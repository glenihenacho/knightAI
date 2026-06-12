import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import {
  segmentReadyChannel,
  shardForCamera,
  type Command,
  type PreviewSessionResponse,
  type SegmentReady,
  type StartPreviewPayloadSchema,
  type StopPreviewPayloadSchema,
} from "@surveillance/shared";
import { SEGMENT_SECONDS } from "../detection.js";
import type { z } from "zod";
import type { Store } from "../db/store.js";
import type { Env } from "../env.js";
import type { ObjectStorage } from "../storage/s3.js";
import { authenticateConnector } from "../auth.js";
import { requireOperator } from "../auth.js";

type StartPayload = z.infer<typeof StartPreviewPayloadSchema>;
type StopPayload = z.infer<typeof StopPreviewPayloadSchema>;

const HLS_FILENAME_RE = /^(playlist\.m3u8|seg-\d{1,6}\.ts)$/;
const PREVIEW_ID_RE = /^[0-9a-f-]{36}$/i;

function hlsKey(cameraId: string, previewId: string, filename: string): string {
  return `hls/${cameraId}/${previewId}/${filename}`;
}

function manifestUrlFor(env: Env, previewId: string): string {
  return `${env.PUBLIC_BASE_URL}/v1/previews/${previewId}/playlist.m3u8`;
}

/**
 * Rewrites a HLS playlist so segment references point back at the API.
 * The connector uploads with relative names (`seg-0001.ts`); we serve them
 * via /v1/previews/:id/seg/:filename so the dashboard never has to talk to
 * S3 directly. That keeps everything same-origin and side-steps R2 CORS.
 */
function rewriteManifest(raw: string, previewId: string): string {
  const base = `/v1/previews/${previewId}/seg`;
  return raw
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return line;
      if (trimmed.startsWith("#")) return line;
      // Treat anything else as a media URI. Only rewrite if it looks like a
      // bare filename (no scheme, no slash) — leaves absolute URLs alone if
      // a future encoder ever produces them.
      if (/^[A-Za-z][A-Za-z0-9+\-.]*:\/\//.test(trimmed)) return line;
      if (trimmed.includes("/")) return line;
      return `${base}/${trimmed}`;
    })
    .join("\n");
}

