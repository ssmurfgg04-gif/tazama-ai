//! OS-keyring secret CRUD (Task 4).
//!
//! Wraps `tauri-plugin-keyring` 0.1.0 password entries under the Tazama AI service,
//! one account per provider (`provider:{name}`).
//!
//! Step-0 finding (crate source wins over remembered docs): 0.1.0 exposes NO
//! `KeyringExt::{initialize_service, set, get, delete, exists}`, NO
//! `CredentialType`/`CredentialValue`, and NO `exists`/`has`. The only surface
//! is `KeyringExt::keyring()` returning `&Keyring<R>` with `get_password` /
//! `set_password` / `delete_password` (+ byte variants `get_secret` /
//! `set_secret` / `delete_secret`). `get_password` folds a missing entry into
//! `Ok(None)`, so `key_has` is get-and-catch via pure mapping fns below.
//!
//! Test note: `tauri::test::mock_builder().build()` cannot execute on this
//! host Ã¢â‚¬â€ any binary calling it dies at startup with STATUS_ENTRYPOINT_NOT_FOUND
//! (see task-4-report.md: `muda`'s load-time `TaskDialogIndirect` import needs
//! comctl32 v6, which manifest-less test binaries don't get). The roundtrip
//! test therefore drives the same `keyring::Entry` calls the plugin makes
//! (same service/account strings via [`account_for`], same `Ok(..ok())`
//! folding) without constructing an `App`.

use tauri::{AppHandle, Runtime};
use tauri_plugin_keyring::KeyringExt;

/// Production keyring service for Tazama AI secrets.
pub const KEYRING_SERVICE: &str = "com.tazamaai.app";

/// Keyring account for a provider name.
fn account_for(provider: &str) -> String {
    format!("provider:{provider}")
}

/// Map a password lookup to a value read: `Some` -> `Ok`, `None` -> not-found
/// error naming the provider, `Err` -> passthrough.
fn map_lookup_to_value(
    provider: &str,
    lookup: Result<Option<String>, String>,
) -> Result<String, String> {
    match lookup {
        Ok(Some(key)) => Ok(key),
        Ok(None) => Err(format!("no key stored for provider `{provider}`")),
        Err(e) => Err(e),
    }
}

/// Map a password lookup to existence: `Some` -> true, `None` -> false
/// (get-and-catch; 0.1.0 has no `exists`), `Err` -> passthrough.
fn map_lookup_to_has(lookup: Result<Option<String>, String>) -> Result<bool, String> {
    match lookup {
        Ok(Some(_)) => Ok(true),
        Ok(None) => Ok(false),
        Err(e) => Err(e),
    }
}

/// Raw lookup mirroring the plugin's `get_password` body
/// (`Entry::new(..)?` errors surface, read misses fold to `None`).
fn get_lookup_with_service<R: Runtime>(
    app: &AppHandle<R>,
    service: &str,
    provider: &str,
) -> Result<Option<String>, String> {
    app.keyring()
        .get_password(service, &account_for(provider))
        .map_err(|e| e.to_string())
}

fn set_with_service<R: Runtime>(
    app: &AppHandle<R>,
    service: &str,
    provider: &str,
    key: &str,
) -> Result<(), String> {
    app.keyring()
        .set_password(service, &account_for(provider), key)
        .map_err(|e| e.to_string())
}

fn read_with_service<R: Runtime>(
    app: &AppHandle<R>,
    service: &str,
    provider: &str,
) -> Result<String, String> {
    map_lookup_to_value(provider, get_lookup_with_service(app, service, provider))
}

fn has_with_service<R: Runtime>(
    app: &AppHandle<R>,
    service: &str,
    provider: &str,
) -> Result<bool, String> {
    map_lookup_to_has(get_lookup_with_service(app, service, provider))
}

fn remove_with_service<R: Runtime>(
    app: &AppHandle<R>,
    service: &str,
    provider: &str,
) -> Result<(), String> {
    app.keyring()
        .delete_password(service, &account_for(provider))
        .map_err(|e| e.to_string())
}

// NOTE: `<R: Runtime>` generics are required because Tauri v2's `AppHandle`
// has no default type parameter; call sites (`read_key(&app, p)`) are unchanged.

#[tauri::command]
pub fn key_set<R: Runtime>(
    app: AppHandle<R>,
    provider: String,
    key: String,
) -> Result<(), String> {
    set_with_service(&app, KEYRING_SERVICE, &provider, &key)
}

#[tauri::command]
pub fn key_has<R: Runtime>(app: AppHandle<R>, provider: String) -> Result<bool, String> {
    has_with_service(&app, KEYRING_SERVICE, &provider)
}

