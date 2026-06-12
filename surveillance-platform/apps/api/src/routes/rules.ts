import type { FastifyInstance, FastifyReply } from "fastify";
import { CreateRuleRequestSchema, UpdateRuleRequestSchema } from "@surveillance/shared";
import type { Store } from "../db/store.js";
import { requireOperator } from "../auth.js";
import { notifyConfigChanged } from "../detection.js";

export function registerRuleRoutes(app: FastifyInstance, store: Store): void {
  // A rule may only reference a zone whose camera's connector lives at the
  // rule's site, and a schedule defined at that same site. Replies 422 and
  // returns false on violation.
  async function validateReferences(
    reply: FastifyReply,
    organizationId: string,
    siteId: string,
    refs: { zoneId?: string; scheduleId?: string | null },
  ): Promise<boolean> {
    if (refs.zoneId !== undefined) {
      const zoneSiteId = await store.getZoneSiteId(refs.zoneId, organizationId);
      if (!zoneSiteId) {
        reply.code(404).send({ error: "zone not found" });
        return false;
      }
      if (zoneSiteId !== siteId) {
        reply.code(422).send({ error: "zone belongs to a different site" });
        return false;
      }
    }
    if (refs.scheduleId !== undefined && refs.scheduleId !== null) {
      const schedule = await store.getScheduleForOrg(refs.scheduleId, organizationId);
      if (!schedule) {
        reply.code(404).send({ error: "schedule not found" });
        return false;
      }
      if (schedule.siteId !== siteId) {
        reply.code(422).send({ error: "schedule belongs to a different site" });
        return false;
      }
    }
    return true;
  }

  app.get("/v1/sites/:siteId/rules", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const { siteId } = req.params as { siteId: string };
    const site = await store.getSiteForOrg(siteId, user.organizationId);
    if (!site) return reply.code(404).send({ error: "site not found" });
    return { rules: await store.listRulesForSite(siteId) };
  });

  app.post("/v1/sites/:siteId/rules", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const { siteId } = req.params as { siteId: string };
    const site = await store.getSiteForOrg(siteId, user.organizationId);
    if (!site) return reply.code(404).send({ error: "site not found" });
    const body = CreateRuleRequestSchema.parse(req.body);
    const ok = await validateReferences(reply, user.organizationId, siteId, {
      zoneId: body.zoneId,
      scheduleId: body.scheduleId ?? null,
    });
    if (!ok) return;
    const rule = await store.createRule(siteId, {
      label: body.label,
      zoneId: body.zoneId,
      scheduleId: body.scheduleId ?? null,
      trigger: body.trigger,
      action: body.action,
      enabled: body.enabled,
    });
    notifyConfigChanged(store, req.log);
    return reply.code(201).send({ rule });
  });

  app.patch("/v1/rules/:id", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const { id } = req.params as { id: string };
    const body = UpdateRuleRequestSchema.parse(req.body);
    const existing = await store.getRuleForOrg(id, user.organizationId);
    if (!existing) return reply.code(404).send({ error: "rule not found" });
    const ok = await validateReferences(reply, user.organizationId, existing.siteId, {
      zoneId: body.zoneId,
      scheduleId: body.scheduleId,
    });
    if (!ok) return;
    const rule = await store.updateRule(id, user.organizationId, body);
    if (!rule) return reply.code(404).send({ error: "rule not found" });
    notifyConfigChanged(store, req.log);
    return { rule };
  });

  app.delete("/v1/rules/:id", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const { id } = req.params as { id: string };
    const deleted = await store.deleteRule(id, user.organizationId);
    if (!deleted) return reply.code(404).send({ error: "rule not found" });
    notifyConfigChanged(store, req.log);
    return reply.code(204).send();
  });
}
