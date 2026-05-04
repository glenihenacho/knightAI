// Minimal ISO-8601 emitter so we don't pull in chrono just for one timestamp.
// Replace with the `time` crate if/when more date math is needed.

use std::time::{SystemTime, UNIX_EPOCH};

pub fn now_iso8601() -> String {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    format!("{}Z", iso_from_unix(secs))
}

fn iso_from_unix(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let sod = (secs % 86_400) as u32;
    let (y, mo, d) = civil_from_days(days);
    let hh = sod / 3600;
    let mm = (sod / 60) % 60;
    let ss = sod % 60;
    format!("{y:04}-{mo:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}")
}

// Howard Hinnant's date algorithm.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}
