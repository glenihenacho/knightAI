import { z } from "zod";

// Phase 2 Behavior Intelligence triggers. 'path_deviation' from the original
// contract is deferred — it needs reference-path authoring in the dashboard
// before the engine has anything to compare a track against.
export const TriggerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("presence_in_zone"),
    params: z.object({}).default({}),
  }),
  z.object({
    type: z.literal("dwell"),
    params: z.object({
      // Continuous seconds a tracked person must remain inside the zone.
      minDurationSeconds: z.number().int().min(5).max(3600),
    }),
  }),
  z.object({
    type: z.literal("reentry"),
    params: z.object({
      // Fires when a person re-enters the zone within this many seconds of
      // having left it.
      withinSeconds: z.number().int().min(10).max(86400),
    }),
  }),
]);

export const SeveritySchema = z.enum(["low", "medium", "high"]);

// Phase 1 actions only raise events; Phase 3's Response Orchestration adds
// routing action types.
export const ActionSchema = z.object({
  type: z.literal("raise_event"),
  severity: SeveritySchema,
});

export const RuleSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid(),
  label: z.string(),
  enabled: z.boolean(),
  zoneId: z.string().uuid(),
  scheduleId: z.string().uuid().nullable(),
  trigger: TriggerSchema,
  action: ActionSchema,
});

export const CreateRuleRequestSchema = z.object({
  label: z.string().min(1).max(120),
  zoneId: z.string().uuid(),
  scheduleId: z.string().uuid().nullable().optional(),
  trigger: TriggerSchema,
  action: ActionSchema,
  enabled: z.boolean().optional(),
});

export const UpdateRuleRequestSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  zoneId: z.string().uuid().optional(),
  scheduleId: z.string().uuid().nullable().optional(),
  trigger: TriggerSchema.optional(),
  action: ActionSchema.optional(),
  enabled: z.boolean().optional(),
});

export type Trigger = z.infer<typeof TriggerSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type Action = z.infer<typeof ActionSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type CreateRuleRequest = z.infer<typeof CreateRuleRequestSchema>;
export type UpdateRuleRequest = z.infer<typeof UpdateRuleRequestSchema>;
