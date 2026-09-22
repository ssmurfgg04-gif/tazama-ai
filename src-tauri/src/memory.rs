//! Tazama AI — built-in memory system
//!
//! Self-contained SQLite store: no cortexm, no Python, no MCP, no opencode.
//! Ships inside the exe, works on any Windows machine, DB lives in %APPDATA%.
//!
//! Three commands exposed to JS:
//!   memory_add(content, tags?) -> Result<String, String>   (returns memory id)
//!   memory_search(query, limit?) -> Result<Vec<Memory>, String>
//!   memory_recall(n?) -> Result<Vec<Memory>, String>
//!
//! Storage: SQLite with FTS5 full-text search.
//! Schema: memories table + fts virtual table.
//! Thread-safe via Mutex<Connection>.

use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Manager, Runtime};
use uuid::Uuid;

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Memory {
    pub id:         String,
    pub content:    String,
    pub tags:       Vec<String>,
    pub created_at: String,
    pub score:      f64,   // relevance (FTS rank) or 1.0 for recall
}

// ─── State ────────────────────────────────────────────────────────────────────

pub struct MemoryState(pub Mutex<Option<Connection>>);

impl Default for MemoryState {
    fn default() -> Self { Self(Mutex::new(None)) }
}

// ─── DB path ─────────────────────────────────────────────────────────────────

fn db_path<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("tazama-memory.db")
}

// ─── Initialise ───────────────────────────────────────────────────────────────

fn open_db(path: &PathBuf) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let conn = Connection::open(path).map_err(|e| format!("db open: {e}"))?;

    // Enable WAL mode for concurrent reads
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
        .map_err(|e| format!("pragma: {e}"))?;

    // Main table
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS memories (
            id          TEXT PRIMARY KEY,
            content     TEXT NOT NULL,
            tags        TEXT NOT NULL DEFAULT '[]',
            created_at  TEXT NOT NULL,
            access_count INTEGER DEFAULT 0
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts
            USING fts5(content, id UNINDEXED, tokenize='unicode61');
        CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);",
    ).map_err(|e| format!("schema: {e}"))?;

    Ok(conn)
}

/// Ensure the DB is open; open it if not. Call before every command.
fn ensure<R: Runtime>(
    app: &AppHandle<R>,
    state: &MemoryState,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| format!("lock: {e}"))?;
    if guard.is_none() {
        let path = db_path(app);
        *guard = Some(open_db(&path)?);
    }
    Ok(())
}

/// Pre-warm on app start (no-op after first call).
pub fn warm_up<R: Runtime>(app: &AppHandle<R>, state: &MemoryState) {
    let _ = ensure(app, state);
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/// Store a memory. Returns the new memory's id.
/// Content is plain text — never pass secrets.
#[tauri::command]
pub fn memory_add<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, MemoryState>,
    content: String,
    tags: Option<Vec<String>>,
) -> Result<String, String> {
    if content.trim().is_empty() {
        return Err("content must not be empty".to_string());
    }
    ensure(&app, &state)?;
    let guard = state.0.lock().map_err(|e| format!("lock: {e}"))?;
    let conn  = guard.as_ref().ok_or("db not open")?;

    let id  = Uuid::new_v4().to_string();
    let ts  = Utc::now().to_rfc3339();
    let tag_json = serde_json::to_string(&tags.unwrap_or_default())
        .unwrap_or_else(|_| "[]".to_string());

    conn.execute(
        "INSERT INTO memories (id, content, tags, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, content, tag_json, ts],
    ).map_err(|e| format!("insert: {e}"))?;

    // Keep FTS in sync
    conn.execute(
        "INSERT INTO memories_fts (content, id) VALUES (?1, ?2)",
        params![content, id],
    ).map_err(|e| format!("fts insert: {e}"))?;

    Ok(id)
}

