// Minimal multi-object tracker, ported from the connector's
// analysis/src/tracker.rs. Greedy IoU matching with a centroid-distance
// fallback (a brisk walker can move far enough between sampled frames that
// boxes no longer overlap). At 5 fps a Kalman filter still buys little;
// what matters is stable ids while a person stands or walks through a zone.

import { center, iou, type BBox } from "./geometry.js";

export interface Detection {
  bbox: BBox;
  confidence: number;
}

export interface Track {
  id: number;
  bbox: BBox;
  confidence: number;
  lastSeen: number;
}

const MAX_AGE_SECONDS = 3;
const IOU_THRESHOLD = 0.25;
const CENTROID_THRESHOLD = 0.12;
// Threshold comparisons are float-tolerant: a box pair sitting exactly on
// the IoU threshold must not flip match/no-match on rounding noise (the
// Rust engine computed in f32, this port in f64 — same fixtures, different
// last bit).
const EPS = 1e-9;

export class Tracker {
  private tracks: Track[] = [];
  private nextId = 1;

  /**
   * Feed one frame's detections at time `t` (seconds, monotonic-ish);
   * returns the live tracks that matched or were created this frame.
   */
  update(detections: readonly Detection[], t: number): Track[] {
    // Expire stale tracks BEFORE matching — a track that aged out must not
    // be resurrected by a new person appearing at the same spot.
    this.tracks = this.tracks.filter((tr) => t - tr.lastSeen <= MAX_AGE_SECONDS);

    // Score every (track, detection) pair, best matches first.
    const pairs: Array<{ ti: number; di: number; score: number }> = [];
    for (let ti = 0; ti < this.tracks.length; ti++) {
      const track = this.tracks[ti]!;
      for (let di = 0; di < detections.length; di++) {
        const det = detections[di]!;
        const overlap = iou(track.bbox, det.bbox);
        if (overlap >= IOU_THRESHOLD - EPS) {
          // IoU matches outrank any centroid match.
          pairs.push({ ti, di, score: 1 + overlap });
          continue;
        }
        const tc = center(track.bbox);
        const dc = center(det.bbox);
        const dist = Math.hypot(tc.x - dc.x, tc.y - dc.y);
        if (dist <= CENTROID_THRESHOLD + EPS) {
          pairs.push({ ti, di, score: 1 - dist });
        }
      }
    }
    pairs.sort((a, b) => b.score - a.score);

    const trackUsed = new Array<boolean>(this.tracks.length).fill(false);
    const detUsed = new Array<boolean>(detections.length).fill(false);
    const current: Track[] = [];

    for (const { ti, di } of pairs) {
      if (trackUsed[ti] || detUsed[di]) continue;
      trackUsed[ti] = true;
      detUsed[di] = true;
      const track = this.tracks[ti]!;
      track.bbox = detections[di]!.bbox;
      track.confidence = detections[di]!.confidence;
      track.lastSeen = t;
      current.push({ ...track });
    }

    for (let di = 0; di < detections.length; di++) {
      if (detUsed[di]) continue;
      const det = detections[di]!;
      const track: Track = {
        id: this.nextId++,
        bbox: det.bbox,
        confidence: det.confidence,
        lastSeen: t,
      };
      this.tracks.push(track);
      current.push({ ...track });
    }

    return current;
  }

  /**
   * Ids still alive in the tracker — includes tracks that missed the current
   * frame but haven't aged out. The engine GCs its per-track state against
   * this, not against the frame's matches, so a single missed detection
   * doesn't reset dwell timers or presence cooldowns.
   */
  aliveIds(): Set<number> {
    return new Set(this.tracks.map((tr) => tr.id));
  }

  activeCount(): number {
    return this.tracks.length;
  }
}
