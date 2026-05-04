use serde::{Deserialize, Serialize};
use std::time::Duration;

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

fn default_timeout() -> u64 { 15_000 }

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
    #[serde(rename = "errorMessage", skip_serializing_if = "Option::is_none")]
    error_message: Option<String>,
}

/// Spawn the polling loop for a paired connector. Idempotent for a given identity:
/// callers should ensure they don't spawn twice.
pub fn spawn(_existing: Option<ConnectorIdentity>, identity: ConnectorIdentity) {
    tauri::async_runtime::spawn(async move {
        let client = reqwest::Client::new();
        loop {
            match poll_once(&client, &identity).await {
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
    });
}

async fn poll_once(client: &reqwest::Client, identity: &ConnectorIdentity) -> anyhow::Result<Option<()>> {
    let res = client
        .get(format!("{}/v1/connectors/commands/next", identity.api_base_url.trim_end_matches('/')))
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
    handle_command(client, identity, command).await?;
    Ok(Some(()))
}

async fn handle_command(
    client: &reqwest::Client,
    identity: &ConnectorIdentity,
    command: Command,
) -> anyhow::Result<()> {
    let started = std::time::Instant::now();
    let (command_id, status, validate, error) = match command {
        Command::ValidateRtsp { id, payload } | Command::CaptureSnapshot { id, payload } => {
            match rtsp::validate(&payload.rtsp_url, Duration::from_millis(payload.timeout_ms)).await {
                Ok(mut result) if result.reachable => {
                    let key = upload_placeholder_snapshot(client, identity, &payload.camera_id)
                        .await
                        .ok();
                    result.snapshot_upload_key = key;
                    (id, "ok", Some(result), None)
                }
                Ok(result) => (id, "ok", Some(result), None),
                Err(e) => (id, "failed", None, Some(e.to_string())),
            }
        }
        Command::Ping { id } => (id, "ok", None, None),
    };

    let result = CommandResult {
        command_id: command_id.clone(),
        status,
        duration_ms: started.elapsed().as_millis() as u64,
        finished_at: chrono_like_now(),
        validate_rtsp: validate,
        error_message: error,
    };

    client
        .post(format!(
            "{}/v1/connectors/commands/{}/result",
            identity.api_base_url.trim_end_matches('/'),
            command_id
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

fn chrono_like_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    format!("{}Z", iso_from_unix(secs))
}

fn iso_from_unix(secs: u64) -> String {
    // Minimal ISO-8601 emitter to avoid pulling chrono. Replace with `time` crate later.
    let days = (secs / 86_400) as i64;
    let sod = (secs % 86_400) as u32;
    let (y, mo, d) = civil_from_days(days);
    let hh = sod / 3600;
    let mm = (sod / 60) % 60;
    let ss = sod % 60;
    format!("{y:04}-{mo:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}")
}

// Howard Hinnant's date algorithm.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}
