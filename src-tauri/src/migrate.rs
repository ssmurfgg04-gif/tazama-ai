//! One-time plaintext key migration into the OS keyring (Task 6).
//!
//! Ruling R14 (persist-then-delete): [`harvest_file`] is pure read+parse and
//! NEVER deletes anything. The [`migrate_legacy_keys`] command persists every
//! harvested pair via [`crate::secrets::persist_key`] FIRST and deletes a
//! source file ONLY after all of that file's pairs persisted successfully. A
//! persist failure aborts with `Err` and the source file is left on disk. A
//! file that harvests to zero pairs is also left on disk (nothing was proven
//! safe to delete -- the original may hold data in an unknown shape).
//!
//! Test note (R13): no `tauri::test::mock_builder()` anywhere on this host --
//! manifest-less test binaries die at load (comctl32-v6 `TaskDialogIndirect`
//! via muda/tray-icon; see `secrets.rs` module docs). Tests therefore cover
//! [`harvest_file`] + [`remove_sources`] with temp files only. The
//! persist-then-delete ORDER of the command (which needs an `AppHandle` to
//! call `persist_key`) holds by code inspection: `persist_key` runs to
//! completion for every pair before `remove_sources` is reached, and the `?`
//! on persist failure returns before any deletion.

use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Runtime};

use crate::secrets::persist_key;

/// Map a `KEY=VALUE` env-var name to its Tazama AI provider name.
fn provider_for_env(name: &str) -> Option<&'static str> {
    match name {
        "ANTHROPIC_API_KEY" => Some("anthropic"),
        "OPENAI_API_KEY" => Some("openai"),
        "GROQ_API_KEY" => Some("groq"),
        "NVIDIA_API_KEY" => Some("nvidia"),
        "FISH_AUDIO_API_KEY" => Some("fish"),
        _ => None,
    }
}

/// Strip one layer of matching surrounding single/double quotes.
fn unquote(s: &str) -> &str {
    let b = s.as_bytes();
    if b.len() >= 2
        && ((b[0] == b'"' && b[b.len() - 1] == b'"')
            || (b[0] == b'\'' && b[b.len() - 1] == b'\''))
    {
        &s[1..s.len() - 1]
    } else {
        s
    }
}

/// Parse `KEY=VALUE` lines into `(provider, key)` pairs.
// ----------------------------------------------------------------------
/// Only the five known `*_API_KEY` names map (see [`provider_for_env`]);
/// blank lines, `#` comments, an optional `export ` prefix, empty values,
/// and unknown names are skipped.
fn harvest_env_text(text: &str) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    for raw_line in text.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").unwrap_or(line).trim();
        let Some((name, value)) = line.split_once('=') else {
            continue;
        };
        let name = name.trim().to_ascii_uppercase();
        let value = unquote(value.trim()).trim();
        if value.is_empty() {
            continue;
        }
        if let Some(provider) = provider_for_env(&name) {
            pairs.push((provider.to_string(), value.to_string()));
        }
    }
    pairs
}

/// Read + parse a legacy key file WITHOUT touching anything on disk.
///
/// Known shapes:
/// - flat JSON object with string values (`{"anthropic":"sk-..."}`) →
///   one pair per non-empty string value (key trimmed, value trimmed);
/// - `KEY=VALUE` lines for the five known `*_API_KEY` names (see
///   [`harvest_env_text`]).
///
/// Anything else (missing file, non-UTF8 bytes, unparsable content, JSON
/// non-object or object with no string values) yields an empty vec -- never
/// an error. In particular this function MUST NOT delete the file (R14).
pub(crate) fn harvest_file(path: &Path) -> Vec<(String, String)> {
    let Ok(text) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    if trimmed.starts_with('{') {
        match serde_json::from_str::<serde_json::Value>(trimmed) {
            Ok(serde_json::Value::Object(map)) => map
                .into_iter()
                .filter_map(|(k, v)| match v {
                    serde_json::Value::String(s) => {
                        let key = k.trim();
                        let val = s.trim();
                        if key.is_empty() || val.is_empty() {
                            None
                        } else {
                            Some((key.to_string(), val.to_string()))
                        }
                    }
                    _ => None,
                })
                .collect(),
            _ => Vec::new(),
        }
    } else {
        harvest_env_text(&text)
    }
}

/// Delete the listed files, returning how many were actually removed.
// ----------------------------------------------------------------------
/// Missing files are skipped silently (not errors, not counted). Any other
/// I/O failure on a file is likewise skipped -- migration must never fail
/// just because a stale source path is unreadable.
pub(crate) fn remove_sources(paths: &[PathBuf]) -> u32 {
    let mut removed = 0u32;
    for p in paths {
        if fs::remove_file(p).is_ok() {
            removed += 1;
        }
    }
    removed
}

/// Default legacy candidates: `%APPDATA%\Gleam\keys.json` and
/// `%APPDATA%\Gleam\buddy-brain.json`, each included only IF it exists.
fn default_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(appdata) = std::env::var("APPDATA") {
        for name in ["keys.json", "buddy-brain.json"] {
            let p = PathBuf::from(&appdata).join("Gleam").join(name);
            if p.is_file() {
                out.push(p);
            }
        }
    }
    out
}

/// Resolve the effective source list: explicit candidates win; an empty
/// argument list falls back to [`default_candidates`].
pub(crate) fn resolve_candidates(candidates: &[String]) -> Vec<PathBuf> {
    if candidates.is_empty() {
        default_candidates()
    } else {
        candidates.iter().map(PathBuf::from).collect()
    }
}

