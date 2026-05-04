// HLS preview pipeline. Each active session owns:
//  - an `ffmpeg` child process (Tauri sidecar) remuxing RTSP -> HLS into a temp dir
//  - a tokio task that polls the temp dir and uploads new segments + the
//    rolling manifest to the API
//  - a tokio task that drains FFmpeg's stderr so its pipe buffer cannot fill
//    and block the encoder
//
// Drop semantics: stopping a session kills the child and aborts the helper
// tasks; the temp dir is removed when the Session value goes out of scope.

use anyhow::{anyhow, Context, Result};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tempfile::TempDir;
use tokio::task::JoinHandle;

use crate::state::ConnectorIdentity;
use crate::time::now_iso8601;

#[derive(Deserialize)]
pub struct StartPreviewPayload {
    #[serde(rename = "cameraId")]
    pub camera_id: String,
    #[serde(rename = "previewId")]
    pub preview_id: String,
    #[serde(rename = "rtspUrl")]
    pub rtsp_url: String,
    #[serde(rename = "maxDurationSeconds")]
    pub max_duration_seconds: u64,
    #[serde(rename = "segmentSeconds")]
    pub segment_seconds: u64,
    #[serde(rename = "windowSegments")]
    pub window_segments: u64,
}

#[derive(Deserialize)]
pub struct StopPreviewPayload {
    #[serde(rename = "previewId")]
    pub preview_id: String,
}

#[derive(Serialize, Clone)]
pub struct StartPreviewResult {
    #[serde(rename = "startedAt")]
    pub started_at: String,
}

struct Session {
    child: CommandChild,
    uploader: JoinHandle<()>,
    log_drain: JoinHandle<()>,
    // Keeps the temp dir alive; auto-removed on drop.
    _temp: TempDir,
}

#[derive(Clone)]
pub struct PreviewManager {
    app: AppHandle,
    sessions: Arc<Mutex<HashMap<String, Session>>>,
}

impl PreviewManager {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn start(
        &self,
        identity: &ConnectorIdentity,
        payload: &StartPreviewPayload,
    ) -> Result<StartPreviewResult> {
        // Idempotency: if the connector already has a session for this preview
        // (operator double-clicked, or the API replayed the command after a
        // restart), no-op succeed instead of starting a second FFmpeg.
        if self.sessions.lock().contains_key(&payload.preview_id) {
            return Ok(StartPreviewResult { started_at: now_iso8601() });
        }

        let temp = tempfile::tempdir().context("create preview temp dir")?;
        let dir_path = temp.path().to_path_buf();
        let segment_pattern = dir_path.join("seg-%04d.ts");
        let manifest_path = dir_path.join("playlist.m3u8");

        let sidecar = self.app.shell().sidecar("ffmpeg").map_err(|e| {
            anyhow!(
                "locate bundled ffmpeg sidecar ({e}) — run `pnpm --filter @surveillance/connector-tauri fetch:ffmpeg`"
            )
        })?;

        // Copy video without transcoding (assumes H.264). Drop audio for
        // pilot; some IP cameras emit unsupported audio codecs that break
        // mux. Re-evaluate when we hit a partner camera that needs sound.
        let args: Vec<String> = vec![
            "-nostdin".into(),
            "-hide_banner".into(),
            "-loglevel".into(),
            "warning".into(),
            "-rtsp_transport".into(),
            "tcp".into(),
            "-i".into(),
            payload.rtsp_url.clone(),
            "-c:v".into(),
            "copy".into(),
            "-an".into(),
            "-f".into(),
            "hls".into(),
            "-hls_time".into(),
            payload.segment_seconds.to_string(),
            "-hls_list_size".into(),
            payload.window_segments.to_string(),
            "-hls_flags".into(),
            "delete_segments+omit_endlist+independent_segments".into(),
            "-hls_segment_filename".into(),
            segment_pattern.to_string_lossy().into_owned(),
            "-t".into(),
            payload.max_duration_seconds.to_string(),
            manifest_path.to_string_lossy().into_owned(),
        ];

        let (mut rx, child) = sidecar
            .args(args)
            .spawn()
            .map_err(|e| anyhow!("spawn ffmpeg sidecar: {e}"))?;

        // Drain FFmpeg's stderr so a full pipe buffer cannot block the encoder,
        // and surface unexpected exits in the connector log.
        let log_preview_id = payload.preview_id.clone();
        let log_drain = tokio::spawn(async move {
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stderr(bytes) => {
                        eprintln!(
                            "ffmpeg ({log_preview_id}): {}",
                            String::from_utf8_lossy(&bytes).trim_end()
                        );
                    }
                    CommandEvent::Error(err) => {
                        eprintln!("ffmpeg ({log_preview_id}) error: {err}");
                    }
                    CommandEvent::Terminated(payload) => {
                        if !matches!(payload.code, Some(0)) {
                            eprintln!(
                                "ffmpeg ({log_preview_id}) exited (code {:?}, signal {:?})",
                                payload.code, payload.signal
                            );
                        }
                        break;
                    }
                    _ => {}
                }
            }
        });

        let uploader_identity = identity.clone();
        let uploader_preview_id = payload.preview_id.clone();
        let uploader_dir = dir_path.clone();
        let uploader = tokio::spawn(async move {
            run_uploader(uploader_preview_id, uploader_dir, uploader_identity).await;
        });

        self.sessions.lock().insert(
            payload.preview_id.clone(),
            Session { child, uploader, log_drain, _temp: temp },
        );

        Ok(StartPreviewResult { started_at: now_iso8601() })
    }

    pub async fn stop(&self, preview_id: &str) -> Result<()> {
        let session = self.sessions.lock().remove(preview_id);
        if let Some(Session { child, uploader, log_drain, _temp: _ }) = session {
            let _ = child.kill();
            uploader.abort();
            log_drain.abort();
            // _temp dropped here, removes the directory.
        }
        Ok(())
    }
}