/// Search memories by text query. Returns up to `limit` results (default 8).
#[tauri::command]
pub fn memory_search<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, MemoryState>,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<Memory>, String> {
    if query.trim().is_empty() {
        return Err("query must not be empty".to_string());
    }
    ensure(&app, &state)?;
    let guard = state.0.lock().map_err(|e| format!("lock: {e}"))?;
    let conn  = guard.as_ref().ok_or("db not open")?;
    let n     = limit.unwrap_or(8).min(50) as i64;

    // FTS5 match — rank is negative (lower = better match)
    let mut stmt = conn.prepare(
        "SELECT m.id, m.content, m.tags, m.created_at, -fts.rank AS score
         FROM memories_fts fts
         JOIN memories m ON m.id = fts.id
         WHERE memories_fts MATCH ?1
         ORDER BY fts.rank
         LIMIT ?2",
    ).map_err(|e| format!("prepare: {e}"))?;

    // Sanitise query for FTS5 (wrap in quotes to avoid syntax errors)
    let safe_query = format!("\"{}\"", query.replace('"', " "));
    let rows: Vec<Memory> = stmt.query_map(params![safe_query, n], row_to_memory)
        .map_err(|e| format!("query: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    // If FTS returns nothing (rare query), fall back to LIKE
    if rows.is_empty() {
        let like_query = format!("%{}%", query);
        let mut stmt2 = conn.prepare(
            "SELECT id, content, tags, created_at, 1.0 AS score
             FROM memories
             WHERE content LIKE ?1
             ORDER BY created_at DESC
             LIMIT ?2",
        ).map_err(|e| format!("prepare fallback: {e}"))?;
        let rows2: Vec<Memory> = stmt2
            .query_map(params![like_query, n], row_to_memory)
            .map_err(|e| format!("like query: {e}"))?
            .filter_map(|r| r.ok())
            .collect();
        return Ok(rows2);
    }

    Ok(rows)
}

/// Recall the N most recent memories (default 12).
#[tauri::command]
pub fn memory_recall<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, MemoryState>,
    n: Option<u32>,
) -> Result<Vec<Memory>, String> {
    ensure(&app, &state)?;
    let guard = state.0.lock().map_err(|e| format!("lock: {e}"))?;
    let conn  = guard.as_ref().ok_or("db not open")?;
    let limit = n.unwrap_or(12).min(50) as i64;

    let mut stmt = conn.prepare(
        "SELECT id, content, tags, created_at, 1.0 AS score
         FROM memories
         ORDER BY created_at DESC
         LIMIT ?1",
    ).map_err(|e| format!("prepare: {e}"))?;

    let rows: Vec<Memory> = stmt
        .query_map(params![limit], row_to_memory)
        .map_err(|e| format!("query: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

/// Delete a specific memory by id.
#[tauri::command]
pub fn memory_delete<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, MemoryState>,
    id: String,
) -> Result<(), String> {
    ensure(&app, &state)?;
    let guard = state.0.lock().map_err(|e| format!("lock: {e}"))?;
    let conn  = guard.as_ref().ok_or("db not open")?;
    conn.execute("DELETE FROM memories WHERE id = ?1", params![id])
        .map_err(|e| format!("delete: {e}"))?;
    conn.execute("DELETE FROM memories_fts WHERE id = ?1", params![id])
        .map_err(|e| format!("fts delete: {e}"))?;
    Ok(())
}

/// Return the count of stored memories.
#[tauri::command]
pub fn memory_count<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, MemoryState>,
) -> Result<i64, String> {
    ensure(&app, &state)?;
    let guard = state.0.lock().map_err(|e| format!("lock: {e}"))?;
    let conn  = guard.as_ref().ok_or("db not open")?;
    conn.query_row("SELECT COUNT(*) FROM memories", [], |r| r.get(0))
        .map_err(|e| format!("count: {e}"))
}

// ─── Helper ───────────────────────────────────────────────────────────────────

fn row_to_memory(row: &rusqlite::Row<'_>) -> rusqlite::Result<Memory> {
    let tag_str: String = row.get(2)?;
    let tags: Vec<String> = serde_json::from_str(&tag_str).unwrap_or_default();
    Ok(Memory {
        id:         row.get(0)?,
        content:    row.get(1)?,
        tags,
        created_at: row.get(3)?,
        score:      row.get(4)?,
    })
}

// ─── Tests ────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db() -> (Connection, PathBuf) {
        let path = std::env::temp_dir().join(format!("tazama-test-{}.db", Uuid::new_v4()));
        let conn = open_db(&path).expect("open temp db");
        (conn, path)
    }

    #[test]
    fn insert_and_recall() {
        let (conn, path) = temp_db();
        let id = Uuid::new_v4().to_string();
        let ts = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO memories (id, content, tags, created_at) VALUES (?1, ?2, '[]', ?3)",
            params![id, "Tazama watches your screen", ts],
        ).unwrap();
        conn.execute(
            "INSERT INTO memories_fts (content, id) VALUES (?1, ?2)",
            params!["Tazama watches your screen", id],
        ).unwrap();

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM memories", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn fts_search_finds_content() {
        let (conn, path) = temp_db();
        let id = Uuid::new_v4().to_string();
        let ts = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO memories (id, content, tags, created_at) VALUES (?1, ?2, '[]', ?3)",
            params![id, "context-m is a memory system for AI agents", ts],
        ).unwrap();
        conn.execute(
            "INSERT INTO memories_fts (content, id) VALUES (?1, ?2)",
            params!["context-m is a memory system for AI agents", id],
        ).unwrap();

        let mut stmt = conn.prepare(
            "SELECT m.id FROM memories_fts f JOIN memories m ON m.id = f.id WHERE memories_fts MATCH '\"memory system\"'"
        ).unwrap();
        let ids: Vec<String> = stmt.query_map([], |r| r.get(0)).unwrap()
            .filter_map(|r| r.ok()).collect();
        assert!(!ids.is_empty(), "FTS should find the memory");
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn delete_removes_record() {
        let (conn, path) = temp_db();
        let id = Uuid::new_v4().to_string();
        let ts = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO memories (id, content, tags, created_at) VALUES (?1, ?2, '[]', ?3)",
            params![id, "delete me", ts],
        ).unwrap();
        conn.execute("DELETE FROM memories WHERE id = ?1", params![id]).unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM memories", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 0);
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn schema_has_fts_table() {
        let (conn, path) = temp_db();
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE name='memories_fts'",
            [], |r| r.get(0)
        ).unwrap();
        assert_eq!(exists, 1, "FTS table must exist");
        std::fs::remove_file(path).ok();
    }
}
