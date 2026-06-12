// Phase 2 Behavior Intelligence glue. The supervisor polls the API's
// analysis-config; for every camera with at least one enabled rule it runs:
//  - an `ffmpeg` sidecar sampling the RTSP stream at 1 fps into JPEG files
//    in a temp dir (file-based tap: plugin-shell event streams aren't a safe
//    transport for binary data, and the dir-scan pattern is already proven
//    by the HLS preview uploader)
//  - a scanner task that picks the newest *complete* frame (the newest file
//    may still be mid-write), drops the backlog, and runs detection + rule
//    evaluation in a blocking task
//  - fired events flow to a single poster task that uploads the triggering
//    frame as the event snapshot (best effort) and POSTs the event batch;
//    event ids are connector-generated UUIDs so retries dedupe server-side.
//
// Config changes (diffed on the raw JSON) restart all workers. Engine state
// is lost on restart — dwell timers begin anew — which is acceptable for a
// once-a-minute config poll.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, bail, Context, Result};
use surveillance_analysis::chrono::Utc;
use surveillance_analysis::config::CameraConfig;
use surveillance_analysis::{AnalysisConfig, CameraEngine, PersonDetector};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tempfile::TempDir;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use crate::state::ConnectorIdentity;

const CONFIG_POLL_SECS: u64 = 60;
const FRAME_SCAN_MS: u64 = 500;
const POST_RETRIES: u32 = 3;

struct OutboundEvent {
    id: String,
    rule_id: String,
    occurred_at: String,
    metadata: serde_json::Value,
    frame_jpeg: Vec<u8>,
}

pub fn spawn(app: AppHandle, identity: ConnectorIdentity) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_supervisor(app, identity).await {
            eprintln!("analysis supervisor exited: {e:#}");
        }
    });
}

