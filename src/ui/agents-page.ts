/**
 * Agents page — Tazama AI
 *
 * Each rail page renders its own surface (fixes: agents/skills/memory
 * all rendering the suggestions view).
 *
 * Lists persistent agents (agents.rs), creates new ones, activates one
 * for the conversation (stores active id + touches last_used), deletes,
 * and shows/extends per-agent notes (AGENTS.md equivalent).
 */

import { invoke } from "@tauri-apps/api/core";
import { playSoundCue } from "./sound-bus.js";

interface Agent {
  id:           string;
  name:         string;
  description:  string;
  system_prompt: string;
  accent:       string | null;
  skills:       string[];
  created_at:   string;
  last_used:    string | null;
  notes_path:   string | null;
}

const ACTIVE_KEY = "tazama-active-agent";

export function getActiveAgentId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export async function renderAgentsPage(container: HTMLElement): Promise<void> {
  container.innerHTML = "";
  container.className = "agents-page";

  const header = document.createElement("div");
  header.className = "page-header";

  const title = document.createElement("h2");
  title.className = "page-title";
  title.textContent = "Agents";

  const sub = document.createElement("p");
  sub.className = "page-sub";
  sub.textContent = "Persistent personas with their own memory. Pick one to talk to.";

  header.append(title, sub);
  container.append(header);

  const list = document.createElement("div");
  list.className = "agents-list";
  container.append(list);

  // New-agent form
  container.append(buildCreateForm(list));

  await refreshAgentsList(list);
}

async function refreshAgentsList(list: HTMLElement): Promise<void> {
  list.innerHTML = "";
  let agents: Agent[] = [];
  try {
    agents = await invoke<Agent[]>("agent_list");
  } catch {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "Could not load agents.";
    list.append(empty);
    return;
  }

  if (agents.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "No agents yet. Create your first one below.";
    list.append(empty);
    return;
  }

  const activeId = getActiveAgentId();
  agents.forEach(a => list.append(buildAgentCard(a, activeId, list)));
}

function buildAgentCard(a: Agent, activeId: string | null, list: HTMLElement): HTMLElement {
  const card = document.createElement("div");
  card.className = "agent-card card" + (a.id === activeId ? " is-active" : "");
  if (a.accent) card.style.setProperty("--agent-accent", a.accent);

  const top = document.createElement("div");
  top.className = "agent-card-top";

  const dot = document.createElement("span");
  dot.className = "agent-dot";
  dot.style.background = a.accent ?? "var(--accent)";

  const name = document.createElement("strong");
  name.textContent = a.name;

  if (a.id === activeId) {
    const badge = document.createElement("span");
    badge.className = "pill agent-active-badge";
    badge.textContent = "Active";
    top.append(dot, name, badge);
  } else {
    top.append(dot, name);
  }

  const desc = document.createElement("p");
  desc.className = "agent-desc";
  desc.textContent = a.description || "No description.";

  const meta = document.createElement("p");
  meta.className = "agent-meta";
  const skillCount = a.skills?.length ?? 0;
  const lastUsed = a.last_used ? `Last used ${formatDate(a.last_used)}` : "Never used";
  meta.textContent = `${skillCount} skill${skillCount === 1 ? "" : "s"} · ${lastUsed}`;

  const actions = document.createElement("div");
  actions.className = "agent-actions";

  if (a.id !== activeId) {
    const useBtn = document.createElement("button");
    useBtn.className = "gel agent-use-btn";
    useBtn.textContent = "Talk to";
    useBtn.addEventListener("click", async () => {
      localStorage.setItem(ACTIVE_KEY, a.id);
      try { await invoke("agent_touch", { id: a.id }); } catch { /* ignore */ }
      playSoundCue("skill-up");
      await refreshAgentsList(list);
    });
    actions.append(useBtn);
  }

  const notesBtn = document.createElement("button");
  notesBtn.className = "agent-notes-btn";
  notesBtn.textContent = "Notes";
  notesBtn.addEventListener("click", async () => {
    await toggleNotes(card, a);
  });
  actions.append(notesBtn);

  const delBtn = document.createElement("button");
  delBtn.className = "agent-del-btn";
  delBtn.textContent = "Delete";
  delBtn.setAttribute("aria-label", `Delete ${a.name}`);
  delBtn.addEventListener("click", async () => {
    if (a.id === getActiveAgentId()) localStorage.removeItem(ACTIVE_KEY);
    try { await invoke("agent_remove", { id: a.id }); } catch { /* ignore */ }
    await refreshAgentsList(list);
  });
  actions.append(delBtn);

  card.append(top, desc, meta, actions);
  return card;
}

async function toggleNotes(card: HTMLElement, a: Agent): Promise<void> {
  const existing = card.querySelector(".agent-notes");
  if (existing) { existing.remove(); return; }

  const wrap = document.createElement("div");
  wrap.className = "agent-notes";

  let notes = "";
  try { notes = await invoke<string>("agent_notes_read", { agent_id: a.id }); } catch { /* ignore */ }

  const pre = document.createElement("pre");
  pre.className = "agent-notes-pre";
  pre.textContent = notes.trim() || "No notes yet.";

  const row = document.createElement("div");
  row.className = "agent-notes-row";

  const input = document.createElement("input");
  input.className = "agent-notes-input";
  input.placeholder = "Add a note…";
  input.setAttribute("aria-label", `Add note to ${a.name}`);

  const addBtn = document.createElement("button");
  addBtn.className = "gel agent-notes-add";
  addBtn.textContent = "Add";
  const submit = async () => {
    const text = input.value.trim();
    if (!text) return;
    try {
      await invoke("agent_note_append", { agent_id: a.id, note: text });
      const updated = await invoke<string>("agent_notes_read", { agent_id: a.id });
      pre.textContent = updated.trim();
      input.value = "";
    } catch { /* ignore */ }
  };
  addBtn.addEventListener("click", submit);
  input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });

  row.append(input, addBtn);
  wrap.append(pre, row);
  card.append(wrap);
}

function buildCreateForm(list: HTMLElement): HTMLElement {
  const form = document.createElement("div");
  form.className = "agent-create card";

  const title = document.createElement("h3");
  title.textContent = "New agent";
  form.append(title);

  const nameInput = document.createElement("input");
  nameInput.className = "agent-create-input";
  nameInput.placeholder = "Name (e.g. Code Buddy)";
  nameInput.setAttribute("aria-label", "Agent name");

  const descInput = document.createElement("input");
  descInput.className = "agent-create-input";
  descInput.placeholder = "One-line description";
  descInput.setAttribute("aria-label", "Agent description");

  const promptInput = document.createElement("textarea");
  promptInput.className = "agent-create-input";
  promptInput.placeholder = "System prompt (optional)";
  promptInput.rows = 2;
  promptInput.setAttribute("aria-label", "Agent system prompt");

  const createBtn = document.createElement("button");
  createBtn.className = "gel agent-create-btn";
  createBtn.textContent = "Create agent";
  createBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const agent: Agent = {
      id: `agent-${Date.now()}`,
      name,
      description: descInput.value.trim(),
      system_prompt: promptInput.value.trim(),
      accent: null,
      skills: [],
      created_at: now,
      last_used: null,
      notes_path: null,
    };
    try {
      await invoke("agent_save", { agent });
      playSoundCue("skill-up");
      nameInput.value = "";
      descInput.value = "";
      promptInput.value = "";
      await refreshAgentsList(list);
    } catch { /* ignore */ }
  });

  form.append(nameInput, descInput, promptInput, createBtn);
  return form;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    return `${days} days ago`;
  } catch {
    return iso;
  }
}
