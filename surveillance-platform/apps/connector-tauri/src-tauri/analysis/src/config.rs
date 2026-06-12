//! Serde mirror of the API's `GET /v1/connectors/analysis-config` response
//! (the zod `AnalysisConfigSchema` in @surveillance/shared is the source of
//! truth for this wire shape).

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct AnalysisConfig {
    pub timezone: String,
    pub cameras: Vec<CameraConfig>,
    pub schedules: Vec<ScheduleConfig>,
    pub rules: Vec<RuleConfig>,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CameraConfig {
    pub id: String,
    pub label: String,
    pub rtsp_url: String,
    pub zones: Vec<ZoneConfig>,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct ZoneConfig {
    pub id: String,
    pub label: String,
    pub polygon: Vec<Point>,
}

/// Normalized to the camera frame: (0,0) top-left, (1,1) bottom-right.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct ScheduleConfig {
    pub id: String,
    pub windows: Vec<ScheduleWindow>,
}

/// Same-day span in the site's timezone; midnight crossings arrive as two
/// windows. endMinute may be 1440 so midnight-ending windows are exact.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleWindow {
    pub day_of_week: u8,
    pub start_minute: u16,
    pub end_minute: u16,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RuleConfig {
    pub id: String,
    pub label: String,
    pub camera_id: String,
    pub zone_id: String,
    pub schedule_id: Option<String>,
    pub trigger: Trigger,
    pub severity: String,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
#[serde(tag = "type", content = "params")]
pub enum Trigger {
    #[serde(rename = "presence_in_zone")]
    PresenceInZone {},
    #[serde(rename = "dwell")]
    Dwell {
        #[serde(rename = "minDurationSeconds")]
        min_duration_seconds: u32,
    },
    #[serde(rename = "reentry")]
    Reentry {
        #[serde(rename = "withinSeconds")]
        within_seconds: u32,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_api_shape() {
        let json = r#"{
            "timezone": "America/Los_Angeles",
            "cameras": [{
                "id": "c1", "label": "Lobby", "rtspUrl": "rtsp://10.0.0.5/stream",
                "zones": [{"id": "z1", "label": "Floor", "polygon": [
                    {"x": 0.1, "y": 0.1}, {"x": 0.9, "y": 0.1}, {"x": 0.5, "y": 0.9}
                ]}]
            }],
            "schedules": [{"id": "s1", "windows": [
                {"dayOfWeek": 1, "startMinute": 540, "endMinute": 1440}
            ]}],
            "rules": [
                {"id": "r1", "label": "Presence", "cameraId": "c1", "zoneId": "z1",
                 "scheduleId": null,
                 "trigger": {"type": "presence_in_zone", "params": {}},
                 "severity": "high"},
                {"id": "r2", "label": "Loiterer", "cameraId": "c1", "zoneId": "z1",
                 "scheduleId": "s1",
                 "trigger": {"type": "dwell", "params": {"minDurationSeconds": 30}},
                 "severity": "medium"},
                {"id": "r3", "label": "Return", "cameraId": "c1", "zoneId": "z1",
                 "scheduleId": null,
                 "trigger": {"type": "reentry", "params": {"withinSeconds": 120}},
                 "severity": "low"}
            ]
        }"#;
        let cfg: AnalysisConfig = serde_json::from_str(json).expect("parse");
        assert_eq!(cfg.cameras[0].rtsp_url, "rtsp://10.0.0.5/stream");
        assert_eq!(cfg.rules.len(), 3);
        assert_eq!(
            cfg.rules[1].trigger,
            Trigger::Dwell { min_duration_seconds: 30 }
        );
        assert_eq!(cfg.schedules[0].windows[0].end_minute, 1440);
    }
}
