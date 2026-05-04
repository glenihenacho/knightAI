import { z } from "zod";

export const PreviewStatusSchema = z.enum(["starting", "active", "ended", "failed"]);

export const PreviewSchema = z.object({
  id: z.string().uuid(),
  cameraId: z.string().uuid(),
  status: PreviewStatusSchema,
  maxDurationSeconds: z.number().int().positive(),
  startedAt: z.string().datetime(),
  lastHeartbeatAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  errorMessage: z.string().nullable(),
});

// What POST /v1/cameras/:id/preview returns. Includes a browser-facing
// manifest URL that points back at the API; the API rewrites segment
// references to short-lived signed S3 URLs each time the player refetches.
export const PreviewSessionResponseSchema = z.object({
  preview: PreviewSchema,
  manifestUrl: z.string(),
});

export type PreviewStatus = z.infer<typeof PreviewStatusSchema>;
export type Preview = z.infer<typeof PreviewSchema>;
export type PreviewSessionResponse = z.infer<typeof PreviewSessionResponseSchema>;
