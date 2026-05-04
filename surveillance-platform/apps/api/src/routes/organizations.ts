import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Store } from "../db/store.js";

const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(120),
});

export function registerOrganizationRoutes(app: FastifyInstance, store: Store): void {
  app.get("/v1/organizations", async () => ({
    organizations: await store.listOrganizations(),
  }));

  app.post("/v1/organizations", async (req, reply) => {
    const body = CreateOrganizationSchema.parse(req.body);
    const org = await store.createOrganization(body.name);
    return reply.code(201).send(org);
  });
}
