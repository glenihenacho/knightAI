import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { IngestEventsRequestSchema, SeveritySchema } from "@surveillance/shared";
import { authenticateConnector, requireOperator } from "../auth.js";
import type { Store } from "../db/store.js";

const ListEventsQuerySchema = z.object({
  siteId: z.string().uuid().optional(),
  cameraId: z.string().uuid().optional(),
  severity: SeveritySchema.optional(),
  before: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export function registerEventRoutes(app: FastifyInstance, store: Store): void {
  // Connector pulls everything its behavior engine needs in one shot and
  // re-polls periodically, diffing the body to decide when to restart workers.
  app.get("/v1/connectors/analysis-config", async (req, reply) => {
    const connector = await authenticateConnector(req, reply, store);
    if (!connector) return;
    return store.getAnalysisConfigForConnector(connector.id);
  });

  // Batch ingest. 202 with the accepted count: duplicates (retries) and
  // events for unknown/foreign rules are skipped, never errored, so one bad
  // entry can't wedge the connector's outbound queue.
  app.post("/v1/connectors/events", async (req, reply) => {
    const connector = await authenticateConnector(req, reply, store);
    if (!connector) return;
    const body = IngestEventsRequestSchema.parse(req.body);
    const result = await store.ingestConnectorEvents(
      connector.id,
      connector.organizationId,
      body.events.map((ev) => ({
        id: ev.id,
        ruleId: ev.ruleId,
        occurredAt: ev.occurredAt,
        snapshotKey: ev.snapshotKey ?? null,
        metadata: ev.metadata,
      })),
    );
    return reply.code(202).send(result);
  });

  app.get("/v1/events", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const query = ListEventsQuerySchema.parse(req.query);
    if (query.siteId) {
      const site = await store.getSiteForOrg(query.siteId, user.organizationId);
      if (!site) return reply.code(404).send({ error: "site not found" });
    }
    const events = await store.listEventsForOrg(user.organizationId, query);
    return { events };
  });
}
