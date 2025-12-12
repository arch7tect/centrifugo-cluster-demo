import os
from dataclasses import dataclass


@dataclass
class EmulatorConfig:
    num_clients: int = 10
    cycles_per_client: int = 5

    num_granian_instances: int = 2
    workers_per_granian: int = 2

    num_centrifugo_nodes: int = 2

    haproxy_http_url: str = "http://localhost:9000"
    haproxy_ws_url: str = "ws://localhost:9001"

    response_length_words: int = 100
    token_delay_seconds: float = 0.01

    max_concurrent_clients: int = 50
    connection_timeout: int = 30
    request_timeout: int = 60

    jwt_secret: str = "super-secret-jwt-key"
    centrifugo_api_key: str = "super-secret-api-key"

    @classmethod
    def from_env(cls) -> 'EmulatorConfig':
        return cls(
            num_clients=int(os.getenv('NUM_CLIENTS', '10')),
            cycles_per_client=int(os.getenv('CYCLES_PER_CLIENT', '5')),
            num_granian_instances=int(os.getenv('NUM_GRANIAN_INSTANCES', '2')),
            workers_per_granian=int(os.getenv('WORKERS_PER_GRANIAN', '2')),
            response_length_words=int(os.getenv('RESPONSE_LENGTH_WORDS', '100')),
            token_delay_seconds=float(os.getenv('TOKEN_DELAY_SECONDS', '0.01')),
            max_concurrent_clients=int(os.getenv('MAX_CONCURRENT_CLIENTS', '50')),
            connection_timeout=int(os.getenv('CONNECTION_TIMEOUT', '30')),
            request_timeout=int(os.getenv('REQUEST_TIMEOUT', '60')),
        )