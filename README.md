# Stateless LLM Emulator with Centrifugo Cluster

Stateless LLM response emulator using Centrifugo cluster for WebSocket streaming with comprehensive load testing capabilities.

Available in both **Python** and **TypeScript** implementations!

## Quick Start

### Python Client (default: 10 clients, 5 cycles)
```bash
./start_emulator.sh
```

### TypeScript Client
```bash
./run_typescript_emulator.sh
```

### Custom Configuration
```bash
./start_emulator.sh [clients] [cycles] [length] [delay] [max_concurrent]

# Examples:
./start_emulator.sh 50 10           # 50 clients, 10 cycles
./start_emulator.sh 100 5 150 0.005 # 100 clients, 5 cycles, 150 words, 5ms delay
```

## Architecture

```
Python/TypeScript Clients
    ↓
HAProxy Load Balancer
    ├─→ HTTP (port 9000) → Granian FastAPI servers (2 instances)
    └─→ WebSocket (port 9001) → Centrifugo cluster (2 nodes)
            ↓
        Redis (pub/sub backend)
```

### Key Features
- **Stateless server design** with REST API session management
- **Centrifugo cluster** for horizontal WebSocket scaling
- **HAProxy load balancing** (round-robin for HTTP, least-conn for WebSocket)
- **Comprehensive statistics**: throughput, latency percentiles (p50/p95/p99), errors
- **Lorem ipsum generation** for realistic LLM streaming
- **Dual implementations**: Python (asyncio) and TypeScript (Node.js)

### Infrastructure Components

#### 1. Redis
- Pub/sub backend for Centrifugo cluster
- Port: 6379

#### 2. Centrifugo Cluster
- 2 nodes for WebSocket message distribution
- Admin UI: http://localhost:8100 and http://localhost:8200 (admin/admin)
- Namespace support for session channels

#### 3. Granian FastAPI Servers
- 2 stateless instances (ports 8001, 8002)
- REST API endpoints for session management
- Token streaming via Centrifugo publish API

#### 4. HAProxy Load Balancer
- HTTP frontend: port 9000
- WebSocket frontend: port 9001
- Stats UI: http://localhost:8404/stats

## Session Lifecycle and Message Flow

### Session Creation
1. Client calls `POST /api/sessions/create` via HAProxy
2. FastAPI generates session ID (UUID) and JWT token
3. FastAPI subscribes client to `session:{uuid}` channel via Centrifugo HTTP API
4. Returns `{session_id, token}` to client
5. Client opens WebSocket with JWT token
6. Client sends minimal connect command (required by Centrifugo protocol)

### Message Streaming
1. Client calls `POST /api/run` with session_id and question
2. FastAPI generates response, publishes tokens to `session:{session_id}` channel
3. Redis broadcasts to all Centrifugo nodes
4. Connected node delivers tokens to client via WebSocket push messages
5. Client receives tokens (no client-to-server WebSocket messages except connect)

### Session Closure
1. Client calls `DELETE /api/sessions/{session_id}` via HAProxy
2. Client closes WebSocket connection
3. No server-side session storage required (stateless)

## Usage

### Parameters
- `clients`: Number of concurrent clients (default: 10)
- `cycles`: Cycles per client (default: 5)
- `length`: Response length in words (default: 100)
- `delay`: Token delay in seconds (default: 0.01)
- `max_concurrent`: Max concurrent connections (default: 50)

### Management Scripts

#### Check Status
```bash
./status_emulator.sh
```

#### View Logs
```bash
# All services
./logs_emulator.sh

# Specific service
./logs_emulator.sh granian1
./logs_emulator.sh centrifugo_node1
./logs_emulator.sh haproxy
```

#### Stop All Services
```bash
./stop_emulator.sh
```

### Manual Operations

