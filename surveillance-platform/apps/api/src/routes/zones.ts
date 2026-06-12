import type { FastifyInstance } from "fastify";
import { CreateZoneRequestSchema, UpdateZoneRequestSchema } from "@surveillance/shared";
import type { Store } from "../db/store.js";
import { requireOperator } from "../auth.js";

export function registerZoneRoutes(app: FastifyInstance, store: Store): void {
  app.get("/v1/cameras/:cameraId/zones", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const { cameraId } = req.params as { cameraId: string };
    const camera = await store.getCameraForOrg(cameraId, user.organizationId);
    if (!camera) return reply.code(404).send({ error: "camera not found" });
    return { zones: await store.listZonesForCamera(cameraId) };
  });

  app.post("/v1/cameras/:cameraId/zones", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const { cameraId } = req.params as { cameraId: string };
    const camera = await store.getCameraForOrg(cameraId, user.organizationId);
    if (!camera) return reply.code(404).send({ error: "camera not found" });
    const body = CreateZoneRequestSchema.parse(req.body);
    const zone = await store.createZone(cameraId, body);
    return reply.code(201).send({ zone });
  });

  app.patch("/v1/zones/:id", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const { id } = req.params as { id: string };
    const body = UpdateZoneRequestSchema.parse(req.body);
    const zone = await store.updateZone(id, user.organizationId, body);
    if (!zone) return reply.code(404).send({ error: "zone not found" });
    return { zone };
  });

  app.delete("/v1/zones/:id", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const { id } = req.params as { id: string };
    const deleted = await store.deleteZone(id, user.organizationId);
    if (!deleted) return reply.code(404).send({ error: "zone not found" });
    return reply.code(204).send();
  });
}
