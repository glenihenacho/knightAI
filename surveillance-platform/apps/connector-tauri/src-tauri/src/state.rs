use anyhow::Result;
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::AppHandle;

use crate::PairingStatus;

#[derive(Clone, Serialize, Deserialize)]
pub struct ConnectorIdentity {
    pub connector_id: String,
    pub connector_token: String,
    pub api_base_url: String,
    pub poll_interval_ms: u64,
}

pub struct ConnectorState {
    identity: Option<ConnectorIdentity>,
    config_path: PathBuf,
}

impl ConnectorState {
    pub fn load(_app: &AppHandle) -> Result<Self> {
        let dirs = ProjectDirs::from("com", "surveillance", "connector")
            .ok_or_else(|| anyhow::anyhow!("could not resolve config dir"))?;
        fs::create_dir_all(dirs.config_dir())?;
        let config_path = dirs.config_dir().join("identity.json");
        let identity = if config_path.exists() {
            let raw = fs::read_to_string(&config_path)?;
            serde_json::from_str(&raw).ok()
        } else {
            None
        };
        Ok(Self { identity, config_path })
    }

    pub fn pairing_status(&self) -> PairingStatus {
        match &self.identity {
            Some(id) => PairingStatus::Paired {
                connector_id: id.connector_id.clone(),
                api_base_url: id.api_base_url.clone(),
            },
            None => PairingStatus::Unpaired,
        }
    }

    pub fn set_identity(&mut self, identity: ConnectorIdentity) {
        if let Ok(raw) = serde_json::to_string_pretty(&identity) {
            let _ = fs::write(&self.config_path, raw);
        }
        self.identity = Some(identity);
    }

    pub fn clone_handle(&self) -> Option<ConnectorIdentity> {
        self.identity.clone()
    }
}
