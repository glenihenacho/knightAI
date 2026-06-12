import { z } from "zod";

export const PreviewStatusSchema = z.enum(["starting", "active", "ended", "failed"]);

// Lifecycle owner. 'operator' previews live and die with the dashboard
// heartbeat; 'detection' previews are created, heartbeated, and rotated by
// the API's detection supervisor while rules are armed for the camera.
export const PreviewStartedBySchema = z.enum(["operator", "detection"]);

export const PreviewSchema = z.object({
  id: z.string().uuid(),
  cameraId: z.string().uuid(),
  status: PreviewStatusSchema,
  startedBy: PreviewStartedBySchema,
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
export type PreviewStartedBy = z.infer<typeof PreviewStartedBySchema>;
export type Preview = z.infer<typeof PreviewSchema>;
export type PreviewSessionResponse = z.infer<typeof PreviewSessionResponseSchema>;
