use std::sync::Mutex;
use tauri::Manager;

mod caps;
mod providers;
mod secrets;

#[derive(Default)]
pub struct AppState {
    pub http: Mutex<Option<reqwest::Client>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app.get_webview_window("main").map(|w| { let _ = w.set_focus(); });
        }))
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_keyring::init())
        .invoke_handler(tauri::generate_handler![
            secrets::key_set,
            secrets::key_has,
            secrets::key_remove,
            providers::chat_complete,
            providers::key_test,
            providers::transcribe,
            providers::speak
        ])
        .run(tauri::generate_context!())
        .expect("error while running Peek");
}
