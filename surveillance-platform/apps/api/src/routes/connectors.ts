import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Connector } from "@surveillance/shared";
import { store } from "../db/store.js";

export interface AuthenticatedRequest extends FastifyRequest {
  connector: Connector;
}

export function authenticateConnector(
  req: FastifyRequest,
  reply: FastifyReply,
): Connector | null {
  const auth = req.headers["authorization"];
  const id = req.headers["x-connector-id"];
  if (typeof auth !== "string" || typeof id !== "string" || !auth.startsWith("Bearer ")) {
    reply.code(401).send({ error: "missing connector credentials" });
    return null;
  }
  const token = auth.slice("Bearer ".length);
  const connector = store.authConnector(id, token);
  if (!connector) {
    reply.code(401).send({ error: "invalid connector credentials" });
    return null;
  }
  return connector;
}

export function registerConnectorRoutes(app: FastifyInstance): void {
  app.get("/v1/connectors", async () => ({
    connectors: [...store.connectors.values()].map(({ token: _t, ...c }) => c),
  }));
}
