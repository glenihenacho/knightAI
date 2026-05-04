import type { FastifyInstance } from "fastify";
import {
  CreatePairingRequestSchema,
  RedeemPairingRequestSchema,
  type CreatePairingResponse,
  type RedeemPairingResponse,
} from "@surveillance/shared";
import type { Store } from "../db/store.js";
import type { Env } from "../env.js";

export function registerPairingRoutes(app: FastifyInstance, store: Store, env: Env): void {
  app.post("/v1/pairings", async (req, reply) => {
    const body = CreatePairingRequestSchema.parse(req.body);
    const org = await store.getOrganization(body.organizationId);
    if (!org) {
      return reply.code(404).send({ error: "organization not found" });
    }
    const pairing = await store.createPairing(body.organizationId);
    const response: CreatePairingResponse = {
      pairingId: pairing.id,
      code: pairing.code,
      expiresAt: pairing.expiresAt,
    };
    return reply.code(201).send(response);
  });

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