fn model_path(app: &AppHandle) -> Result<PathBuf> {
    // Installed app: bundled resource. Dev (`tauri dev`): the source tree.
    if let Ok(p) = app
        .path()
        .resolve("assets/models/yolox_nano.onnx", BaseDirectory::Resource)
    {
        if p.exists() {
            return Ok(p);
        }
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets/models/yolox_nano.onnx");
    if dev.exists() {
        return Ok(dev);
    }
    bail!(
        "person-detection model not found — run `pnpm --filter @surveillance/connector-tauri fetch:model`"
    )
}

async fn run_supervisor(app: AppHandle, identity: ConnectorIdentity) -> Result<()> {
    let path = model_path(&app)?;
    let detector = Arc::new(
        tokio::task::spawn_blocking(move || PersonDetector::load(&path))
            .await
            .map_err(|e| anyhow!("detector load task: {e}"))??,
    );

    let client = reqwest::Client::new();
    let (event_tx, event_rx) = mpsc::channel::<OutboundEvent>(64);
    tokio::spawn(post_events(client.clone(), identity.clone(), event_rx));

    let mut current_raw = String::new();
    let mut current_cfg: Option<AnalysisConfig> = None;
    let mut workers: Vec<Worker> = Vec::new();

    loop {
        match fetch_config(&client, &identity).await {
            Ok(raw) => {
                if raw != current_raw {
                    match serde_json::from_str::<AnalysisConfig>(&raw) {
                        Ok(cfg) => {
                            workers.drain(..).for_each(Worker::stop);
                            workers = start_workers(&app, &detector, &cfg, &event_tx);
                            current_raw = raw;
                            current_cfg = Some(cfg);
                        }
                        Err(e) => eprintln!("analysis: config did not parse: {e}"),
                    }
                }
            }
            Err(e) => eprintln!("analysis: config fetch failed: {e:#}"),
        }

        // Watchdog: respawn workers whose ffmpeg died (camera offline,
        // network blip). The fresh worker re-resolves the stream.
        if let Some(cfg) = &current_cfg {
            for w in workers.iter_mut() {
                if w.dead.load(Ordering::Relaxed) {
                    eprintln!("analysis: worker for {} died, restarting", w.camera.label);
                    match Worker::start(&app, detector.clone(), w.camera.clone(), cfg, event_tx.clone()) {
                        Ok(fresh) => {
                            let old = std::mem::replace(w, fresh);
                            old.stop();
                        }
                        Err(e) => eprintln!("analysis: restart failed for {}: {e:#}", w.camera.label),
                    }
                }
            }
        }

        tokio::time::sleep(Duration::from_secs(CONFIG_POLL_SECS)).await;
    }
}

fn start_workers(
    app: &AppHandle,
    detector: &Arc<PersonDetector>,
    cfg: &AnalysisConfig,
    event_tx: &mpsc::Sender<OutboundEvent>,
) -> Vec<Worker> {
    let mut workers = Vec::new();
    for cam in &cfg.cameras {
        let rules = cfg.rules.iter().filter(|r| r.camera_id == cam.id).count();
        if rules == 0 {
            continue;
        }
        match Worker::start(app, detector.clone(), cam.clone(), cfg, event_tx.clone()) {
            Ok(w) => {
                eprintln!("analysis: watching {} ({rules} rule(s))", cam.label);
                workers.push(w);
            }
            Err(e) => eprintln!("analysis: failed to start worker for {}: {e:#}", cam.label),
        }
    }
    workers
}

async fn fetch_config(client: &reqwest::Client, identity: &ConnectorIdentity) -> Result<String> {
    let res = client
        .get(format!(
            "{}/v1/connectors/analysis-config",
            identity.api_base_url.trim_end_matches('/')
        ))
        .bearer_auth(&identity.connector_token)
        .header("x-connector-id", &identity.connector_id)
        .send()
        .await?
        .error_for_status()?;
    Ok(res.text().await?)
}

struct Worker {
    camera: CameraConfig,
    child: CommandChild,
    scanner: JoinHandle<()>,
    log_drain: JoinHandle<()>,
    dead: Arc<AtomicBool>,
    _temp: TempDir,
}

impl Worker {
    fn start(
        app: &AppHandle,
        detector: Arc<PersonDetector>,
        camera: CameraConfig,
        cfg: &AnalysisConfig,
        event_tx: mpsc::Sender<OutboundEvent>,
    ) -> Result<Self> {
        let engine = CameraEngine::new(&camera, cfg);
        let temp = tempfile::tempdir().context("create analysis temp dir")?;
        let pattern = temp.path().join("frame-%06d.jpg");

        let sidecar = app.shell().sidecar("ffmpeg").map_err(|e| {
            anyhow!(
                "locate bundled ffmpeg sidecar ({e}) — run `pnpm --filter @surveillance/connector-tauri fetch:ffmpeg`"
            )
        })?;
        let args: Vec<String> = vec![
            "-nostdin".into(),
            "-hide_banner".into(),
            "-loglevel".into(),
            "warning".into(),
            "-rtsp_transport".into(),
            "tcp".into(),
            "-i".into(),
            camera.rtsp_url.clone(),
            "-vf".into(),
            "fps=1".into(),
            "-q:v".into(),
            "6".into(),
            "-f".into(),
            "image2".into(),
            pattern.to_string_lossy().into_owned(),
        ];
        let (mut rx, child) = sidecar
            .args(args)
            .spawn()
            .map_err(|e| anyhow!("spawn ffmpeg sidecar: {e}"))?;

        let dead = Arc::new(AtomicBool::new(false));
        let drain_dead = dead.clone();
        let drain_label = camera.label.clone();
        let log_drain = tokio::spawn(async move {
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stderr(bytes) => {
                        eprintln!(
                            "analysis ffmpeg ({drain_label}): {}",
                            String::from_utf8_lossy(&bytes).trim_end()
                        );
                    }
                    CommandEvent::Error(err) => {
                        eprintln!("analysis ffmpeg ({drain_label}) error: {err}");
                    }
                    CommandEvent::Terminated(payload) => {
                        eprintln!(
                            "analysis ffmpeg ({drain_label}) exited (code {:?}, signal {:?})",
                            payload.code, payload.signal
                        );
                        drain_dead.store(true, Ordering::Relaxed);
                        break;
                    }
                    _ => {}
                }
            }
        });

        let scanner = tokio::spawn(scan_frames(
            temp.path().to_path_buf(),
            detector,
            engine,
            event_tx,
        ));

        Ok(Self { camera, child, scanner, log_drain, dead, _temp: temp })
    }

    fn stop(self) {
        let _ = self.child.kill();
        self.scanner.abort();
        self.log_drain.abort();
        // _temp dropped here, removes the directory.
    }
}

