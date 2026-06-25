import { createHash, timingSafeEqual } from "node:crypto";

// Process-local coordination for connector dormancy. A paired-but-idle
// connector that keeps long-polling /commands/next writes to Postgres on every
// poll, which keeps Neon's serverless compute from suspending. So an idle
// connector goes dormant: it stops hitting the DB-backed poll endpoint and
// instead polls wake-check here. Nothing in this module touches Postgres, so a
// dormant connector imposes no database load — Neon can suspend.
//
// State is in-memory and per-process. On an API restart the token cache is
// empty; wake-check then reports "uncached" so the connector falls back to a
// full (DB-backed) poll, which re-authenticates and re-populates the cache.

const wakeRequested = new Set<string>();
const tokenHashByConnector = new Map<string, string>();

function sha256Hex(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

// Ask a (possibly dormant) connector to wake. Called by the operator wake
// route and whenever a command is queued for the connector.
export function requestConnectorWake(connectorId: string): void {
  wakeRequested.add(connectorId);
}

// One-shot latch read by wake-check: true once after a wake request, then clears.
export function consumeConnectorWake(connectorId: string): boolean {
  return wakeRequested.delete(connectorId);
}

// Cache the connector's token hash on each full (DB-backed) auth so wake-check
// can authenticate without a database round-trip.
export function rememberConnectorToken(connectorId: string, tokenHash: string): void {
  tokenHashByConnector.set(connectorId, tokenHash);
}

export type CachedAuthResult = "ok" | "uncached" | "denied";

// Authenticate a wake-check against the cached token hash — no DB query.
export function verifyCachedConnectorToken(connectorId: string, token: string): CachedAuthResult {
  const cached = tokenHashByConnector.get(connectorId);
  if (!cached) return "uncached";
  const a = Buffer.from(sha256Hex(token), "hex");
  const b = Buffer.from(cached, "hex");
  if (a.length !== b.length) return "denied";
  return timingSafeEqual(a, b) ? "ok" : "denied";
}

// Test seam: drop all in-memory state.
export function __resetConnectorWake(): void {
  wakeRequested.clear();
  tokenHashByConnector.clear();
}
