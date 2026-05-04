import type { CommandResult } from "@surveillance/shared";
import { ConnectorClient } from "./client.js";
import type { CommandHandler } from "./types.js";

export interface PollerOptions {
  client: ConnectorClient;
  handler: CommandHandler;
  pollIntervalMs: number;
  onError?: (err: unknown) => void;
}

export class CommandPoller {
  private running = false;
  private abort = new AbortController();

  constructor(private readonly options: PollerOptions) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.abort = new AbortController();
    void this.loop();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.abort.abort();
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const command = await this.options.client.pullNextCommand(this.abort.signal);
        if (!command) {
          await this.sleep(this.options.pollIntervalMs);
          continue;
        }
        const startedAt = Date.now();
        const partial = await this.options.handler(command);
        const result: CommandResult = {
          ...partial,
          commandId: command.id,
          finishedAt: new Date().toISOString(),
          durationMs: partial.durationMs ?? Date.now() - startedAt,
        };
        await this.options.client.submitResult(result);
      } catch (err) {
        if (this.abort.signal.aborted) return;
        this.options.onError?.(err);
        await this.sleep(this.options.pollIntervalMs);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.abort.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
