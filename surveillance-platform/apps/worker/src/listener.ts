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

export interface ReconnectPolicy {
  // Delay before reconnecting while the pipeline is active (segments flowing).
  activeMs: number;
  // Delay before reconnecting while idle. Kept past Neon's suspend window so a
  // dropped connection doesn't immediately wake the compute back up.
  idleMs: number;
  // No NOTIFY for this long ⇒ idle.
  idleAfterMs: number;
}

const DEFAULT_POLICY: ReconnectPolicy = {
  activeMs: 1_000,
  idleMs: 300_000,
  idleAfterMs: 60_000,
};

export class PgListener {
  private client: pg.Client | null = null;
  private stopped = false;
  private lastNotificationAt = 0;
  private readonly policy: ReconnectPolicy;

  constructor(
    private readonly databaseUrl: string,
    private readonly channels: string[],
    private readonly handlers: ListenerHandlers,
    private readonly log: Logger,
    policy: Partial<ReconnectPolicy> = {},
  ) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }

  // Reconnect fast while work is flowing; back off when idle so Neon can stay
  // suspended instead of being woken every second by a reconnect.
  private reconnectDelayMs(): number {
    const idle = Date.now() - this.lastNotificationAt > this.policy.idleAfterMs;
    return idle ? this.policy.idleMs : this.policy.activeMs;
  }

  async start(): Promise<void> {
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const client = new pg.Client({ connectionString: this.databaseUrl });
    this.client = client;
    client.on("notification", (msg) => {
      this.lastNotificationAt = Date.now();
      this.handlers.onNotification(msg.channel, msg.payload ?? "");
    });
    client.on("error", (err) => {
      this.log.warn({ err }, "listener connection error");
    });
    client.on("end", () => {
      if (this.stopped) return;
      const delay = this.reconnectDelayMs();
      this.log.warn({ delayMs: delay }, "listener disconnected, reconnecting");
      setTimeout(() => void this.connect().catch(() => this.scheduleRetry()), delay);
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
    setTimeout(() => void this.connect().catch(() => this.scheduleRetry()), this.reconnectDelayMs());
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.client?.end().catch(() => {});
  }
}
