// Port of analysis/src/schedule.rs tests, plus a DST-transition case (the
// Rust side leaned on chrono-tz; here Intl/ICU does the same job).

import { test } from "node:test";
import assert from "node:assert/strict";
import { isActive } from "../src/schedule.js";
import type { ScheduleWindow } from "@surveillance/shared";

function window(dayOfWeek: number, startMinute: number, endMinute: number): ScheduleWindow {
  return { dayOfWeek, startMinute, endMinute };
}

test("respects timezone", () => {
  // 2026-06-08 is a Monday. 16:30 UTC = 09:30 in Los Angeles.
  const t = Date.UTC(2026, 5, 8, 16, 30, 0);
  const businessHoursMonday = [window(1, 540, 1020)]; // 09:00-17:00
  assert.ok(isActive(businessHoursMonday, t, "America/Los_Angeles"));
  assert.ok(isActive(businessHoursMonday, t, "UTC"));
  // 05:00 UTC Monday = 22:00 Sunday in LA — Monday window must not match.
  const early = Date.UTC(2026, 5, 8, 5, 0, 0);
  assert.ok(!isActive(businessHoursMonday, early, "America/Los_Angeles"));
  // ...but a Sunday-evening window does.
  assert.ok(isActive([window(0, 1260, 1440)], early, "America/Los_Angeles"));
});

test("end minute is exclusive and 1440 reaches midnight", () => {
  // Tuesday 23:59 UTC.
  const t = Date.UTC(2026, 5, 9, 23, 59, 0);
  assert.ok(isActive([window(2, 1380, 1440)], t, "UTC"));
  // Exactly at endMinute is outside.
  const edge = Date.UTC(2026, 5, 9, 17, 0, 0);
  assert.ok(!isActive([window(2, 540, 1020)], edge, "UTC"));
});

test("bad timezone falls back to UTC", () => {
  const t = Date.UTC(2026, 5, 8, 12, 0, 0); // Monday noon UTC
  assert.ok(isActive([window(1, 700, 760)], t, "Not/AZone"));
});

test("DST transition: window tracks local clock", () => {
  // US spring-forward 2026-03-08 (Sunday): 02:00 EST jumps to 03:00 EDT.
  // 14:00 UTC on 2026-03-09 (Monday) = 10:00 EDT (UTC-4, post-transition).
  const afterDst = Date.UTC(2026, 2, 9, 14, 0, 0);
  const tenToElevenMonday = [window(1, 600, 660)];
  assert.ok(isActive(tenToElevenMonday, afterDst, "America/New_York"));
  // Pre-transition (2026-03-02, also Monday) the same UTC instant is
  // 09:00 EST — outside the window.
  const beforeDst = Date.UTC(2026, 2, 2, 14, 0, 0);
  assert.ok(!isActive(tenToElevenMonday, beforeDst, "America/New_York"));
});
