// Frame extraction: one FFmpeg subprocess per segment, MPEG-TS in on stdin,
// MJPEG out on stdout, split on JPEG SOI/EOI markers. Per-segment isolation —
// a corrupt segment kills its FFmpeg, not the worker.

import { spawn } from "node:child_process";
import type { Readable } from "node:stream";

const SOI = 0xffd8;
const EOI = 0xffd9;

/** Split a growing MJPEG byte stream into complete JPEG frames. */
export class MjpegSplitter {
  private buffer: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): Buffer[] {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    const frames: Buffer[] = [];
    for (;;) {
      const start = indexOfMarker(this.buffer, SOI, 0);
      if (start === -1) {
        this.buffer = Buffer.alloc(0);
        break;
      }
      const end = indexOfMarker(this.buffer, EOI, start + 2);
      if (end === -1) {
        if (start > 0) this.buffer = this.buffer.subarray(start);
        break;
      }
      frames.push(this.buffer.subarray(start, end + 2));
      this.buffer = this.buffer.subarray(end + 2);
    }
    return frames;
  }
}

function indexOfMarker(buf: Buffer, marker: number, from: number): number {
  const hi = marker >> 8;
  const lo = marker & 0xff;
  for (let i = from; i + 1 < buf.length; i++) {
    if (buf[i] === hi && buf[i + 1] === lo) return i;
  }
  return -1;
}

/**
 * Sample `fps` frames per second out of an MPEG-TS segment stream. Resolves
 * with whatever complete frames FFmpeg produced; rejects only when FFmpeg
 * failed AND produced nothing (a tail-truncated segment that still yielded
 * frames is fine).
 */
export function extractFrames(
  segment: Readable,
  opts: { fps: number; ffmpegPath: string; timeoutMs?: number },
): Promise<Buffer[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      opts.ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-vf",
        `fps=${opts.fps}`,
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    const frames: Buffer[] = [];
    const splitter = new MjpegSplitter();
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
    }, opts.timeoutMs ?? 30_000);

    const settle = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (err && frames.length === 0) reject(err);
      else resolve(frames);
    };

    child.stdout.on("data", (chunk: Buffer) => {
      frames.push(...splitter.push(chunk));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => settle(err));
    child.on("close", (code) => {
      settle(code === 0 ? undefined : new Error(`ffmpeg exited ${code}: ${stderr.trim()}`));
    });

    // FFmpeg closes stdin once it has read the container's tail; EPIPE here
    // is normal, not an error.
    child.stdin.on("error", () => {});
    segment.on("error", (err) => {
      child.kill("SIGKILL");
      settle(err instanceof Error ? err : new Error(String(err)));
    });
    segment.pipe(child.stdin);
  });
}
