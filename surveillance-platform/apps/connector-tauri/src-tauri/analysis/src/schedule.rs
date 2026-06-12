//! "Is this rule active right now?" — schedule windows are evaluated in the
//! site's timezone, matching the dashboard's 7×24 editor semantics.

use chrono::{DateTime, Datelike, Timelike, Utc};
use chrono_tz::Tz;

use crate::config::ScheduleWindow;

/// Parses an IANA timezone, falling back to UTC on garbage — a bad site
/// timezone must degrade to "schedules run in UTC", not kill the engine.
pub fn parse_tz(name: &str) -> Tz {
    name.parse().unwrap_or(chrono_tz::UTC)
}

pub fn is_active(windows: &[ScheduleWindow], now_utc: DateTime<Utc>, tz: Tz) -> bool {
    let local = now_utc.with_timezone(&tz);
    let day = local.weekday().num_days_from_sunday() as u8;
    let minute = (local.hour() * 60 + local.minute()) as u16;
    windows
        .iter()
        .any(|w| w.day_of_week == day && w.start_minute <= minute && minute < w.end_minute)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn window(day: u8, start: u16, end: u16) -> ScheduleWindow {
        ScheduleWindow { day_of_week: day, start_minute: start, end_minute: end }
    }

    #[test]
    fn respects_timezone() {
        // 2026-06-08 is a Monday. 16:30 UTC = 09:30 in Los Angeles.
        let t = Utc.with_ymd_and_hms(2026, 6, 8, 16, 30, 0).unwrap();
        let la: Tz = "America/Los_Angeles".parse().unwrap();
        let business_hours_monday = [window(1, 540, 1020)]; // 09:00–17:00
        assert!(is_active(&business_hours_monday, t, la));
        // Same instant in UTC terms (16:30) is outside a 09:00–17:00 window
        // only if the day flips; here it's still Monday in UTC and inside.
        assert!(is_active(&business_hours_monday, t, chrono_tz::UTC));
        // 05:00 UTC Monday = 22:00 Sunday in LA — Monday window must not match.
        let early = Utc.with_ymd_and_hms(2026, 6, 8, 5, 0, 0).unwrap();
        assert!(!is_active(&business_hours_monday, early, la));
        // ...but a Sunday-evening window does.
        assert!(is_active(&[window(0, 1260, 1440)], early, la));
    }

    #[test]
    fn end_minute_is_exclusive_and_1440_reaches_midnight() {
        let tz = chrono_tz::UTC;
        // Tuesday 23:59 UTC.
        let t = Utc.with_ymd_and_hms(2026, 6, 9, 23, 59, 0).unwrap();
        assert!(is_active(&[window(2, 1380, 1440)], t, tz));
        // Exactly at endMinute is outside.
        let edge = Utc.with_ymd_and_hms(2026, 6, 9, 17, 0, 0).unwrap();
        assert!(!is_active(&[window(2, 540, 1020)], edge, tz));
    }

    #[test]
    fn bad_timezone_falls_back_to_utc() {
        assert_eq!(parse_tz("Not/AZone"), chrono_tz::UTC);
    }
}
