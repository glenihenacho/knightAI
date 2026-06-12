import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { IngestEventsRequestSchema, SeveritySchema } from "@surveillance/shared";
import { authenticateConnector, requireOperator } from "../auth.js";
import type { Store } from "../db/store.js";
import type { ObjectStorage } from "../storage/s3.js";
import { SEGMENT_SECONDS } from "../detection.js";

const ListEventsQuerySchema = z.object({
  siteId: z.string().uuid().optional(),
  cameraId: z.string().uuid().optional(),
  severity: SeveritySchema.optional(),
  before: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const EVENT_ID_RE = /^[0-9a-f-]{36}$/i;
const SEGMENT_KEY_RE = /^hls\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/seg-(\d{1,6})\.ts$/i;

/**
 * The event's own segment plus its immediate neighbors (~2s of context on
 * each side), skipping any that already expired from S3.
 */
async function clipSegmentKeys(storage: ObjectStorage, segmentKey: string): Promise<string[]> {
  const match = SEGMENT_KEY_RE.exec(segmentKey);
  if (!match) return [];
  const digits = match[1]!;
  const n = Number(digits);
  const prefix = segmentKey.slice(0, segmentKey.lastIndexOf("/") + 1);
  const candidates = [n - 1, n, n + 1]
    .filter((i) => i >= 0)
    .map((i) => `${prefix}seg-${String(i).padStart(digits.length, "0")}.ts`);
  const exists = await Promise.all(candidates.map((key) => storage.objectExists(key)));
  return candidates.filter((_, i) => exists[i]);
}

function filenameOf(key: string): string {
  return key.slice(key.lastIndexOf("/") + 1);
}

export function registerEventRoutes(
  app: FastifyInstance,
  store: Store,
  storage: ObjectStorage,
): void {
  // Connector pulls everything its behavior engine needs in one shot and
  // re-polls periodically, diffing the body to decide when to restart workers.
  // Kept for connector back-compat during the server-side pivot; new
  // connector builds no longer call it.
  app.get("/v1/connectors/analysis-config", async (req, reply) => {
    const connector = await authenticateConnector(req, reply, store);
    if (!connector) return;
    return store.getAnalysisConfigForConnector(connector.id);
  });

  // Batch ingest. 202 with the accepted count: duplicates (retries) and
  // events for unknown/foreign rules are skipped, never errored, so one bad
  // entry can't wedge the connector's outbound queue. Kept for connector
  // back-compat; the server-side worker writes events directly.
  app.post("/v1/connectors/events", async (req, reply) => {
    const connector = await authenticateConnector(req, reply, store);
    if (!connector) return;
    const body = IngestEventsRequestSchema.parse(req.body);
    const result = await store.ingestConnectorEvents(
      connector.id,
      connector.organizationId,
      body.events.map((ev) => ({
        id: ev.id,
        ruleId: ev.ruleId,
        occurredAt: ev.occurredAt,
        snapshotKey: ev.snapshotKey ?? null,
        metadata: ev.metadata,
      })),
    );
    return reply.code(202).send(result);
  });

  app.get("/v1/events", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const query = ListEventsQuerySchema.parse(req.query);
    if (query.siteId) {
      const site = await store.getSiteForOrg(query.siteId, user.organizationId);
      if (!site) return reply.code(404).send({ error: "site not found" });
    }
    const events = await store.listEventsForOrg(user.organizationId, query);
    return { events };
  });

  app.get("/v1/events/:id", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const { id } = req.params as { id: string };
    if (!EVENT_ID_RE.test(id)) return reply.code(400).send({ error: "invalid event id" });
    const event = await store.getEventForOrg(id, user.organizationId);
    if (!event) return reply.code(404).send({ error: "event not found" });
    const clip = event.segmentKey ? await store.getEventClipRef(id) : null;
    return { event, zonePolygon: clip?.zonePolygon ?? null };
  });

  // ---- clip playback ----
  // Public-by-id like preview manifests: the random event uuid is the access
  // credential. M-future: tie to operator session.

  // VOD manifest: the trigger segment ± one neighbor, served through the seg
  // proxy below so the browser never talks to S3 directly.
  app.get("/v1/events/:id/playlist.m3u8", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!EVENT_ID_RE.test(id)) return reply.code(400).send({ error: "invalid event id" });
    const clip = await store.getEventClipRef(id);
    if (!clip) return reply.code(404).send({ error: "no clip for this event" });
    const keys = await clipSegmentKeys(storage, clip.segmentKey);
    if (keys.length === 0) {
      return reply.code(404).send({ error: "clip segments expired from storage" });
    }
    const lines = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      `#EXT-X-TARGETDURATION:${SEGMENT_SECONDS}`,
      "#EXT-X-PLAYLIST-TYPE:VOD",
      ...keys.flatMap((key) => [
        `#EXTINF:${SEGMENT_SECONDS}.0,`,
        `/v1/events/${id}/seg/${filenameOf(key)}`,
      ]),
      "#EXT-X-ENDLIST",
      "",
    ];
    return reply
      .header("content-type", "application/vnd.apple.mpegurl")
      .header("cache-control", "no-store")
      .send(lines.join("\n"));
  });

  // Segment proxy. Only filenames within the clip's neighborhood resolve —
  // the event id grants ~6 seconds of footage, not the camera's history.
  app.get("/v1/events/:id/seg/:filename", async (req, reply) => {
    const { id, filename } = req.params as { id: string; filename: string };
    if (!EVENT_ID_RE.test(id)) return reply.code(400).send({ error: "invalid event id" });
    const clip = await store.getEventClipRef(id);
    if (!clip) return reply.code(404).send({ error: "no clip for this event" });
    const keys = await clipSegmentKeys(storage, clip.segmentKey);
    const key = keys.find((k) => filenameOf(k) === filename);
    if (!key) return reply.code(404).send({ error: "segment not in clip" });
    const obj = await storage.getObjectStream(key);
    if (!obj) return reply.code(404).send({ error: "segment not found" });
    reply.header("content-type", obj.contentType ?? "video/mp2t");
    if (obj.contentLength !== undefined) reply.header("content-length", obj.contentLength);
    reply.header("cache-control", "private, max-age=300");
    return reply.send(obj.body);
  });

  // Detections overlay data: the worker's sidecar JSONs for the clip's
  // segments, concatenated in playlist order. Frames carry absolute epoch
  // tsMs; the client maps video currentTime onto them via the first frame.
  app.get("/v1/events/:id/detections", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!EVENT_ID_RE.test(id)) return reply.code(400).send({ error: "invalid event id" });
    const clip = await store.getEventClipRef(id);
    if (!clip) return reply.code(404).send({ error: "no clip for this event" });
    const keys = await clipSegmentKeys(storage, clip.segmentKey);
    const sidecars = await Promise.all(
      keys.map((key) => storage.getObjectText(key.replace(/\.ts$/, ".json"))),
    );
    const frames = sidecars.flatMap((text) => {
      if (!text) return [];
      try {
        return JSON.parse(text) as unknown[];
      } catch {
        return [];
      }
    });
    return { frames, zonePolygon: clip.zonePolygon };
  });
}
