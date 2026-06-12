// Port of analysis/src/engine.rs tests — same zone, same walking paths,
// same expectations. People move gradually (≤ ~0.1/frame): teleporting
// positions splits tracks and fails for tracker reasons, not engine bugs.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Trigger } from "@surveillance/shared";
import { CameraEngine, type EngineCameraConfig, type FiredEvent } from "../src/engine.js";
import type { Detection } from "../src/tracker.js";

// Zone: central square [0.3,0.7]^2 in normalized coords.
function config(trigger: Trigger, scheduleWindows?: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>): EngineCameraConfig {
  return {
    timezone: "UTC",
    zones: [
      {
        id: "z1",
        label: "Zone",
        polygon: [
          { x: 0.3, y: 0.3 },
          { x: 0.7, y: 0.3 },
          { x: 0.7, y: 0.7 },
          { x: 0.3, y: 0.7 },
        ],
      },
    ],
    schedules: scheduleWindows ? [{ id: "s1", windows: scheduleWindows }] : [],
    rules: [
      {
        id: "r1",
        label: "Rule",
        zoneId: "z1",
        scheduleId: scheduleWindows ? "s1" : null,
        trigger,
        severity: "high",
      },
    ],
  };
}

/** Detection whose anchor (bottom-center) lands at (x, y). */
function personAt(x: number, y: number): Detection {
  return {
    bbox: { x1: x - 0.05, y1: y - 0.3, x2: x + 0.05, y2: y },
    confidence: 0.9,
  };
}

// Monday 2026-06-08 12:00:00 UTC + secs, in ms.
const BASE_MS = Date.UTC(2026, 5, 8, 12, 0, 0);
function at(secs: number): number {
  return BASE_MS + secs * 1000;
}

// Anchor positions. The zone is y in [0.3, 0.7]; a person walks out the
// bottom edge via EDGE (still inside) then OUT (outside).
const IN: [number, number] = [0.5, 0.5];
const EDGE: [number, number] = [0.5, 0.65];
const OUT: [number, number] = [0.5, 0.75];

const presence: Trigger = { type: "presence_in_zone", params: {} };

test("presence fires once per entry with cooldown", () => {
  const eng = new CameraEngine(config(presence));
  const fired = eng.process([personAt(...IN)], at(0));
  assert.equal(fired.length, 1, "entry fires");
  assert.equal(fired[0]!.ruleId, "r1");
  assert.equal(fired[0]!.metadata.trackId, 1);

  // Still inside: no refire.
  assert.equal(eng.process([personAt(0.52, 0.5)], at(1)).length, 0);
  // Walk out and back within the cooldown: no refire.
  assert.equal(eng.process([personAt(...EDGE)], at(2)).length, 0);
  assert.equal(eng.process([personAt(...OUT)], at(3)).length, 0);
  assert.equal(eng.process([personAt(...EDGE)], at(4)).length, 0);
  // Leave for over a minute (track dies), come back: fires again.
  assert.equal(eng.process([personAt(...OUT)], at(5)).length, 0);
  assert.equal(eng.process([personAt(...IN)], at(70)).length, 1);
});

test("second person fires independently", () => {
  const eng = new CameraEngine(config(presence));
  assert.equal(eng.process([personAt(...IN)], at(0)).length, 1);
  const both = eng.process([personAt(0.51, 0.5), personAt(0.6, 0.6)], at(1));
  assert.equal(both.length, 1, "only the newcomer fires");
});

test("dwell fires once after threshold and resets on exit", () => {
  const dwell: Trigger = { type: "dwell", params: { minDurationSeconds: 30 } };
  const eng = new CameraEngine(config(dwell));
  // Stand in the zone at 1 fps for 45s: fires exactly once, at >= 30s.
  const fired: FiredEvent[] = [];
  for (let s = 0; s <= 45; s++) {
    fired.push(...eng.process([personAt(...IN)], at(s)));
  }
  assert.equal(fired.length, 1);
  assert.ok((fired[0]!.metadata.dwellSeconds as number) >= 30);
  // Walk out and back in: the timer restarts and fires once more.
  assert.equal(eng.process([personAt(...EDGE)], at(46)).length, 0);
  assert.equal(eng.process([personAt(...OUT)], at(47)).length, 0);
  const refired: FiredEvent[] = [];
  for (let s = 48; s <= 80; s++) {
    refired.push(...eng.process([personAt(...IN)], at(s)));
  }
  assert.equal(refired.length, 1);
});

