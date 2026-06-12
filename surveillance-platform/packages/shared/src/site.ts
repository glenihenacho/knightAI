import { z } from "zod";

// IANA timezone names are validated by the API against Intl's database; the
// schema only enforces shape.
export const SiteSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  label: z.string(),
  timezone: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateSiteRequestSchema = z.object({
  label: z.string().min(1).max(120),
  timezone: z.string().min(1).max(64).optional(),
});

export const UpdateSiteRequestSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  timezone: z.string().min(1).max(64).optional(),
});

export type Site = z.infer<typeof SiteSchema>;
export type CreateSiteRequest = z.infer<typeof CreateSiteRequestSchema>;
export type UpdateSiteRequest = z.infer<typeof UpdateSiteRequestSchema>;
