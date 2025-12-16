import os
from dataclasses import dataclass


@dataclass
class EmulatorConfig:
    num_clients: int = 10
    cycles_per_client: int = 5

    haproxy_http_url: str = "http://localhost:9000"
    haproxy_ws_url: str = "ws://localhost:9001"

    response_length_words: int = 100
    token_delay_seconds: float = 0.01

    connection_timeout: int = 300
    request_timeout: int = 300
    client_ramp_delay_ms: int = 0

    jwt_secret: str = "super-secret-jwt-key"
    centrifugo_api_key: str = "super-secret-api-key"

    @classmethod
    def from_env(cls) -> 'EmulatorConfig':
        return cls(
            num_clients=int(os.getenv('NUM_CLIENTS', '10')),
            cycles_per_client=int(os.getenv('CYCLES_PER_CLIENT', '5')),
            response_length_words=int(os.getenv('RESPONSE_LENGTH_WORDS', '100')),
            token_delay_seconds=float(os.getenv('TOKEN_DELAY_SECONDS', '0.01')),
            connection_timeout=int(os.getenv('CONNECTION_TIMEOUT', '30')),
            request_timeout=int(os.getenv('REQUEST_TIMEOUT', '120')),
            client_ramp_delay_ms=int(os.getenv('CLIENT_RAMP_DELAY_MS', '0')),
        )
