/**
 * In-memory store used for early scaffolding. Swap for a Postgres-backed
 * implementation that mirrors `infra/database/migrations` once the schema lands.
 */
import { randomUUID } from "node:crypto";
import type { Camera, Command, Connector, ConnectorStatus } from "@surveillance/shared";

interface PairingRecord {
  id: string;
  organizationId: string;
  code: string;
  expiresAt: string;
  redeemedConnectorId: string | null;
}

interface QueuedCommand {
  command: Command;
  connectorId: string;
  status: "queued" | "in_flight" | "done";
}

class Store {
  pairings = new Map<string, PairingRecord>();
  connectors = new Map<string, Connector & { token: string }>();
  cameras = new Map<string, Camera>();
  commands = new Map<string, QueuedCommand>();
  results = new Map<string, unknown>();

  createPairing(organizationId: string, ttlSeconds = 600): PairingRecord {
    const id = randomUUID();
    const code = generateCode();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const record: PairingRecord = {
      id,
      organizationId,
      code,
      expiresAt,
      redeemedConnectorId: null,
    };
    this.pairings.set(id, record);
    return record;
  }

  redeemPairing(code: string, info: {
    hostname: string;
    platform: "macos" | "windows" | "linux";
    version: string;
  }): { connector: Connector; token: string } | null {
    const pairing = [...this.pairings.values()].find(
      (p) => p.code === code && p.redeemedConnectorId === null && new Date(p.expiresAt) > new Date(),
    );
    if (!pairing) return null;

    const connectorId = randomUUID();
    const token = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
    const connector: Connector = {
      id: connectorId,
      organizationId: pairing.organizationId,
      label: `${info.hostname} (${info.platform})`,
      hostname: info.hostname,
      platform: info.platform,
      version: info.version,
      status: "online",
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    this.connectors.set(connectorId, { ...connector, token });
    pairing.redeemedConnectorId = connectorId;
    return { connector, token };
  }

  authConnector(connectorId: string, token: string): Connector | null {
    const c = this.connectors.get(connectorId);
    if (!c || c.token !== token) return null;
    c.lastSeenAt = new Date().toISOString();
    return c;
  }

  setConnectorStatus(connectorId: string, status: ConnectorStatus): void {
    const c = this.connectors.get(connectorId);
    if (c) c.status = status;
  }

  enqueueCommand(connectorId: string, command: Command): void {
    this.commands.set(command.id, { command, connectorId, status: "queued" });
  }

  takeNextCommand(connectorId: string): Command | null {
    for (const entry of this.commands.values()) {
      if (entry.connectorId === connectorId && entry.status === "queued") {
        entry.status = "in_flight";
        return entry.command;
      }
    }
    return null;
  }

  recordResult(commandId: string, result: unknown): boolean {
    const entry = this.commands.get(commandId);
    if (!entry) return false;
    entry.status = "done";
    this.results.set(commandId, result);
    return true;
  }
}

export const store = new Store();

function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = () => alphabet[Math.floor(Math.random() * alphabet.length)] ?? "A";
  const block = () => Array.from({ length: 4 }, pick).join("");
  return `${block()}-${block()}`;
}
