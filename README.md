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
    ├─→ HTTP (port 9000) → Granian FastAPI servers (4 instances)
    └─→ WebSocket (port 9001) → Centrifugo cluster (3 nodes)
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
--length N           Response length in words (default: 100)
--delay SECONDS      Token delay in seconds (default: 0.01)
--ramp-delay-ms N    Delay between client startups in ms (default: 0)
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
```

For detailed TypeScript implementation notes, see [typescript-client/README.md](typescript-client/README.md)

### Environment Variables

Override defaults with environment variables:

```bash
export NUM_CLIENTS=50
export CYCLES_PER_CLIENT=10
export RESPONSE_LENGTH_WORDS=150
export TOKEN_DELAY_SECONDS=0.005
export CLIENT_RAMP_DELAY_MS=5
export CONNECTION_TIMEOUT=300
export REQUEST_TIMEOUT=300

uv run python run_emulator.py
```

## Service Endpoints

| Service | URL | Purpose |
|---------|-----|---------|
| HAProxy Stats | http://localhost:8404/stats | Load balancer statistics |
| Centrifugo Node 1 | http://localhost:8100/ | Admin UI (admin/admin) |
| Centrifugo Node 2 | http://localhost:8200/ | Admin UI (admin/admin) |
| Centrifugo Node 3 | http://localhost:8300/ | Admin UI (admin/admin) |
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
Test completed. [total_clients=1000, total_cycles=3000, completed=3000, duration=66.39s]

THROUGHPUT:
  [requests_per_sec=45.19, tokens_per_sec=4519.09, cycles_per_sec=45.19]

REQUEST LATENCY (ms):
  [p50=79.05, p95=217.67, p99=284.88, max=387.60]

TOKEN LATENCY (ms):
  [p50=143.10, p95=476.47, p99=770.26]

CONNECTIONS:
  [successful=1000, failed=0, total_errors=0, reconnections=0]
================================================================================
```

Latest benchmark (recovery on, `history_size=1000`, ramp 5 ms):
- 1000 clients × 3 cycles, 66s: completed 2937/3000 (~98%); 45 req/s; req p95 218 ms; token p95 476 ms; errors 0; reconnections 0.

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

### 5000 Concurrent Clients (5 cycles each, Centrifugo v6)

**Infrastructure**: 3 Centrifugo nodes, 4 Granian instances (6 workers each = 24 total workers), HAProxy with 4 threads, Redis 7

**Test Results (December 16, 2025)**:
- Success Rate: 99.5% (24,881/25,000 cycles completed)
- Errors: 119 timeouts (0.5%)
- Duration: 719.99s (12 minutes)
- Throughput: 34.72 req/s, 3,464 tokens/s
- Request Latency: p50=53ms, p95=259ms, p99=425ms, max=1,182ms
- Token Latency: p50=415ms, p95=5,267ms, p99=11,091ms
- Reconnections: 4 (0.08% of clients)

**Previous Results (Single-threaded HAProxy)**:
- Success Rate: 98.8% (24,696/25,000 cycles)
- Errors: 304 timeouts (1.2%)
- Reconnections: High (measurement bug in previous version)

**HAProxy Multi-Threading Impact**:
- Error reduction: 61% fewer timeouts (304 to 119)
- Reconnections: 4 total (0.08% of clients)
- Latency improvement: 19% faster request p95, 16% faster token p99
- CPU utilization: Distributed across 4 cores vs single-core bottleneck

**Scaling Analysis**: HAProxy CPU bottleneck was the primary limitation at 5000 clients. Enabling multi-threading eliminated WebSocket connection instability and significantly improved success rates. Remaining errors are concentrated in cycle 1 during initial connection burst. System can scale beyond 5000 clients with further Redis/Centrifugo tuning.

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
- Granian: 4 instances with 6 workers each (24 total workers)
- Background task streaming for non-blocking token publishing

**Capacity Limits**:
- Proven capacity: 5000 concurrent clients (99.5% success rate, p95 request latency 259ms)
- Bottleneck eliminated: HAProxy multi-threading resolved WebSocket connection instability
- Scaling potential: System can handle beyond 5000 clients with additional Redis/Centrifugo tuning
- Current limitations: Remaining 0.5% errors concentrated in initial connection burst (cycle 1)

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
