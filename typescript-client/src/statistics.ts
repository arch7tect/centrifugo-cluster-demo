export class ClientStats {
  clientId: number;
  sessionId: string;
  requestLatencies: number[] = [];
  tokenLatencies: number[] = [];
  cyclesCompleted: number = 0;
  totalTokensReceived: number = 0;
  totalRequests: number = 0;
  connectionErrors: number = 0;
  timeoutErrors: number = 0;
  otherErrors: number = 0;
  startTime: number = 0;
  endTime: number = 0;

  constructor(clientId: number, sessionId: string) {
    this.clientId = clientId;
    this.sessionId = sessionId;
  }
}

export class AggregatedStats {
  totalClients: number;
  totalCycles: number;
  totalDuration: number;
  requestsPerSecond: number;
  tokensPerSecond: number;
  cyclesPerSecond: number;
  requestLatencyP50: number;
  requestLatencyP95: number;
  requestLatencyP99: number;
  requestLatencyMax: number;
  tokenLatencyP50: number;
  tokenLatencyP95: number;
  tokenLatencyP99: number;
  successfulConnections: number;
  failedConnections: number;
  totalErrors: number;

  constructor(data: Partial<AggregatedStats>) {
    Object.assign(this, data);
  }

  static fromClientStats(clientStats: ClientStats[]): AggregatedStats {
    if (clientStats.length === 0) {
      return new AggregatedStats({
        totalClients: 0,
        totalCycles: 0,
        totalDuration: 0,
        requestsPerSecond: 0,
        tokensPerSecond: 0,
        cyclesPerSecond: 0,
        requestLatencyP50: 0,
        requestLatencyP95: 0,
        requestLatencyP99: 0,
        requestLatencyMax: 0,
        tokenLatencyP50: 0,
        tokenLatencyP95: 0,
        tokenLatencyP99: 0,
        successfulConnections: 0,
        failedConnections: 0,
        totalErrors: 0
      });
    }

    const allRequestLatencies: number[] = [];
    const allTokenLatencies: number[] = [];
    let totalTokens = 0;
    let totalRequests = 0;
    let totalErrors = 0;
    let successful = 0;
    let failed = 0;

    const validStats = clientStats.filter(s => s.startTime > 0);
    const start = Math.min(...validStats.map(s => s.startTime));
    const end = Math.max(...validStats.map(s => s.endTime));
    const duration = end > start ? end - start : 0;

    for (const stats of clientStats) {
      allRequestLatencies.push(...stats.requestLatencies);
      allTokenLatencies.push(...stats.tokenLatencies);
      totalTokens += stats.totalTokensReceived;
      totalRequests += stats.totalRequests;
      totalErrors += stats.connectionErrors + stats.timeoutErrors + stats.otherErrors;

      if (stats.connectionErrors > 0) {
        failed++;
      } else {
        successful++;
      }
    }

    const totalCycles = clientStats.reduce((sum, s) => sum + s.cyclesCompleted, 0);

    return new AggregatedStats({
      totalClients: clientStats.length,
      totalCycles,
      totalDuration: duration,
      requestsPerSecond: duration > 0 ? totalRequests / duration : 0,
      tokensPerSecond: duration > 0 ? totalTokens / duration : 0,
      cyclesPerSecond: duration > 0 ? totalCycles / duration : 0,
      requestLatencyP50: percentile(allRequestLatencies, 50) * 1000,
      requestLatencyP95: percentile(allRequestLatencies, 95) * 1000,
      requestLatencyP99: percentile(allRequestLatencies, 99) * 1000,
      requestLatencyMax: allRequestLatencies.length > 0 ? Math.max(...allRequestLatencies) * 1000 : 0,
      tokenLatencyP50: percentile(allTokenLatencies, 50) * 1000,
      tokenLatencyP95: percentile(allTokenLatencies, 95) * 1000,
      tokenLatencyP99: percentile(allTokenLatencies, 99) * 1000,
      successfulConnections: successful,
      failedConnections: failed,
      totalErrors
    });
  }

  printReport(): void {
    console.log('\n');
    console.log('LOAD TEST RESULTS');
    console.log('================================================================================');
    console.log(`Test completed. [total_clients=${this.totalClients}, total_cycles=${this.totalCycles}, duration=${this.totalDuration.toFixed(2)}s]`);
    console.log('');
    console.log('THROUGHPUT:');
    console.log(`  [requests_per_sec=${this.requestsPerSecond.toFixed(2)}, tokens_per_sec=${this.tokensPerSecond.toFixed(2)}, cycles_per_sec=${this.cyclesPerSecond.toFixed(2)}]`);
    console.log('');
    console.log('REQUEST LATENCY (ms):');
    console.log(`  [p50=${this.requestLatencyP50.toFixed(2)}, p95=${this.requestLatencyP95.toFixed(2)}, p99=${this.requestLatencyP99.toFixed(2)}, max=${this.requestLatencyMax.toFixed(2)}]`);
    console.log('');
    console.log('TOKEN LATENCY (ms):');
    console.log(`  [p50=${this.tokenLatencyP50.toFixed(2)}, p95=${this.tokenLatencyP95.toFixed(2)}, p99=${this.tokenLatencyP99.toFixed(2)}]`);
    console.log('');
    console.log('CONNECTIONS:');
    console.log(`  [successful=${this.successfulConnections}, failed=${this.failedConnections}, total_errors=${this.totalErrors}]`);
    console.log('================================================================================');
    console.log('');
  }
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;

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
