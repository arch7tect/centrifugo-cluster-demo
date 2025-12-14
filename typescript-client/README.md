# TypeScript LLM Emulator Client

TypeScript implementation of the stateless LLM emulator client.

## Installation

```bash
cd typescript-client
npm install
```

## Usage

```bash
npm start -- --clients 10 --cycles 5
```

Parameters: `--clients`, `--cycles`, `--length`, `--delay`

## Logging

All test runs automatically log to timestamped files in `logs/` directory:
- Console output: stderr (for real-time monitoring)
- File output: `logs/load_test_{clients}clients_{cycles}cycles_{timestamp}.log`
- Format: `YYYY-MM-DD HH:MM:SS - module - LEVEL - message`

Example log file: `logs/load_test_10clients_5cycles_20251214_092058.log`

## Key Differences from Python

| Feature | Python | TypeScript |
|---------|--------|------------|
| WebSocket | `websockets` | `ws` |
| HTTP Client | `httpx` | `fetch` |
| Async | `asyncio` | Native Promises |
| Percentiles | `numpy` | Custom implementation |

## Percentile Calculation

Custom linear interpolation implementation (no NumPy dependency):

```typescript
function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);

  if (Number.isInteger(index)) return sorted[index];

  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}
```
