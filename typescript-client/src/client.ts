import WebSocket from 'ws';
import type { EmulatorConfig } from './config';
import { ClientStats } from './statistics';

export class EmulatorClient {
  private clientId: number;
  private config: EmulatorConfig;
  private sessionId: string = '';
  private ws: WebSocket | null = null;
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
      // Create session via REST API
      const response = await fetch(`${this.config.haproxyHttpUrl}/api/sessions/create`, {
        method: 'POST'
      });
      const data = await response.json();
      this.sessionId = data.session_id;
      const token = data.token;
      this.stats.sessionId = this.sessionId;

      // Open WebSocket
      const wsUrl = `${this.config.haproxyWsUrl}/connection/websocket`;
      this.ws = await new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(wsUrl, {
          protocol: 'json'
        });
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, this.config.connectionTimeout);

        ws.on('open', () => {
          clearTimeout(timeout);
          resolve(ws);
        });

        ws.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      // Send minimal connect command (required by Centrifugo)
      this.ws.send(JSON.stringify({
        id: 1,
        connect: { token }
      }));

      await new Promise<void>((resolve) => {
        const handler = (data: Buffer) => {
          this.ws?.off('message', handler);
          resolve();
        };
        this.ws?.on('message', handler);
      });

      // Server already subscribed us via API, so NO subscribe command needed!
      this.setupWebSocketHandlers();

      console.log(`Client connected successfully. [client_id=${this.clientId}, session_id=${this.sessionId}]`);
      return true;

    } catch (error) {
      console.error(`Client connection failed. [client_id=${this.clientId}, error=${(error as Error).message}]`);
      this.stats.connectionErrors++;
      return false;
    }
  }

  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.push?.pub?.data) {
          const pushData = message.push.pub.data;

          if (pushData.token) {
            this.tokenQueue.push(pushData.token);
            this.stats.totalTokensReceived++;

            if (this.tokenResolvers.length > 0) {
              const resolve = this.tokenResolvers.shift();
              resolve?.();
            }
          }

          if (pushData.done && this.doneResolve) {
            this.doneResolve();
          }
        }

        // NO ping/pong handling - client never sends!

      } catch (error) {
        console.error(`WebSocket message parse error. [client_id=${this.clientId}, session_id=${this.sessionId}, error=${(error as Error).message}]`);
      }
    });

    this.ws.on('close', () => {
      // Connection closed
    });

    this.ws.on('error', (error) => {
      console.error(`WebSocket error. [client_id=${this.clientId}, session_id=${this.sessionId}, error=${error.message}]`);
      this.stats.otherErrors++;
    });
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
        console.error(`Cycle timeout. [client_id=${this.clientId}, session_id=${this.sessionId}]`);
        this.stats.timeoutErrors++;
      } else {
        console.error(`Cycle execution error. [client_id=${this.clientId}, session_id=${this.sessionId}, error=${(error as Error).message}]`);
        this.stats.otherErrors++;
      }
      return null;
    }
  }

  async disconnect(): Promise<void> {
    // Close session via REST API
    if (this.sessionId) {
      try {
        await fetch(`${this.config.haproxyHttpUrl}/api/sessions/${this.sessionId}`, {
          method: 'DELETE'
        });
      } catch (error) {
        console.warn(`Failed to close session. [session_id=${this.sessionId}, error=${(error as Error).message}]`);
      }
    }

    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
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
        console.warn(`Cycle failed. [client_id=${this.clientId}, session_id=${this.sessionId}, cycle=${cycle + 1}]`);
      }
    }

    await this.disconnect();
    this.stats.endTime = performance.now() / 1000;

    return this.stats;
  }
}
