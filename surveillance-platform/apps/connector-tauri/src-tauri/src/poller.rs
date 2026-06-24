use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::onvif;
use crate::preview::{PreviewManager, StartPreviewPayload, StartPreviewResult, StopPreviewPayload};
use crate::time::now_iso8601;
use crate::{rtsp, state::ConnectorIdentity};

const PLACEHOLDER_JPEG: &[u8] = include_bytes!("../assets/placeholder.jpg");

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Command {
    ValidateRtsp {
        id: String,
        payload: ValidateRtspPayload,
    },
    CaptureSnapshot {
        id: String,
        payload: ValidateRtspPayload,
    },
    Ping {
        id: String,
    },
    StartPreview {
        id: String,
        payload: StartPreviewPayload,
    },
    StopPreview {
        id: String,
        payload: StopPreviewPayload,
    },
    // Headless preview: same FFmpeg -> HLS -> upload pipeline, but the API
    // owns the lifecycle (no operator watching). Detection itself runs in the
    // server-side worker; the connector just keeps segments flowing.
    StartDetection {
        id: String,
        payload: StartPreviewPayload,
    },
    StopDetection {
        id: String,
        payload: StopPreviewPayload,
    },
    DiscoverOnvif {
        id: String,
        #[serde(default)]
        payload: DiscoverOnvifPayload,
    },
}

#[derive(Deserialize)]
struct DiscoverOnvifPayload {
    #[serde(default = "default_discover_timeout", rename = "timeoutMs")]
    timeout_ms: u64,
}

fn default_discover_timeout() -> u64 {
    4_000
}

impl Default for DiscoverOnvifPayload {
    fn default() -> Self {
        Self {
            timeout_ms: default_discover_timeout(),
        }
    }
}

#[derive(Deserialize)]
struct ValidateRtspPayload {
    #[serde(rename = "cameraId")]
    camera_id: String,
    #[serde(rename = "rtspUrl")]
    rtsp_url: String,
    #[serde(default = "default_timeout", rename = "timeoutMs")]
    timeout_ms: u64,
}

fn default_timeout() -> u64 {
    15_000
}

#[derive(Serialize)]
struct CommandResult {
    #[serde(rename = "commandId")]
    command_id: String,
    status: &'static str,
    #[serde(rename = "durationMs")]
    duration_ms: u64,
    #[serde(rename = "finishedAt")]
    finished_at: String,
    #[serde(rename = "validateRtsp", skip_serializing_if = "Option::is_none")]
    validate_rtsp: Option<rtsp::ValidationResult>,
    #[serde(rename = "startPreview", skip_serializing_if = "Option::is_none")]
    start_preview: Option<StartPreviewResult>,
    #[serde(rename = "discoverOnvif", skip_serializing_if = "Option::is_none")]
    discover_onvif: Option<onvif::DiscoverResult>,
    #[serde(rename = "errorMessage", skip_serializing_if = "Option::is_none")]
    error_message: Option<String>,
}

struct CommandOutcome {
    id: String,
    status: &'static str,
    validate_rtsp: Option<rtsp::ValidationResult>,
    start_preview: Option<StartPreviewResult>,
    discover_onvif: Option<onvif::DiscoverResult>,
    error_message: Option<String>,
}

/// Spawn the polling loop for a paired connector and return its task handle so
/// the caller can abort it on re-pair/reset. Idempotent for a given identity:
/// callers should ensure they don't spawn twice (and abort the prior handle
/// before spawning a new one).
pub fn spawn(
    manager: PreviewManager,
    identity: ConnectorIdentity,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        let client = reqwest::Client::new();
        loop {
            match poll_once(&client, &identity, &manager).await {
                Ok(Some(())) => {} // got a command, immediately try again
                Ok(None) => {
                    tokio::time::sleep(Duration::from_millis(identity.poll_interval_ms)).await;
                }
                Err(err) => {
                    eprintln!("poll error: {err:?}");
                    tokio::time::sleep(Duration::from_millis(identity.poll_interval_ms)).await;
                }
            }
        }
    })
}

async fn poll_once(
    client: &reqwest::Client,
    identity: &ConnectorIdentity,
    manager: &PreviewManager,
) -> anyhow::Result<Option<()>> {
    let res = client
        .get(format!(
            "{}/v1/connectors/commands/next",
            identity.api_base_url.trim_end_matches('/')
        ))
        .bearer_auth(&identity.connector_token)
        .header("x-connector-id", &identity.connector_id)
        .send()
        .await?;

    if res.status().as_u16() == 204 {
        return Ok(None);
    }
    if !res.status().is_success() {
        anyhow::bail!("poll failed: {}", res.status());
    }

    let command: Command = res.json().await?;
    handle_command(client, identity, manager, command).await?;
    Ok(Some(()))
}

