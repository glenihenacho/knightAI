import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareTokenHash,
  generateConnectorToken,
  generatePairingCode,
  hashToken,
} from "./tokens.js";

test("hashToken is a deterministic 64-char sha256 hex digest", () => {
  const a = hashToken("hunter2");
  const b = hashToken("hunter2");
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(hashToken("hunter2"), hashToken("hunter3"));
});

test("compareTokenHash accepts the matching plaintext", () => {
  const token = generateConnectorToken();
  assert.equal(compareTokenHash(token, hashToken(token)), true);
});

test("compareTokenHash rejects a wrong plaintext of the same length", () => {
  const token = generateConnectorToken();
  const other = generateConnectorToken();
  assert.equal(compareTokenHash(other, hashToken(token)), false);
});

test("compareTokenHash rejects a malformed / wrong-length stored hash", () => {
  const token = generateConnectorToken();
  // Truncated hash must not throw and must not compare equal.
  assert.equal(compareTokenHash(token, hashToken(token).slice(0, 32)), false);
  assert.equal(compareTokenHash(token, ""), false);
});

test("generateConnectorToken yields 96 hex chars (48 random bytes)", () => {
  assert.match(generateConnectorToken(), /^[0-9a-f]{96}$/);
});

test("generatePairingCode matches XXXX-XXXX from the unambiguous alphabet", () => {
  for (let i = 0; i < 50; i += 1) {
    const code = generatePairingCode();
    assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
  }
});
