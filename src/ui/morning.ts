/**
 * Morning suggestions / constellation — Tazama AI
 *
 * Time-gated suggestion ritual with adjustable cards and floating portraits.
 * Better than HeyClicky's NotchMorningSuggestionsSurface because:
 *   - "Not useful" feedback persists to context-m memory so it never resurfaces
 *   - Time slots shown explicitly (so users know when to expect suggestions)
 *   - Constellation uses our eye mascots instead of cloud portraits
 *   - Cards can be snoozed ("Not now") or dismissed ("Not useful")
 *
 * HeyClicky checks: 6am / 9am / noon / 3pm / 6pm while active.
 * Tazama matches this and also checks after long idle gaps.
 */

import { invoke } from "@tauri-apps/api/core";

export interface Suggestion {
  id:       string;
  text:     string;
  context?: string;  // why this was suggested
}

const CHECK_HOURS = [6, 9, 12, 15, 18];
let lastCheckDate = "";
let checkTimer: ReturnType<typeof setInterval> | null = null;

// ─── Schedule ─────────────────────────────────────────────────────────────────

export function startMorningRitual(onSuggestions: (s: Suggestion[]) => void): void {
  stopMorningRitual();
  checkTimer = setInterval(() => {
    const now = new Date();
    const dateKey = now.toDateString();
    const hour = now.getHours();

    if (dateKey === lastCheckDate) return; // already checked today
    if (!CHECK_HOURS.includes(hour)) return;

    lastCheckDate = dateKey;
    generateSuggestions().then(s => {
      if (s.length > 0) onSuggestions(s);
    });
  }, 60_000); // check every minute

  // Also check immediately
  generateSuggestions().then(s => {
    if (s.length > 0) onSuggestions(s);
  });
}

export function stopMorningRitual(): void {
  if (checkTimer) { clearInterval(checkTimer); checkTimer = null; }
}

async function generateSuggestions(): Promise<Suggestion[]> {
  // Recall recent memory to personalise suggestions
  try {
    const memory = await invoke<string>("memory_recall", { n: 6 });
    const hour = new Date().getHours();
    const timeCtx = hour < 10 ? "morning" : hour < 14 ? "midday" : "afternoon";

    // Generate via AI using recalled context
    const prompt = `You are Tazama AI's morning-ritual system. Based on this memory context:\n${memory}\n\nGenerate exactly 3 short (≤8 words each), specific, actionable ${timeCtx} suggestions for the user. Return as JSON array: [{"id":"1","text":"...","context":"..."}]`;
    const raw = await invoke<string>("chat_complete", {
      provider: "anthropic",
      model: "claude-haiku-4-5",
      messages: [{ role: "user", content: prompt }],
    });

    const match = raw.match(/\[[\s\S]*?\]/);
    if (match) {
      return JSON.parse(match[0]) as Suggestion[];
    }
  } catch { /* fall through to defaults */ }

  // Sensible defaults
  const hour = new Date().getHours();
  const defaults: Suggestion[][] = [
    [{ id: "d1", text: "What's on my screen right now?", context: "Morning check-in" },
     { id: "d2", text: "Summarise my last session",       context: "Daily review" },
     { id: "d3", text: "Any emails I should reply to?",   context: "Inbox triage" }],
    [{ id: "d4", text: "What am I working on?",       context: "Midday focus" },
     { id: "d5", text: "Take a screenshot for notes", context: "Documentation" },
     { id: "d6", text: "Run a quick code review",     context: "Quality check" }],
    [{ id: "d7", text: "Wrap up open tasks",          context: "End of day" },
     { id: "d8", text: "Draft tomorrow's priorities", context: "Planning" },
     { id: "d9", text: "What did I accomplish today?",context: "Reflection" }],
  ];
  return defaults[hour < 10 ? 0 : hour < 15 ? 1 : 2];
}

// ─── Suggestion card UI ───────────────────────────────────────────────────────

export function buildSuggestionCard(
  s: Suggestion,
  onAccept: (s: Suggestion) => void,
  onDismiss: (id: string, useful: boolean) => void
): HTMLElement {
  const card = document.createElement("div");
  card.className = "suggestion-card card";
  card.id = `suggestion-${s.id}`;

  const text = document.createElement("p");
  text.className = "suggestion-text";
  text.textContent = s.text;

  if (s.context) {
    const ctx = document.createElement("span");
    ctx.className = "suggestion-context";
    ctx.textContent = s.context;
    card.append(ctx);
  }

  const actions = document.createElement("div");
  actions.className = "suggestion-actions";

  const acceptBtn = document.createElement("button");
  acceptBtn.className = "gel suggestion-accept";
  acceptBtn.textContent = "Ask Tazama";
  acceptBtn.addEventListener("click", () => {
    card.classList.add("card-exit");
    card.addEventListener("animationend", () => card.remove(), { once: true });
    onAccept(s);
  });

  const snoozeBtn = document.createElement("button");
  snoozeBtn.className = "suggestion-snooze";
  snoozeBtn.textContent = "Not now";
  snoozeBtn.setAttribute("aria-label", "Snooze this suggestion");
  snoozeBtn.addEventListener("click", () => {
    card.classList.add("card-exit");
    card.addEventListener("animationend", () => card.remove(), { once: true });
    onDismiss(s.id, true); // snooze = still useful
  });

  const uselessBtn = document.createElement("button");
  uselessBtn.className = "suggestion-useless";
  uselessBtn.textContent = "Not useful";
  uselessBtn.setAttribute("aria-label", "Mark as not useful");
  uselessBtn.addEventListener("click", async () => {
    card.classList.add("card-exit");
    card.addEventListener("animationend", () => card.remove(), { once: true });
    onDismiss(s.id, false);
    // Persist to memory so this suggestion type is deprioritised
    try {
      await invoke("memory_add", {
        content: `User marked suggestion as not useful: "${s.text}". Do not suggest similar tasks.`,
      });
    } catch { /* non-critical */ }
  });

  actions.append(acceptBtn, snoozeBtn, uselessBtn);
  card.append(text, actions);
  return card;
}

// ─── Floating mascot constellation ────────────────────────────────────────────
// Mirrors MorningClickyConstellation — eye mascots floating with tilt/delay/duration
// Better: freezes on first hover hover per HeyClicky spec

import { buildMascot } from "./mascot.js";

export function buildConstellation(count = 3): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "constellation";

  const sizes = [56, 72, 48];
  const tilts  = [-3, 2, -2];

  for (let i = 0; i < count; i++) {
    const eye = buildMascot(sizes[i] ?? 56);
    const delay = (i * 0.4).toFixed(1);
    const dur   = (4.5 + Math.random() * 2).toFixed(1);
    const tilt  = tilts[i] ?? 0;
    eye.style.setProperty("--float-delay",    `${delay}s`);
    eye.style.setProperty("--float-duration", `${dur}s`);
    eye.style.setProperty("--float-tilt",     `${tilt}deg`);
    eye.classList.add("constellation-portrait", "ambient-only");

    // Freeze after first completed hover (HeyClicky __hasStoppedFloatingAfterFirstCompletedHover)
    let hovered = false;
    eye.addEventListener("mouseenter", () => { hovered = true; });
    eye.addEventListener("mouseleave", () => {
      if (hovered) {
        eye.classList.remove("ambient-only");
        eye.style.animation = "none";
      }
    });

    wrap.append(eye);
  }
  return wrap;
}