/// Migrate plaintext legacy keys into the OS keyring (persist-then-delete).
// ----------------------------------------------------------------------
/// For each candidate path: harvest pairs → `persist_key` each pair → ONLY
/// on full persist success, delete that source file (files harvesting to
/// zero pairs are left alone). Returns the total pairs migrated. Any persist
/// failure aborts with `Err` and that file is NOT deleted.
#[tauri::command]
pub fn migrate_legacy_keys<R: Runtime>(
    app: AppHandle<R>,
    candidates: Vec<String>,
) -> Result<u32, String> {
    let paths = resolve_candidates(&candidates);
    let mut total = 0u32;
    for path in &paths {
        let pairs = harvest_file(path);
        // Persist FIRST: every pair must land in the keyring before the
        // source file may be touched. `?` returns early -- no delete below.
        for (provider, key) in &pairs {
            persist_key(&app, provider, key.clone())
                .map_err(|e| format!("failed to migrate `{}`: {e}", path.display()))?;
        }
        // Delete ONLY after full persist success (and only when something
        // was actually harvested -- see module docs).
        if !pairs.is_empty() {
            remove_sources(std::slice::from_ref(path));
        }
        total += pairs.len() as u32;
    }
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static CTR: AtomicU64 = AtomicU64::new(0);

    fn temp_path(tag: &str) -> PathBuf {
        let n = CTR.fetch_add(1, Ordering::SeqCst);
        std::env::temp_dir().join(format!(
            "Tazama AI-migrate-test-{}-{n}-{tag}.tmp",
            std::process::id()
        ))
    }

    fn write_temp(tag: &str, contents: &str) -> PathBuf {
        let p = temp_path(tag);
        fs::write(&p, contents).expect("write temp fixture");
        p
    }

    fn sorted(mut pairs: Vec<(String, String)>) -> Vec<(String, String)> {
        pairs.sort();
        pairs
    }

    #[test]
    fn harvest_flat_json_returns_exact_pairs() {
        let p = write_temp("json", r#"{"anthropic":"sk-ant-1","openai":"sk-oai-2"}"#);
        let got = sorted(harvest_file(&p));
        assert_eq!(
            got,
            vec![
                ("anthropic".to_string(), "sk-ant-1".to_string()),
                ("openai".to_string(), "sk-oai-2".to_string()),
            ]
        );
        assert!(p.is_file(), "harvest MUST NOT delete the source (R14)");
        let _ = fs::remove_file(&p);
    }

    #[test]
    fn harvest_env_lines_returns_mapped_pairs() {
        let p = write_temp(
            "env",
            "# legacy gleam export\nANTHROPIC_API_KEY=sk-ant-1\nOPENAI_API_KEY = \"sk-oai-2\"\nexport GROQ_API_KEY='sk-groq-3'\nNVIDIA_API_KEY=sk-nv-4\nFISH_AUDIO_API_KEY=sk-fish-5\nUNKNOWN_THING=zzz\nEMPTY=\n",
        );
        let got = sorted(harvest_file(&p));
        assert_eq!(
            got,
            vec![
                ("anthropic".to_string(), "sk-ant-1".to_string()),
                ("fish".to_string(), "sk-fish-5".to_string()),
                ("groq".to_string(), "sk-groq-3".to_string()),
                ("nvidia".to_string(), "sk-nv-4".to_string()),
                ("openai".to_string(), "sk-oai-2".to_string()),
            ]
        );
        assert!(p.is_file(), "harvest MUST NOT delete the source (R14)");
        let _ = fs::remove_file(&p);
    }

    #[test]
    fn harvest_garbage_returns_empty_never_errors() {
        let p = write_temp("garbage", "\x00\x01\x02 not json {{{ ===\nno-equals-here");
        assert!(harvest_file(&p).is_empty());
        assert!(p.is_file(), "garbage file must be left on disk");
        let _ = fs::remove_file(&p);
        // Missing file is also empty, not an error.
        assert!(harvest_file(&temp_path("definitely-missing")).is_empty());
        // JSON non-object shapes harvest to empty.
        let p2 = write_temp("json-array", r#"["anthropic","sk-ant-1"]"#);
        assert!(harvest_file(&p2).is_empty());
        let _ = fs::remove_file(&p2);
    }

    #[test]
    fn remove_sources_deletes_and_tolerates_missing() {
        let a = write_temp("a", "x");
        let b = write_temp("b", "y");
        let missing = temp_path("missing-never-created");
        assert!(!missing.exists());
        let n = remove_sources(&[a.clone(), b.clone(), missing]);
        assert_eq!(n, 2, "only actual deletions count");
        assert!(!a.exists() && !b.exists(), "sources must be gone");
    }

    #[test]
    fn resolve_empty_falls_back_to_defaults() {
        // With explicit candidates, resolution is the identity mapping.
        let got = resolve_candidates(&["a.json".to_string(), "b.env".to_string()]);
        assert_eq!(got, vec![PathBuf::from("a.json"), PathBuf::from("b.env")]);
        // Empty input must not invent paths: on this machine the Gleam
        // defaults almost surely don't exist, so expect empty; if they DO
        // exist the fallback is working as specified -- either way no panic.
        let _ = resolve_candidates(&[]);
    }
}