/// Newest *complete* frame: ffmpeg writes frame files in place, so the
/// highest-numbered file may be mid-write — take the one before it and
/// treat everything older as backlog to delete (built-in frame dropping
/// when detection falls behind).
async fn pick_frame(dir: &Path) -> Option<(PathBuf, Vec<PathBuf>)> {
    let mut frames: Vec<(u64, PathBuf)> = Vec::new();
    let mut entries = tokio::fs::read_dir(dir).await.ok()?;
    while let Ok(Some(entry)) = entries.next_entry().await {
        let name = entry.file_name().to_string_lossy().to_string();
        if let Some(num) = name
            .strip_prefix("frame-")
            .and_then(|s| s.strip_suffix(".jpg"))
            .and_then(|s| s.parse::<u64>().ok())
        {
            frames.push((num, entry.path()));
        }
    }
    if frames.len() < 2 {
        return None;
    }
    // Numeric sort: lexicographic breaks when %06d overflows six digits
    // (an always-on camera gets there in ~12 days).
    frames.sort_by_key(|(n, _)| *n);
    let latest_complete = frames.remove(frames.len() - 2);
    frames.pop(); // the possibly-mid-write newest stays on disk
    Some((latest_complete.1, frames.into_iter().map(|(_, p)| p).collect()))
}

async fn scan_frames(
    dir: PathBuf,
    detector: Arc<PersonDetector>,
    mut engine: CameraEngine,
    event_tx: mpsc::Sender<OutboundEvent>,
) {
    loop {
        tokio::time::sleep(Duration::from_millis(FRAME_SCAN_MS)).await;
        let Some((latest, backlog)) = pick_frame(&dir).await else {
            continue;
        };
        for stale in backlog {
            let _ = tokio::fs::remove_file(stale).await;
        }
        let Ok(bytes) = tokio::fs::read(&latest).await else {
            continue;
        };
        let _ = tokio::fs::remove_file(&latest).await;

        // Inference is CPU-bound; move the engine through a blocking task
        // rather than stalling the runtime.
        let det = detector.clone();
        let result = tokio::task::spawn_blocking(move || {
            let fired = match det.detect_jpeg(&bytes) {
                Ok(dets) => engine.process(&dets, Utc::now()),
                Err(e) => {
                    eprintln!("analysis: frame decode/detect failed: {e:#}");
                    Vec::new()
                }
            };
            (engine, fired, bytes)
        })
        .await;
        let Ok((engine_back, fired, frame_jpeg)) = result else {
            eprintln!("analysis: detection task panicked; stopping scanner");
            return;
        };
        engine = engine_back;

        for ev in fired {
            let outbound = OutboundEvent {
                id: uuid::Uuid::new_v4().to_string(),
                rule_id: ev.rule_id,
                occurred_at: ev.occurred_at.to_rfc3339(),
                metadata: ev.metadata,
                frame_jpeg: frame_jpeg.clone(),
            };
            // Bounded queue: if the API is unreachable long enough to fill
            // it, dropping new events beats buffering unboundedly.
            if let Err(e) = event_tx.try_send(outbound) {
                eprintln!("analysis: event queue full, dropping event: {e}");
            }
        }
    }
}

async fn post_events(
    client: reqwest::Client,
    identity: ConnectorIdentity,
    mut rx: mpsc::Receiver<OutboundEvent>,
) {
    let base = identity.api_base_url.trim_end_matches('/').to_string();
    while let Some(ev) = rx.recv().await {
        // Snapshot first, best effort — the event goes out either way.
        let snapshot_key = format!("evt_{}", ev.id.replace('-', ""));
        let snap_ok = client
            .put(format!("{base}/v1/connectors/uploads/{snapshot_key}"))
            .bearer_auth(&identity.connector_token)
            .header("x-connector-id", &identity.connector_id)
            .header("content-type", "image/jpeg")
            .body(ev.frame_jpeg.clone())
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false);

        let mut event = serde_json::json!({
            "id": ev.id,
            "ruleId": ev.rule_id,
            "occurredAt": ev.occurred_at,
            "metadata": ev.metadata,
        });
        if snap_ok {
            event["snapshotKey"] = serde_json::Value::String(snapshot_key);
        }
        let body = serde_json::json!({ "events": [event] });

        // Ids are idempotency keys, so blind retries are safe.
        for attempt in 1..=POST_RETRIES {
            let res = client
                .post(format!("{base}/v1/connectors/events"))
                .bearer_auth(&identity.connector_token)
                .header("x-connector-id", &identity.connector_id)
                .json(&body)
                .send()
                .await;
            match res {
                Ok(r) if r.status().is_success() => break,
                Ok(r) => eprintln!("analysis: event post {attempt}/{POST_RETRIES} -> {}", r.status()),
                Err(e) => eprintln!("analysis: event post {attempt}/{POST_RETRIES} failed: {e}"),
            }
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    }
}
