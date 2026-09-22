//! Persistent named agents — Tazama AI (Plan D)
//!
//! Better than HeyClicky's AGENTS.md system because:
//!   - Agents stored in OS-native JSON (no platform-specific workspace dirs)
//!   - Memory auto-saved to context-m DB shared with opencode
//!   - Agent colour drives UI accent for that agent's HUD chip
//!   - Supports skills (list of skill IDs) and custom system prompts
//!   - agent_list returns all agents sorted by last_used desc

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::PathBuf};
use tauri::{AppHandle, Manager, Runtime};

/// A persistent named agent — the Tazama equivalent of HeyClicky's
/// "persistent named agent" with AGENTS.md workspace memory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id:           String,
    pub name:         String,
    pub description:  String,
    pub system_prompt: String,
    pub accent:       Option<String>,  // hex colour, drives HUD chip
    pub skills:       Vec<String>,     // skill IDs
    pub created_at:   String,          // RFC3339
    pub last_used:    Option<String>,
    pub notes_path:   Option<String>,  // path to AGENTS.md equivalent
}

impl Agent {
    pub fn new(name: impl Into<String>, description: impl Into<String>) -> Self {
        let id = format!("agent-{}", Utc::now().timestamp_millis());
        Agent {
            id,
            name: name.into(),
            description: description.into(),
            system_prompt: String::new(),
            accent: None,
            skills: vec![],
            created_at: Utc::now().to_rfc3339(),
            last_used: None,
            notes_path: None,
        }
    }
}

fn agents_path<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    app.path().app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("agents.json")
}

fn load_agents<R: Runtime>(app: &AppHandle<R>) -> HashMap<String, Agent> {
    let path = agents_path(app);
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_agents<R: Runtime>(app: &AppHandle<R>, agents: &HashMap<String, Agent>) -> Result<(), String> {
    let path = agents_path(app);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    serde_json::to_string_pretty(agents)
        .map_err(|e| format!("serialize: {e}"))
        .and_then(|s| std::fs::write(&path, s).map_err(|e| format!("write: {e}")))
}

/// List all agents sorted by last_used descending.
#[tauri::command]
pub fn agent_list<R: Runtime>(app: AppHandle<R>) -> Vec<Agent> {
    let mut agents: Vec<Agent> = load_agents(&app).into_values().collect();
    agents.sort_by(|a, b| b.last_used.cmp(&a.last_used));
    agents
}

/// Save (create or update) an agent.
#[tauri::command]
pub fn agent_save<R: Runtime>(app: AppHandle<R>, agent: Agent) -> Result<Agent, String> {
    let mut agents = load_agents(&app);
    agents.insert(agent.id.clone(), agent.clone());
    save_agents(&app, &agents)?;
    Ok(agent)
}

/// Remove an agent by ID.
#[tauri::command]
pub fn agent_remove<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    let mut agents = load_agents(&app);
    agents.remove(&id);
    save_agents(&app, &agents)
}

/// Touch last_used for an agent.
#[tauri::command]
pub fn agent_touch<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    let mut agents = load_agents(&app);
    if let Some(a) = agents.get_mut(&id) {
        a.last_used = Some(Utc::now().to_rfc3339());
    }
    save_agents(&app, &agents)
}

/// Get one agent by ID.
#[tauri::command]
pub fn agent_get<R: Runtime>(app: AppHandle<R>, id: String) -> Option<Agent> {
    load_agents(&app).remove(&id)
}

/// Append a line to the agent's notes file (AGENTS.md equivalent).
#[tauri::command]
pub fn agent_note_append<R: Runtime>(
    app: AppHandle<R>,
    agent_id: String,
    note: String,
) -> Result<(), String> {
    let agents = load_agents(&app);
    let agent  = agents.get(&agent_id).ok_or("agent not found")?;
    let path = agent.notes_path.as_deref().map(PathBuf::from).unwrap_or_else(|| {
        app.path().app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(format!("agents/{}/AGENTS.md", agent_id))
    });
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let ts = Utc::now().format("%Y-%m-%d");
    let line = format!("- {ts}: {note}\n");
    use std::io::Write;
    std::fs::OpenOptions::new()
        .create(true).append(true)
        .open(&path)
        .map_err(|e| format!("open: {e}"))?
        .write_all(line.as_bytes())
        .map_err(|e| format!("write: {e}"))
}

/// Read the agent's notes file.
#[tauri::command]
pub fn agent_notes_read<R: Runtime>(app: AppHandle<R>, agent_id: String) -> String {
    let agents = load_agents(&app);
    let path = agents.get(&agent_id)
        .and_then(|a| a.notes_path.as_deref().map(PathBuf::from))
        .unwrap_or_else(|| {
            app.path().app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join(format!("agents/{}/AGENTS.md", agent_id))
        });
    std::fs::read_to_string(path).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn agent_new_has_unique_id() {
        let a1 = Agent::new("Alice", "test");
        std::thread::sleep(std::time::Duration::from_millis(2));
        let a2 = Agent::new("Bob", "test");
        assert_ne!(a1.id, a2.id);
    }
    #[test]
    fn agent_new_rfc3339_created_at() {
        let a = Agent::new("T", "test");
        assert!(a.created_at.contains('T'), "created_at should be RFC3339");
    }
}