async fn handle_command(
    client: &reqwest::Client,
    identity: &ConnectorIdentity,
    manager: &PreviewManager,
    command: Command,
) -> anyhow::Result<()> {
    let started = std::time::Instant::now();
    let outcome = match command {
        Command::ValidateRtsp { id, payload } | Command::CaptureSnapshot { id, payload } => {
            match rtsp::validate(&payload.rtsp_url, Duration::from_millis(payload.timeout_ms)).await {
                Ok(mut result) if result.reachable => {
                    let key = upload_placeholder_snapshot(client, identity, &payload.camera_id)
                        .await
                        .ok();
                    result.snapshot_upload_key = key;
                    CommandOutcome {
                        id,
                        status: "ok",
                        validate_rtsp: Some(result),
                        start_preview: None,
                        discover_onvif: None,
                        error_message: None,
                    }
                }
                Ok(result) => CommandOutcome {
                    id,
                    status: "ok",
                    validate_rtsp: Some(result),
                    start_preview: None,
                    discover_onvif: None,
                    error_message: None,
                },
                Err(e) => CommandOutcome {
                    id,
                    status: "failed",
                    validate_rtsp: None,
                    start_preview: None,
                    discover_onvif: None,
                    error_message: Some(e.to_string()),
                },
            }
        }
        Command::Ping { id } => CommandOutcome {
            id,
            status: "ok",
            validate_rtsp: None,
            start_preview: None,
            discover_onvif: None,
            error_message: None,
        },
        Command::StartPreview { id, payload } | Command::StartDetection { id, payload } => match manager.start(identity, &payload).await {
            Ok(result) => CommandOutcome {
                id,
                status: "ok",
                validate_rtsp: None,
                start_preview: Some(result),
                discover_onvif: None,
                error_message: None,
            },
            Err(e) => CommandOutcome {
                id,
                status: "failed",
                validate_rtsp: None,
                start_preview: None,
                discover_onvif: None,
                error_message: Some(e.to_string()),
            },
        },
        Command::StopPreview { id, payload } | Command::StopDetection { id, payload } => {
            let _ = manager.stop(&payload.preview_id).await;
            CommandOutcome {
                id,
                status: "ok",
                validate_rtsp: None,
                start_preview: None,
                discover_onvif: None,
                error_message: None,
            }
        }
        Command::DiscoverOnvif { id, payload } => match onvif::discover(payload.timeout_ms).await {
            Ok(result) => CommandOutcome {
                id,
                status: "ok",
                validate_rtsp: None,
                start_preview: None,
                discover_onvif: Some(result),
                error_message: None,
            },
            Err(e) => CommandOutcome {
                id,
                status: "failed",
                validate_rtsp: None,
                start_preview: None,
                discover_onvif: None,
                error_message: Some(e.to_string()),
            },
        },
    };

    let result = CommandResult {
        command_id: outcome.id.clone(),
        status: outcome.status,
        duration_ms: started.elapsed().as_millis() as u64,
        finished_at: now_iso8601(),
        validate_rtsp: outcome.validate_rtsp,
        start_preview: outcome.start_preview,
        discover_onvif: outcome.discover_onvif,
        error_message: outcome.error_message,
    };

    client
        .post(format!(
            "{}/v1/connectors/commands/{}/result",
            identity.api_base_url.trim_end_matches('/'),
            outcome.id,
        ))
        .bearer_auth(&identity.connector_token)
        .header("x-connector-id", &identity.connector_id)
        .json(&result)
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

async fn upload_placeholder_snapshot(
    client: &reqwest::Client,
    identity: &ConnectorIdentity,
    camera_id: &str,
) -> anyhow::Result<String> {
    let key = format!(
        "snap_{}_{}",
        camera_id.replace('-', ""),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_millis()
    );
    client
        .put(format!(
            "{}/v1/connectors/uploads/{}",
            identity.api_base_url.trim_end_matches('/'),
            key
        ))
        .bearer_auth(&identity.connector_token)
        .header("x-connector-id", &identity.connector_id)
        .header("content-type", "image/jpeg")
        .body(PLACEHOLDER_JPEG.to_vec())
        .send()
        .await?
        .error_for_status()?;
    Ok(key)
}
