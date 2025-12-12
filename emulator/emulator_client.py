import asyncio
import json
import logging
import time
import uuid
from typing import Optional
import jwt
import httpx
import websockets

from emulator.config import EmulatorConfig
from emulator.statistics import ClientStats


logger = logging.getLogger(__name__)


class EmulatorClient:
    def __init__(self, client_id: int, config: EmulatorConfig):
        self.client_id = client_id
        self.config = config
        self.session_id = str(uuid.uuid4())
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.http_client: Optional[httpx.AsyncClient] = None
        self.stats = ClientStats(client_id=client_id, session_id=self.session_id)
        self.token_queue: asyncio.Queue = asyncio.Queue()
        self.done_event = asyncio.Event()
        self.receive_task: Optional[asyncio.Task] = None

    def generate_token(self, channel: str) -> str:
        payload = {
            "sub": f"client-{self.client_id}",
            "exp": int(time.time()) + 3600,
            "channels": [channel]
        }
        return jwt.encode(payload, self.config.jwt_secret, algorithm="HS256")

    async def connect(self):
        try:
            token = self.generate_token(channel=f"session:{self.session_id}")

            ws_url = f"{self.config.haproxy_ws_url}/connection/websocket"
            self.ws = await asyncio.wait_for(
                websockets.connect(ws_url, subprotocols=["json"]),
                timeout=self.config.connection_timeout
            )

            # Send connect command
            await self.ws.send(json.dumps({
                "id": 1,
                "connect": {"token": token}
            }))
            reply = await self.ws.recv()
            logger.debug(f"Connect reply received. [client_id=%s, session_id=%s]", self.client_id, self.session_id)

            # Subscribe to personal channel
            await self.ws.send(json.dumps({
                "id": 2,
                "subscribe": {"channel": f"session:{self.session_id}"}
            }))
            sub_reply = await self.ws.recv()
            logger.debug(f"Subscribe reply received. [client_id=%s, session_id=%s]", self.client_id, self.session_id)
            logger.info(f"Client connected successfully. [client_id=%s, session_id=%s]", self.client_id, self.session_id)

            self.http_client = httpx.AsyncClient(
                base_url=self.config.haproxy_http_url,
                timeout=self.config.request_timeout
            )

            return True
        except Exception as e:
            logger.error(f"Client connection failed. [client_id=%s, session_id=%s, error=%s]", self.client_id, self.session_id, e)
            self.stats.connection_errors += 1
            return False

    async def receive_tokens(self):
        try:
            while True:
                message = await self.ws.recv()
                data = json.loads(message)
                logger.debug(f"WebSocket message received. [client_id=%s, session_id=%s]", self.client_id, self.session_id)

                # Handle push messages
                if "push" in data:
                    pub = data["push"].get("pub", {})
                    push_data = pub.get("data", {})

                    if "token" in push_data:
                        await self.token_queue.put(push_data["token"])
                        self.stats.total_tokens_received += 1

                    if push_data.get("done"):
                        self.done_event.set()

                # Respond to pings
                elif "ping" in data:
                    await self.ws.send(json.dumps({}))

        except websockets.exceptions.ConnectionClosed:
            logger.debug(f"WebSocket connection closed. [client_id=%s, session_id=%s]", self.client_id, self.session_id)
        except Exception as e:
            logger.error(f"WebSocket receive error. [client_id=%s, session_id=%s, error=%s]", self.client_id, self.session_id, e)
            self.stats.other_errors += 1

    async def run_cycle(self, question: str):
        try:
            self.done_event.clear()
            while not self.token_queue.empty():
                await self.token_queue.get()

            # Measure first token latency
            first_token_start = time.perf_counter()

            # Make HTTP request
            request_start = time.perf_counter()
            response = await self.http_client.post(
                "/api/run",
                json={"session_id": self.session_id, "question": question}
            )
            request_latency = time.perf_counter() - request_start

            self.stats.request_latencies.append(request_latency)
            self.stats.total_requests += 1

            # Wait for first token
            first_token = await asyncio.wait_for(
                self.token_queue.get(),
                timeout=self.config.request_timeout
            )
            first_token_latency = time.perf_counter() - first_token_start
            self.stats.token_latencies.append(first_token_latency)

            # Wait for completion
            await asyncio.wait_for(
                self.done_event.wait(),
                timeout=self.config.request_timeout
            )

            full_response = response.json()["response"]
            self.stats.cycles_completed += 1

            return full_response

        except asyncio.TimeoutError:
            logger.error(f"Cycle timeout. [client_id=%s, session_id=%s]", self.client_id, self.session_id)
            self.stats.timeout_errors += 1
            return None
        except Exception as e:
            logger.error(f"Cycle execution error. [client_id=%s, session_id=%s, error=%s]", self.client_id, self.session_id, e)
            self.stats.other_errors += 1
            return None

    async def disconnect(self):
        if self.receive_task:
            self.receive_task.cancel()
            try:
                await self.receive_task
            except asyncio.CancelledError:
                pass
        if self.http_client:
            await self.http_client.aclose()
        if self.ws:
            await self.ws.close()

    async def run(self):
        self.stats.start_time = time.perf_counter()

        if not await self.connect():
            self.stats.end_time = time.perf_counter()
            return self.stats

        # Start receiving tokens in background for entire session
        self.receive_task = asyncio.create_task(self.receive_tokens())

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
