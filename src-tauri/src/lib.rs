use std::sync::Mutex;
use tauri::Manager;

mod agents;
mod caps;
mod capture;
mod memory;
mod migrate;
mod notes;
mod providers;
mod secrets;

pub use memory::MemoryState;

#[derive(Default)]
pub struct AppState {
    pub http: Mutex<Option<reqwest::Client>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .manage(MemoryState::default())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app.get_webview_window("main").map(|w| { let _ = w.set_focus(); });
        }))
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_keyring::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // Pre-warm context-m cortexm process (zero first-call latency)
            let mem = app.state::<MemoryState>();
            memory::warm_up(app.handle(), &mem);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // ── Plan A: Security core ──
            migrate::migrate_legacy_keys,
            secrets::key_set,
            secrets::key_has,
            secrets::key_remove,
            providers::chat_complete,
            providers::key_test,
            providers::transcribe,
            providers::speak,
            // ── Plan A+: Memory (context-m) ──
            memory::memory_add,
            memory::memory_search,
            memory::memory_recall,
            // ── Plan C: Screen capture + computer-use ──
            capture::screenshot,
            capture::get_ui_elements,
            capture::cu_exec,
            // ── Plan D: Agents ──
            agents::agent_list,
            agents::agent_save,
            agents::agent_remove,
            agents::agent_touch,
            agents::agent_get,
            agents::agent_note_append,
            agents::agent_notes_read,
            // ── Plan D: Notes ──
            notes::note_add,
            notes::note_edit,
            notes::note_remove,
            notes::note_list,
            notes::note_search,
            // ── Plan D: Routines ──
            notes::routine_new,
            notes::routine_save,
            notes::routine_run,
            notes::routine_remove,
            notes::routine_list,
            // ── Plan D: Goals ──
            notes::goal_new,
            notes::goal_save,
            notes::goal_step_toggle,
            notes::goal_remove,
            notes::goal_list,
            // ── Plan D: Clipboard ──
            notes::clipboard_write,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tazama AI");
}
