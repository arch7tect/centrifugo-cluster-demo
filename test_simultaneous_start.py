import asyncio
import time
from emulator.config import EmulatorConfig
from emulator.emulator_client import EmulatorClient

async def test_simultaneous_start():
    config = EmulatorConfig(
        num_clients=10,
        cycles_per_client=1,
        max_concurrent_clients=10
    )

    start_times = []

    async def run_client_with_timing(client_id: int):
        start_time = time.perf_counter()
        start_times.append((client_id, start_time))
        print(f"Client {client_id} started at {start_time:.6f}")
        client = EmulatorClient(client_id, config)
        await client.run()

    print("Creating all client tasks...")
    tasks = [run_client_with_timing(i) for i in range(10)]

    print("Launching all clients with asyncio.gather()...")
    await asyncio.gather(*tasks)

    if start_times:
        start_times.sort(key=lambda x: x[1])
        first_start = start_times[0][1]
        last_start = start_times[-1][1]
        spread = (last_start - first_start) * 1000

        print("\n" + "="*60)
        print("START TIME ANALYSIS")
        print("="*60)
        print(f"First client started: {first_start:.6f}")
        print(f"Last client started: {last_start:.6f}")
        print(f"Time spread: {spread:.2f}ms")
        print()
        if spread < 100:
            print("✅ All clients started within 100ms - SIMULTANEOUS")
        else:
            print(f"⚠️  Clients started over {spread:.0f}ms - NOT simultaneous")

if __name__ == "__main__":
    asyncio.run(test_simultaneous_start())
