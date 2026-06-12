//! Person detection with YOLOX (Apache-2.0 — YOLOv8 and friends are AGPL,
//! unusable in a commercial installer) running on tract's pure-Rust ONNX
//! runtime. The official YOLOX release models are exported with
//! decode_in_inference=False, so the raw head output is decoded here exactly
//! like the upstream demo: per-stride grid offsets, exp() box sizes, then
//! class-0 (COCO person) score threshold and NMS.

use std::path::Path;

use anyhow::{Context, Result};
use image::DynamicImage;
use tract_onnx::prelude::*;

use crate::geometry::BBox;
use crate::tracker::Detection;

const STRIDES: [usize; 3] = [8, 16, 32];
const PERSON_CLASS: usize = 0;
/// Letterbox padding value used by YOLOX preprocessing.
const PAD: f32 = 114.0;

type Model = SimplePlan<TypedFact, Box<dyn TypedOp>, Graph<TypedFact, Box<dyn TypedOp>>>;

pub struct PersonDetector {
    model: Model,
    /// Square model input (416 for yolox_nano / yolox_tiny).
    input_size: usize,
    score_threshold: f32,
    nms_iou: f32,
}

impl PersonDetector {
    pub fn load(model_path: &Path) -> Result<Self> {
        Self::load_with(model_path, 416, 0.5, 0.45)
    }

    pub fn load_with(
        model_path: &Path,
        input_size: usize,
        score_threshold: f32,
        nms_iou: f32,
    ) -> Result<Self> {
        let model = tract_onnx::onnx()
            .model_for_path(model_path)
            .with_context(|| format!("loading ONNX model {}", model_path.display()))?
            .with_input_fact(
                0,
                f32::fact([1, 3, input_size, input_size]).into(),
            )?
            .into_optimized()?
            .into_runnable()?;
        Ok(Self { model, input_size, score_threshold, nms_iou })
    }

    /// Decode an encoded frame (JPEG from the ffmpeg tap) and detect.
    /// Keeps the `image` dependency out of callers.
    pub fn detect_jpeg(&self, bytes: &[u8]) -> Result<Vec<Detection>> {
        let img = image::load_from_memory(bytes).context("decode frame")?;
        self.detect(&img)
    }

    /// Detect persons in a frame. Returned boxes are normalized to [0,1]
    /// in the original image's coordinates.
    pub fn detect(&self, frame: &DynamicImage) -> Result<Vec<Detection>> {
        let rgb = frame.to_rgb8();
        let (w, h) = (rgb.width() as usize, rgb.height() as usize);
        if w == 0 || h == 0 {
            return Ok(Vec::new());
        }
        let s = self.input_size;
        let ratio = (s as f32 / w as f32).min(s as f32 / h as f32);
        let rw = ((w as f32 * ratio) as usize).max(1).min(s);
        let rh = ((h as f32 * ratio) as usize).max(1).min(s);
        let resized = image::imageops::resize(
            &rgb,
            rw as u32,
            rh as u32,
            image::imageops::FilterType::Triangle,
        );

        // CHW, BGR channel order, raw 0–255 floats, grey letterbox padding —
        // YOLOX models are trained on exactly this, no normalization.
        let input = tract_ndarray::Array4::from_shape_fn((1, 3, s, s), |(_, c, y, x)| {
            if x < rw && y < rh {
                let px = resized.get_pixel(x as u32, y as u32);
                px[2 - c] as f32
            } else {
                PAD
            }
        });

        let outputs = self.model.run(tvec!(Tensor::from(input).into()))?;
        let preds = outputs[0]
            .to_array_view::<f32>()?
            .into_dimensionality::<tract_ndarray::Ix3>()
            .context("unexpected YOLOX output rank")?;
        // preds: [1, n_anchors, 5 + n_classes], anchors laid out stride by
        // stride, row-major over each stride's grid.
        let mut candidates: Vec<Detection> = Vec::new();
        let mut row = 0usize;
        for stride in STRIDES {
            let grid = s / stride;
            for gy in 0..grid {
                for gx in 0..grid {
                    let p = preds.index_axis(tract_ndarray::Axis(0), 0);
                    let cx = (p[[row, 0]] + gx as f32) * stride as f32;
                    let cy = (p[[row, 1]] + gy as f32) * stride as f32;
                    let bw = p[[row, 2]].exp() * stride as f32;
                    let bh = p[[row, 3]].exp() * stride as f32;
                    let score = p[[row, 4]] * p[[row, 5 + PERSON_CLASS]];
                    row += 1;
                    if score < self.score_threshold {
                        continue;
                    }
                    // Back to original pixels, then normalize.
                    let x1 = ((cx - bw / 2.0) / ratio / w as f32).clamp(0.0, 1.0);
                    let y1 = ((cy - bh / 2.0) / ratio / h as f32).clamp(0.0, 1.0);
                    let x2 = ((cx + bw / 2.0) / ratio / w as f32).clamp(0.0, 1.0);
                    let y2 = ((cy + bh / 2.0) / ratio / h as f32).clamp(0.0, 1.0);
                    if x2 > x1 && y2 > y1 {
                        candidates.push(Detection {
                            bbox: BBox { x1, y1, x2, y2 },
                            confidence: score,
                        });
                    }
                }
            }
        }
        Ok(nms(candidates, self.nms_iou))
    }
}

fn nms(mut dets: Vec<Detection>, iou_threshold: f32) -> Vec<Detection> {
    dets.sort_by(|a, b| b.confidence.total_cmp(&a.confidence));
    let mut kept: Vec<Detection> = Vec::new();
    for det in dets {
        if kept.iter().all(|k| k.bbox.iou(&det.bbox) < iou_threshold) {
            kept.push(det);
        }
    }
    kept
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nms_collapses_overlaps() {
        let mk = |x1: f32, conf: f32| Detection {
            bbox: BBox { x1, y1: 0.0, x2: x1 + 0.2, y2: 0.4 },
            confidence: conf,
        };
        let kept = nms(vec![mk(0.00, 0.9), mk(0.02, 0.8), mk(0.5, 0.7)], 0.45);
        assert_eq!(kept.len(), 2);
        assert!((kept[0].confidence - 0.9).abs() < 1e-6);
    }

    /// Real-model integration test; runs only when testdata is present
    /// (fetch with `node scripts/fetch-model.mjs --testdata` from
    /// apps/connector-tauri).
    #[test]
    fn detects_person_in_sample_photo() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("testdata");
        let model_path = dir.join("yolox_nano.onnx");
        let img_path = dir.join("person.jpg");
        if !model_path.exists() || !img_path.exists() {
            eprintln!("skipping: testdata not fetched");
            return;
        }
        let detector = PersonDetector::load(&model_path).expect("load model");
        let img = image::open(&img_path).expect("open sample");
        let dets = detector.detect(&img).expect("detect");
        assert!(
            !dets.is_empty(),
            "expected at least one person in the sample photo"
        );
        for d in &dets {
            assert!(d.confidence >= 0.5);
            assert!(d.bbox.x2 > d.bbox.x1 && d.bbox.y2 > d.bbox.y1);
        }
    }
}