export function registerPreviewRoutes(
  app: FastifyInstance,
  store: Store,
  storage: ObjectStorage,
  env: Env,
): void {
  // ---- operator: start a preview session for a camera ----
  app.post("/v1/cameras/:cameraId/preview", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const { cameraId } = req.params as { cameraId: string };
    const camera = await store.getCameraForOrg(cameraId, user.organizationId);
    if (!camera) return reply.code(404).send({ error: "camera not found" });

    // Idempotent: if there's already an active session, return it instead of
    // spawning a second transcoder. The dashboard treats this as a resume.
    const existing = await store.getActivePreviewForCamera(cameraId);
    if (existing) {
      const response: PreviewSessionResponse = {
        preview: existing,
        manifestUrl: manifestUrlFor(env, existing.id),
      };
      return reply.send(response);
    }

    const preview = await store.createPreview({
      cameraId,
      maxDurationSeconds: 300,
    });
    const payload: StartPayload = {
      cameraId,
      previewId: preview.id,
      rtspUrl: camera.rtspUrl,
      maxDurationSeconds: preview.maxDurationSeconds,
      segmentSeconds: 2,
      windowSegments: 5,
    };
    const command: Command = {
      id: randomUUID(),
      kind: "start_preview",
      issuedAt: new Date().toISOString(),
      payload,
    };
    await store.enqueueCommand(camera.connectorId, command, cameraId);

    const response: PreviewSessionResponse = {
      preview,
      manifestUrl: manifestUrlFor(env, preview.id),
    };
    return reply.code(201).send(response);
  });

  // ---- operator: stop the active preview ----
  app.delete("/v1/cameras/:cameraId/preview", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const { cameraId } = req.params as { cameraId: string };
    const camera = await store.getCameraForOrg(cameraId, user.organizationId);
    if (!camera) return reply.code(404).send({ error: "camera not found" });

    const active = await store.getActivePreviewForCamera(cameraId);
    if (!active) return reply.code(204).send();
    // Detection previews belong to the supervisor; an operator closing their
    // viewer must not tear down the camera's detection pipeline.
    if (active.startedBy === "detection") return reply.code(204).send();

    await store.endPreview(active.id);
    const payload: StopPayload = { cameraId, previewId: active.id };
    const command: Command = {
      id: randomUUID(),
      kind: "stop_preview",
      issuedAt: new Date().toISOString(),
      payload,
    };
    await store.enqueueCommand(camera.connectorId, command, cameraId);
    return reply.code(204).send();
  });

  // ---- operator: heartbeat the session so the connector knows someone is watching ----
  app.post("/v1/previews/:previewId/heartbeat", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const { previewId } = req.params as { previewId: string };
    if (!PREVIEW_ID_RE.test(previewId)) return reply.code(400).send({ error: "invalid preview id" });
    const preview = await store.getPreviewById(previewId);
    if (!preview) return reply.code(404).send({ error: "preview not found" });
    // Confirm the operator owns the camera the preview is bound to.
    const camera = await store.getCameraForOrg(preview.cameraId, user.organizationId);
    if (!camera) return reply.code(404).send({ error: "preview not found" });
    const ok = await store.recordPreviewHeartbeat(previewId);
    if (!ok) return reply.code(409).send({ error: "preview already ended" });
    return reply.code(204).send();
  });

  // ---- public: rewritten manifest ----
  // Random preview id is the access credential, same posture as snapshots.
  // M-future: tie to operator session.
  app.get("/v1/previews/:previewId/playlist.m3u8", async (req, reply) => {
    const { previewId } = req.params as { previewId: string };
    if (!PREVIEW_ID_RE.test(previewId)) return reply.code(400).send({ error: "invalid preview id" });
    const preview = await store.getPreviewById(previewId);
    if (!preview) return reply.code(404).send({ error: "preview not found" });
    const raw = await storage.getObjectText(hlsKey(preview.cameraId, preview.id, "playlist.m3u8"));
    if (!raw) {
      // Encoder hasn't produced the manifest yet (start_preview dispatched
      // moments ago, FFmpeg still warming up). hls.js retries on 404.
      return reply.code(404).send({ error: "manifest not ready" });
    }
    return reply
      .header("content-type", "application/vnd.apple.mpegurl")
      .header("cache-control", "no-store")
      .send(rewriteManifest(raw, preview.id));
  });

  // ---- public: segment proxy ----
  app.get("/v1/previews/:previewId/seg/:filename", async (req, reply) => {
    const { previewId, filename } = req.params as { previewId: string; filename: string };
    if (!PREVIEW_ID_RE.test(previewId)) return reply.code(400).send({ error: "invalid preview id" });
    if (!HLS_FILENAME_RE.test(filename) || filename === "playlist.m3u8") {
      return reply.code(400).send({ error: "invalid segment filename" });
    }
    const preview = await store.getPreviewById(previewId);
    if (!preview) return reply.code(404).send({ error: "preview not found" });
    const obj = await storage.getObjectStream(hlsKey(preview.cameraId, preview.id, filename));
    if (!obj) return reply.code(404).send({ error: "segment not found" });
    reply.header("content-type", obj.contentType ?? "video/mp2t");
    if (obj.contentLength !== undefined) reply.header("content-length", obj.contentLength);
    reply.header("cache-control", "no-store");
    return reply.send(obj.body);
  });

  // ---- connector: upload manifest / segment under its preview ----
  app.put("/v1/connectors/hls/:previewId/:filename", async (req, reply) => {
    const connector = await authenticateConnector(req, reply, store);
    if (!connector) return;
    const { previewId, filename } = req.params as { previewId: string; filename: string };
    if (!PREVIEW_ID_RE.test(previewId)) return reply.code(400).send({ error: "invalid preview id" });
    if (!HLS_FILENAME_RE.test(filename)) return reply.code(400).send({ error: "invalid filename" });

    const preview = await store.getPreviewForConnector(previewId, connector.id);
    if (!preview) return reply.code(404).send({ error: "preview not found" });
    if (preview.endedAt) return reply.code(409).send({ error: "preview already ended" });

    const isManifest = filename === "playlist.m3u8";
    const contentType = isManifest ? "application/vnd.apple.mpegurl" : "video/mp2t";

    const chunks: Buffer[] = [];
    for await (const chunk of req.raw) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);

    await storage.putObject({
      key: hlsKey(preview.cameraId, preview.id, filename),
      body,
      contentType,
    });

    // First manifest upload flips the row from `starting` to `active`. After
    // that we leave it alone — the connector keeps refreshing the manifest as
    // segments rotate.
    if (isManifest && preview.status === "starting") {
      await store.setPreviewStatus(preview.id, "active");
    }

    if (!isManifest) {
      // Wake the detection worker. Best-effort: a lost NOTIFY only delays
      // detection until the next segment two seconds later.
      const payload: SegmentReady = {
        previewId: preview.id,
        cameraId: preview.cameraId,
        filename,
        segmentSeconds: SEGMENT_SECONDS,
        uploadedAt: new Date().toISOString(),
      };
      const shard = shardForCamera(preview.cameraId, env.WORKER_SHARDS);
      try {
        await store.notify(segmentReadyChannel(shard), JSON.stringify(payload));
      } catch (err) {
        req.log.warn({ err, previewId: preview.id }, "segment_ready notify failed");
      }
      // For detection previews last_heartbeat_at doubles as "segments are
      // flowing" — the supervisor recycles sessions whose uploads stall.
      if (preview.startedBy === "detection") {
        await store.recordPreviewHeartbeat(preview.id);
      }
    }
    return reply.code(204).send();
  });
}
