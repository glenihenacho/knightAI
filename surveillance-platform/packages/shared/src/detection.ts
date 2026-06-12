import { z } from "zod";

// Contracts between the API and the server-side detection worker
// (apps/worker), plus the sidecar shape the dashboard reads for bbox overlay.

// Payload of the Postgres NOTIFY the API emits on `segment_ready_shard_{n}`
// after each successful HLS segment upload. The worker treats receipt as
// "segment is in S3, go".
export const SegmentReadySchema = z.object({
  previewId: z.string().uuid(),
  cameraId: z.string().uuid(),
  filename: z.string().regex(/^seg-\d{1,6}\.ts$/),
  segmentSeconds: z.number().int().positive(),
  // When the API finished the S3 PUT. The worker uses this for frame
  // timestamps and for the listener-lag metric.
  uploadedAt: z.string().datetime(),
});

// Channel the API pokes after any rules/zones/schedules mutation so the
// worker drops its cached config for that site.
export const CONFIG_CHANGED_CHANNEL = "config_changed";

export function segmentReadyChannel(shard: number): string {
  return `segment_ready_shard_${shard}`;
}

// Stable cameraId -> shard assignment (FNV-1a). Phase 2 runs one worker on
// shard 0; the routing exists so adding workers is config-only.
export function shardForCamera(cameraId: string, shardCount: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < cameraId.length; i++) {
    h ^= cameraId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % Math.max(1, shardCount);
}

// One frame's detections. bbox is [x, y, w, h] normalized to [0,1] — the same
// convention as Phase 1 zone polygons, so the dashboard overlays both without
// coordinate juggling.
export const FrameDetectionsSchema = z.object({
  tsMs: z.number(),
  detections: z.array(
    z.object({
      cls: z.literal("person"),
      conf: z.number(),
      bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    }),
  ),
});

// Sidecar JSON written by the worker next to each processed segment:
// hls/{cameraId}/{previewId}/seg-NNNN.json. The dashboard fetches it in the
// event clip player to draw bounding boxes over the video.
export const SegmentDetectionsSidecarSchema = z.array(FrameDetectionsSchema);

export type SegmentReady = z.infer<typeof SegmentReadySchema>;
export type FrameDetections = z.infer<typeof FrameDetectionsSchema>;
export type SegmentDetectionsSidecar = z.infer<typeof SegmentDetectionsSidecarSchema>;
