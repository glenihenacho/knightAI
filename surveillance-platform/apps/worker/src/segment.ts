// Per-segment pipeline: S3 fetch -> FFmpeg frame extraction -> inference ->
// tracker/evaluator -> sidecar JSON + event rows.
//
// Ordering contract: segments for the SAME camera process strictly in
// arrival order (tracker and dwell state depend on it); segments for
// different cameras run concurrently up to MAX_CONCURRENT_SEGMENTS. A camera
// whose queue overflows drops its oldest pending segments — falling behind
// must degrade detection, not grow memory without bound.

import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import {
  SegmentReadySchema,
  type SegmentDetectionsSidecar,
  type SegmentReady,
} from "@surveillance/shared";
import type { Env } from "./env.js";
import { CameraEngine } from "./engine.js";
import { extractFrames } from "./frames.js";
import type { Inferencer } from "./inferencer.js";
import type { Metrics } from "./metrics.js";
import type { ObjectStorage } from "./s3.js";
import type { EventInsert, WorkerDb } from "./db.js";

class Semaphore {
  private waiters: Array<() => void> = [];
  constructor(private slots: number) {}

  async acquire(): Promise<void> {
    if (this.slots > 0) {
      this.slots -= 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.slots += 1;
  }
}

interface CameraState {
  engine: CameraEngine;
  fingerprint: string;
  lastSegmentAt: number;
}

export class SegmentProcessor {
  private readonly queues = new Map<string, SegmentReady[]>();
  private readonly pumping = new Set<string>();
  private readonly cameras = new Map<string, CameraState>();
  private readonly semaphore: Semaphore;

  constructor(
    private readonly env: Env,
    private readonly s3: ObjectStorage,
    private readonly db: WorkerDb,
    private readonly inferencer: Inferencer,
    private readonly metrics: Metrics,
    private readonly log: Logger,
  ) {
    this.semaphore = new Semaphore(env.MAX_CONCURRENT_SEGMENTS);
  }

  /** Entry point for segment_ready NOTIFY payloads. */
  enqueue(rawPayload: string): void {
    const parsed = SegmentReadySchema.safeParse(safeJson(rawPayload));
    if (!parsed.success) {
      this.log.warn({ rawPayload }, "unparseable segment_ready payload");
      return;
    }
    const msg = parsed.data;
    let queue = this.queues.get(msg.cameraId);
    if (!queue) {
      queue = [];
      this.queues.set(msg.cameraId, queue);
    }
    queue.push(msg);
    while (queue.length > this.env.MAX_QUEUE_PER_CAMERA) {
      queue.shift();
      this.metrics.throttled.inc();
    }
    void this.pump(msg.cameraId);
  }

  private async pump(cameraId: string): Promise<void> {
    if (this.pumping.has(cameraId)) return;
    this.pumping.add(cameraId);
    try {
      for (;;) {
        const msg = this.queues.get(cameraId)?.shift();
        if (!msg) break;
        await this.semaphore.acquire();
        try {
          await this.processOne(msg);
          this.metrics.segmentsProcessed.inc();
        } catch (err) {
          this.metrics.segmentFailures.inc();
          this.log.error({ err, cameraId, filename: msg.filename }, "segment processing failed");
        } finally {
          this.semaphore.release();
        }
      }
    } finally {
      this.pumping.delete(cameraId);
      // A notify that raced the loop's exit re-pumps.
      if ((this.queues.get(cameraId)?.length ?? 0) > 0) void this.pump(cameraId);
    }
  }

