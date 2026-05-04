import type { FastifyInstance } from "fastify";
import {
  CreatePairingRequestSchema,
  RedeemPairingRequestSchema,
  type CreatePairingResponse,
  type RedeemPairingResponse,
} from "@surveillance/shared";
import { store } from "../db/store.js";
import { loadEnv } from "../env.js";

export function registerPairingRoutes(app: FastifyInstance): void {
  const env = loadEnv();

  app.post("/v1/pairings", async (req, reply) => {
    const body = CreatePairingRequestSchema.parse(req.body);
    const pairing = store.createPairing(body.organizationId);
    const response: CreatePairingResponse = {
      pairingId: pairing.id,
      code: pairing.code,
      expiresAt: pairing.expiresAt,
    };
    return reply.code(201).send(response);
  });

  app.post("/v1/pairings/redeem", async (req, reply) => {
    const body = RedeemPairingRequestSchema.parse(req.body);
    const result = store.redeemPairing(body.code, {
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
