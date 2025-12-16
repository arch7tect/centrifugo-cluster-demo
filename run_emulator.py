import argparse
import asyncio
import logging
import signal
import sys
from datetime import datetime
from pathlib import Path
import uvloop

from emulator.config import EmulatorConfig
from emulator.emulator_client import EmulatorClient
from emulator.statistics import AggregatedStats


logger = logging.getLogger(__name__)

def setup_logging(num_clients: int, cycles: int):
    logs_dir = Path("logs")
    logs_dir.mkdir(exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = logs_dir / f"load_test_{num_clients}clients_{cycles}cycles_{timestamp}.log"

    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(
        logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    )

    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(
        logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    )

    logging.basicConfig(
        level=logging.INFO,
        handlers=[file_handler, console_handler]
    )

    logger.info(f"Logging to file. [log_file=%s]", log_file)
    return log_file


class EmulatorOrchestrator:
    def __init__(self, config: EmulatorConfig):
        self.config = config
        self.clients_stats = []
        self.running = True
        self.progress_task = None

    async def log_progress(self):
        while self.running:
            await asyncio.sleep(10)
            if self.clients_stats:
                total_cycles = sum(s.cycles_completed for s in self.clients_stats)
                total_tokens = sum(s.total_tokens_received for s in self.clients_stats)
                total_errors = sum(
                    s.connection_errors + s.timeout_errors + s.other_errors
                    for s in self.clients_stats
                )
                logger.info(
                    f"Test progress. [cycles=%s, tokens=%s, errors=%s]",
                    total_cycles, total_tokens, total_errors
                )

    async def run_client(self, client_id: int):
        client = EmulatorClient(client_id, self.config)
        stats = await client.run()
        self.clients_stats.append(stats)
        return stats

    async def run(self):
        logger.info(f"Emulator starting. [num_clients=%s, cycles_per_client=%s]",
                   self.config.num_clients, self.config.cycles_per_client)

        # Start progress logging
        self.progress_task = asyncio.create_task(self.log_progress())

        # Launch clients with optional ramp delay to avoid thundering herd
        tasks = []
        for client_id in range(self.config.num_clients):
            tasks.append(asyncio.create_task(self.run_client(client_id)))
            if self.config.client_ramp_delay_ms > 0 and client_id + 1 < self.config.num_clients:
                await asyncio.sleep(self.config.client_ramp_delay_ms / 1000.0)

        try:
            await asyncio.gather(*tasks)
        except KeyboardInterrupt:
            logger.info("Test interrupted by user.")
            self.running = False
        finally:
            self.running = False
            if self.progress_task:
                self.progress_task.cancel()
                try:
                    await self.progress_task
                except asyncio.CancelledError:
                    pass

        # Aggregate and print statistics
        aggregated = AggregatedStats.from_client_stats(self.clients_stats)
        aggregated.print_report()


def parse_args():
    parser = argparse.ArgumentParser(description='LLM Emulator Load Test')
    parser.add_argument('--clients', type=int, default=10,
                       help='Number of clients (default: 10)')
    parser.add_argument('--cycles', type=int, default=5,
                       help='Cycles per client (default: 5)')
    parser.add_argument('--length', type=int, default=100,
                       help='Response length in words (default: 100)')
    parser.add_argument('--delay', type=float, default=0.01,
                       help='Token delay in seconds (default: 0.01)')
    parser.add_argument('--ramp-delay-ms', type=int, default=0,
                       help='Delay in milliseconds between client startups (default: 0)')
    return parser.parse_args()


async def main():
    args = parse_args()

    setup_logging(args.clients, args.cycles)

    config = EmulatorConfig(
        num_clients=args.clients,
        cycles_per_client=args.cycles,
        response_length_words=args.length,
        token_delay_seconds=args.delay,
        client_ramp_delay_ms=args.ramp_delay_ms,
    )

    orchestrator = EmulatorOrchestrator(config)

    # Handle graceful shutdown
    def signal_handler(sig, frame):
        logger.info("Shutdown signal received. [signal=%s]", sig)
        orchestrator.running = False

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    await orchestrator.run()


if __name__ == "__main__":
    uvloop.install()
    asyncio.run(main())
