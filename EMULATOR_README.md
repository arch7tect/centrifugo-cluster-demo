# LLM Emulator - Load Testing System

Stateless LLM response emulator using Centrifugo cluster for WebSocket streaming.

## Architecture

```
Python Clients (asyncio)
    ↓
HAProxy Load Balancer
    ├─→ HTTP (port 9000) → Granian FastAPI servers (2 instances)
    └─→ WebSocket (port 9001) → Centrifugo cluster (2 nodes)
            ↓
        Redis (pub/sub backend)
```

**Key Features:**
- Stateless server design with session-based channels
- Centrifugo cluster for horizontal WebSocket scaling
- HAProxy load balancing (round-robin for HTTP, least-conn for WebSocket)
- Comprehensive statistics: throughput, latency percentiles (p50/p95/p99), errors
- Lorem ipsum text generation for realistic LLM streaming

## Quick Start

### Simple Start (default: 10 clients, 5 cycles)
```bash
./start_emulator.sh
```

### Custom Configuration
```bash
./start_emulator.sh [clients] [cycles] [length] [delay] [max_concurrent]

# Examples:
./start_emulator.sh 50 10           # 50 clients, 10 cycles
./start_emulator.sh 100 5 150 0.005 # 100 clients, 5 cycles, 150 words, 5ms delay
```

### Parameters:
- `clients`: Number of concurrent clients (default: 10)
- `cycles`: Cycles per client (default: 5)
- `length`: Response length in words (default: 100)
- `delay`: Token delay in seconds (default: 0.01)
- `max_concurrent`: Max concurrent connections (default: 50)

## Management Scripts

### Check Status
```bash
./status_emulator.sh
```

### View Logs
```bash
# All services
./logs_emulator.sh

# Specific service
./logs_emulator.sh granian1
./logs_emulator.sh centrifugo_node1
./logs_emulator.sh haproxy
```

### Stop All Services
```bash
./stop_emulator.sh
```

## Manual Operations

### Start Infrastructure Only
```bash
docker-compose up -d
```

### Run Load Test
```bash
uv run python run_emulator.py --clients 10 --cycles 5
```

### Available Options
```bash
python run_emulator.py --help

Options:
  --clients N          Number of clients (default: 10)
  --cycles N           Cycles per client (default: 5)
  --servers N          Number of Granian instances (default: 2)
  --workers N          Workers per Granian instance (default: 2)
  --length N           Response length in words (default: 100)
  --delay SECONDS      Token delay in seconds (default: 0.01)
  --max-concurrent N   Max concurrent clients (default: 50)
```

## Service Endpoints

| Service | URL | Purpose |
|---------|-----|---------|
| HAProxy Stats | http://localhost:8404/stats | Load balancer statistics |
| Centrifugo Node 1 | http://localhost:8100/ | Admin UI (admin/admin) |
| Centrifugo Node 2 | http://localhost:8200/ | Admin UI (admin/admin) |
| FastAPI Health | http://localhost:9000/health | API health check |
| Redis | localhost:6379 | Pub/sub backend |

## Performance Tuning

### Increase Throughput
```bash
# More clients
./start_emulator.sh 100 5

# Faster token delay
./start_emulator.sh 50 10 100 0.001

# Higher concurrency
./start_emulator.sh 200 3 100 0.01 150
```

### Monitor Resources
```bash
# Docker stats
docker stats

# HAProxy stats
open http://localhost:8404/stats

# Container logs
docker-compose logs -f granian1
```

## Statistics Output

After each test run, you'll see:

```
LOAD TEST RESULTS
================================================================================
Test completed. [total_clients=10, total_cycles=50, duration=18.55s]

THROUGHPUT:
  [requests_per_sec=2.70, tokens_per_sec=269.61, cycles_per_sec=2.70]

REQUEST LATENCY (ms):
  [p50=2789.42, p95=4701.31, p99=4752.32, max=4758.55]

TOKEN LATENCY (ms):
  [p50=2789.43, p95=4701.33, p99=4752.34]

CONNECTIONS:
  [successful=10, failed=0, total_errors=0]
================================================================================
```

## Architecture Details

### Stateless Design
- No server-side session storage
- Session ID in channel name: `session:{uuid}`
- Any FastAPI instance can handle any request
- Centrifugo distributes messages via Redis pub/sub

### Load Distribution
- **HAProxy → FastAPI**: Round-robin (short-lived requests)
- **HAProxy → Centrifugo**: Least connections (persistent WebSocket)
- **Centrifugo → Redis**: Pub/sub broadcasts to all nodes

### Message Flow
1. Client subscribes to `session:{uuid}` channel via Centrifugo
2. Client calls `/api/run` HTTP endpoint via HAProxy
3. FastAPI generates response, publishes tokens to channel
4. Redis broadcasts to all Centrifugo nodes
5. Connected node delivers to client via WebSocket

## Troubleshooting

### Services won't start
```bash
# Check Docker
docker ps

# Check logs
./logs_emulator.sh

# Restart everything
./stop_emulator.sh
./start_emulator.sh
```

### Connection timeouts
```bash
# Increase timeout in config
export CONNECTION_TIMEOUT=60
export REQUEST_TIMEOUT=120

# Or reduce concurrent load
./start_emulator.sh 20 3
```

### High latency
```bash
# Check system resources
docker stats

# Reduce load
./start_emulator.sh 10 5

# Check HAProxy stats
open http://localhost:8404/stats
```

## Development

### Install Dependencies
```bash
uv sync
```

### Run Tests Locally
```bash
# Start infrastructure
docker-compose up -d

# Run specific test
uv run python run_emulator.py --clients 5 --cycles 3

# Stop infrastructure
docker-compose down
```

### Configuration Files
- `docker-compose.yml` - Service orchestration
- `haproxy/haproxy.cfg` - Load balancer config
- `centrifugo/config_node*.json` - Centrifugo node configs
- `emulator/config.py` - Application configuration

## Environment Variables

Override defaults with environment variables:

```bash
export NUM_CLIENTS=50
export CYCLES_PER_CLIENT=10
export RESPONSE_LENGTH_WORDS=150
export TOKEN_DELAY_SECONDS=0.005
export MAX_CONCURRENT_CLIENTS=100

uv run python run_emulator.py
```

## Cleanup

```bash
# Stop all services
./stop_emulator.sh

# Remove volumes (clears Redis data)
docker-compose down -v

# Remove images
docker-compose down --rmi all
```
