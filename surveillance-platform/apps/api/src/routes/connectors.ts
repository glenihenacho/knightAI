import type { FastifyInstance } from "fastify";
import type { Store } from "../db/store.js";

export function registerConnectorRoutes(app: FastifyInstance, store: Store): void {
  app.get("/v1/connectors", async () => ({
    connectors: await store.listConnectors(),
  }));
}