test("reentry fires within window only", () => {
  const reentry: Trigger = { type: "reentry", params: { withinSeconds: 60 } };
  const eng = new CameraEngine(config(reentry));
  // Visit for 3s (>= min visit), then walk out.
  assert.equal(eng.process([personAt(...IN)], at(0)).length, 0);
  assert.equal(eng.process([personAt(...EDGE)], at(3)).length, 0);
  assert.equal(eng.process([personAt(...OUT)], at(4)).length, 0);
  // Re-enter 10s later (>= min absence, <= window): fires.
  assert.equal(eng.process([personAt(...OUT)], at(13)).length, 0);
  const fired = eng.process([personAt(...EDGE)], at(14));
  assert.equal(fired.length, 1);
  const absent = fired[0]!.metadata.absentSeconds as number;
  assert.ok(absent >= 9 && absent <= 11, `absent ${absent}`);

  // Walk out again and come back after the window: no fire.
  assert.equal(eng.process([personAt(...IN)], at(16)).length, 0);
  assert.equal(eng.process([personAt(...OUT)], at(17)).length, 0);
  assert.equal(eng.process([personAt(...IN)], at(100)).length, 0);
});

test("reentry ignores boundary flap", () => {
  const reentry: Trigger = { type: "reentry", params: { withinSeconds: 60 } };
  const eng = new CameraEngine(config(reentry));
  // 1s visit < min visit: the exit doesn't arm reentry.
  assert.equal(eng.process([personAt(...EDGE)], at(0)).length, 0);
  assert.equal(eng.process([personAt(...OUT)], at(1)).length, 0);
  assert.equal(eng.process([personAt(...OUT)], at(10)).length, 0);
  assert.equal(eng.process([personAt(...EDGE)], at(11)).length, 0);
});

test("reentry after leaving the frame", () => {
  const reentry: Trigger = { type: "reentry", params: { withinSeconds: 60 } };
  const eng = new CameraEngine(config(reentry));
  // In the zone, then gone from the frame entirely (track dies).
  assert.equal(eng.process([personAt(...IN)], at(0)).length, 0);
  assert.equal(eng.process([personAt(...IN)], at(3)).length, 0);
  assert.equal(eng.process([], at(4)).length, 0);
  assert.equal(eng.process([], at(8)).length, 0); // track expires (> max_age)
  // Back 12s after vanishing: new track, but zone memory fires.
  assert.equal(eng.process([personAt(...IN)], at(20)).length, 1);
});

test("schedule gates firing", () => {
  // Window: Mondays 12:00-13:00 UTC (minutes 720-780). at(0) is Monday
  // 12:00 UTC sharp; at(-2) is 11:59:58.
  const windows = [{ dayOfWeek: 1, startMinute: 720, endMinute: 780 }];
  const eng = new CameraEngine(config(presence, windows));
  // Entry just before the window opens: suppressed, and the same visit
  // doesn't retroactively fire once the window is open.
  assert.equal(eng.process([personAt(...IN)], at(-2)).length, 0);
  assert.equal(eng.process([personAt(...IN)], at(1)).length, 0);
  // A fresh entry inside the window fires.
  const eng2 = new CameraEngine(config(presence, windows));
  assert.equal(eng2.process([personAt(...IN)], at(1)).length, 1);
});

test("dwell started before window fires once open", () => {
  const dwell: Trigger = { type: "dwell", params: { minDurationSeconds: 30 } };
  const windows = [{ dayOfWeek: 1, startMinute: 720, endMinute: 780 }];
  const eng = new CameraEngine(config(dwell, windows));
  // In the zone from 20s before the window opens. The 30s dwell completes
  // at +10s, inside the window — exactly one event.
  const fired: FiredEvent[] = [];
  for (let s = -20; s <= 20; s++) {
    fired.push(...eng.process([personAt(...IN)], at(s)));
  }
  assert.equal(fired.length, 1);
  const dwellSeconds = fired[0]!.metadata.dwellSeconds as number;
  assert.ok(dwellSeconds >= 29 && dwellSeconds <= 32, `dwell ${dwellSeconds}`);
});

test("drops rules with unresolvable refs", () => {
  const cfg = config(presence);
  cfg.rules[0]!.zoneId = "missing";
  assert.equal(new CameraEngine(cfg).ruleCount(), 0);

  const cfg2 = config(presence);
  cfg2.rules[0]!.scheduleId = "missing";
  assert.equal(new CameraEngine(cfg2).ruleCount(), 0);
});

test("dedup key is deterministic for the same firing", () => {
  const a = new CameraEngine(config(presence)).process([personAt(...IN)], at(0));
  const b = new CameraEngine(config(presence)).process([personAt(...IN)], at(0));
  assert.equal(a[0]!.dedupKey, b[0]!.dedupKey);
});
