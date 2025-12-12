import os
import asyncio
import logging
import time
import uuid
from fastapi import FastAPI
from pydantic import BaseModel
import httpx
import jwt

from emulator.llm_emulator import generate_lorem_ipsum


logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI()

CENTRIFUGO_API_URL = os.getenv("CENTRIFUGO_API_URL", "http://localhost:9001/api")
CENTRIFUGO_API_KEY = os.getenv("CENTRIFUGO_API_KEY", "super-secret-api-key")
JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-jwt-key")
RESPONSE_LENGTH_WORDS = int(os.getenv("RESPONSE_LENGTH_WORDS", "100"))
TOKEN_DELAY_SECONDS = float(os.getenv("TOKEN_DELAY_SECONDS", "0.01"))


class RunRequest(BaseModel):
    session_id: str
    question: str


class SessionCreateResponse(BaseModel):
    session_id: str
    token: str


async def publish_to_centrifugo(channel: str, data: dict):
    async with httpx.AsyncClient() as client:
        try:
            await client.post(
                CENTRIFUGO_API_URL,
                json={
                    "method": "publish",
                    "params": {"channel": channel, "data": data}
                },
                headers={"Authorization": f"apikey {CENTRIFUGO_API_KEY}"},
                timeout=5.0
            )
        except Exception as e:
            logger.error(f"Failed to publish to Centrifugo. [channel=%s, error=%s]", channel, e)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/api/sessions/create", response_model=SessionCreateResponse)
async def create_session():
    session_id = str(uuid.uuid4())
    channel = f"session:{session_id}"

    payload = {
        "sub": session_id,
        "exp": int(time.time()) + 3600,
        "channels": [channel]
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")

    # Subscribe user to their channel via Centrifugo API (server-side subscription)
    async with httpx.AsyncClient() as client:
        try:
            await client.post(
                CENTRIFUGO_API_URL,
                json={
                    "method": "subscribe",
                    "params": {
                        "user": session_id,
                        "channel": channel
                    }
                },
                headers={"Authorization": f"apikey {CENTRIFUGO_API_KEY}"},
                timeout=5.0
            )
            logger.debug(f"User subscribed to channel. [session_id=%s, channel=%s]", session_id, channel)
        except Exception as e:
            logger.error(f"Failed to subscribe user. [session_id=%s, error=%s]", session_id, e)

    logger.info(f"Session created. [session_id=%s]", session_id)
    return SessionCreateResponse(session_id=session_id, token=token)


@app.delete("/api/sessions/{session_id}")
async def close_session(session_id: str):
    logger.info(f"Session closed. [session_id=%s]", session_id)
    return {"status": "closed"}


@app.post("/api/run")
async def run(request: RunRequest):
    session_id = request.session_id
    channel = f"session:{session_id}"

    full_response = generate_lorem_ipsum(length=RESPONSE_LENGTH_WORDS)
    tokens = full_response.split()

    # Stream tokens to client via Centrifugo
    for token in tokens:
        await publish_to_centrifugo(channel, {"token": token})
        await asyncio.sleep(TOKEN_DELAY_SECONDS)

    # Send completion marker
    await publish_to_centrifugo(channel, {"done": True})

    return {"response": full_response}
