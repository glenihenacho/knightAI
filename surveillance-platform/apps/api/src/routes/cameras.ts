import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import {
  CreateCameraRequestSchema,
  type Camera,
  type Command,
} from "@surveillance/shared";
import { parseRtspUrl, RtspUrlError } from "@surveillance/camera-core";
import type { Store } from "../db/store.js";

export function registerCameraRoutes(app: FastifyInstance, store: Store): void {
  app.post("/v1/cameras", async (req, reply) => {
    const body = CreateCameraRequestSchema.parse(req.body);
    try {
      parseRtspUrl(body.rtspUrl);
    } catch (err) {
      if (err instanceof RtspUrlError) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }

    const connector = await store.getConnector(body.connectorId);
    if (!connector) {
      return reply.code(404).send({ error: "connector not found" });
    }

    const draft: Camera = {
      id: randomUUID(),
      connectorId: body.connectorId,
      label: body.label,
      rtspUrl: body.rtspUrl,
      state: "validating",
      lastValidatedAt: null,
      lastSnapshotKey: null,
      errorMessage: null,
    };
    const camera = await store.createCamera(draft);

    const command: Command = {
      id: randomUUID(),
      kind: "validate_rtsp",
      issuedAt: new Date().toISOString(),
      payload: {
        cameraId: camera.id,
        rtspUrl: camera.rtspUrl,
        timeoutMs: 15_000,
      },
    };
    await store.enqueueCommand(body.connectorId, command, camera.id);

    return reply.code(201).send({ camera, queuedCommandId: command.id });
  });

  app.get("/v1/cameras", async () => ({
    cameras: await store.listCameras(),
  }));
}
