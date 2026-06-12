import { z } from "zod";
import { SeveritySchema, TriggerSchema } from "./rule.js";
import { PolygonSchema } from "./zone.js";
import { ScheduleWindowsSchema } from "./schedule.js";

// Phase 2: an event is a rule firing, raised by the connector's behavior
// engine. The connector generates the event id so a retried POST after a
// network failure dedupes server-side (INSERT ... ON CONFLICT DO NOTHING).
export const ConnectorEventSchema = z.object({
  id: z.string().uuid(),
  ruleId: z.string().uuid(),
  occurredAt: z.string().datetime({ offset: true }),
  // Optional frame of the triggering moment, uploaded beforehand via
  // PUT /v1/connectors/uploads/:uploadKey (same keyspace as snapshots).
  snapshotKey: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  // Engine-specific detail (trackId, dwellSeconds, absentSeconds, confidence).
  metadata: z.record(z.unknown()).default({}),
});

export const IngestEventsRequestSchema = z.object({
  events: z.array(ConnectorEventSchema).min(1).max(50),
});

// Read model. rule/camera/zone ids are null once the source row is deleted;
// the labels are denormalized at insert so the event still renders.
export const EventSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid(),
  ruleId: z.string().uuid().nullable(),
  ruleLabel: z.string(),
  cameraId: z.string().uuid().nullable(),
  cameraLabel: z.string(),
  zoneId: z.string().uuid().nullable(),
  zoneLabel: z.string(),
  triggerType: z.string(),
  severity: SeveritySchema,
  occurredAt: z.string().datetime({ offset: true }),
  snapshotKey: z.string().nullable(),
  metadata: z.record(z.unknown()),
  // S3 key of the HLS segment containing the trigger frame, set by the
  // server-side detection worker. Null for connector-era events (pre-pivot)
  // — those have no clip playback.
  segmentKey: z.string().nullable(),
});

// Connector-facing snapshot of everything its behavior engine needs: cameras
// it owns (with RTSP URLs), zones per camera, the site's schedules + timezone,
// and the enabled rules. The connector polls this and diffs the JSON to decide
// when to restart analysis workers.
export const AnalysisCameraSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  rtspUrl: z.string(),
  zones: z.array(
    z.object({
      id: z.string().uuid(),
      label: z.string(),
      polygon: PolygonSchema,
    }),
  ),
});

export const AnalysisRuleSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  cameraId: z.string().uuid(),
  zoneId: z.string().uuid(),
  scheduleId: z.string().uuid().nullable(),
  trigger: TriggerSchema,
  severity: SeveritySchema,
});

export const AnalysisConfigSchema = z.object({
  timezone: z.string(),
  cameras: z.array(AnalysisCameraSchema),
  schedules: z.array(
    z.object({
      id: z.string().uuid(),
      windows: ScheduleWindowsSchema,
    }),
  ),
  rules: z.array(AnalysisRuleSchema),
});

export type ConnectorEvent = z.infer<typeof ConnectorEventSchema>;
export type IngestEventsRequest = z.infer<typeof IngestEventsRequestSchema>;
export type Event = z.infer<typeof EventSchema>;
export type AnalysisCamera = z.infer<typeof AnalysisCameraSchema>;
export type AnalysisRule = z.infer<typeof AnalysisRuleSchema>;
export type AnalysisConfig = z.infer<typeof AnalysisConfigSchema>;
