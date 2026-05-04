import type { FastifyInstance } from "fastify";
import {
  CreatePairingRequestSchema,
  RedeemPairingRequestSchema,
  type CreatePairingResponse,
  type RedeemPairingResponse,
} from "@surveillance/shared";
import type { Store } from "../db/store.js";
import type { Env } from "../env.js";
import { requireOperator } from "../auth.js";

export function registerPairingRoutes(app: FastifyInstance, store: Store, env: Env): void {
  // Create a pairing for the operator's own org. The org id is derived from
  // the session — the request body never carries it, so cross-tenant misuse is
  // structurally impossible.
  app.post("/v1/pairings", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    CreatePairingRequestSchema.parse(req.body ?? {});
    const pairing = await store.createPairing(user.organizationId);
    const response: CreatePairingResponse = {
      pairingId: pairing.id,
      code: pairing.code,
      expiresAt: pairing.expiresAt,
    };
    return reply.code(201).send(response);
  });

  // Redeemed by the connector itself, before any session exists. Stays
  // unauthenticated — the pairing code is the credential.
  app.post("/v1/pairings/redeem", async (req, reply) => {
    const body = RedeemPairingRequestSchema.parse(req.body);
    const result = await store.redeemPairing(body.code, {
      hostname: body.hostname,
      platform: body.platform,
      version: body.version,
    });
    if (!result) {
      return reply.code(404).send({ error: "invalid or expired pairing code" });
    }
    const response: RedeemPairingResponse = {
      connectorId: result.connector.id,
      connectorToken: result.token,
      apiBaseUrl: env.PUBLIC_BASE_URL,
      pollIntervalMs: env.CONNECTOR_POLL_INTERVAL_MS,
    };
    return reply.code(200).send(response);
  });
}
