use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

use crate::state::ConnectorIdentity;

#[derive(Serialize)]
struct RedeemRequest<'a> {
    code: &'a str,
    hostname: String,
    platform: &'a str,
    version: &'a str,
}

#[derive(Deserialize)]
struct RedeemResponse {
    #[serde(rename = "connectorId")]
    connector_id: String,
    #[serde(rename = "connectorToken")]
    connector_token: String,
    #[serde(rename = "apiBaseUrl")]
    api_base_url: String,
    #[serde(rename = "pollIntervalMs")]
    poll_interval_ms: u64,
    #[serde(rename = "siteName", default)]
    site_name: String,
}

pub async fn redeem(api_url: &str, code: &str) -> Result<ConnectorIdentity> {
    let hostname = hostname::get_best_effort();
    let platform = if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    };

    let req = RedeemRequest {
        code,
        hostname,
        platform,
        version: env!("CARGO_PKG_VERSION"),
    };

    let res = reqwest::Client::new()
        .post(format!("{}/v1/pairings/redeem", api_url.trim_end_matches('/')))
        .json(&req)
        .send()
        .await?;

    if !res.status().is_success() {
        return Err(anyhow!("pairing failed: {}", res.text().await.unwrap_or_default()));
    }

    let body: RedeemResponse = res.json().await?;
    Ok(ConnectorIdentity {
        connector_id: body.connector_id,
        connector_token: body.connector_token,
        api_base_url: body.api_base_url,
        poll_interval_ms: body.poll_interval_ms,
        site_name: body.site_name,
    })
}

mod hostname {
    pub fn get_best_effort() -> String {
        std::env::var("HOSTNAME")
            .or_else(|_| std::env::var("COMPUTERNAME"))
            .unwrap_or_else(|_| "connector".to_string())
    }
}
