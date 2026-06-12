// Per-camera rule evaluation, ported from the connector's
// analysis/src/engine.rs with identical semantics:
//
// - presence_in_zone: fires when a tracked person enters the zone, at most
//   once per PRESENCE_COOLDOWN_SECONDS per track (boundary flapping must not
//   spam events).
// - dwell: fires once per visit when a track has been continuously inside
//   for minDurationSeconds. A visit that starts before the rule's schedule
//   window opens still counts — the event fires once the window is open and
//   the duration is met.
// - reentry: zone-level memory, not person identity (no re-id model). Any
//   entry within withinSeconds of the zone's last exit fires, provided the
//   prior visit lasted >= REENTRY_MIN_VISIT_SECONDS and the absence lasted
//   >= REENTRY_MIN_ABSENCE_SECONDS (both guard against boundary flapping).
//   A track that disappears while inside counts as an exit.
// - Schedule gating suppresses firing but state still updates; transitions
//   that happen while the schedule is closed do not retroactively fire.

import type { Severity, Trigger, ScheduleWindow } from "@surveillance/shared";
import { anchor, pointInPolygon, type BBox, type Point } from "./geometry.js";
import { isActive } from "./schedule.js";
import { Tracker, type Detection } from "./tracker.js";

const PRESENCE_COOLDOWN_SECONDS = 60;
const REENTRY_MIN_VISIT_SECONDS = 2;
const REENTRY_MIN_ABSENCE_SECONDS = 5;

export interface EngineRuleConfig {
  id: string;
  label: string;
  zoneId: string;
  scheduleId: string | null;
  trigger: Trigger;
  severity: Severity;
}

export interface EngineCameraConfig {
  timezone: string;
  zones: Array<{ id: string; label: string; polygon: Point[] }>;
  schedules: Array<{ id: string; windows: ScheduleWindow[] }>;
  rules: EngineRuleConfig[];
}

export interface FiredEvent {
  ruleId: string;
  ruleLabel: string;
  zoneId: string;
  zoneLabel: string;
  severity: Severity;
  triggerType: Trigger["type"];
  occurredAtMs: number;
  /** Deterministic for a given (rule, track, trigger, second) so NOTIFY
   *  redelivery dedupes via the events_dedup_idx unique index. */
  dedupKey: string;
  metadata: Record<string, unknown>;
}

interface TrackState {
  insideSince: number | null;
  dwellFired: boolean;
  lastPresenceFired: number | null;
}

interface RuleState {
  trackStates: Map<number, TrackState>;
  /** When the zone last became empty of a track (any track), for reentry. */
  lastExit: number | null;
}

interface EngineRule {
  cfg: EngineRuleConfig;
  zoneLabel: string;
  polygon: Point[];
  windows: ScheduleWindow[] | null;
}

function bboxArray(b: BBox): [number, number, number, number] {
  return [b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1];
}

export class CameraEngine {
  private readonly timezone: string;
  private readonly rules: EngineRule[] = [];
  private readonly states: RuleState[] = [];
  private readonly tracker = new Tracker();

  /**
   * Rules whose zone or schedule can't be resolved are dropped (the API
   * guarantees referential integrity, so a miss means a config race — the
   * next config refresh rebuilds the engine anyway).
   */
  constructor(config: EngineCameraConfig) {
    this.timezone = config.timezone;
    for (const cfg of config.rules) {
      const zone = config.zones.find((z) => z.id === cfg.zoneId);
      if (!zone) continue;
      let windows: ScheduleWindow[] | null = null;
      if (cfg.scheduleId !== null) {
        const schedule = config.schedules.find((s) => s.id === cfg.scheduleId);
        if (!schedule) continue;
        windows = schedule.windows;
      }
      this.rules.push({ cfg, zoneLabel: zone.label, polygon: zone.polygon, windows });
      this.states.push({ trackStates: new Map(), lastExit: null });
    }
  }

  ruleCount(): number {
    return this.rules.length;
  }

  activeTrackCount(): number {
    return this.tracker.activeCount();
  }

  process(detections: readonly Detection[], nowMs: number): FiredEvent[] {
    const t = nowMs / 1000;
    const tracks = this.tracker.update(detections, t);
    const live = this.tracker.aliveIds();
    const fired: FiredEvent[] = [];

    for (let i = 0; i < this.rules.length; i++) {
      const rule = this.rules[i]!;
      const state = this.states[i]!;
      const active = rule.windows === null || isActive(rule.windows, nowMs, this.timezone);

      const fire = (trackId: number, bbox: BBox, extra: Record<string, unknown>) => {
        fired.push({
          ruleId: rule.cfg.id,
          ruleLabel: rule.cfg.label,
          zoneId: rule.cfg.zoneId,
          zoneLabel: rule.zoneLabel,
          severity: rule.cfg.severity,
          triggerType: rule.cfg.trigger.type,
          occurredAtMs: nowMs,
          dedupKey: `${rule.cfg.id}:${trackId}:${rule.cfg.trigger.type}:${Math.round(t)}`,
          metadata: { trackId, bbox: bboxArray(bbox), ...extra },
        });
      };

      for (const track of tracks) {
        const inside = pointInPolygon(anchor(track.bbox), rule.polygon);
        let ts = state.trackStates.get(track.id);
        if (!ts) {
          ts = { insideSince: null, dwellFired: false, lastPresenceFired: null };
          state.trackStates.set(track.id, ts);
        }

        if (inside) {
          if (ts.insideSince === null) {
            // Entry transition.
            ts.insideSince = t;
            ts.dwellFired = false;
            if (active) {
              const trigger = rule.cfg.trigger;
              if (trigger.type === "presence_in_zone") {
                const offCooldown =
                  ts.lastPresenceFired === null ||
                  t - ts.lastPresenceFired >= PRESENCE_COOLDOWN_SECONDS;
                if (offCooldown) {
                  ts.lastPresenceFired = t;
                  fire(track.id, track.bbox, { confidence: track.confidence });
                }
              } else if (trigger.type === "reentry") {
                if (state.lastExit !== null) {
                  const absent = t - state.lastExit;
                  if (
                    absent >= REENTRY_MIN_ABSENCE_SECONDS &&
                    absent <= trigger.params.withinSeconds
                  ) {
                    state.lastExit = null;
                    fire(track.id, track.bbox, {
                      absentSeconds: absent,
                      confidence: track.confidence,
                    });
                  }
                }
              }
            }
          } else if (active && rule.cfg.trigger.type === "dwell") {
            const dwell = t - ts.insideSince;
            if (!ts.dwellFired && dwell >= rule.cfg.trigger.params.minDurationSeconds) {
              ts.dwellFired = true;
              fire(track.id, track.bbox, {
                dwellSeconds: dwell,
                confidence: track.confidence,
              });
            }
          }
        } else if (ts.insideSince !== null) {
          // Exit transition.
          if (t - ts.insideSince >= REENTRY_MIN_VISIT_SECONDS) {
            state.lastExit = t;
          }
          ts.insideSince = null;
          ts.dwellFired = false;
        }
      }

      // Tracks the tracker dropped: a disappearance while inside the zone is
      // an exit (person left the frame through the zone).
      for (const [id, ts] of state.trackStates) {
        if (live.has(id)) continue;
        if (ts.insideSince !== null && t - ts.insideSince >= REENTRY_MIN_VISIT_SECONDS) {
          state.lastExit = t;
        }
        state.trackStates.delete(id);
      }
    }

    return fired;
  }
}
