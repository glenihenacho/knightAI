import { z } from "zod";

export const UserSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const RequestMagicLinkRequestSchema = z.object({
  email: z.string().email(),
});

export const MeResponseSchema = z.object({
  user: UserSchema,
});

export type User = z.infer<typeof UserSchema>;
export type RequestMagicLinkRequest = z.infer<typeof RequestMagicLinkRequestSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;
