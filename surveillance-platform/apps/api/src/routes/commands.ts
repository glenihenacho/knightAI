import type { FastifyInstance } from "fastify";
import { CommandResultSchema } from "@surveillance/shared";
import type { Store } from "../db/store.js";
import { authenticateConnector } from "../auth.js";
import { consumeConnectorWake, verifyCachedConnectorToken } from "../connector-wake.js";

export function registerCommandRoutes(app: FastifyInstance, store: Store): void {
  app.get("/v1/connectors/commands/next", async (req, reply) => {
    const connector = await authenticateConnector(req, reply, store);
    if (!connector) return;
    const command = await store.takeNextCommand(connector.id);
    if (!command) return reply.code(204).send();
    return reply.send(command);
  });

  // Dormant connectors poll this instead of /commands/next. It authenticates
  // entirely from an in-memory token cache — NO database query — so a dormant
  // connector imposes no load on Postgres and Neon's compute can stay suspended.
  // Response: { wake } — true means resume normal (DB-backed) command polling.
  // "uncached" (e.g. after an API restart) also returns wake=true so the
  // connector does a full poll, which re-authenticates and re-seeds the cache.
  app.get("/v1/connectors/commands/wake-check", async (req, reply) => {
    const auth = req.headers["authorization"];
    const id = req.headers["x-connector-id"];
    if (typeof auth !== "string" || typeof id !== "string" || !auth.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "missing connector credentials" });
    }
    const token = auth.slice("Bearer ".length);
    const verdict = verifyCachedConnectorToken(id, token);
    if (verdict === "denied") {
      return reply.code(401).send({ error: "invalid connector credentials" });
    }
    if (verdict === "uncached") return reply.send({ wake: true });
    return reply.send({ wake: consumeConnectorWake(id) });
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