async fn run_uploader(preview_id: String, dir: PathBuf, identity: ConnectorIdentity) {
    let client = reqwest::Client::new();
    let mut uploaded_segments: HashSet<String> = HashSet::new();
    let mut last_manifest: Vec<u8> = Vec::new();
    loop {
        if let Err(e) = scan_and_upload(
            &client,
            &identity,
            &preview_id,
            &dir,
            &mut uploaded_segments,
            &mut last_manifest,
        )
        .await
        {
            eprintln!("preview uploader ({preview_id}) error: {e:#}");
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
}

async fn scan_and_upload(
    client: &reqwest::Client,
    identity: &ConnectorIdentity,
    preview_id: &str,
    dir: &PathBuf,
    uploaded_segments: &mut HashSet<String>,
    last_manifest: &mut Vec<u8>,
) -> Result<()> {
    let mut entries = tokio::fs::read_dir(dir).await.context("read_dir")?;
    let mut segment_files: Vec<String> = Vec::new();
    let mut has_manifest = false;
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name();
        let s = name.to_string_lossy().to_string();
        if s == "playlist.m3u8" {
            has_manifest = true;
        } else if s.starts_with("seg-") && s.ends_with(".ts") {
            segment_files.push(s);
        }
    }
    // Upload segments before the manifest. The manifest references them by
    // name, and the API rejects manifests pointing at missing segments.
    segment_files.sort();
    for s in segment_files {
        if uploaded_segments.contains(&s) {
            continue;
        }
        let data = tokio::fs::read(dir.join(&s)).await.context("read segment")?;
        upload_file(client, identity, preview_id, &s, "video/mp2t", data).await?;
        uploaded_segments.insert(s);
    }
    if has_manifest {
        let data = tokio::fs::read(dir.join("playlist.m3u8")).await.context("read manifest")?;
        if data != *last_manifest {
            upload_file(
                client,
                identity,
                preview_id,
                "playlist.m3u8",
                "application/vnd.apple.mpegurl",
                data.clone(),
            )
            .await?;
            *last_manifest = data;
        }
    }
    Ok(())
}

async fn upload_file(
    client: &reqwest::Client,
    identity: &ConnectorIdentity,
    preview_id: &str,
    filename: &str,
    content_type: &str,
    bytes: Vec<u8>,
) -> Result<()> {
    let url = format!(
        "{}/v1/connectors/hls/{}/{}",
        identity.api_base_url.trim_end_matches('/'),
        preview_id,
        filename,
    );
    client
        .put(url)
        .bearer_auth(&identity.connector_token)
        .header("x-connector-id", &identity.connector_id)
        .header("content-type", content_type)
        .body(bytes)
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}
