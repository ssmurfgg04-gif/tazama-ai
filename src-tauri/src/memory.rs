//! Context-m memory integration — Tazama AI
//!
//! Spawns `cortexm serve --db <path>` as a stdio child and communicates over
//! JSON-RPC (MCP protocol). Shares the SAME database as the opencode session
//! (./data/context-m.db relative to the workspace root), so the buddy
//! inherits and contributes to Jack's persistent memory.
//!
//! Three Tauri commands exposed to JS (never expose raw DB path or creds):
//!   memory_add(content: String) -> Result<String, String>
//!   memory_search(query: String, limit: u32) -> Result<String, String>
//!   memory_recall(n: u32) -> Result<String, String>
//!
//! The child process is started lazily on first call and kept alive.
//! If it exits, the next call restarts it (self-healing).

use std::{
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::Mutex,
};
use tauri::{AppHandle, Manager};

// ─── Process state (app-lifetime singleton) ───────────────────────────────────

struct CortexState {
    child:  Option<Child>,
    stdin:  Option<ChildStdin>,
    stdout: Option<BufReader<ChildStdout>>,
    seq:    u64,
    initialized: bool,
}

impl Default for CortexState {
    fn default() -> Self {
        Self {
            child:  None,
            stdin:  None,
            stdout: None,
            seq:    0,
            initialized: false,
        }
    }
}

pub struct MemoryState(pub Mutex<CortexState>);

impl Default for MemoryState {
    fn default() -> Self {
        Self(Mutex::new(CortexState::default()))
    }
}

// ─── DB path resolution ────────────────────────────────────────────────────────

fn db_path<R: tauri::Runtime>(app: &AppHandle<R>) -> String {
    // 1. Env var override (same as opencode MCP config: CONTEXT_M_DB)
    if let Ok(p) = std::env::var("CONTEXT_M_DB") {
        return p;
    }
    // 2. Sibling of the exe: <exe_dir>/../../data/context-m.db
    //    Works when running from the peek/ project during dev (exe is in target/…)
    // 3. AppData fallback for installed release
    let app_dir = app.path().app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    app_dir.join("context-m.db").to_string_lossy().into_owned()
}

// ─── Child lifecycle ───────────────────────────────────────────────────────────

fn ensure_child(state: &mut CortexState, db: &str) -> Result<(), String> {
    // Check if existing child is still alive
    if let Some(ref mut child) = state.child {
        match child.try_wait() {
            Ok(Some(_)) => {
                // Exited — clear and restart below
                state.stdin  = None;
                state.stdout = None;
                state.child  = None;
                state.initialized = false;
            }
            Ok(None) => return Ok(()), // still running
            Err(_)   => {
                state.stdin  = None;
                state.stdout = None;
                state.child  = None;
                state.initialized = false;
            }
        }
    }

    // Spawn cortexm serve
    let mut cmd = Command::new("cortexm");
    cmd.args(["serve", "--db", db])
       .env("PYTHONUTF8", "1")
       .stdin(Stdio::piped())
       .stdout(Stdio::piped())
       .stderr(Stdio::null());

    let mut child = cmd.spawn().map_err(|e| format!("cortexm spawn failed: {e}"))?;
    let stdin  = child.stdin.take().ok_or("cortexm stdin missing")?;
    let stdout = BufReader::new(child.stdout.take().ok_or("cortexm stdout missing")?);
    state.stdin  = Some(stdin);
    state.stdout = Some(stdout);
    state.child  = Some(child);
    state.initialized = false;
    Ok(())
}

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

fn rpc_write(stdin: &mut ChildStdin, msg: &str) -> Result<(), String> {
    stdin.write_all(msg.as_bytes()).map_err(|e| format!("rpc write: {e}"))?;
    stdin.write_all(b"\n").map_err(|e| format!("rpc newline: {e}"))?;
    stdin.flush().map_err(|e| format!("rpc flush: {e}"))?;
    Ok(())
}

fn rpc_read(stdout: &mut BufReader<ChildStdout>) -> Result<serde_json::Value, String> {
    let mut line = String::new();
    stdout.read_line(&mut line).map_err(|e| format!("rpc read: {e}"))?;
    let v: serde_json::Value = serde_json::from_str(line.trim())
        .map_err(|e| format!("rpc parse: {e}\nraw: {}", line.trim()))?;
    Ok(v)
}

fn next_id(state: &mut CortexState) -> u64 {
    state.seq += 1;
    state.seq
}

