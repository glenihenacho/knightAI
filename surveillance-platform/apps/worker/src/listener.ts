// Postgres LISTEN with reconnect-on-disconnect. A dedicated client (not a
// pool connection) because LISTEN binds to the session. Losing the
// connection loses any NOTIFYs sent meanwhile — acceptable: segments arrive
// every ~2s per camera, so detection resumes on the next one, and the config
// cache has a TTL backstop.

import pg from "pg";
import type { Logger } from "pino";

export interface ListenerHandlers {
  onNotification(channel: string, payload: string): void;
}

export class PgListener {
  private client: pg.Client | null = null;
  private stopped = false;

  constructor(
    private readonly databaseUrl: string,
    private readonly channels: string[],
    private readonly handlers: ListenerHandlers,
    private readonly log: Logger,
  ) {}

  async start(): Promise<void> {
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const client = new pg.Client({ connectionString: this.databaseUrl });
    this.client = client;
    client.on("notification", (msg) => {
      this.handlers.onNotification(msg.channel, msg.payload ?? "");
    });
    client.on("error", (err) => {
      this.log.warn({ err }, "listener connection error");
    });
    client.on("end", () => {
      if (this.stopped) return;
      this.log.warn("listener disconnected, reconnecting in 1s");
      setTimeout(() => void this.connect().catch(() => this.scheduleRetry()), 1000);
    });
    try {
      await client.connect();
      for (const channel of this.channels) {
        await client.query(`LISTEN ${pg.escapeIdentifier(channel)}`);
      }
      this.log.info({ channels: this.channels }, "listening");
    } catch (err) {
      this.log.error({ err }, "listener connect failed");
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    setTimeout(() => void this.connect().catch(() => this.scheduleRetry()), 2000);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.client?.end().catch(() => {});
  }
}