#### Python Client
```bash
# Run load test
uv run python run_emulator.py --clients 10 --cycles 5

# Available options
--clients N          Number of clients (default: 10)
--cycles N           Cycles per client (default: 5)
--servers N          Number of Granian instances (default: 2)
--workers N          Workers per Granian instance (default: 2)
--length N           Response length in words (default: 100)
--delay SECONDS      Token delay in seconds (default: 0.01)
--max-concurrent N   Max concurrent clients (default: 50)
```

#### TypeScript Client
```bash
cd typescript-client
npm install
npm start -- --clients 10 --cycles 5

# Available options
--clients N          Number of clients (default: 10)
--cycles N           Cycles per client (default: 5)
--length N           Response length in words (default: 100)
--delay SECONDS      Token delay in seconds (default: 0.01)
--max-concurrent N   Max concurrent clients (default: 50)
```

For detailed TypeScript implementation notes, see [typescript-client/README.md](typescript-client/README.md)

### Environment Variables

Override defaults with environment variables:

```bash
export NUM_CLIENTS=50
export CYCLES_PER_CLIENT=10
export RESPONSE_LENGTH_WORDS=150
export TOKEN_DELAY_SECONDS=0.005
export MAX_CONCURRENT_CLIENTS=100

uv run python run_emulator.py
```

## Service Endpoints

| Service | URL | Purpose |
|---------|-----|---------|
| HAProxy Stats | http://localhost:8404/stats | Load balancer statistics |
| Centrifugo Node 1 | http://localhost:8100/ | Admin UI (admin/admin) |
| Centrifugo Node 2 | http://localhost:8200/ | Admin UI (admin/admin) |
| FastAPI Health | http://localhost:9000/health | API health check |
| Session Create | http://localhost:9000/api/sessions/create | Create new session (POST) |
| Session Close | http://localhost:9000/api/sessions/{id} | Close session (DELETE) |
| Run Request | http://localhost:9000/api/run | Execute question/response cycle (POST) |
| Redis | localhost:6379 | Pub/sub backend |

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

## TypeScript Implementation

Complete TypeScript client implementation matching Python functionality:

### Key Differences from Python

| Aspect | Python | TypeScript |
|--------|--------|------------|
| Runtime | Python 3.11+ with asyncio | Node.js 20+ with native Promises |
| WebSocket | `websockets` library | `ws` library |
| HTTP Client | `httpx.AsyncClient` | Native `fetch` API |
| Percentiles | `numpy.percentile()` | Custom linear interpolation |
| Session Management | REST API | REST API |
| JWT Generation | Server-side | Server-side |

### Architecture Benefits

1. **Dual Implementation**: Validates stateless architecture design across languages
2. **Language-Agnostic**: Same Centrifugo protocol works in both Python and TypeScript
3. **Performance Validation**: Both achieve similar throughput (~2-3 req/sec, ~270 tokens/sec)
4. **Choice**: Use Python for asyncio-based systems or TypeScript for Node.js/web environments

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
# Python
uv sync

# TypeScript
cd typescript-client
npm install
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

### Structured Logging

All modules follow consistent logging patterns:

```python
import logging
logger = logging.getLogger(__name__)

# Structured format with bracketed key-value pairs
logger.info(f"Session created. [session_id=%s, user_id=%s]", session_id, user_id)
logger.error(f"Failed to connect. [client_id=%s, error=%s]", client_id, exc)
```

**Logging Levels:**
- `logger.debug()`: Detailed diagnostic information
- `logger.info()`: General operational messages
- `logger.warning()`: Potentially harmful situations
- `logger.error()`: Error conditions
- `logger.critical()`: Very serious errors

## Load Testing Results

### 500 Clients × 3 Cycles (1500 total requests)

**Python Client**:
- Completed: 1500/1500 (100% success)
- Errors: 0
- Reconnections: 436 (0.87 per client)
- Throughput: 24.06 req/sec, 2406 tokens/sec
- Latency: p50: 14ms, p95: 186ms, p99: 205ms
- Duration: 62.34s

