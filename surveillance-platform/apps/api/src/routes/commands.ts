import type { FastifyInstance } from "fastify";
import {
  CommandResultSchema,
  type Camera,
} from "@surveillance/shared";
import { store } from "../db/store.js";
import { authenticateConnector } from "./connectors.js";

export function registerCommandRoutes(app: FastifyInstance): void {
  app.get("/v1/connectors/commands/next", async (req, reply) => {
    const connector = authenticateConnector(req, reply);
    if (!connector) return;
    const command = store.takeNextCommand(connector.id);
    if (!command) return reply.code(204).send();
    return reply.send(command);
  });

  app.post("/v1/connectors/commands/:commandId/result", async (req, reply) => {
    const connector = authenticateConnector(req, reply);
    if (!connector) return;
    const result = CommandResultSchema.parse(req.body);

    const recorded = store.recordResult(result.commandId, result);
    if (!recorded) {
      return reply.code(404).send({ error: "command not found" });
    }

    if (result.validateRtsp) {
      const cameraId = findCameraIdForCommand(result.commandId);
      if (cameraId) {
        const camera = store.cameras.get(cameraId);
        if (camera) {
          const next: Camera = {
            ...camera,
            state: result.validateRtsp.reachable ? "online" : "error",
            lastValidatedAt: result.finishedAt,
            lastSnapshotKey: result.validateRtsp.snapshotUploadKey ?? camera.lastSnapshotKey,
            errorMessage: result.validateRtsp.error ?? null,
          };
          store.cameras.set(camera.id, next);
        }
      }
    }

    return reply.code(204).send();
  });
}

function findCameraIdForCommand(commandId: string): string | null {
  const entry = store.commands.get(commandId);
  if (!entry) return null;
  if (entry.command.kind === "validate_rtsp" || entry.command.kind === "capture_snapshot") {
    return entry.command.payload.cameraId;
  }
  return null;
}
