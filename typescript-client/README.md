# TypeScript LLM Emulator Client

TypeScript implementation of the stateless LLM emulator client with standalone orchestrator.

## Features

- ✅ Full TypeScript implementation matching Python version
- ✅ WebSocket streaming via Centrifugo
- ✅ JWT authentication
- ✅ Comprehensive statistics (throughput, latency percentiles)
- ✅ Semaphore-based concurrency limiting
- ✅ Real-time progress logging
- ✅ Structured logging format

## Requirements

- Node.js >= 20.x
- npm
- Running infrastructure (Redis, Centrifugo cluster, HAProxy, Granian servers)

## Installation

```bash
cd typescript-client
npm install
```

## Usage

### Basic Usage

```bash
npm start
```

### With Parameters

```bash
npm start -- --clients 10 --cycles 5
npm start -- --clients 100 --cycles 10 --length 150 --delay 0.005
```

### Parameters

- `--clients N` - Number of concurrent clients (default: 10)
- `--cycles N` - Cycles per client (default: 5)
- `--length N` - Response length in words (default: 100)
- `--delay N` - Token delay in seconds (default: 0.01)
- `--max-concurrent N` - Max concurrent clients (default: 50)

### Environment Variables

```bash
export NUM_CLIENTS=50
export CYCLES_PER_CLIENT=10
npm start
```

## Quick Start from Project Root

```bash
# From project root
./run_typescript_emulator.sh

# Custom parameters
./run_typescript_emulator.sh 100 5 150 0.005 200
```

## Implementation Details

### Architecture

- **Runtime**: Node.js with TypeScript via `tsx`
- **WebSocket**: `ws` library (compatible with Centrifugo)
- **HTTP**: Native `fetch` API for REST API calls
- **Session Management**: REST API endpoints for session lifecycle
- **Authentication**: Server-generated JWT tokens

### Key Components

1. **src/client.ts** - EmulatorClient class
   - REST API session creation/closure
   - WebSocket connection (receive-only with minimal connect command)
   - Message handling and statistics collection

2. **src/statistics.ts** - Statistics classes
   - ClientStats: per-client metrics
   - AggregatedStats: cluster-wide analysis
   - Custom percentile calculation (no NumPy equivalent needed)

3. **src/orchestrator.ts** - Load test orchestrator
   - Semaphore for concurrency limiting
   - Progress logging every 10 seconds
   - Statistics aggregation

4. **src/config.ts** - Configuration management
   - CLI argument parsing
   - Environment variable support

5. **src/main.ts** - Entry point with graceful shutdown

### Session Lifecycle

1. **Create**: `POST /api/sessions/create` returns `{session_id, token}`
2. **Connect**: Open WebSocket with JWT token, send minimal connect command
3. **Stream**: Receive tokens via WebSocket push messages (no client sends)
4. **Close**: `DELETE /api/sessions/{session_id}` and close WebSocket

### Percentile Calculation

Uses linear interpolation for accurate percentiles without NumPy:

```typescript
function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);

  if (Number.isInteger(index)) {
    return sorted[index];
  }

  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}
```

## Comparison with Python Version

Both implementations provide identical functionality:

| Feature | Python | TypeScript |
|---------|--------|------------|
| WebSocket | `websockets` | `ws` |
| HTTP Client | `httpx` | `fetch` |
| Session Management | REST API | REST API |
| JWT Generation | Server-side | Server-side |
| Async | `asyncio` | Native Promises |
| Percentiles | `numpy` | Custom implementation |
| Performance | ✅ | ✅ |

## Development

### Watch Mode

```bash
npm run dev
```

### Build

```bash
npm run build
```

## Testing

Run small test:

```bash
npm start -- --clients 5 --cycles 2
```

Run stress test:

```bash
npm start -- --clients 100 --cycles 5
```

## Logging

All logs follow structured format:

```
Client connected successfully. [client_id=0, session_id=123e4567-e89b-12d3-a456-426614174000]
Test progress. [cycles=50, tokens=5000, errors=0]
```

## Troubleshooting

### Connection Errors

```bash
# Check infrastructure is running
../status_emulator.sh

# Restart infrastructure
../stop_emulator.sh
../start_emulator.sh
```

### TypeScript Errors

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## Example Output

```
Emulator starting. [num_clients=10, cycles_per_client=5]
Client connected successfully. [client_id=0, session_id=...]
Client connected successfully. [client_id=1, session_id=...]
...

LOAD TEST RESULTS
===============================================================================
Test completed. [total_clients=10, total_cycles=50, duration=18.42s]

THROUGHPUT:
  [requests_per_sec=2.72, tokens_per_sec=271.58, cycles_per_sec=2.72]

REQUEST LATENCY (ms):
  [p50=2650.23, p95=2801.45, p99=2850.67, max=2875.12]

TOKEN LATENCY (ms):
  [p50=2650.25, p95=2801.47, p99=2850.69]

CONNECTIONS:
  [successful=10, failed=0, total_errors=0]
===============================================================================
```
