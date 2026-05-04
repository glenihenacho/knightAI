mod pairing;
mod poller;
mod rtsp;
mod state;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use state::ConnectorState;
use std::sync::Arc;
use tauri::Manager;

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum PairingStatus {
    Unpaired,
    Paired {
        connector_id: String,
        api_base_url: String,
    },
}

pub struct AppState {
    pub connector: Arc<Mutex<ConnectorState>>,
}

#[tauri::command]
async fn get_pairing_status(state: tauri::State<'_, AppState>) -> Result<PairingStatus, String> {
    let connector = state.connector.lock();
    Ok(connector.pairing_status())
}

#[tauri::command]
async fn pair_with_code(
    state: tauri::State<'_, AppState>,
    api_url: String,
    code: String,
) -> Result<PairingStatus, String> {
    let identity = pairing::redeem(&api_url, &code)
        .await
        .map_err(|e| e.to_string())?;
    let mut connector = state.connector.lock();
    connector.set_identity(identity.clone());
    poller::spawn(connector.clone_handle(), identity.clone());
    Ok(PairingStatus::Paired {
        connector_id: identity.connector_id,
        api_base_url: identity.api_base_url,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let connector = ConnectorState::load(app.handle())?;
            app.manage(AppState {
                connector: Arc::new(Mutex::new(connector)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_pairing_status, pair_with_code])
        .run(tauri::generate_context!())
        .expect("failed to run tauri application");
}
