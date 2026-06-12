//! Per-camera rule evaluation. Consumes one frame's person detections,
//! maintains track/zone state, and emits events when triggers fire.
//!
//! Semantics (v1):
//! - presence_in_zone: fires when a tracked person enters the zone, at most
//!   once per PRESENCE_COOLDOWN_SECS per track (boundary flapping must not
//!   spam events).
//! - dwell: fires once per visit when a track has been continuously inside
//!   for minDurationSeconds. A visit that starts before the rule's schedule
//!   window opens still counts — the event fires once the window is open and
//!   the duration is met.
//! - reentry: zone-level memory, not person identity (no re-id model). Any
//!   entry within withinSeconds of the zone's last exit fires, provided the
//!   prior visit lasted >= REENTRY_MIN_VISIT_SECS and the absence lasted
//!   >= REENTRY_MIN_ABSENCE_SECS (both guard against boundary flapping).
//!   A track that disappears while inside counts as an exit.
//! - Schedule gating suppresses firing but state still updates; transitions
//!   that happen while the schedule is closed do not retroactively fire.

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use chrono_tz::Tz;
use serde_json::json;

use crate::config::{AnalysisConfig, CameraConfig, Point, RuleConfig, ScheduleWindow, Trigger};
use crate::geometry::point_in_polygon;
use crate::schedule::{is_active, parse_tz};
use crate::tracker::{Detection, Tracker};

const PRESENCE_COOLDOWN_SECS: f64 = 60.0;
const REENTRY_MIN_VISIT_SECS: f64 = 2.0;
const REENTRY_MIN_ABSENCE_SECS: f64 = 5.0;

#[derive(Debug, Clone)]
pub struct FiredEvent {
    pub rule_id: String,
    pub occurred_at: DateTime<Utc>,
    pub metadata: serde_json::Value,
}

#[derive(Default)]
struct TrackState {
    inside_since: Option<f64>,
    dwell_fired: bool,
    last_presence_fired: Option<f64>,
}

#[derive(Default)]
struct RuleState {
    track_states: HashMap<u64, TrackState>,
    /// When the zone last became empty of this track (any track), for reentry.
    last_exit: Option<f64>,
}

struct EngineRule {
    cfg: RuleConfig,
    polygon: Vec<Point>,
    windows: Option<Vec<ScheduleWindow>>,
}

pub struct CameraEngine {
    tz: Tz,
    rules: Vec<EngineRule>,
    states: Vec<RuleState>,
    tracker: Tracker,
}

impl CameraEngine {
    /// Builds the engine for one camera from the full config. Rules whose
    /// zone or schedule can't be resolved are dropped (the API guarantees
    /// referential integrity, so a miss means a config race — next config
    /// poll rebuilds the engine anyway).
    pub fn new(camera: &CameraConfig, config: &AnalysisConfig) -> Self {
        let mut rules = Vec::new();
        for cfg in config.rules.iter().filter(|r| r.camera_id == camera.id) {
            let Some(zone) = camera.zones.iter().find(|z| z.id == cfg.zone_id) else {
                continue;
            };
            let windows = match &cfg.schedule_id {
                None => None,
                Some(sid) => match config.schedules.iter().find(|s| &s.id == sid) {
                    Some(s) => Some(s.windows.clone()),
                    None => continue,
                },
            };
            rules.push(EngineRule { cfg: cfg.clone(), polygon: zone.polygon.clone(), windows });
        }
        let states = rules.iter().map(|_| RuleState::default()).collect();
        Self { tz: parse_tz(&config.timezone), rules, states, tracker: Tracker::default() }
    }

    pub fn rule_count(&self) -> usize {
        self.rules.len()
    }

