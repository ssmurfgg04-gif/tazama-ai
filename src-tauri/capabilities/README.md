# Peek capabilities — permission justifications

`core:*` permissions are the only grants. Plugin IPC grants (log, store,
keyring) were removed in the Task 8 fix round because the frontend never
calls `plugin:store|*` or `plugin:keyring|*` directly — it calls only
custom app commands (`key_set`, `key_has`, `key_remove`, `key_test`,
`chat_complete`, `transcribe`, `speak`, `migrate_legacy_keys`).

Rust-side plugin calls (KeyringExt, store, log) are unaffected by capability
entries — those are IPC gates for the WebView, not for Rust code.

## Active permissions

| Permission | Reason |
|---|---|
| `core:default` | Tauri built-in default window capabilities. |
| `core:window:allow-close` | Settings UI close button. |
| `core:window:allow-minimize` | Overlay minimize to tray. |
| `core:window:allow-toggle-maximize` | Overlay expand/restore. |