  private async processOne(msg: SegmentReady): Promise<void> {
    const startedAt = Date.now();
    this.metrics.listenerLag.observe(Math.max(0, (startedAt - Date.parse(msg.uploadedAt)) / 1000));

    const config = await this.db.getCameraConfig(msg.cameraId);
    if (!config || config.engine.rules.length === 0) return;

    let state = this.cameras.get(msg.cameraId);
    if (!state || state.fingerprint !== config.fingerprint) {
      // Config changed: rebuild the engine. Tracker/dwell state is lost — at
      // most one missed dwell event per active dwelling track, same trade-off
      // the edge engine made on config refresh.
      state = {
        engine: new CameraEngine(config.engine),
        fingerprint: config.fingerprint,
        lastSegmentAt: startedAt,
      };
      this.cameras.set(msg.cameraId, state);
    }
    state.lastSegmentAt = startedAt;

    const segmentKey = `hls/${msg.cameraId}/${msg.previewId}/${msg.filename}`;
    const stream = await this.s3.getObjectStream(segmentKey);
    if (!stream) {
      // Rolling-window HLS deletes old segments; one that rotated out before
      // we got to it is stale work, not an error.
      this.log.warn({ segmentKey }, "segment gone from S3, skipping");
      return;
    }

    const frames = await extractFrames(stream, {
      fps: this.env.INFER_FPS,
      ffmpegPath: this.env.FFMPEG_PATH,
    });
    if (frames.length === 0) return;

    // Segment started segmentSeconds before its upload finished (close
    // enough at 2s segments; events carry second-level precision).
    const baseTsMs = Date.parse(msg.uploadedAt) - msg.segmentSeconds * 1000;
    const frameIntervalMs = 1000 / this.env.INFER_FPS;

    const sidecar: SegmentDetectionsSidecar = [];
    const inserts: EventInsert[] = [];
    for (let i = 0; i < frames.length; i++) {
      const tsMs = Math.round(baseTsMs + i * frameIntervalMs);
      const inferStart = Date.now();
      const detections = await this.inferencer.detectJpeg(frames[i]!);
      this.metrics.inferenceDuration.observe(
        { cameraId: msg.cameraId },
        Date.now() - inferStart,
      );
      sidecar.push({
        tsMs,
        detections: detections.map((d) => ({
          cls: "person" as const,
          conf: round3(d.confidence),
          bbox: [
            round3(d.bbox.x1),
            round3(d.bbox.y1),
            round3(d.bbox.x2 - d.bbox.x1),
            round3(d.bbox.y2 - d.bbox.y1),
          ],
        })),
      });
      for (const fired of state.engine.process(detections, tsMs)) {
        // The trigger frame doubles as the event thumbnail, uploaded into the
        // same snapshots/ keyspace the dashboard already links to.
        const id = randomUUID();
        const snapshotKey = `evt_${id.replaceAll("-", "")}`;
        let uploaded: string | null = snapshotKey;
        try {
          await this.s3.putObject({
            key: `snapshots/${snapshotKey}.jpg`,
            body: frames[i]!,
            contentType: "image/jpeg",
          });
        } catch (err) {
          uploaded = null;
          this.log.warn({ err, cameraId: msg.cameraId }, "event thumbnail upload failed");
        }
        inserts.push({
          id,
          fired,
          config,
          previewId: msg.previewId,
          segmentKey,
          snapshotKey: uploaded,
        });
      }
    }
    this.metrics.activeTracks.set({ cameraId: msg.cameraId }, state.engine.activeTrackCount());

    // Sidecar next to the segment: the dashboard's clip player overlays these
    // boxes; the evaluator above already consumed them in-process.
    await this.s3.putObject({
      key: segmentKey.replace(/\.ts$/, ".json"),
      body: Buffer.from(JSON.stringify(sidecar)),
      contentType: "application/json",
    });

    if (inserts.length > 0) {
      const inserted = await this.db.insertEvents(inserts);
      for (const { fired } of inserts) {
        this.metrics.eventsRaised.inc({
          triggerType: fired.triggerType,
          severity: fired.severity,
        });
      }
      this.log.info(
        { cameraId: msg.cameraId, fired: inserts.length, inserted },
        "events raised",
      );
    }

    const elapsed = Date.now() - startedAt;
    this.metrics.segmentDuration.observe(elapsed);
    if (elapsed > msg.segmentSeconds * 1000) this.metrics.throttled.inc();

    this.metrics.activeCameras.set(
      [...this.cameras.values()].filter((c) => startedAt - c.lastSegmentAt < 300_000).length,
    );
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