    pub fn process(&mut self, detections: &[Detection], now: DateTime<Utc>) -> Vec<FiredEvent> {
        let t = now.timestamp_millis() as f64 / 1000.0;
        let tracks = self.tracker.update(detections, t);
        let live: std::collections::HashSet<u64> = self.tracker.alive_ids().collect();
        let mut fired = Vec::new();

        for (rule, state) in self.rules.iter().zip(self.states.iter_mut()) {
            let active = rule
                .windows
                .as_ref()
                .map_or(true, |w| is_active(w, now, self.tz));

            for track in &tracks {
                let inside = point_in_polygon(track.bbox.anchor(), &rule.polygon);
                let ts = state.track_states.entry(track.id).or_default();

                if inside {
                    if ts.inside_since.is_none() {
                        // Entry transition.
                        ts.inside_since = Some(t);
                        ts.dwell_fired = false;
                        if active {
                            match rule.cfg.trigger {
                                Trigger::PresenceInZone {} => {
                                    let off_cooldown = ts
                                        .last_presence_fired
                                        .map_or(true, |last| t - last >= PRESENCE_COOLDOWN_SECS);
                                    if off_cooldown {
                                        ts.last_presence_fired = Some(t);
                                        fired.push(FiredEvent {
                                            rule_id: rule.cfg.id.clone(),
                                            occurred_at: now,
                                            metadata: json!({
                                                "trackId": track.id,
                                                "confidence": track.confidence,
                                            }),
                                        });
                                    }
                                }
                                Trigger::Reentry { within_seconds } => {
                                    if let Some(exit_t) = state.last_exit {
                                        let absent = t - exit_t;
                                        if absent >= REENTRY_MIN_ABSENCE_SECS
                                            && absent <= within_seconds as f64
                                        {
                                            state.last_exit = None;
                                            fired.push(FiredEvent {
                                                rule_id: rule.cfg.id.clone(),
                                                occurred_at: now,
                                                metadata: json!({
                                                    "trackId": track.id,
                                                    "absentSeconds": absent,
                                                    "confidence": track.confidence,
                                                }),
                                            });
                                        }
                                    }
                                }
                                Trigger::Dwell { .. } => {}
                            }
                        }
                    } else if active {
                        if let Trigger::Dwell { min_duration_seconds } = rule.cfg.trigger {
                            let dwell = t - ts.inside_since.unwrap_or(t);
                            if !ts.dwell_fired && dwell >= min_duration_seconds as f64 {
                                ts.dwell_fired = true;
                                fired.push(FiredEvent {
                                    rule_id: rule.cfg.id.clone(),
                                    occurred_at: now,
                                    metadata: json!({
                                        "trackId": track.id,
                                        "dwellSeconds": dwell,
                                        "confidence": track.confidence,
                                    }),
                                });
                            }
                        }
                    }
                } else if let Some(since) = ts.inside_since {
                    // Exit transition.
                    if t - since >= REENTRY_MIN_VISIT_SECS {
                        state.last_exit = Some(t);
                    }
                    ts.inside_since = None;
                    ts.dwell_fired = false;
                }
            }

            // Tracks the tracker dropped: a disappearance while inside the
            // zone is an exit (person left the frame through the zone).
            let RuleState { track_states, last_exit } = state;
            track_states.retain(|id, ts| {
                if live.contains(id) {
                    return true;
                }
                if let Some(since) = ts.inside_since {
                    if t - since >= REENTRY_MIN_VISIT_SECS {
                        *last_exit = Some(t);
                    }
                }
                false
            });
        }

        fired
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{ScheduleConfig, ZoneConfig};
    use crate::geometry::BBox;
    use chrono::TimeZone;

    // Zone: central square [0.3,0.7]^2 in normalized coords.
    fn config(trigger_json: &str, schedule: Option<&str>) -> AnalysisConfig {
        let schedule_id = schedule.map(|_| "\"s1\"".to_string()).unwrap_or("null".into());
        let schedules = schedule
            .map(|w| format!(r#"[{{"id": "s1", "windows": {w}}}]"#))
            .unwrap_or("[]".into());
        let json = format!(
            r#"{{
                "timezone": "UTC",
                "cameras": [{{
                    "id": "c1", "label": "Cam", "rtspUrl": "rtsp://x",
                    "zones": [{{"id": "z1", "label": "Zone", "polygon": [
                        {{"x": 0.3, "y": 0.3}}, {{"x": 0.7, "y": 0.3}},
                        {{"x": 0.7, "y": 0.7}}, {{"x": 0.3, "y": 0.7}}
                    ]}}]
                }}],
                "schedules": {schedules},
                "rules": [{{
                    "id": "r1", "label": "Rule", "cameraId": "c1", "zoneId": "z1",
                    "scheduleId": {schedule_id},
                    "trigger": {trigger_json},
                    "severity": "high"
                }}]
            }}"#
        );
        serde_json::from_str(&json).expect("test config")
    }

    fn engine(cfg: &AnalysisConfig) -> CameraEngine {
        CameraEngine::new(&cfg.cameras[0], cfg)
    }

    /// Detection whose anchor (bottom-center) lands at (x, y).
    fn person_at(x: f32, y: f32) -> Detection {
        Detection {
            bbox: BBox { x1: x - 0.05, y1: y - 0.3, x2: x + 0.05, y2: y },
            confidence: 0.9,
        }
    }

    fn at(secs: i64) -> DateTime<Utc> {
        // Monday 2026-06-08 12:00:00 UTC + secs.
        Utc.timestamp_opt(1_780_920_000 + secs, 0).unwrap()
    }

    // Anchor positions. The zone is y in [0.3, 0.7]; a person walks out the
    // bottom edge via EDGE (still inside) then OUT (outside). Each step keeps
    // enough box overlap for the tracker to follow — people walk, they don't
    // teleport.
    const IN: (f32, f32) = (0.5, 0.5);
    const EDGE: (f32, f32) = (0.5, 0.65);
    const OUT: (f32, f32) = (0.5, 0.75);

    #[test]
    fn presence_fires_once_per_entry_with_cooldown() {
        let cfg = config(r#"{"type": "presence_in_zone", "params": {}}"#, None);
        let mut eng = engine(&cfg);
        let fired = eng.process(&[person_at(IN.0, IN.1)], at(0));
        assert_eq!(fired.len(), 1, "entry fires");
        assert_eq!(fired[0].rule_id, "r1");
        assert_eq!(fired[0].metadata["trackId"], 1);

        // Still inside: no refire.
        assert!(eng.process(&[person_at(0.52, 0.5)], at(1)).is_empty());
        // Walk out and back within the cooldown: no refire.
        assert!(eng.process(&[person_at(EDGE.0, EDGE.1)], at(2)).is_empty());
        assert!(eng.process(&[person_at(OUT.0, OUT.1)], at(3)).is_empty());
        assert!(eng.process(&[person_at(EDGE.0, EDGE.1)], at(4)).is_empty());
        // Leave for over a minute (track dies), come back: fires again.
        assert!(eng.process(&[person_at(OUT.0, OUT.1)], at(5)).is_empty());
        let again = eng.process(&[person_at(IN.0, IN.1)], at(70));
        assert_eq!(again.len(), 1);
    }

    #[test]
    fn second_person_fires_independently() {
        let cfg = config(r#"{"type": "presence_in_zone", "params": {}}"#, None);
        let mut eng = engine(&cfg);
        assert_eq!(eng.process(&[person_at(IN.0, IN.1)], at(0)).len(), 1);
        let both = eng.process(&[person_at(0.51, 0.5), person_at(0.6, 0.6)], at(1));
        assert_eq!(both.len(), 1, "only the newcomer fires");
    }

    #[test]
    fn dwell_fires_once_after_threshold_and_resets_on_exit() {
        let cfg = config(r#"{"type": "dwell", "params": {"minDurationSeconds": 30}}"#, None);
        let mut eng = engine(&cfg);
        // Stand in the zone at 1 fps for 45s: fires exactly once, at >= 30s.
        let mut fired = Vec::new();
        for s in 0..=45 {
            fired.extend(eng.process(&[person_at(IN.0, IN.1)], at(s)));
        }
        assert_eq!(fired.len(), 1);
        assert!(fired[0].metadata["dwellSeconds"].as_f64().unwrap() >= 30.0);
        // Walk out and back in: the timer restarts and fires once more.
        assert!(eng.process(&[person_at(EDGE.0, EDGE.1)], at(46)).is_empty());
        assert!(eng.process(&[person_at(OUT.0, OUT.1)], at(47)).is_empty());
        let mut refired = Vec::new();
        for s in 48..=80 {
            refired.extend(eng.process(&[person_at(IN.0, IN.1)], at(s)));
        }
        assert_eq!(refired.len(), 1);
    }

    #[test]
    fn reentry_fires_within_window_only() {
        let cfg = config(r#"{"type": "reentry", "params": {"withinSeconds": 60}}"#, None);
        let mut eng = engine(&cfg);
        // Visit for 3s (>= min visit), then walk out.
        assert!(eng.process(&[person_at(IN.0, IN.1)], at(0)).is_empty());
        assert!(eng.process(&[person_at(EDGE.0, EDGE.1)], at(3)).is_empty());
        assert!(eng.process(&[person_at(OUT.0, OUT.1)], at(4)).is_empty());
        // Re-enter 10s later (>= min absence, <= window): fires.
        assert!(eng.process(&[person_at(OUT.0, OUT.1)], at(13)).is_empty());
        let fired = eng.process(&[person_at(EDGE.0, EDGE.1)], at(14));
        assert_eq!(fired.len(), 1);
        let absent = fired[0].metadata["absentSeconds"].as_f64().unwrap();
        assert!((9.0..=11.0).contains(&absent), "absent {absent}");

        // Walk out again and come back after the window: no fire.
        assert!(eng.process(&[person_at(IN.0, IN.1)], at(16)).is_empty());
        assert!(eng.process(&[person_at(OUT.0, OUT.1)], at(17)).is_empty());
        assert!(eng.process(&[person_at(IN.0, IN.1)], at(100)).is_empty());
    }

    #[test]
    fn reentry_ignores_boundary_flap() {
        let cfg = config(r#"{"type": "reentry", "params": {"withinSeconds": 60}}"#, None);
        let mut eng = engine(&cfg);
        // 1s visit < min visit: the exit doesn't arm reentry.
        assert!(eng.process(&[person_at(EDGE.0, EDGE.1)], at(0)).is_empty());
        assert!(eng.process(&[person_at(OUT.0, OUT.1)], at(1)).is_empty());
        assert!(eng.process(&[person_at(OUT.0, OUT.1)], at(10)).is_empty());
        assert!(eng.process(&[person_at(EDGE.0, EDGE.1)], at(11)).is_empty());
    }

    #[test]
    fn reentry_after_leaving_the_frame() {
        let cfg = config(r#"{"type": "reentry", "params": {"withinSeconds": 60}}"#, None);
        let mut eng = engine(&cfg);
        // In the zone, then gone from the frame entirely (track dies).
        assert!(eng.process(&[person_at(IN.0, IN.1)], at(0)).is_empty());
        assert!(eng.process(&[person_at(IN.0, IN.1)], at(3)).is_empty());
        assert!(eng.process(&[], at(4)).is_empty());
        assert!(eng.process(&[], at(8)).is_empty()); // track expires (> max_age)
        // Back 12s after vanishing: new track, but zone memory fires.
        let fired = eng.process(&[person_at(IN.0, IN.1)], at(20));
        assert_eq!(fired.len(), 1);
    }

    #[test]
    fn schedule_gates_firing() {
        // Window: Mondays 12:00–13:00 UTC (minutes 720–780). at(0) is Monday
        // 12:00 UTC sharp; at(-60) is 11:59.
        let cfg = config(
            r#"{"type": "presence_in_zone", "params": {}}"#,
            Some(r#"[{"dayOfWeek": 1, "startMinute": 720, "endMinute": 780}]"#),
        );
        let mut eng = engine(&cfg);
        // Entry just before the window opens: suppressed, and the same visit
        // doesn't retroactively fire once the window is open.
        assert!(eng.process(&[person_at(IN.0, IN.1)], at(-2)).is_empty());
        assert!(eng.process(&[person_at(IN.0, IN.1)], at(1)).is_empty());
        // A fresh entry inside the window fires.
        let mut eng2 = engine(&cfg);
        assert_eq!(eng2.process(&[person_at(IN.0, IN.1)], at(1)).len(), 1);
    }

    #[test]
    fn dwell_started_before_window_fires_once_open() {
        let cfg = config(
            r#"{"type": "dwell", "params": {"minDurationSeconds": 30}}"#,
            Some(r#"[{"dayOfWeek": 1, "startMinute": 720, "endMinute": 780}]"#),
        );
        let mut eng = engine(&cfg);
        // In the zone from 20s before the window opens. The 30s dwell
        // completes at +10s, inside the window — exactly one event.
        let mut fired = Vec::new();
        for s in -20..=20 {
            fired.extend(eng.process(&[person_at(IN.0, IN.1)], at(s)));
        }
        assert_eq!(fired.len(), 1);
        let dwell = fired[0].metadata["dwellSeconds"].as_f64().unwrap();
        assert!((29.0..=32.0).contains(&dwell), "dwell {dwell}");
    }

    #[test]
    fn drops_rules_with_unresolvable_refs() {
        let mut cfg = config(r#"{"type": "presence_in_zone", "params": {}}"#, None);
        cfg.rules[0].zone_id = "missing".into();
        assert_eq!(engine(&cfg).rule_count(), 0);

        let mut cfg2 = config(r#"{"type": "presence_in_zone", "params": {}}"#, None);
        cfg2.rules[0].schedule_id = Some("missing".into());
        assert_eq!(engine(&cfg2).rule_count(), 0);
    }

    #[allow(dead_code)]
    fn silence_unused(_: ZoneConfig, _: ScheduleConfig) {}
}
