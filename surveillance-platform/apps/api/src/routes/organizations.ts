import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Store } from "../db/store.js";
import { requireAdmin, requireOperator } from "../auth.js";

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

  // Admin-only. The first org is bootstrapped via SEED_ORGANIZATION_NAME at
  // server startup; the seeded admin can then create additional orgs here.
  // New admins for those orgs come in via fresh invites with role='admin'.
  app.post("/v1/organizations", async (req, reply) => {
    const admin = await requireAdmin(req, reply, store);
    if (!admin) return;
    const body = CreateOrganizationSchema.parse(req.body);
    const org = await store.createOrganization(body.name);
    return reply.code(201).send(org);
  });
}
