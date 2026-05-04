import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Store } from "../db/store.js";
import { requireOperator } from "../auth.js";

const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(120),
});

export function registerOrganizationRoutes(app: FastifyInstance, store: Store): void {
  // Returns just the operator's own organization. Listing all orgs across
  // tenants would be a leak.
  app.get("/v1/organizations", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const org = await store.getOrganization(user.organizationId);
    return { organizations: org ? [org] : [] };
  });

  // Creating additional orgs is gated on an authenticated operator. The first
  // org is bootstrapped via SEED_ORGANIZATION_NAME at server startup, so the
  // chicken-and-egg "no org → no user → can't auth → can't create org" is
  // resolved out-of-band.
  app.post("/v1/organizations", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const body = CreateOrganizationSchema.parse(req.body);
    const org = await store.createOrganization(body.name);
    return reply.code(201).send(org);
  });
}
