import { z } from "zod";

export const CommandKindSchema = z.enum([
  "validate_rtsp",
  "capture_snapshot",
  "ping",
  "start_preview",
  "stop_preview",
  // "Preview but no operator is watching": the connector runs the exact same
  // FFmpeg -> HLS -> upload pipeline; the API owns the heartbeat and the
  // server-side worker consumes the segments for detection.
  "start_detection",
  "stop_detection",
  // LAN camera discovery: the connector runs an ONVIF WS-Discovery multicast
  // probe and returns the devices that answer. No camera is targeted.
  "discover_onvif",
]);

export const ValidateRtspPayloadSchema = z.object({
  cameraId: z.string().uuid(),
  rtspUrl: z.string().url(),
  timeoutMs: z.number().int().positive().max(60_000).default(15_000),
});

export const CaptureSnapshotPayloadSchema = z.object({
  cameraId: z.string().uuid(),
  rtspUrl: z.string().url(),
});

export const PingPayloadSchema = z.object({});

export const StartPreviewPayloadSchema = z.object({
  cameraId: z.string().uuid(),
  previewId: z.string().uuid(),
  rtspUrl: z.string().url(),
  // Connector exits FFmpeg after this many seconds even if no stop arrives.
  maxDurationSeconds: z.number().int().positive().max(60 * 60).default(300),
  // HLS tuning. Defaults: 2s segments, 5-segment rolling window. Matches
  // ~6-10s end-to-end latency from camera to browser.
  segmentSeconds: z.number().int().positive().max(10).default(2),
  windowSegments: z.number().int().positive().max(20).default(5),
});

export const StopPreviewPayloadSchema = z.object({
  cameraId: z.string().uuid(),
  previewId: z.string().uuid(),
});

export const DiscoverOnvifPayloadSchema = z.object({
  // How long the connector listens for ONVIF probe answers before returning.
  timeoutMs: z.number().int().positive().max(15_000).default(4_000),
});

export const CommandSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().uuid(),
    kind: z.literal("validate_rtsp"),
    issuedAt: z.string().datetime(),
    payload: ValidateRtspPayloadSchema,
  }),
  z.object({
    id: z.string().uuid(),
    kind: z.literal("capture_snapshot"),
    issuedAt: z.string().datetime(),
    payload: CaptureSnapshotPayloadSchema,
  }),
  z.object({
    id: z.string().uuid(),
    kind: z.literal("ping"),
    issuedAt: z.string().datetime(),
    payload: PingPayloadSchema,
  }),
  z.object({
    id: z.string().uuid(),
    kind: z.literal("start_preview"),
    issuedAt: z.string().datetime(),
    payload: StartPreviewPayloadSchema,
  }),
  z.object({
    id: z.string().uuid(),
    kind: z.literal("stop_preview"),
    issuedAt: z.string().datetime(),
    payload: StopPreviewPayloadSchema,
  }),
  z.object({
    id: z.string().uuid(),
    kind: z.literal("start_detection"),
    issuedAt: z.string().datetime(),
    payload: StartPreviewPayloadSchema,
  }),
  z.object({
    id: z.string().uuid(),
    kind: z.literal("stop_detection"),
    issuedAt: z.string().datetime(),
    payload: StopPreviewPayloadSchema,
  }),
  z.object({
    id: z.string().uuid(),
    kind: z.literal("discover_onvif"),
    issuedAt: z.string().datetime(),
    payload: DiscoverOnvifPayloadSchema,
  }),
]);

export const CommandResultStatusSchema = z.enum(["ok", "failed", "timeout"]);

export const ValidateRtspResultSchema = z.object({
  reachable: z.boolean(),
  codec: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fps: z.number().positive().optional(),
  snapshotUploadKey: z.string().optional(),
  error: z.string().optional(),
});

export const StartPreviewResultSchema = z.object({
  // Connector confirms it has spawned the transcoder. The first segment will
  // be uploaded shortly after; the dashboard can poll the manifest endpoint.
  startedAt: z.string().datetime(),
});

export const OnvifDeviceSchema = z.object({
  // The camera's host/IP, extracted from the ONVIF service address. This is
  // what the operator drops into an RTSP URL.
  address: z.string(),
  name: z.string().optional(),
  hardware: z.string().optional(),
  // Full ONVIF device-service URL the camera advertised (e.g.
  // http://192.168.1.50/onvif/device_service).
  xaddr: z.string().optional(),
});

export const DiscoverOnvifResultSchema = z.object({
  devices: z.array(OnvifDeviceSchema),
});

export const CommandResultSchema = z.object({
  commandId: z.string().uuid(),
  status: CommandResultStatusSchema,
  durationMs: z.number().int().nonnegative(),
  finishedAt: z.string().datetime(),
  validateRtsp: ValidateRtspResultSchema.optional(),
  startPreview: StartPreviewResultSchema.optional(),
  discoverOnvif: DiscoverOnvifResultSchema.optional(),
  errorMessage: z.string().optional(),
});

export type CommandKind = z.infer<typeof CommandKindSchema>;
export type Command = z.infer<typeof CommandSchema>;
export type CommandResult = z.infer<typeof CommandResultSchema>;
export type ValidateRtspResult = z.infer<typeof ValidateRtspResultSchema>;
export type StartPreviewResult = z.infer<typeof StartPreviewResultSchema>;
export type OnvifDevice = z.infer<typeof OnvifDeviceSchema>;
export type DiscoverOnvifResult = z.infer<typeof DiscoverOnvifResultSchema>;
