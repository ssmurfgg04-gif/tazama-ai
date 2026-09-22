# Peek capabilities — permission justifications (Task 8)

`core:*` permissions are Tauri defaults (window close/minimize/maximize on `main`).
Every non-`core:*` permission below carries a `// reason:` line. All 9 are
justified; none removed. Key material lives ONLY in the OS keyring (see
`src/settings.contract.md`) — never in the store, never logged.

// reason: log:default — tauri_plugin_log registered in src-tauri/src/lib.rs; Rust-side diagnostics only, never logs key material (providers.rs reads keys via read_key, never logs).
// reason: store:default — tauri_plugin_store registered in src-tauri/src/lib.rs; base capability for non-secret app-state persistence.
// reason: store:allow-load — load persisted non-secret app state (e.g. settings) from disk at startup.
// reason: store:allow-get — read non-secret persisted values (settings/UI state); keys are excluded by contract.
// reason: store:allow-set — write non-secret persisted values (settings/UI state) in memory.
// reason: store:allow-save — flush non-secret persisted values to disk.
// reason: keyring:allow-set-password — secrets::key_set / persist_key store provider API keys in the OS keyring (Task 4/6).
// reason: keyring:allow-get-password — secrets::key_has + read_key check/read provider keys from the OS keyring (Task 5 consumers).
// reason: keyring:allow-delete-password — secrets::key_remove deletes provider keys from the OS keyring.
