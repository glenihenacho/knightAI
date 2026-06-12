import type { FastifyInstance } from "fastify";
import { CreateScheduleRequestSchema, UpdateScheduleRequestSchema } from "@surveillance/shared";
import type { Store } from "../db/store.js";
import { requireOperator } from "../auth.js";
import { notifyConfigChanged } from "../detection.js";

// Postgres unique_violation — schedules_site_label_uniq.
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export function registerScheduleRoutes(app: FastifyInstance, store: Store): void {
  app.get("/v1/sites/:siteId/schedules", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const { siteId } = req.params as { siteId: string };
    const site = await store.getSiteForOrg(siteId, user.organizationId);
    if (!site) return reply.code(404).send({ error: "site not found" });
    return { schedules: await store.listSchedulesForSite(siteId) };
  });

  app.post("/v1/sites/:siteId/schedules", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const { siteId } = req.params as { siteId: string };
    const site = await store.getSiteForOrg(siteId, user.organizationId);
    if (!site) return reply.code(404).send({ error: "site not found" });
    const body = CreateScheduleRequestSchema.parse(req.body);
    try {
      const schedule = await store.createSchedule(siteId, body);
      notifyConfigChanged(store, req.log);
      return reply.code(201).send({ schedule });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.code(409).send({ error: "a schedule with that label already exists at this site" });
      }
      throw err;
    }
  });

  app.patch("/v1/schedules/:id", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const { id } = req.params as { id: string };
    const body = UpdateScheduleRequestSchema.parse(req.body);
    try {
      const schedule = await store.updateSchedule(id, user.organizationId, body);
      if (!schedule) return reply.code(404).send({ error: "schedule not found" });
      notifyConfigChanged(store, req.log);
      return { schedule };
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.code(409).send({ error: "a schedule with that label already exists at this site" });
      }
      throw err;
    }
  });

  app.delete("/v1/schedules/:id", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const { id } = req.params as { id: string };
    const deleted = await store.deleteSchedule(id, user.organizationId);
    if (!deleted) return reply.code(404).send({ error: "schedule not found" });
    notifyConfigChanged(store, req.log);
    return reply.code(204).send();
  });
}
