import type { FastifyInstance } from "fastify";
import { CreateSiteRequestSchema, UpdateSiteRequestSchema } from "@surveillance/shared";
import type { Store } from "../db/store.js";
import { requireOperator } from "../auth.js";

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Postgres unique_violation — sites_org_label_uniq.
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export function registerSiteRoutes(app: FastifyInstance, store: Store): void {
  app.get("/v1/sites", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    return { sites: await store.listSitesForOrg(user.organizationId) };
  });

  app.post("/v1/sites", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const body = CreateSiteRequestSchema.parse(req.body);
    if (body.timezone && !isValidTimezone(body.timezone)) {
      return reply.code(400).send({ error: `unknown timezone: ${body.timezone}` });
    }
    try {
      const site = await store.createSite(user.organizationId, body);
      return reply.code(201).send({ site });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.code(409).send({ error: "a site with that label already exists" });
      }
      throw err;
    }
  });

  app.get("/v1/sites/:id", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const { id } = req.params as { id: string };
    const site = await store.getSiteForOrg(id, user.organizationId);
    if (!site) {
      // Both "not found" and "not in your org" return 404 — don't leak existence.
      return reply.code(404).send({ error: "site not found" });
    }
    return { site };
  });

  app.patch("/v1/sites/:id", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const { id } = req.params as { id: string };
    const body = UpdateSiteRequestSchema.parse(req.body);
    if (body.timezone && !isValidTimezone(body.timezone)) {
      return reply.code(400).send({ error: `unknown timezone: ${body.timezone}` });
    }
    try {
      const site = await store.updateSite(id, user.organizationId, body);
      if (!site) return reply.code(404).send({ error: "site not found" });
      return { site };
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.code(409).send({ error: "a site with that label already exists" });
      }
      throw err;
    }
  });

  app.delete("/v1/sites/:id", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const { id } = req.params as { id: string };
    const result = await store.deleteSite(id, user.organizationId);
    if (result === "not_found") return reply.code(404).send({ error: "site not found" });
    if (result === "has_connectors") {
      return reply.code(409).send({ error: "site has connectors attached; move or revoke them first" });
    }
    return reply.code(204).send();
  });
}
