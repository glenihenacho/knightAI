// Port of analysis/src/tracker.rs tests — same scenarios, same thresholds.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Tracker, type Detection } from "../src/tracker.js";

function det(x1: number, y1: number, x2: number, y2: number): Detection {
  return { bbox: { x1, y1, x2, y2 }, confidence: 0.9 };
}

test("keeps id across overlapping frames", () => {
  const tr = new Tracker();
  const a = tr.update([det(0.4, 0.4, 0.5, 0.6)], 0);
  const b = tr.update([det(0.42, 0.4, 0.52, 0.6)], 1);
  assert.equal(a[0]!.id, b[0]!.id);
});

test("centroid fallback bridges fast movement", () => {
  const tr = new Tracker();
  const a = tr.update([det(0.4, 0.4, 0.46, 0.55)], 0);
  // Walked far enough that the boxes no longer overlap, but the centroid
  // only moved ~0.08.
  const b = tr.update([det(0.48, 0.4, 0.54, 0.55)], 1);
  assert.equal(a[0]!.id, b[0]!.id);
});

test("distinct people get distinct ids", () => {
  const tr = new Tracker();
  const tracks = tr.update([det(0.1, 0.1, 0.2, 0.3), det(0.7, 0.6, 0.8, 0.9)], 0);
  assert.notEqual(tracks[0]!.id, tracks[1]!.id);
});

test("stale tracks expire and ids are not reused", () => {
  const tr = new Tracker();
  const a = tr.update([det(0.4, 0.4, 0.5, 0.6)], 0);
  tr.update([], 1);
  // 5s later (> max_age) the same spot is a NEW person/track.
  const b = tr.update([det(0.4, 0.4, 0.5, 0.6)], 5);
  assert.notEqual(a[0]!.id, b[0]!.id);
});

test("survives single missed frame", () => {
  const tr = new Tracker();
  const a = tr.update([det(0.4, 0.4, 0.5, 0.6)], 0);
  tr.update([], 1);
  const b = tr.update([det(0.41, 0.4, 0.51, 0.6)], 2);
  assert.equal(a[0]!.id, b[0]!.id);
});
