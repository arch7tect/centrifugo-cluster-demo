import { Centrifuge, PublicationContext, Subscription } from 'centrifuge';
import type { EmulatorConfig } from './config';
import { ClientStats } from './statistics';
import { getLogger } from './logger';

const logger = getLogger('emulator.emulator_client');

export class EmulatorClient {
  private clientId: number;
  private config: EmulatorConfig;
  private sessionId: string = '';
  private token: string = '';
  private centrifuge: Centrifuge | null = null;
  private subscription: Subscription | null = null;
  private stats: ClientStats;
  private tokenQueue: string[] = [];
  private tokenResolvers: Array<() => void> = [];
  private doneResolve: (() => void) | null = null;
  private donePromise: Promise<void>;

  constructor(clientId: number, config: EmulatorConfig) {
    this.clientId = clientId;
    this.config = config;
    this.stats = new ClientStats(clientId, '');
    this.donePromise = new Promise((resolve) => {
      this.doneResolve = resolve;
    });
  }

  async connect(): Promise<boolean> {
    try {
      // Create session via REST API (only on initial connect)
      if (!this.sessionId) {
        const response = await fetch(`${this.config.haproxyHttpUrl}/api/sessions/create`, {
          method: 'POST'
        });
        const data = await response.json();
        this.sessionId = data.session_id;
        this.token = data.token;
        this.stats.sessionId = this.sessionId;
      }

      const wsUrl = `${this.config.haproxyWsUrl}/connection/websocket`;

      this.centrifuge = new Centrifuge(wsUrl, {
        token: this.token,
      });

      this.centrifuge.on('connected', (ctx) => {
        logger.info(`Client connected successfully. [client_id=${this.clientId}, session_id=${this.sessionId}]`);
      });

      this.centrifuge.on('disconnected', (ctx) => {
        logger.warning(`Client disconnected. [client_id=${this.clientId}, session_id=${this.sessionId}]`);
        this.stats.reconnectionCount++;
      });

      this.centrifuge.on('error', (ctx) => {
        logger.error(`Client error. [client_id=${this.clientId}, session_id=${this.sessionId}, error=${ctx.error?.message}]`);
        this.stats.otherErrors++;
      });

      this.centrifuge.on('publication', (ctx: PublicationContext) => {
        const data = ctx.data;
        logger.debug(`Server publication received. [client_id=${this.clientId}, session_id=${this.sessionId}]`);

        if (data.token) {
          this.tokenQueue.push(data.token);
          this.stats.totalTokensReceived++;

          if (this.tokenResolvers.length > 0) {
            const resolve = this.tokenResolvers.shift();
            resolve?.();
          }
        }

        if (data.done && this.doneResolve) {
          this.doneResolve();
        }
      });

      this.centrifuge.connect();

      const channel = `session:${this.sessionId}`;
      this.subscription = this.centrifuge.newSubscription(channel);

      this.subscription.on('publication', (ctx: PublicationContext) => {
        const data = ctx.data;
        logger.debug(`Publication received. [client_id=${this.clientId}, session_id=${this.sessionId}]`);

        if (data.token) {
          this.tokenQueue.push(data.token);
          this.stats.totalTokensReceived++;

          if (this.tokenResolvers.length > 0) {
            const resolve = this.tokenResolvers.shift();
            resolve?.();
          }
        }

        if (data.done && this.doneResolve) {
          this.doneResolve();
        }
      });

      this.subscription.subscribe();

      return true;

    } catch (error) {
      logger.error(`Client connection failed. [client_id=${this.clientId}, error=${(error as Error).message}]`);
      this.stats.connectionErrors++;
      return false;
    }
  }

  private async waitForToken(): Promise<string> {
    if (this.tokenQueue.length > 0) {
      return this.tokenQueue.shift()!;
    }

    return new Promise((resolve) => {
      this.tokenResolvers.push(() => {
        resolve(this.tokenQueue.shift()!);
      });
    });
  }

  async runCycle(question: string): Promise<string | null> {
    try {
      this.tokenQueue = [];
      this.donePromise = new Promise((resolve) => {
        this.doneResolve = resolve;
      });

      const firstTokenStart = performance.now();
      const requestStart = performance.now();

      const response = await Promise.race([
        fetch(`${this.config.haproxyHttpUrl}/api/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: this.sessionId, question })
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), this.config.requestTimeout)
        )
      ]);

      const requestLatency = (performance.now() - requestStart) / 1000;
      this.stats.requestLatencies.push(requestLatency);
      this.stats.totalRequests++;

      const firstToken = await Promise.race([
        this.waitForToken(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Token timeout')), this.config.requestTimeout)
        )
      ]);

      const firstTokenLatency = (performance.now() - firstTokenStart) / 1000;
      this.stats.tokenLatencies.push(firstTokenLatency);

      await Promise.race([
        this.donePromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Done timeout')), this.config.requestTimeout)
        )
      ]);

      const data = await response.json();
      const fullResponse = data.response;
      this.stats.cyclesCompleted++;

      return fullResponse;

    } catch (error) {
      if ((error as Error).message.includes('timeout')) {
        logger.error(`Cycle timeout. [client_id=${this.clientId}, session_id=${this.sessionId}]`);
        this.stats.timeoutErrors++;
      } else {
        logger.error(`Cycle execution error. [client_id=${this.clientId}, session_id=${this.sessionId}, error=${(error as Error).message}]`);
        this.stats.otherErrors++;
      }
      return null;
    }
  }

  async disconnect(): Promise<void> {
    // Unsubscribe from channel
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription.removeAllListeners();
      this.subscription = null;
    }

    // Disconnect Centrifuge client
    if (this.centrifuge) {
      this.centrifuge.removeAllListeners();
      this.centrifuge.disconnect();
      this.centrifuge = null;
    }

    // Close session via REST API
    if (this.sessionId) {
      try {
        await fetch(`${this.config.haproxyHttpUrl}/api/sessions/${this.sessionId}`, {
          method: 'DELETE'
        });
      } catch (error) {
        logger.warning(`Failed to close session. [session_id=${this.sessionId}, error=${(error as Error).message}]`);
      }
    }
  }

  async run(): Promise<ClientStats> {
    this.stats.startTime = performance.now() / 1000;

    if (!await this.connect()) {
      this.stats.endTime = performance.now() / 1000;
      return this.stats;
    }

    for (let cycle = 0; cycle < this.config.cyclesPerClient; cycle++) {
      const question = `Question ${cycle + 1} from client ${this.clientId}`;
      const result = await this.runCycle(question);

      if (result === null) {
        logger.warning(`Cycle failed. [client_id=${this.clientId}, session_id=${this.sessionId}, cycle=${cycle + 1}]`);
      }
    }

    await this.disconnect();
    this.stats.endTime = performance.now() / 1000;

    return this.stats;
  }
}
