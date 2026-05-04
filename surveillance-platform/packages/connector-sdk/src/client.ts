import {
  CommandSchema,
  RedeemPairingResponseSchema,
  type Command,
  type CommandResult,
  type RedeemPairingRequest,
  type RedeemPairingResponse,
} from "@surveillance/shared";
import type { ConnectorIdentity, SnapshotUpload } from "./types.js";

export class ConnectorApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ConnectorApiError";
  }
}

export class ConnectorClient {
  constructor(private readonly identity: ConnectorIdentity) {}

  static async pair(
    apiBaseUrl: string,
    request: RedeemPairingRequest,
  ): Promise<RedeemPairingResponse> {
    const res = await fetch(`${apiBaseUrl}/v1/pairings/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      throw new ConnectorApiError(`pairing failed: ${await res.text()}`, res.status);
    }
    return RedeemPairingResponseSchema.parse(await res.json());
  }

  /** Long-poll the next command for this connector. Returns null when no work. */
  async pullNextCommand(signal?: AbortSignal): Promise<Command | null> {
    const res = await fetch(`${this.identity.apiBaseUrl}/v1/connectors/commands/next`, {
      method: "GET",
      headers: this.authHeaders(),
      signal,
    });
    if (res.status === 204) return null;
    if (!res.ok) {
      throw new ConnectorApiError(`pull failed: ${await res.text()}`, res.status);
    }
    return CommandSchema.parse(await res.json());
  }

  async submitResult(result: CommandResult): Promise<void> {
    const res = await fetch(
      `${this.identity.apiBaseUrl}/v1/connectors/commands/${result.commandId}/result`,
      {
        method: "POST",
        headers: { ...this.authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(result),
      },
    );
    if (!res.ok) {
      throw new ConnectorApiError(`submit failed: ${await res.text()}`, res.status);
    }
  }

  async uploadSnapshot(upload: SnapshotUpload): Promise<void> {
    const res = await fetch(
      `${this.identity.apiBaseUrl}/v1/connectors/uploads/${encodeURIComponent(upload.uploadKey)}`,
      {
        method: "PUT",
        headers: { ...this.authHeaders(), "content-type": upload.contentType },
        body: upload.bytes,
      },
    );
    if (!res.ok) {
      throw new ConnectorApiError(`upload failed: ${await res.text()}`, res.status);
    }
  }

  private authHeaders(): Record<string, string> {
    return {
      authorization: `Bearer ${this.identity.connectorToken}`,
      "x-connector-id": this.identity.connectorId,
    };
  }
}