**TypeScript Client**:
- Completed: 1500/1500 (100% success)
- Errors: 0
- Reconnections: 766 (1.53 per client)
- Throughput: 22.37 req/sec, 2237 tokens/sec
- Latency: p50: 13ms, p95: 44ms, p99: 54ms
- Duration: 67.04s

### 5000 Clients × 3 Cycles (15000 total requests)

**Python Client**:
- Completed: 3792/15000 (25.3% success)
- Failed clients: 1830/5000 (36.6%)
- Errors: 11,219
- Reconnections: 61,567 (12.3 per client)
- Throughput: 23.59 req/sec, 1060 tokens/sec
- Request Latency: p50: 1.4s, p95: 51s, p99: 90s, max: 116s
- Token Latency: p50: 2.8s, p95: 23s, p99: 84s
- Duration: 635.72s (~10.6 minutes)

**TypeScript Client**:
- Completed: 3352/15000 (22.3% success)
- Errors: 11,648
- Reconnections: 59,933 (12.0 per client)
- Throughput: 32.95 req/sec, 1473 tokens/sec, 7.36 cycles/sec
- Request Latency: p50: 42ms, p95: 144ms, p99: 384ms, max: 37s
- Token Latency: p50: 1.4s, p95: 12.9s, p99: 37.4s
- Duration: 455.24s (~7.6 minutes)

**Analysis**: At 5000 concurrent clients, both implementations reach capacity limits with ~77% failure rate, high latency, and massive reconnection activity. Only 22-25% of expected cycles completed. This represents the maximum sustainable load before severe degradation.

**After Scaling to 32 Workers (16 per Granian instance)**:
- Completed: 6145/15000 (41.0% success) - 62% improvement
- Successful clients: 3549/5000 (71.0%)
- Failed clients: 1451/5000 (29.0%)
- Errors: 7,564 (-33% reduction)
- Reconnections: 22,491 (4.5 per client, -63% reduction)
- Throughput: 23.87 req/sec, 1315 tokens/sec (+24% improvement)
- Request Latency: p50: 10s, p95: 43.8s, p99: 45s, max: 46.4s
- Token Latency: p50: 10.7s, p95: 43.7s, p99: 56s
- Duration: 537s (~9 minutes)

**Scaling Analysis**: Increasing workers from 8 to 32 improved success rate and reduced errors/reconnections, but latency degraded significantly. The bottleneck shifted from Granian workers to Centrifugo/Redis capacity. Further horizontal scaling of Centrifugo nodes is needed for better performance at 5000+ concurrent clients.

### Key Implementation Features

**Persistent HTTP Connection Pool**:
- Max 100 keepalive connections, 200 total connections to Centrifugo
- Eliminates connection overhead for high-volume token publishing
- Enables 100% success rate at 500+ concurrent clients

**Automatic WebSocket Reconnection**:
- Detects connection drops and automatically reconnects
- Exponential backoff: 1s, 2s, 4s between retry attempts
- Up to 3 reconnection attempts per disconnection
- Seamlessly resumes receiving messages after reconnection

**Configuration**:
- HAProxy timeouts: 300s (client/server), 3600s (tunnel)
- Centrifugo: 300s stale/expired delays, 100 message history with 5min TTL
- Application: 120s request timeout
- Granian: 4 workers per instance (8 total)
- Background task streaming for non-blocking token publishing

**Capacity Limits**:
- Optimal performance: Up to 500 concurrent clients (100% success, sub-second latency)
- Degraded performance: 500-5000 clients (increasing failures and latency)
- Capacity ceiling: ~5000 clients (36.6% failure rate, severe latency degradation)

## Cleanup

```bash
# Stop all services
./stop_emulator.sh

# Remove volumes (clears Redis data)
docker-compose down -v

# Remove images
docker-compose down --rmi all
```

## License

MIT License - see [LICENSE](LICENSE) file for details.
