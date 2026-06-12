// MJPEG splitter unit tests plus a real-FFmpeg extraction test over a
// synthetic 2s MPEG-TS segment (generated with testsrc, like the segments
// the connector uploads).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { extractFrames, MjpegSplitter } from "../src/frames.js";

const execFileAsync = promisify(execFile);

function jpeg(bodyBytes: number[]): Buffer {
  return Buffer.from([0xff, 0xd8, ...bodyBytes, 0xff, 0xd9]);
}

test("splitter yields complete frames across chunk boundaries", () => {
  const a = jpeg([1, 2, 3]);
  const b = jpeg([4, 5]);
  const joined = Buffer.concat([a, b]);
  const splitter = new MjpegSplitter();
  const out: Buffer[] = [];
  // Feed in awkward 3-byte chunks.
  for (let i = 0; i < joined.length; i += 3) {
    out.push(...splitter.push(joined.subarray(i, i + 3)));
  }
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], a);
  assert.deepEqual(out[1], b);
});

test("splitter ignores garbage before SOI", () => {
  const splitter = new MjpegSplitter();
  const frame = jpeg([9]);
  const out = splitter.push(Buffer.concat([Buffer.from([0, 1, 2]), frame]));
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], frame);
});

test("extracts ~fps*duration frames from a real ts segment", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "worker-frames-"));
  const seg = join(dir, "seg-0001.ts");
  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=2:size=320x240:rate=25",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-f",
      "mpegts",
      seg,
    ]);
  } catch (err) {
    t.skip(`ffmpeg unavailable or failed: ${err}`);
    await rm(dir, { recursive: true, force: true });
    return;
  }
  try {
    const frames = await extractFrames(createReadStream(seg), {
      fps: 5,
      ffmpegPath: "ffmpeg",
    });
    // 2s at 5 fps -> ~10 frames (FFmpeg may emit 9-11 depending on PTS).
    assert.ok(frames.length >= 8 && frames.length <= 12, `got ${frames.length} frames`);
    for (const f of frames) {
      assert.equal(f.readUInt16BE(0), 0xffd8);
      assert.equal(f.readUInt16BE(f.length - 2), 0xffd9);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
