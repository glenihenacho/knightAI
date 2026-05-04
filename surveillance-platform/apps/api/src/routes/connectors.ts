import type { FastifyInstance } from "fastify";
import type { Store } from "../db/store.js";
import { requireOperator } from "../auth.js";

export function registerConnectorRoutes(app: FastifyInstance, store: Store): void {
  app.get("/v1/connectors", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    return { connectors: await store.listConnectorsForOrg(user.organizationId) };
  });
}
