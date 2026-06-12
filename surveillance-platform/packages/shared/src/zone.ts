import { z } from "zod";

// Vertices are normalized to the camera frame: (0,0) top-left, (1,1)
// bottom-right. Normalized coords survive resolution changes; the dashboard
// scales against the rendered element's bounding box.
export const PolygonPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const PolygonSchema = z.array(PolygonPointSchema).min(3);

export const ZoneSchema = z.object({
  id: z.string().uuid(),
  cameraId: z.string().uuid(),
  label: z.string(),
  polygon: PolygonSchema,
});

export const CreateZoneRequestSchema = z.object({
  label: z.string().min(1).max(120),
  polygon: PolygonSchema,
});

export const UpdateZoneRequestSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  polygon: PolygonSchema.optional(),
});

export type PolygonPoint = z.infer<typeof PolygonPointSchema>;
export type Zone = z.infer<typeof ZoneSchema>;
export type CreateZoneRequest = z.infer<typeof CreateZoneRequestSchema>;
export type UpdateZoneRequest = z.infer<typeof UpdateZoneRequestSchema>;
