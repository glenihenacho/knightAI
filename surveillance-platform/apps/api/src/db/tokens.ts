import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Credential generation, hashing, and constant-time comparison for connector
// and session tokens. Kept dependency-free (node:crypto only) so it can be
// unit tested without importing db/store.ts, which pulls in the Postgres pool.

const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePairingCode(): string {
  const pick = () => PAIRING_ALPHABET[randomBytes(1)[0]! % PAIRING_ALPHABET.length];
  const block = () => Array.from({ length: 4 }, pick).join("");
  return `${block()}-${block()}`;
}

export function generateConnectorToken(): string {
  return randomBytes(48).toString("hex");
}

export function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

export function compareTokenHash(plain: string, hash: string): boolean {
  const a = Buffer.from(hashToken(plain), "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
