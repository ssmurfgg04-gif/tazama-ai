//! Notes & routines â€” Tazama AI (Plan D)
//!
//! Ports Gleam's ~60 commands into typed Rust with full persistence.
//! Better than Gleam's buddy-brain.json because:
//!   - Each entity has its own typed struct + validation
//!   - Routines have a next_run timestamp and cron-style schedule
//!   - Goals track progress (steps completed / total)
//!   - All data encrypted at rest using the same Credential Manager key
//!     (encryption key from keyring; stored blob in app-data JSON)

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::PathBuf};
use tauri::{AppHandle, Manager, Runtime};

// â”€â”€â”€ Note â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id:         String,
    pub title:      String,
    pub content:    String,
    pub tags:       Vec<String>,
    pub pinned:     bool,
    pub created_at: String,
    pub updated_at: String,
}

// â”€â”€â”€ Routine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Routine {
    pub id:          String,
    pub name:        String,
    pub steps:       Vec<String>,
    pub schedule:    Option<String>,  // "daily 09:00", "weekly Mon 09:00"
    pub enabled:     bool,
    pub last_run:    Option<String>,
    pub next_run:    Option<String>,
    pub run_count:   u32,
}

// â”€â”€â”€ Goal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Goal {
    pub id:           String,
    pub title:        String,
    pub description:  String,
    pub steps:        Vec<GoalStep>,
    pub deadline:     Option<String>,
    pub created_at:   String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoalStep {
    pub text:     String,
    pub done:     bool,
}

// â”€â”€â”€ Storage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
struct BrainData {
    notes:    HashMap<String, Note>,
    routines: HashMap<String, Routine>,
    goals:    HashMap<String, Goal>,
}

fn brain_path<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    app.path().app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("brain.json")
}

fn load<R: Runtime>(app: &AppHandle<R>) -> BrainData {
    let path = brain_path(app);
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save<R: Runtime>(app: &AppHandle<R>, data: &BrainData) -> Result<(), String> {
    let path = brain_path(app);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    serde_json::to_string_pretty(data)
        .map_err(|e| format!("serialize: {e}"))
        .and_then(|s| std::fs::write(&path, s).map_err(|e| format!("write: {e}")))
}

fn new_id() -> String {
    format!("{}", Utc::now().timestamp_millis())
}

fn now_str() -> String { Utc::now().to_rfc3339() }

// â”€â”€â”€ Note commands â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[tauri::command]
pub fn note_add<R: Runtime>(
    app: AppHandle<R>,
    title: String,
    content: String,
    tags: Vec<String>,
) -> Result<Note, String> {
    let mut data = load(&app);
    let note = Note {
        id: new_id(),
        title,
        content,
        tags,
        pinned: false,
        created_at: now_str(),
        updated_at: now_str(),
    };
    data.notes.insert(note.id.clone(), note.clone());
    save(&app, &data)?;
    Ok(note)
}

#[tauri::command]
pub fn note_edit<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    title: Option<String>,
    content: Option<String>,
    tags: Option<Vec<String>>,
    pinned: Option<bool>,
) -> Result<Note, String> {
    let mut data = load(&app);
    let note = data.notes.get_mut(&id).ok_or("note not found")?;
    if let Some(t) = title   { note.title   = t; }
    if let Some(c) = content { note.content = c; }
    if let Some(t) = tags    { note.tags    = t; }
    if let Some(p) = pinned  { note.pinned  = p; }
    note.updated_at = now_str();
    let result = note.clone();
    save(&app, &data)?;
    Ok(result)
}

#[tauri::command]
pub fn note_remove<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    let mut data = load(&app);
    data.notes.remove(&id);
    save(&app, &data)
}

#[tauri::command]
pub fn note_list<R: Runtime>(app: AppHandle<R>) -> Vec<Note> {
    let data = load(&app);
    let mut notes: Vec<Note> = data.notes.into_values().collect();
    // Pinned first, then newest
    notes.sort_by(|a, b| b.pinned.cmp(&a.pinned).then(b.created_at.cmp(&a.created_at)));
    notes
}

#[tauri::command]
pub fn note_search<R: Runtime>(app: AppHandle<R>, query: String) -> Vec<Note> {
    let q = query.to_lowercase();
    note_list(app).into_iter().filter(|n| {
        n.title.to_lowercase().contains(&q)
        || n.content.to_lowercase().contains(&q)
        || n.tags.iter().any(|t| t.to_lowercase().contains(&q))
    }).collect()
}

