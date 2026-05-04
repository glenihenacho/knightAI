import type { FastifyReply, FastifyRequest } from "fastify";
import type { Connector } from "@surveillance/shared";
import type { Store } from "./db/store.js";

export async function authenticateConnector(
  req: FastifyRequest,
  reply: FastifyReply,
  store: Store,
): Promise<Connector | null> {
  const auth = req.headers["authorization"];
  const id = req.headers["x-connector-id"];
  if (typeof auth !== "string" || typeof id !== "string" || !auth.startsWith("Bearer ")) {
    reply.code(401).send({ error: "missing connector credentials" });
    return null;
  }
  const token = auth.slice("Bearer ".length);
  const connector = await store.authConnector(id, token);
  if (!connector) {
    reply.code(401).send({ error: "invalid connector credentials" });
    return null;
  }
  return connector;
}
