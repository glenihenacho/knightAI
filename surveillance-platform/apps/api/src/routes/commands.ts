import type { FastifyInstance } from "fastify";
import { CommandResultSchema } from "@surveillance/shared";
import type { Store } from "../db/store.js";
import { authenticateConnector } from "../auth.js";

export function registerCommandRoutes(app: FastifyInstance, store: Store): void {
  app.get("/v1/connectors/commands/next", async (req, reply) => {
    const connector = await authenticateConnector(req, reply, store);
    if (!connector) return;
    const command = await store.takeNextCommand(connector.id);
    if (!command) return reply.code(204).send();
    return reply.send(command);
  });

  app.post("/v1/connectors/commands/:commandId/result", async (req, reply) => {
    const connector = await authenticateConnector(req, reply, store);
    if (!connector) return;
    const result = CommandResultSchema.parse(req.body);

    const ref = await store.recordResult({
      connectorId: connector.id,
      commandId: result.commandId,
      result,
    });
    if (!ref) {
      // Either the command id doesn't exist or it belongs to a different
      // connector. Return 404 either way so we don't leak existence.
      return reply.code(404).send({ error: "command not found" });
    }

    if (result.validateRtsp && ref.cameraId && ref.kind === "validate_rtsp") {
      await store.updateCameraValidation({
        id: ref.cameraId,
        state: result.validateRtsp.reachable ? "online" : "error",
        lastValidatedAt: result.finishedAt,
        lastSnapshotKey: result.validateRtsp.snapshotUploadKey ?? null,
        errorMessage: result.validateRtsp.error ?? null,
      });
    }

    // If the connector failed to start a preview, mark the active session as
    // failed so the dashboard can surface the error and stop polling.
    if (ref.kind === "start_preview" && result.status !== "ok" && ref.cameraId) {
      const active = await store.getActivePreviewForCamera(ref.cameraId);
      if (active) await store.endPreview(active.id, result.errorMessage ?? "connector reported failure");
    }

    return reply.code(204).send();
  });
}
