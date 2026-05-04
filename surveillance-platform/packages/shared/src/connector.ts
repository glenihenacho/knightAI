import { z } from "zod";

export const ConnectorStatusSchema = z.enum([
  "pending",
  "online",
  "offline",
  "revoked",
]);

export const ConnectorSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  label: z.string(),
  hostname: z.string().nullable(),
  platform: z.enum(["macos", "windows", "linux"]).nullable(),
  version: z.string().nullable(),
  status: ConnectorStatusSchema,
  lastSeenAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type ConnectorStatus = z.infer<typeof ConnectorStatusSchema>;
export type Connector = z.infer<typeof ConnectorSchema>;
