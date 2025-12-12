import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import type { EmulatorConfig } from './config';
import { ClientStats } from './statistics';

export class EmulatorClient {
  private clientId: number;
  private config: EmulatorConfig;
  private sessionId: string;
  private ws: WebSocket | null = null;
  private stats: ClientStats;
  private tokenQueue: string[] = [];
  private tokenResolvers: Array<() => void> = [];
  private doneResolve: (() => void) | null = null;
  private donePromise: Promise<void>;

  constructor(clientId: number, config: EmulatorConfig) {
    this.clientId = clientId;
    this.config = config;
    this.sessionId = crypto.randomUUID();
    this.stats = new ClientStats(clientId, this.sessionId);
    this.donePromise = new Promise((resolve) => {
      this.doneResolve = resolve;
    });
  }

  private generateToken(channel: string): string {
    const payload = {
      sub: `client-${this.clientId}`,
      exp: Math.floor(Date.now() / 1000) + 3600,
      channels: [channel]
    };
    return jwt.sign(payload, this.config.jwtSecret, { algorithm: 'HS256' });
  }

  async connect(): Promise<boolean> {
    try {
      const token = this.generateToken(`session:${this.sessionId}`);
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

      this.ws.send(JSON.stringify({
        id: 2,
        subscribe: { channel: `session:${this.sessionId}` }
      }));

      await new Promise<void>((resolve) => {
        const handler = (data: Buffer) => {
          this.ws?.off('message', handler);
          resolve();
        };
        this.ws?.on('message', handler);
      });

      this.setupWebSocketHandlers();

      console.log(`Client connected successfully. [client_id=${this.clientId}, session_id=${this.sessionId}]`);
      return true;

    } catch (error) {
      console.error(`Client connection failed. [client_id=${this.clientId}, session_id=${this.sessionId}, error=${(error as Error).message}]`);
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

        if (message.ping) {
          this.ws?.send(JSON.stringify({}));
        }

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
