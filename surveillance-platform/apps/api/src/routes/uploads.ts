import type { FastifyInstance } from "fastify";
import { authenticateConnector } from "../auth.js";
import type { Store } from "../db/store.js";
import type { ObjectStorage } from "../storage/s3.js";

const UPLOAD_KEY_RE = /^[A-Za-z0-9_-]+$/;
const SNAPSHOT_PREFIX = "snapshots/";

export function registerUploadRoutes(
  app: FastifyInstance,
  store: Store,
  storage: ObjectStorage,
): void {
  app.put("/v1/connectors/uploads/:uploadKey", async (req, reply) => {
    const connector = await authenticateConnector(req, reply, store);
    if (!connector) return;

    const { uploadKey } = req.params as { uploadKey: string };
    if (!UPLOAD_KEY_RE.test(uploadKey)) {
      return reply.code(400).send({ error: "invalid upload key" });
    }

    const contentType =
      typeof req.headers["content-type"] === "string"
        ? req.headers["content-type"]
        : "application/octet-stream";

    const chunks: Buffer[] = [];
    for await (const chunk of req.raw) {
      chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks);

    await storage.putObject({
      key: `${SNAPSHOT_PREFIX}${uploadKey}.jpg`,
      body,
      contentType: contentType.startsWith("image/") ? contentType : "image/jpeg",
    });

    return reply.code(204).send();
  });

  // Browser-facing snapshot URL. Issues a 302 to a short-lived signed S3 URL
  // so we never proxy bytes through the API.
  app.get("/v1/snapshots/:uploadKey", async (req, reply) => {
    const { uploadKey } = req.params as { uploadKey: string };
    if (!UPLOAD_KEY_RE.test(uploadKey)) {
      return reply.code(400).send({ error: "invalid upload key" });
    }
    const url = await storage.getSignedReadUrl(`${SNAPSHOT_PREFIX}${uploadKey}.jpg`);
    return reply.redirect(url, 302);
  });
}
