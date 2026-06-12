// Port of analysis/src/geometry.rs tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { anchor, iou, pointInPolygon, type Point } from "../src/geometry.js";

const square: Point[] = [
  { x: 0.2, y: 0.2 },
  { x: 0.8, y: 0.2 },
  { x: 0.8, y: 0.8 },
  { x: 0.2, y: 0.8 },
];

test("inside and outside square", () => {
  assert.ok(pointInPolygon({ x: 0.5, y: 0.5 }, square));
  assert.ok(!pointInPolygon({ x: 0.1, y: 0.5 }, square));
  assert.ok(!pointInPolygon({ x: 0.5, y: 0.9 }, square));
});

test("concave polygon", () => {
  // L-shape: the notch (top-right quadrant) is outside.
  const l: Point[] = [
    { x: 0, y: 0 },
    { x: 0.5, y: 0 },
    { x: 0.5, y: 0.5 },
    { x: 1, y: 0.5 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  assert.ok(pointInPolygon({ x: 0.25, y: 0.25 }, l));
  assert.ok(!pointInPolygon({ x: 0.75, y: 0.25 }, l));
  assert.ok(pointInPolygon({ x: 0.75, y: 0.75 }, l));
});

test("iou and anchor", () => {
  const a = { x1: 0, y1: 0, x2: 0.5, y2: 0.5 };
  const b = { x1: 0.25, y1: 0.25, x2: 0.75, y2: 0.75 };
  assert.ok(Math.abs(iou(a, b) - 0.0625 / 0.4375) < 1e-6);
  const p = anchor(a);
  assert.ok(Math.abs(p.x - 0.25) < 1e-6 && Math.abs(p.y - 0.5) < 1e-6);
});