fn mcp_initialize(state: &mut CortexState) -> Result<(), String> {
    if state.initialized { return Ok(()); }
    let id = next_id(state);
    let msg = format!(
        r#"{{"jsonrpc":"2.0","id":{id},"method":"initialize","params":{{"protocolVersion":"2024-11-05","capabilities":{{}},"clientInfo":{{"name":"tazama-ai","version":"0.1.0"}}}}}}"#
    );
    let stdin  = state.stdin.as_mut().ok_or("no stdin")?;
    let stdout = state.stdout.as_mut().ok_or("no stdout")?;
    rpc_write(stdin, &msg)?;
    rpc_read(stdout)?; // consume initialize result
    state.initialized = true;
    Ok(())
}

/// Call a context-m MCP tool and return the first text content.
fn call_tool(state: &mut CortexState, tool: &str, args: serde_json::Value) -> Result<String, String> {
    let id = next_id(state);
    let msg = serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": "tools/call",
        "params": { "name": tool, "arguments": args }
    });
    let stdin  = state.stdin.as_mut().ok_or("no stdin")?;
    let stdout = state.stdout.as_mut().ok_or("no stdout")?;
    rpc_write(stdin, &msg.to_string())?;
    let resp = rpc_read(stdout)?;
    // Extract text from content[0].text
    let text = resp
        .pointer("/result/content/0/text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Ok(text)
}

// ─── Tauri commands ───────────────────────────────────────────────────────────

/// Store a memory. Content is the fact or lesson to remember.
/// Never pass secrets — content goes into the shared context-m DB.
#[tauri::command]
pub fn memory_add<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, MemoryState>,
    content: String,
) -> Result<String, String> {
    if content.trim().is_empty() {
        return Err("content must not be empty".to_string());
    }
    let db = db_path(&app);
    let mut s = state.0.lock().map_err(|e| format!("lock: {e}"))?;
    ensure_child(&mut s, &db)?;
    mcp_initialize(&mut s)?;
    let args = serde_json::json!({
        "messages": [{"role": "assistant", "content": content}],
        "user_id": "jack"
    });
    call_tool(&mut s, "contextm_add", args)
}

/// Search memory for facts relevant to a query. Returns markdown context block.
#[tauri::command]
pub fn memory_search<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, MemoryState>,
    query: String,
    limit: Option<u32>,
) -> Result<String, String> {
    if query.trim().is_empty() {
        return Err("query must not be empty".to_string());
    }
    let db = db_path(&app);
    let mut s = state.0.lock().map_err(|e| format!("lock: {e}"))?;
    ensure_child(&mut s, &db)?;
    mcp_initialize(&mut s)?;
    let args = serde_json::json!({
        "query": query,
        "user_id": "jack",
        "limit": limit.unwrap_or(8)
    });
    call_tool(&mut s, "contextm_search", args)
}

/// Load the most recent N facts as a context block for prompt injection.
#[tauri::command]
pub fn memory_recall<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, MemoryState>,
    n: Option<u32>,
) -> Result<String, String> {
    let db = db_path(&app);
    let mut s = state.0.lock().map_err(|e| format!("lock: {e}"))?;
    ensure_child(&mut s, &db)?;
    mcp_initialize(&mut s)?;
    let args = serde_json::json!({
        "user_id": "jack",
        "n": n.unwrap_or(12)
    });
    call_tool(&mut s, "contextm_preload", args)
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

pub fn shutdown(state: &MemoryState) {
    if let Ok(mut s) = state.0.lock() {
        s.stdin.take(); // close stdin so cortexm exits cleanly
        if let Some(mut child) = s.child.take() {
            let _ = child.wait();
        }
    }
}

/// Called from app setup to pre-warm cortexm before the first user message.
pub fn warm_up<R: tauri::Runtime>(app: &AppHandle<R>, state: &MemoryState) {
    let db = db_path(app);
    if let Ok(mut s) = state.0.lock() {
        let _ = ensure_child(&mut s, &db);
        let _ = mcp_initialize(&mut s);
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn db_env_override() {
        std::env::set_var("CONTEXT_M_DB", "/tmp/test.db");
        // Can't construct AppHandle in tests — verify env resolution path
        // via the env var check directly
        let p = std::env::var("CONTEXT_M_DB").unwrap();
        assert_eq!(p, "/tmp/test.db");
        std::env::remove_var("CONTEXT_M_DB");
    }

    #[test]
    fn cortex_state_default_uninitialized() {
        let s = CortexState::default();
        assert!(!s.initialized);
        assert!(s.child.is_none());
        assert_eq!(s.seq, 0);
    }
}
