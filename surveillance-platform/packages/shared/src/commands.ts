import { z } from "zod";

export const CommandKindSchema = z.enum([
  "validate_rtsp",
  "capture_snapshot",
  "ping",
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

export const CommandResultSchema = z.object({
  commandId: z.string().uuid(),
  status: CommandResultStatusSchema,
  durationMs: z.number().int().nonnegative(),
  finishedAt: z.string().datetime(),
  validateRtsp: ValidateRtspResultSchema.optional(),
  errorMessage: z.string().optional(),
});

export type CommandKind = z.infer<typeof CommandKindSchema>;
export type Command = z.infer<typeof CommandSchema>;
export type CommandResult = z.infer<typeof CommandResultSchema>;
export type ValidateRtspResult = z.infer<typeof ValidateRtspResultSchema>;
