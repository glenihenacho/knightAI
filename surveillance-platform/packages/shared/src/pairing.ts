import { z } from "zod";

export const PairingCodeSchema = z
  .string()
  .regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/, "expected XXXX-XXXX format");

// The organization is derived from the authenticated operator's session, so
// the body only carries the optional label and target site. When siteId is
// omitted the API falls back to the org's oldest site.
export const CreatePairingRequestSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  siteId: z.string().uuid().optional(),
});

export const CreatePairingResponseSchema = z.object({
  pairingId: z.string().uuid(),
  code: PairingCodeSchema,
  expiresAt: z.string().datetime(),
});

export const RedeemPairingRequestSchema = z.object({
  code: PairingCodeSchema,
  hostname: z.string().min(1),
  platform: z.enum(["macos", "windows", "linux"]),
  version: z.string().min(1),
});

export const RedeemPairingResponseSchema = z.object({
  connectorId: z.string().uuid(),
  connectorToken: z.string().min(32),
  apiBaseUrl: z.string().url(),
  pollIntervalMs: z.number().int().positive(),
  // Label of the site this connector was paired to, shown on the connector's
  // running screen so multi-site operators can tell machines apart.
  siteName: z.string(),
});

export type PairingCode = z.infer<typeof PairingCodeSchema>;
export type CreatePairingRequest = z.infer<typeof CreatePairingRequestSchema>;
export type CreatePairingResponse = z.infer<typeof CreatePairingResponseSchema>;
export type RedeemPairingRequest = z.infer<typeof RedeemPairingRequestSchema>;
export type RedeemPairingResponse = z.infer<typeof RedeemPairingResponseSchema>;