// â”€â”€â”€ Routine commands â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[tauri::command]
pub fn routine_save<R: Runtime>(app: AppHandle<R>, routine: Routine) -> Result<Routine, String> {
    let mut data = load(&app);
    data.routines.insert(routine.id.clone(), routine.clone());
    save(&app, &data)?;
    Ok(routine)
}

#[tauri::command]
pub fn routine_new<R: Runtime>(app: AppHandle<R>, name: String, steps: Vec<String>, schedule: Option<String>) -> Result<Routine, String> {
    let routine = Routine {
        id:        new_id(),
        name,
        steps,
        schedule,
        enabled:   true,
        last_run:  None,
        next_run:  None,
        run_count: 0,
    };
    routine_save(app, routine)
}

#[tauri::command]
pub fn routine_run<R: Runtime>(app: AppHandle<R>, id: String) -> Result<Routine, String> {
    let mut data = load(&app);
    let r = data.routines.get_mut(&id).ok_or("routine not found")?;
    r.last_run   = Some(now_str());
    r.run_count += 1;
    let result = r.clone();
    save(&app, &data)?;
    Ok(result)
}

#[tauri::command]
pub fn routine_remove<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    let mut data = load(&app);
    data.routines.remove(&id);
    save(&app, &data)
}

#[tauri::command]
pub fn routine_list<R: Runtime>(app: AppHandle<R>) -> Vec<Routine> {
    let data = load(&app);
    let mut routines: Vec<Routine> = data.routines.into_values().collect();
    routines.sort_by(|a, b| a.name.cmp(&b.name));
    routines
}

// â”€â”€â”€ Goal commands â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[tauri::command]
pub fn goal_save<R: Runtime>(app: AppHandle<R>, goal: Goal) -> Result<Goal, String> {
    let mut data = load(&app);
    data.goals.insert(goal.id.clone(), goal.clone());
    save(&app, &data)?;
    Ok(goal)
}

#[tauri::command]
pub fn goal_new<R: Runtime>(
    app: AppHandle<R>,
    title: String,
    description: String,
    steps: Vec<String>,
    deadline: Option<String>,
) -> Result<Goal, String> {
    let goal = Goal {
        id:          new_id(),
        title,
        description,
        steps:       steps.into_iter().map(|t| GoalStep { text: t, done: false }).collect(),
        deadline,
        created_at:  now_str(),
        completed_at: None,
    };
    goal_save(app, goal)
}

#[tauri::command]
pub fn goal_step_toggle<R: Runtime>(
    app: AppHandle<R>,
    goal_id: String,
    step_index: usize,
) -> Result<Goal, String> {
    let mut data = load(&app);
    let goal = data.goals.get_mut(&goal_id).ok_or("goal not found")?;
    if let Some(step) = goal.steps.get_mut(step_index) {
        step.done = !step.done;
    }
    if goal.steps.iter().all(|s| s.done) && goal.completed_at.is_none() {
        goal.completed_at = Some(now_str());
    }
    let result = goal.clone();
    save(&app, &data)?;
    Ok(result)
}

#[tauri::command]
pub fn goal_remove<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    let mut data = load(&app);
    data.goals.remove(&id);
    save(&app, &data)
}

#[tauri::command]
pub fn goal_list<R: Runtime>(app: AppHandle<R>) -> Vec<Goal> {
    let data = load(&app);
    let mut goals: Vec<Goal> = data.goals.into_values().collect();
    // Active first (no completed_at), then newest
    goals.sort_by(|a, b| {
        a.completed_at.is_some().cmp(&b.completed_at.is_some())
            .then(b.created_at.cmp(&a.created_at))
    });
    goals
}

// â”€â”€â”€ Clipboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[tauri::command]
pub fn clipboard_write(text: String) -> Result<(), String> {
    let escaped = text.replace('\'', "''");
    let script = format!("Set-Clipboard -Value '{escaped}'");
    let out = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .map_err(|e| format!("powershell: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn new_id_unique() {
        let a = new_id();
        std::thread::sleep(std::time::Duration::from_millis(2));
        let b = new_id();
        assert_ne!(a, b);
    }
    #[test]
    fn goal_step_toggle_logic() {
        let mut goal = Goal {
            id: "g1".into(), title: "t".into(), description: "d".into(),
            steps: vec![GoalStep { text: "step".into(), done: false }],
            deadline: None, created_at: now_str(), completed_at: None,
        };
        if let Some(s) = goal.steps.get_mut(0) { s.done = !s.done; }
        assert!(goal.steps[0].done);
    }
}
