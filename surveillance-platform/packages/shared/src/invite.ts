import { z } from "zod";
import { UserRoleSchema } from "./user.js";

export const InviteSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  organizationId: z.string().uuid(),
  role: UserRoleSchema,
  createdByUserId: z.string().uuid(),
  consumedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export const CreateInviteRequestSchema = z.object({
  email: z.string().email(),
  organizationId: z.string().uuid(),
  role: UserRoleSchema,
});

export const ListInvitesResponseSchema = z.object({
  invites: z.array(InviteSchema),
});

export type Invite = z.infer<typeof InviteSchema>;
export type CreateInviteRequest = z.infer<typeof CreateInviteRequestSchema>;
export type ListInvitesResponse = z.infer<typeof ListInvitesResponseSchema>;
