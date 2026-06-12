// Person detection with YOLOX (Apache-2.0 — YOLOv8 and friends are AGPL,
// unusable in a commercial product) on onnxruntime-node. The official YOLOX
// release models are exported with decode_in_inference=False, so the raw
// head output is decoded here exactly like the upstream demo — and exactly
// like the connector's analysis/src/detector.rs, which this ports: per-stride
// grid offsets, exp() box sizes, then class-0 (COCO person) score threshold
// and NMS.

import * as ort from "onnxruntime-node";
import sharp from "sharp";
import { iou } from "./geometry.js";
import type { Detection } from "./tracker.js";

const STRIDES = [8, 16, 32] as const;
const PERSON_CLASS = 0;
/** Letterbox padding value used by YOLOX preprocessing. */
const PAD = 114;
/** Square model input for yolox_nano / yolox_tiny. */
const INPUT_SIZE = 416;

export interface InferencerOptions {
  scoreThreshold?: number;
  nmsIou?: number;
  executionProviders?: string[];
}

export class Inferencer {
  private constructor(
    private readonly session: ort.InferenceSession,
    private readonly scoreThreshold: number,
    private readonly nmsIou: number,
  ) {}

  static async load(modelPath: string, opts: InferencerOptions = {}): Promise<Inferencer> {
    const session = await ort.InferenceSession.create(
      modelPath,
      opts.executionProviders ? { executionProviders: opts.executionProviders as never } : {},
    );
    return new Inferencer(session, opts.scoreThreshold ?? 0.5, opts.nmsIou ?? 0.45);
  }

  /**
   * Detect persons in a JPEG frame. Returned boxes are normalized to [0,1]
   * in the original image's coordinates.
   */
  async detectJpeg(jpeg: Buffer): Promise<Detection[]> {
    const meta = await sharp(jpeg).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w === 0 || h === 0) return [];

    const s = INPUT_SIZE;
    const ratio = Math.min(s / w, s / h);
    const rw = Math.min(Math.max(Math.floor(w * ratio), 1), s);
    const rh = Math.min(Math.max(Math.floor(h * ratio), 1), s);
    const { data } = await sharp(jpeg)
      .resize(rw, rh, { fit: "fill", kernel: "cubic" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // CHW, BGR channel order, raw 0-255 floats, grey letterbox padding —
    // YOLOX models are trained on exactly this, no normalization.
    const input = new Float32Array(3 * s * s).fill(PAD);
    for (let c = 0; c < 3; c++) {
      const plane = c * s * s;
      for (let y = 0; y < rh; y++) {
        const rowIn = y * rw * 3;
        const rowOut = plane + y * s;
        for (let x = 0; x < rw; x++) {
          input[rowOut + x] = data[rowIn + x * 3 + (2 - c)]!;
        }
      }
    }

    const inputName = this.session.inputNames[0]!;
    const outputName = this.session.outputNames[0]!;
    const results = await this.session.run({
      [inputName]: new ort.Tensor("float32", input, [1, 3, s, s]),
    });
    const out = results[outputName]!;
    // [1, n_anchors, 5 + n_classes], anchors laid out stride by stride,
    // row-major over each stride's grid.
    const preds = out.data as Float32Array;
    const channels = out.dims[2]!;

    const candidates: Detection[] = [];
    let row = 0;
    for (const stride of STRIDES) {
      const grid = s / stride;
      for (let gy = 0; gy < grid; gy++) {
        for (let gx = 0; gx < grid; gx++) {
          const base = row * channels;
          row += 1;
          const score = preds[base + 4]! * preds[base + 5 + PERSON_CLASS]!;
          if (score < this.scoreThreshold) continue;
          const cx = (preds[base]! + gx) * stride;
          const cy = (preds[base + 1]! + gy) * stride;
          const bw = Math.exp(preds[base + 2]!) * stride;
          const bh = Math.exp(preds[base + 3]!) * stride;
          // Back to original pixels, then normalize.
          const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
          const x1 = clamp((cx - bw / 2) / ratio / w);
          const y1 = clamp((cy - bh / 2) / ratio / h);
          const x2 = clamp((cx + bw / 2) / ratio / w);
          const y2 = clamp((cy + bh / 2) / ratio / h);
          if (x2 > x1 && y2 > y1) {
            candidates.push({ bbox: { x1, y1, x2, y2 }, confidence: score });
          }
        }
      }
    }
    return nms(candidates, this.nmsIou);
  }
}

export function nms(dets: Detection[], iouThreshold: number): Detection[] {
  const sorted = [...dets].sort((a, b) => b.confidence - a.confidence);
  const kept: Detection[] = [];
  for (const det of sorted) {
    if (kept.every((k) => iou(k.bbox, det.bbox) < iouThreshold)) {
      kept.push(det);
    }
  }
  return kept;
}
