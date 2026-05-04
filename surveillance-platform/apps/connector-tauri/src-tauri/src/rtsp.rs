use anyhow::{anyhow, Result};
use serde::Serialize;
use std::time::Duration;
use tokio::{io::AsyncReadExt, net::TcpStream, time::timeout};
use url::Url;

#[derive(Serialize, Clone)]
pub struct ValidationResult {
    pub reachable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub codec: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fps: Option<f32>,
    #[serde(rename = "snapshotUploadKey", skip_serializing_if = "Option::is_none")]
    pub snapshot_upload_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Lightweight reachability probe: TCP connect + RTSP OPTIONS handshake.
/// Decoder integration (FFmpeg/GStreamer) lands in a follow-up.
pub async fn validate(rtsp_url: &str, dur: Duration) -> Result<ValidationResult> {
    let url = Url::parse(rtsp_url).map_err(|e| anyhow!("invalid url: {e}"))?;
    if url.scheme() != "rtsp" && url.scheme() != "rtsps" {
        return Err(anyhow!("unsupported scheme {}", url.scheme()));
    }
    let host = url.host_str().ok_or_else(|| anyhow!("missing host"))?;
    let port = url.port().unwrap_or(if url.scheme() == "rtsps" { 322 } else { 554 });

    let connect = TcpStream::connect((host, port));
    let mut stream = match timeout(dur, connect).await {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => {
            return Ok(ValidationResult {
                reachable: false,
                codec: None,
                width: None,
                height: None,
                fps: None,
                snapshot_upload_key: None,
                error: Some(format!("tcp connect: {e}")),
            });
        }
        Err(_) => {
            return Ok(ValidationResult {
                reachable: false,
                codec: None,
                width: None,
                height: None,
                fps: None,
                snapshot_upload_key: None,
                error: Some("connect timeout".to_string()),
            });
        }
    };

    let request = format!(
        "OPTIONS {} RTSP/1.0\r\nCSeq: 1\r\nUser-Agent: surveillance-connector/0.1\r\n\r\n",
        rtsp_url
    );
    use tokio::io::AsyncWriteExt;
    stream.write_all(request.as_bytes()).await?;

    let mut buf = [0u8; 1024];
    let n = match timeout(dur, stream.read(&mut buf)).await {
        Ok(Ok(n)) => n,
        _ => 0,
    };

    let response = String::from_utf8_lossy(&buf[..n]);
    let reachable = response.starts_with("RTSP/1.0 200")
        || response.starts_with("RTSP/1.0 401"); // 401 still proves the server is alive.

    Ok(ValidationResult {
        reachable,
        codec: None,
        width: None,
        height: None,
        fps: None,
        snapshot_upload_key: None,
        error: if reachable { None } else { Some("no RTSP response".to_string()) },
    })
}