#[tauri::command]
pub fn key_remove<R: Runtime>(app: AppHandle<R>, provider: String) -> Result<(), String> {
    remove_with_service(&app, KEYRING_SERVICE, &provider)
}

/// Read a provider key from the OS keyring (Task 5 consumes verbatim).
#[allow(dead_code)] // consumed by Task 5; tests never read the prod service
pub(crate) fn read_key<R: Runtime>(app: &AppHandle<R>, provider: &str) -> Result<String, String> {
    read_with_service(app, KEYRING_SERVICE, provider)
}

/// Persist a provider key (Ruling R6; Task 6 consumes; same write path as
/// `key_set` minus the command wrapper).
#[allow(dead_code)] // consumed by Task 6; tests never write the prod service
pub(crate) fn persist_key<R: Runtime>(
    app: &AppHandle<R>,
    provider: &str,
    key: String,
) -> Result<(), String> {
    set_with_service(app, KEYRING_SERVICE, provider, &key)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Test-only keyring service prefix: never touches production entries.
    const TEST_SERVICE: &str = "com.tazamaai.app.test";
    const TEST_PROVIDER: &str = "roundtrip-provider";
    const TEST_KEY: &str = "test-key-abc123";

    /// Lookup mirroring the plugin's `get_password` body line-for-line
    /// (`Entry::new(..)?`, misses fold to `None`), but callable without an
    /// `AppHandle` (mock apps cannot run on this host Ã¢â‚¬â€ see module docs).
    fn direct_lookup(service: &str, provider: &str) -> Result<Option<String>, String> {
        Ok(keyring::Entry::new(service, &account_for(provider))
            .map_err(|e| e.to_string())?
            .get_password()
            .ok())
    }

    fn direct_set(service: &str, provider: &str, key: &str) -> Result<(), String> {
        keyring::Entry::new(service, &account_for(provider))
            .map_err(|e| e.to_string())?
            .set_password(key)
            .map_err(|e| e.to_string())
    }

    fn direct_remove(service: &str, provider: &str) -> Result<(), String> {
        keyring::Entry::new(service, &account_for(provider))
            .map_err(|e| e.to_string())?
            .delete_credential()
            .map_err(|e| e.to_string())
    }

    #[test]
    fn account_format_is_provider_prefixed() {
        assert_eq!(account_for("openai"), "provider:openai");
        assert_eq!(account_for(""), "provider:");
    }

    #[test]
    fn service_constants_use_test_prefix() {
        assert_eq!(KEYRING_SERVICE, "com.tazamaai.app");
        assert_eq!(TEST_SERVICE, "com.tazamaai.app.test");
        assert_ne!(TEST_SERVICE, KEYRING_SERVICE);
    }

    #[test]
    fn lookup_value_mapping() {
        assert_eq!(
            map_lookup_to_value("p", Ok(Some("k".into()))),
            Ok("k".to_string())
        );
        let err = map_lookup_to_value("p", Ok(None)).unwrap_err();
        assert!(err.contains('p'), "not-found must name provider: {err}");
        assert_eq!(
            map_lookup_to_value("p", Err("boom".to_string())),
            Err("boom".to_string())
        );
    }

    #[test]
    fn lookup_has_mapping() {
        assert_eq!(map_lookup_to_has(Ok(Some("k".into()))), Ok(true));
        assert_eq!(map_lookup_to_has(Ok(None)), Ok(false));
        assert_eq!(
            map_lookup_to_has(Err("boom".to_string())),
            Err("boom".to_string())
        );
    }

    #[test]
    fn keyring_roundtrip_under_test_prefix() {
        // Drop residue from an earlier aborted run so the test is repeatable.
        let _ = direct_remove(TEST_SERVICE, TEST_PROVIDER);

        let result = (|| -> Result<(), String> {
            direct_set(TEST_SERVICE, TEST_PROVIDER, TEST_KEY)?;
            let got = map_lookup_to_value(TEST_PROVIDER, direct_lookup(TEST_SERVICE, TEST_PROVIDER))?;
            assert_eq!(got, TEST_KEY, "read back must equal written key");
            assert!(
                map_lookup_to_has(direct_lookup(TEST_SERVICE, TEST_PROVIDER))?,
                "has must be true after set"
            );
            direct_remove(TEST_SERVICE, TEST_PROVIDER)?;
            assert!(
                !map_lookup_to_has(direct_lookup(TEST_SERVICE, TEST_PROVIDER))?,
                "has must be false after remove"
            );
            Ok(())
        })();

        // Cleanup even on failure: leave no test entries behind.
        let _ = direct_remove(TEST_SERVICE, TEST_PROVIDER);

        result.expect("keyring roundtrip");
    }
}

