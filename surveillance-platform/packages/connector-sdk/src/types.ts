import type { Command, CommandResult } from "@surveillance/shared";

export interface ConnectorIdentity {
  connectorId: string;
  connectorToken: string;
  apiBaseUrl: string;
}

export interface CommandHandler {
  (command: Command): Promise<Omit<CommandResult, "commandId" | "finishedAt">>;
}

export interface SnapshotUpload {
  uploadKey: string;
  contentType: "image/jpeg" | "image/png";
  bytes: Uint8Array;
}
