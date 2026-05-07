import type { FastifyReply, FastifyRequest } from "fastify";
import type { Connector, User } from "@surveillance/shared";
import type { Store } from "./db/store.js";
import { SESSION_COOKIE_NAME } from "./cookies.js";

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

/**
 * Resolves the operator (dashboard user) for a request via the session cookie.
 * Replies 401 and returns null when the cookie is missing or invalid; callers
 * should `return` immediately in that case.
 */
export async function requireOperator(
  req: FastifyRequest,
  reply: FastifyReply,
  store: Store,
): Promise<User | null> {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) {
    reply.code(401).send({ error: "not authenticated" });
    return null;
  }
  const principal = await store.findSessionByToken(token);
  if (!principal) {
    reply.code(401).send({ error: "session invalid or expired" });
    return null;
  }
  return principal.user;
}

/**
 * Like requireOperator but additionally requires role === "admin".
 * Replies 403 to authenticated non-admins.
 */
export async function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
  store: Store,
): Promise<User | null> {
  const user = await requireOperator(req, reply, store);
  if (!user) return null;
  if (user.role !== "admin") {
    reply.code(403).send({ error: "admin required" });
    return null;
  }
  return user;
}
