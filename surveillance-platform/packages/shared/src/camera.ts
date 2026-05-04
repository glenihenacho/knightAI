import { z } from "zod";

export const CameraStateSchema = z.enum([
  "draft",
  "validating",
  "online",
  "offline",
  "error",
]);

export const CreateCameraRequestSchema = z.object({
  connectorId: z.string().uuid(),
  label: z.string().min(1).max(120),
  rtspUrl: z.string().url(),
});

export const CameraSchema = z.object({
  id: z.string().uuid(),
  connectorId: z.string().uuid(),
  label: z.string(),
  rtspUrl: z.string().url(),
  state: CameraStateSchema,
  lastValidatedAt: z.string().datetime().nullable(),
  lastSnapshotKey: z.string().nullable(),
  errorMessage: z.string().nullable(),
});

export type CameraState = z.infer<typeof CameraStateSchema>;
export type CreateCameraRequest = z.infer<typeof CreateCameraRequestSchema>;
export type Camera = z.infer<typeof CameraSchema>;
