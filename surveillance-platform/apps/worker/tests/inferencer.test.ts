// NMS unit test (port of detector.rs) plus a real-model integration test
// gated on the analysis crate's testdata being fetched
// (node scripts/fetch-model.mjs --testdata from apps/connector-tauri).

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { nms, Inferencer } from "../src/inferencer.js";
import type { Detection } from "../src/tracker.js";

const TESTDATA = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../connector-tauri/src-tauri/analysis/testdata",
);

test("nms collapses overlaps", () => {
  const mk = (x1: number, conf: number): Detection => ({
    bbox: { x1, y1: 0, x2: x1 + 0.2, y2: 0.4 },
    confidence: conf,
  });
  const kept = nms([mk(0, 0.9), mk(0.02, 0.8), mk(0.5, 0.7)], 0.45);
  assert.equal(kept.length, 2);
  assert.ok(Math.abs(kept[0]!.confidence - 0.9) < 1e-6);
});

test("detects person in sample photo", async (t) => {
  const modelPath = resolve(TESTDATA, "yolox_nano.onnx");
  const imgPath = resolve(TESTDATA, "person.jpg");
  if (!existsSync(modelPath) || !existsSync(imgPath)) {
    t.skip("testdata not fetched");
    return;
  }
  const inferencer = await Inferencer.load(modelPath);
  const dets = await inferencer.detectJpeg(await readFile(imgPath));
  assert.ok(dets.length > 0, "expected at least one person in the sample photo");
  for (const d of dets) {
    assert.ok(d.confidence >= 0.5);
    assert.ok(d.bbox.x2 > d.bbox.x1 && d.bbox.y2 > d.bbox.y1);
  }
});
