import type { EmulatorConfig } from './config';
import { EmulatorClient } from './client';
import { ClientStats, AggregatedStats } from './statistics';

class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    const resolve = this.queue.shift();
    if (resolve) {
      this.permits--;
      resolve();
    }
  }
}

export class EmulatorOrchestrator {
  private config: EmulatorConfig;
  private clientsStats: ClientStats[] = [];
  private running: boolean = false;
  private progressInterval: NodeJS.Timeout | null = null;

  constructor(config: EmulatorConfig) {
    this.config = config;
  }

  private async runClient(clientId: number, semaphore: Semaphore): Promise<void> {
    await semaphore.acquire();
    try {
      const client = new EmulatorClient(clientId, this.config);
      const stats = await client.run();
      this.clientsStats.push(stats);
    } finally {
      semaphore.release();
    }
  }

  private logProgress(): void {
    if (this.clientsStats.length === 0) return;

    const totalCycles = this.clientsStats.reduce((sum, s) => sum + s.cyclesCompleted, 0);
    const totalTokens = this.clientsStats.reduce((sum, s) => sum + s.totalTokensReceived, 0);
    const totalErrors = this.clientsStats.reduce(
      (sum, s) => sum + s.connectionErrors + s.timeoutErrors + s.otherErrors,
      0
    );

    console.log(`Test progress. [cycles=${totalCycles}, tokens=${totalTokens}, errors=${totalErrors}]`);
  }

  async run(): Promise<void> {
    console.log(`Emulator starting. [num_clients=${this.config.numClients}, cycles_per_client=${this.config.cyclesPerClient}]`);

    this.running = true;
    this.progressInterval = setInterval(() => {
      if (this.running) {
        this.logProgress();
      }
    }, 10000);

    const semaphore = new Semaphore(this.config.maxConcurrentClients);
    const tasks: Promise<void>[] = [];

    for (let i = 0; i < this.config.numClients; i++) {
      tasks.push(this.runClient(i, semaphore));
    }

    await Promise.all(tasks);

    this.running = false;
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }

    const aggregated = AggregatedStats.fromClientStats(this.clientsStats);
    aggregated.printReport();
  }
}
