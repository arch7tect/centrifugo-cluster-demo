import logging
from dataclasses import dataclass, field
import numpy as np


logger = logging.getLogger(__name__)


@dataclass
class ClientStats:
    client_id: int
    session_id: str

    request_latencies: list[float] = field(default_factory=list)
    token_latencies: list[float] = field(default_factory=list)

    cycles_completed: int = 0
    total_tokens_received: int = 0
    total_requests: int = 0

    connection_errors: int = 0
    timeout_errors: int = 0
    other_errors: int = 0
    reconnection_count: int = 0

    start_time: float = 0
    end_time: float = 0


@dataclass
class AggregatedStats:
    total_clients: int
    total_cycles: int
    total_duration: float

    requests_per_second: float
    tokens_per_second: float
    cycles_per_second: float

    request_latency_p50: float
    request_latency_p95: float
    request_latency_p99: float
    request_latency_max: float

    token_latency_p50: float
    token_latency_p95: float
    token_latency_p99: float

    successful_connections: int
    failed_connections: int
    total_errors: int
    total_reconnections: int

    @classmethod
    def from_client_stats(cls, client_stats: list[ClientStats]) -> 'AggregatedStats':
        if not client_stats:
            return cls(
                total_clients=0, total_cycles=0, total_duration=0,
                requests_per_second=0, tokens_per_second=0, cycles_per_second=0,
                request_latency_p50=0, request_latency_p95=0,
                request_latency_p99=0, request_latency_max=0,
                token_latency_p50=0, token_latency_p95=0, token_latency_p99=0,
                successful_connections=0, failed_connections=0, total_errors=0, total_reconnections=0
            )

        all_request_latencies = []
        all_token_latencies = []
        total_tokens = 0
        total_requests = 0
        total_errors = 0
        successful = 0
        failed = 0

        start = min(s.start_time for s in client_stats if s.start_time > 0)
        end = max(s.end_time for s in client_stats if s.end_time > 0)
        duration = end - start if end > start else 0

        total_reconnections = 0
        for stats in client_stats:
            all_request_latencies.extend(stats.request_latencies)
            all_token_latencies.extend(stats.token_latencies)
            total_tokens += stats.total_tokens_received
            total_requests += stats.total_requests
            total_errors += stats.connection_errors + stats.timeout_errors + stats.other_errors
            total_reconnections += stats.reconnection_count

            if stats.cycles_completed > 0:
                successful += 1
            else:
                failed += 1

        req_lat_ms = np.array(all_request_latencies) * 1000 if all_request_latencies else np.array([0])
        tok_lat_ms = np.array(all_token_latencies) * 1000 if all_token_latencies else np.array([0])

        return cls(
            total_clients=len(client_stats),
            total_cycles=sum(s.cycles_completed for s in client_stats),
            total_duration=duration,
            requests_per_second=total_requests / duration if duration > 0 else 0,
            tokens_per_second=total_tokens / duration if duration > 0 else 0,
            cycles_per_second=sum(s.cycles_completed for s in client_stats) / duration if duration > 0 else 0,
            request_latency_p50=float(np.percentile(req_lat_ms, 50)),
            request_latency_p95=float(np.percentile(req_lat_ms, 95)),
            request_latency_p99=float(np.percentile(req_lat_ms, 99)),
            request_latency_max=float(np.max(req_lat_ms)),
            token_latency_p50=float(np.percentile(tok_lat_ms, 50)),
            token_latency_p95=float(np.percentile(tok_lat_ms, 95)),
            token_latency_p99=float(np.percentile(tok_lat_ms, 99)),
            successful_connections=successful,
            failed_connections=failed,
            total_errors=total_errors,
            total_reconnections=total_reconnections
        )

    def print_report(self):
        logger.info("=" * 80)
        logger.info("LOAD TEST RESULTS")
        logger.info("=" * 80)
        logger.info("Test completed. [total_clients=%s, total_cycles=%s, duration=%.2fs]",
                   self.total_clients, self.total_cycles, self.total_duration)
        logger.info("")
        logger.info("THROUGHPUT:")
        logger.info("  [requests_per_sec=%.2f, tokens_per_sec=%.2f, cycles_per_sec=%.2f]",
                   self.requests_per_second, self.tokens_per_second, self.cycles_per_second)
        logger.info("")
        logger.info("REQUEST LATENCY (ms):")
        logger.info("  [p50=%.2f, p95=%.2f, p99=%.2f, max=%.2f]",
                   self.request_latency_p50, self.request_latency_p95,
                   self.request_latency_p99, self.request_latency_max)
        logger.info("")
        logger.info("TOKEN LATENCY (ms):")
        logger.info("  [p50=%.2f, p95=%.2f, p99=%.2f]",
                   self.token_latency_p50, self.token_latency_p95, self.token_latency_p99)
        logger.info("")
        logger.info("CONNECTIONS:")
        logger.info("  [successful=%s, failed=%s, total_errors=%s, reconnections=%s]",
                   self.successful_connections, self.failed_connections, self.total_errors, self.total_reconnections)
        logger.info("=" * 80)
