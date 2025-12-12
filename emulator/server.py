import os
import asyncio
import logging
from fastapi import FastAPI
from pydantic import BaseModel
import httpx

from emulator.llm_emulator import generate_lorem_ipsum


logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI()

CENTRIFUGO_API_URL = os.getenv("CENTRIFUGO_API_URL", "http://localhost:9001/api")
CENTRIFUGO_API_KEY = os.getenv("CENTRIFUGO_API_KEY", "super-secret-api-key")
RESPONSE_LENGTH_WORDS = int(os.getenv("RESPONSE_LENGTH_WORDS", "100"))
TOKEN_DELAY_SECONDS = float(os.getenv("TOKEN_DELAY_SECONDS", "0.01"))


class RunRequest(BaseModel):
    session_id: str
    question: str


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
