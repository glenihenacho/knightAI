import type { FastifyInstance } from "fastify";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Env } from "../env.js";
import { authenticateConnector } from "./connectors.js";

export function registerUploadRoutes(app: FastifyInstance, env: Env): void {
  app.put("/v1/connectors/uploads/:uploadKey", async (req, reply) => {
    const connector = authenticateConnector(req, reply);
    if (!connector) return;

    const { uploadKey } = req.params as { uploadKey: string };
    if (!/^[A-Za-z0-9_-]+$/.test(uploadKey)) {
      return reply.code(400).send({ error: "invalid upload key" });
    }

    const dir = resolve(env.SNAPSHOT_BUCKET_DIR);
    await mkdir(dir, { recursive: true });

    const chunks: Buffer[] = [];
    for await (const chunk of req.raw) {
      chunks.push(chunk as Buffer);
    }
    await writeFile(resolve(dir, `${uploadKey}.jpg`), Buffer.concat(chunks));

    return reply.code(204).send();
  });

  app.get("/v1/snapshots/:uploadKey", async (req, reply) => {
    const { uploadKey } = req.params as { uploadKey: string };
    if (!/^[A-Za-z0-9_-]+$/.test(uploadKey)) {
      return reply.code(400).send({ error: "invalid upload key" });
    }
    const dir = resolve(env.SNAPSHOT_BUCKET_DIR);
    return reply.type("image/jpeg").sendFile?.(`${uploadKey}.jpg`, dir)
      ?? reply.code(501).send({ error: "snapshot serving requires @fastify/static" });
  });
}
