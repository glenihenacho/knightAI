mod pairing;
mod poller;
mod preview;
mod rtsp;
mod state;
mod time;

use parking_lot::Mutex;
use preview::PreviewManager;
use serde::{Deserialize, Serialize};
use state::ConnectorState;
use std::sync::Arc;
use tauri::async_runtime::JoinHandle;
use tauri::Manager;

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum PairingStatus {
    Unpaired,
    Paired {
        connector_id: String,
        api_base_url: String,
        site_name: String,
    },
}

pub struct AppState {
    pub connector: Arc<Mutex<ConnectorState>>,
    // Shared so reset_pairing can stop active previews; owned here (not inside
    // the poll task) so it outlives a poller abort.
    pub preview: PreviewManager,
    // Handle to the running poll loop, so re-pair/reset can abort it cleanly.
    pub poller: Arc<Mutex<Option<JoinHandle<()>>>>,
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
    state.connector.lock().set_identity(identity.clone());
    // Replace any prior poll loop (defensive — pairing is normally only
    // reachable from the unpaired state).
    if let Some(handle) = state.poller.lock().take() {
        handle.abort();
    }
    let handle = poller::spawn(state.preview.clone(), identity.clone());
    *state.poller.lock() = Some(handle);
    Ok(PairingStatus::Paired {
        connector_id: identity.connector_id,
        api_base_url: identity.api_base_url,
        site_name: identity.site_name,
    })
}

/// Tear down the current pairing: stop polling, kill active previews, and
/// delete the persisted identity so the UI returns to the pairing form. Lets an
/// operator re-point this machine at another site without touching the
/// filesystem by hand.
#[tauri::command]
async fn reset_pairing(state: tauri::State<'_, AppState>) -> Result<PairingStatus, String> {
    if let Some(handle) = state.poller.lock().take() {
        handle.abort();
    }
    state.preview.stop_all();
    state
        .connector
        .lock()
        .clear_identity()
        .map_err(|e| e.to_string())?;
    Ok(PairingStatus::Unpaired)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let connector = ConnectorState::load(app.handle())?;
            let preview = PreviewManager::new(app.handle().clone());
            let poller: Arc<Mutex<Option<JoinHandle<()>>>> = Arc::new(Mutex::new(None));
            // Re-arm the command poller for an already-paired connector.
            // Without this a restarted connector never polled for commands
            // again — pairing was the only spawn site.
            //
            // Phase 2 pivot: detection moved to the server-side worker; the
            // connector's only jobs are command polling and RTSP -> HLS -> S3.
            if let Some(identity) = connector.clone_handle() {
                let handle = poller::spawn(preview.clone(), identity);
                *poller.lock() = Some(handle);
            }
            app.manage(AppState {
                connector: Arc::new(Mutex::new(connector)),
                preview,
                poller,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_pairing_status,
            pair_with_code,
            reset_pairing
        ])
        .run(tauri::generate_context!())
        .expect("failed to run tauri application");
}
