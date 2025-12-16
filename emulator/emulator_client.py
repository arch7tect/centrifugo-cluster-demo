import asyncio
import logging
import time
from typing import Optional
import httpx
from centrifuge import (
    Client,
    ClientEventHandler,
    SubscriptionEventHandler,
    ConnectedContext,
    DisconnectedContext,
    ErrorContext,
    PublicationContext,
    ServerPublicationContext,
)
from centrifuge.codes import _DisconnectedCode

from emulator.config import EmulatorConfig
from emulator.statistics import ClientStats


logger = logging.getLogger(__name__)


class EmulatorClient:
    def __init__(self, client_id: int, config: EmulatorConfig):
        self.client_id = client_id
        self.config = config
        self.session_id: Optional[str] = None
        self.token: Optional[str] = None
        self.centrifuge_client: Optional[Client] = None
        self.http_client: Optional[httpx.AsyncClient] = None
        self.stats = ClientStats(client_id=client_id, session_id="")
        self.token_queue: asyncio.Queue = asyncio.Queue()
        self.done_event = asyncio.Event()
        self.shutting_down = False

    async def connect(self):
        try:
            self.http_client = httpx.AsyncClient(
                base_url=self.config.haproxy_http_url,
                timeout=self.config.request_timeout
            )

            if not self.session_id:
                response = await self.http_client.post("/api/sessions/create")
                data = response.json()
                self.session_id = data["session_id"]
                self.token = data["token"]
                self.stats.session_id = self.session_id

            ws_url = f"{self.config.haproxy_ws_url}/connection/websocket"

            class MyClientHandler(ClientEventHandler):
                async def on_connected(handler_self, ctx: ConnectedContext) -> None:
                    logger.info(f"Client connected successfully. [client_id=%s, session_id=%s]", self.client_id, self.session_id)

                async def on_disconnected(handler_self, ctx: DisconnectedContext) -> None:
                    logger.info(
                        "Client disconnected. [client_id=%s, session_id=%s, code=%s, reason=%s]",
                        self.client_id,
                        self.session_id,
                        ctx.code,
                        ctx.reason,
                    )
                    code = ctx.code
                    disconnect_called = (
                        code == _DisconnectedCode.DISCONNECT_CALLED
                        or (isinstance(code, int) and code == _DisconnectedCode.DISCONNECT_CALLED.value)
                    )
                    if not self.shutting_down and not disconnect_called:
                        self.stats.reconnection_count += 1

                async def on_error(handler_self, ctx: ErrorContext) -> None:
                    logger.error(f"Client error. [client_id=%s, session_id=%s, error=%s]", self.client_id, self.session_id, ctx.error)
                    self.stats.other_errors += 1

                async def on_server_publication(handler_self, ctx: ServerPublicationContext) -> None:
                    data = ctx.pub.data
                    logger.debug(f"Server publication received. [client_id=%s, session_id=%s]", self.client_id, self.session_id)

                    if "token" in data:
                        await self.token_queue.put(data["token"])
                        self.stats.total_tokens_received += 1

                    if data.get("done"):
                        self.done_event.set()

            class MySubscriptionHandler(SubscriptionEventHandler):
                async def on_publication(handler_self, ctx: PublicationContext) -> None:
                    data = ctx.pub.data
                    logger.debug(f"Publication received. [client_id=%s, session_id=%s]", self.client_id, self.session_id)

                    if "token" in data:
                        await self.token_queue.put(data["token"])
                        self.stats.total_tokens_received += 1

                    if data.get("done"):
                        self.done_event.set()

            self.centrifuge_client = Client(ws_url, events=MyClientHandler(), token=self.token)

            await self.centrifuge_client.connect()

            channel = f"session:{self.session_id}"
            subscription = self.centrifuge_client.new_subscription(channel, events=MySubscriptionHandler())
            await subscription.subscribe()

            return True

        except Exception as e:
            logger.error(f"Client connection failed. [client_id=%s, error=%s]", self.client_id, e)
            self.stats.connection_errors += 1
            return False

    async def run_cycle(self, question: str):
        try:
            self.done_event.clear()
            while not self.token_queue.empty():
                await self.token_queue.get()

            first_token_start = time.perf_counter()

            request_start = time.perf_counter()
            response = await self.http_client.post(
                "/api/run",
                json={"session_id": self.session_id, "question": question}
            )
            request_latency = time.perf_counter() - request_start

            self.stats.request_latencies.append(request_latency)
            self.stats.total_requests += 1

            first_token = await asyncio.wait_for(
                self.token_queue.get(),
                timeout=self.config.request_timeout
            )
            first_token_latency = time.perf_counter() - first_token_start
            self.stats.token_latencies.append(first_token_latency)

            await asyncio.wait_for(
                self.done_event.wait(),
                timeout=self.config.request_timeout
            )

            full_response = response.json()["response"]
            self.stats.cycles_completed += 1

            return full_response

        except asyncio.TimeoutError as e:
            logger.error(f"Cycle timeout. [client_id=%s, session_id=%s, error=%s]", self.client_id, self.session_id, e)
            self.stats.timeout_errors += 1
            return None
        except Exception as e:
            logger.error(f"Cycle execution error. [client_id=%s, session_id=%s, error=%s]", self.client_id, self.session_id, e)
            self.stats.other_errors += 1
            return None

    async def disconnect(self):
        # Mark shutdown to avoid counting the planned close as a reconnect.
        self.shutting_down = True
        if self.http_client and self.session_id:
            try:
                await self.http_client.delete(f"/api/sessions/{self.session_id}")
            except Exception as e:
                logger.warning(f"Failed to close session. [session_id=%s, error=%s]", self.session_id, e)

        if self.http_client:
            await self.http_client.aclose()

        if self.centrifuge_client:
            await self.centrifuge_client.disconnect()

    async def run(self):
        self.stats.start_time = time.perf_counter()

        if not await self.connect():
            self.stats.end_time = time.perf_counter()
            return self.stats

        for cycle in range(self.config.cycles_per_client):
            question = f"Question {cycle + 1} from client {self.client_id}"
            result = await self.run_cycle(question)
            if result is None:
                logger.warning(f"Cycle failed. [client_id=%s, session_id=%s, cycle=%s]", self.client_id, self.session_id, cycle + 1)
            else:
                logger.debug(f"Cycle completed successfully. [client_id=%s, session_id=%s, cycle=%s]", self.client_id, self.session_id, cycle + 1)

        await self.disconnect()
        self.stats.end_time = time.perf_counter()

        return self.stats
