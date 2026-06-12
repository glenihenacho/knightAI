//! Phase 2 Behavior Intelligence engine: person detection (YOLOX on tract),
//! lightweight tracking, zone geometry, schedule gating, and the rule state
//! machines that turn frames into events.
//!
//! This crate is pure Rust on purpose — no Tauri, tokio, or native ML
//! runtimes — so it builds and tests on any host. The Tauri app supplies
//! frames (ffmpeg sidecar) and ships fired events to the API.

pub use chrono;

pub mod config;
pub mod detector;
pub mod engine;
pub mod geometry;
pub mod schedule;
pub mod tracker;

pub use config::{AnalysisConfig, CameraConfig, Trigger};
pub use detector::PersonDetector;
pub use engine::{CameraEngine, FiredEvent};
pub use tracker::{Detection, Track, Tracker};
