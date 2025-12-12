FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml ./

RUN pip install --no-cache-dir -e .

COPY . .

CMD ["granian", "emulator.server:app", "--interface", "asgi", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]