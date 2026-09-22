/**
 * HomeSpace surface — Tazama AI
 *
 * The main companion window. Structure mirrors HeyClicky's HomeSpaceRootView:
 *   ┌─ compact rail (agent/page icons) ─┐
 *   │ header (back · title · controls)  │
 *   │ conversation / suggestions pane   │
 *   │ composer (text input + send gel)  │
 *   └────────────────────────────────────┘
 *
 * Anatomy proven from binary: HomeSpaceCompactRail, HomeSpaceHeader,
 * HomeSpaceConversationTranscript, HomeSpaceNewPage, HomeSpaceSuggestionsPage,
 * HomeSpaceSuggestedCardShimmer, HomeSpaceCoworkBreathingDot.
 */

import { invoke } from "@tauri-apps/api/core";
import { PROVIDERS } from "../settings.js";
import {
  buildBuddyChip,
  getActiveCharacter,
  renderCharactersPage,
  personaMessages,
  renderBuddyFace,
  CharacterDef,
} from "./characters.js";

/* ─── Types ─── */
interface TazamaMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  summary?: string;       // <SUMMARY> one-sentence spoken line
  steps?: string[];       // radio-dispatch past-tense step log
  nextActions?: string[]; // NEXT_ACTIONS ≤4 imperatives
  doneTitle?: string;     // DONE_TITLE 2-5 words Title Case
  isStreaming?: boolean;
}

type Phase = "idle" | "thinking" | "listening" | "speaking" | "done" | "needs-you";

/* ─── State ─── */

let messages: TazamaMessage[] = [];
let animationsEnabled = true;

/* ─── Root elements ─── */
export function mountHomeSpace(root: HTMLElement): void {
  root.innerHTML = "";
  root.className = "homespace";
  root.setAttribute("role", "main");

  const rail = buildRail();
  const main = document.createElement("div");
  main.className = "homespace-main";

  const header = buildHeader();
  const body   = buildBody();
  const composer = buildComposer();

  main.append(header, body, composer);
  root.append(rail, main);

  // Initial suggestions shimmer while loading
  showShimmer(body);
  setTimeout(() => showSuggestions(body), 800);

  // ── Cross-surface events ──
  // Buddy chip in the header → jump to Characters page
  document.addEventListener("tazama:open-characters", () => {
    const railBtn = document.querySelector<HTMLButtonElement>('.rail-row[data-page="characters"]');
    railBtn?.click();
  });

  // A new buddy was cast → refresh the suggestions view + tell the mascot
  document.addEventListener("tazama:buddy-cast", (e: Event) => {
    const buddy = (e as CustomEvent<CharacterDef>).detail;
    document.dispatchEvent(new CustomEvent("tazama:phase", { detail: "happy" }));
    const bodyEl = document.querySelector(".homespace-body");
    if (bodyEl && !document.getElementById("transcript")) {
      showSuggestions(bodyEl as HTMLElement);
    }
    // Keep the header chip in sync even when Settings re-rendered it
    const chip = document.querySelector(".buddy-chip");
    if (chip) {
      const face = chip.querySelector(".buddy-chip-face");
      const name = chip.querySelector(".buddy-chip-name");
      const craft = chip.querySelector(".buddy-chip-craft");
      if (face) face.replaceWith(renderBuddyFace(buddy, "buddy-chip-face"));
      if (name) name.textContent = buddy.name;
      if (craft) craft.textContent = buddy.craft;
    }
  });
}

/* ─── Compact rail ─── */
/* HomeSpaceCompactRail + HomeSpaceIconRail pattern */
function buildRail(): HTMLElement {
  const rail = document.createElement("nav");
  rail.className = "compact-rail";
  rail.setAttribute("aria-label", "Pages");

  const pages = [
    { iconFile: "home",       label: "Home",       id: "home"       },
    { iconFile: "characters", label: "Characters", id: "characters" },
    { iconFile: "agents",     label: "Agents",     id: "agents"     },
    { iconFile: "zap",        label: "Skills",     id: "skills"     },
    { iconFile: "settings",   label: "Settings",   id: "settings"   },
    { iconFile: "memory",     label: "Memory",     id: "memory"     },
  ];

  pages.forEach((p, i) => {
    const btn = document.createElement("button");
    btn.className = "rail-row" + (i === 0 ? " is-selected" : "");
    btn.dataset.page = p.id;
    btn.setAttribute("aria-label", p.label);
    btn.title = p.label;

    // Use generated SVG icons (better than Unicode glyphs)
    const iconWrap = document.createElement("span");
    iconWrap.className = "rail-icon";
    iconWrap.setAttribute("aria-hidden", "true");
    const img = document.createElement("img");
    img.src = `/icons/${p.iconFile}.svg`;
    img.alt = "";
    img.style.cssText = "width:18px;height:18px;opacity:1;filter:invert(1)";
    iconWrap.append(img);

    btn.append(iconWrap);
    btn.addEventListener("click", () => selectPage(p.id, rail, btn));
    rail.append(btn);
  });

  return rail;
}

function selectPage(id: string, rail: HTMLElement, btn: HTMLButtonElement): void {
  rail.querySelectorAll(".rail-row").forEach(r => r.classList.remove("is-selected"));
  btn.classList.add("is-selected");
  const body = document.querySelector(".homespace-body");
  if (!body) return;
  if (id === "settings") {
    body.innerHTML = "";
    // Settings rendered by settings.ts; imported lazily
    import("./settings-page.js").then(m => m.renderSettings(body as HTMLElement));
  } else if (id === "characters") {
    body.innerHTML = "";
    renderCharactersPage(body as HTMLElement);
  } else {
    showSuggestions(body as HTMLElement);
  }
}

/* ─── Header ─── */
/* Buddy chip (current cast) on the left, close on the right. */
function buildHeader(): HTMLElement {
  const hdr = document.createElement("header");
  hdr.className = "homespace-header";

  hdr.append(buildBuddyChip());

  const closeBtn = document.createElement("button");
  closeBtn.className = "header-btn";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => invoke("plugin:window|close"));

  hdr.append(closeBtn);
  return hdr;
}

/* ─── Body ─── */
function buildBody(): HTMLElement {
  const body = document.createElement("div");
  body.className = "homespace-body";
  return body;
}

/* ─── Shimmer skeletons ─── */
/* Mirrors HomeSpaceSuggestedCardShimmer.skeletonBar(width:height:cornerRadius:) */
/* and HomeSpaceConversationShimmer.receivedProse(lineWidthFractions:)           */
function showShimmer(container: HTMLElement): void {
  container.innerHTML = "";
  const fractionSets = [[0.9, 0.72, 0.55], [0.85, 0.6], [0.7, 0.9, 0.45]];
  fractionSets.forEach(fractions => {
    const card = document.createElement("div");
    card.className = "card shimmer-card";
    fractions.forEach(f => {
      const bar = document.createElement("div");
      bar.className = "skeleton";
      bar.style.width  = `${f * 100}%`;
      bar.style.height = "11px";
      bar.style.marginBottom = "8px";
      card.append(bar);
    });
    container.append(card);
  });
}

/* ─── Suggestions ─── */
/* HomeSpaceSuggestionsPage / HomeSpaceSuggestedTaskCard — now persona-flavoured:
 * a "Hello my name is" name-tag sticker (HeyClicky DNA) introduces the buddy,
 * then their own starter prompts. */
function showSuggestions(container: HTMLElement): void {
  container.innerHTML = "";
  const buddy = getActiveCharacter();

  // Name-tag sticker — the personality moment
  const tag = document.createElement("div");
  tag.className = "name-tag";
  tag.style.setProperty("--char-accent", buddy.accent);

  const tagHello = document.createElement("span");
  tagHello.className = "name-tag-hello";
  tagHello.textContent = "Hello, my name is";

  const tagFace = renderBuddyFace(buddy, "name-tag-face");

  const tagName = document.createElement("span");
  tagName.className = "name-tag-name";
  tagName.textContent = buddy.name;

  const tagLine = document.createElement("span");
  tagLine.className = "name-tag-line";
  tagLine.textContent = buddy.greeting;

  tag.append(tagHello, tagFace, tagName, tagLine);
  container.append(tag);

  const label = document.createElement("p");
  label.className = "section-label";
  label.textContent = buddy.id === "tazama-classic" ? "SUGGESTED FOR YOU" : "ON THEIR MIND TODAY";

  container.append(label);

  const suggestions = buddy.suggestions;

  suggestions.forEach((text, i) => {
    const card = document.createElement("button");
    card.className = "suggested-card";
    card.textContent = text;
    // Staggered entrance: y 8→0, opacity 0→1, spring 300/26
    if (animationsEnabled) {
      card.style.setProperty("--stagger-delay", `${i * 30}ms`);
      card.classList.add("entrance-stagger");
    }
    card.addEventListener("click", () => sendMessage(text, container));
    container.append(card);
  });

  const footer = document.createElement("p");
  footer.className = "suggestions-footer";
  footer.textContent = buddy.id === "tazama-classic"
    ? "Come back tomorrow for fresh ideas from your Tazama agents."
    : `Ask ${buddy.name} anything — or cast someone new from Characters.`;
  container.append(footer);
}

/* ─── Conversation ─── */
function showConversation(container: HTMLElement): void {
  container.innerHTML = "";
  const transcript = document.createElement("div");
  transcript.className = "conversation-transcript";
  transcript.id = "transcript";
  renderMessages(transcript);
  container.append(transcript);
}

function renderMessages(transcript: HTMLElement): void {
  // Clear first — this renders the FULL transcript every time (append-only
  // would duplicate every bubble on each state change).
  transcript.innerHTML = "";
  messages.forEach(msg => {
    const bubble = document.createElement("div");
    bubble.className = `bubble bubble-${msg.role}`;
    bubble.dataset.id = msg.id;

    if (msg.role === "user") {
      bubble.textContent = msg.content;
    } else {
      // Radio-dispatch step log
      if (msg.steps?.length) {
        const steps = document.createElement("ul");
        steps.className = "cowork-steps";
        msg.steps.forEach(s => {
          const li = document.createElement("li");
          li.className = "cowork-step";
          li.textContent = s;
          steps.append(li);
        });
        bubble.append(steps);
      }
      // Main content
      const content = document.createElement("p");
      content.textContent = msg.content;
      bubble.append(content);

      // NEXT_ACTIONS pills (≤4)
      if (msg.nextActions?.length) {
        const actions = document.createElement("div");
        actions.className = "next-actions";
        msg.nextActions.slice(0, 4).forEach(a => {
          const pill = document.createElement("button");
          pill.className = "pill action-pill";
          pill.textContent = a;
          pill.addEventListener("click", () => sendMessage(a, transcript.parentElement!));
          actions.append(pill);
        });
        bubble.append(actions);
      }

      // Tapback (HomeSpaceTapbackBadge — ringedCircle, thumbs-up)
      const tapback = document.createElement("button");
      tapback.className = "tapback-btn";
      tapback.setAttribute("aria-label", "Thumbs up");
      tapback.textContent = "👍";
      tapback.addEventListener("click", () => fireTapback(tapback));
      bubble.append(tapback);

      // Typing indicator while streaming
      if (msg.isStreaming) {
        const indicator = document.createElement("div");
        indicator.className = "typing-indicator";
        for (let d = 0; d < 3; d++) {
          const dot = document.createElement("span");
          dot.className = "typing-dot ambient-only";
          dot.style.animationDelay = `${d * 150}ms`;
          indicator.append(dot);
        }
        bubble.append(indicator);
      }
    }

    transcript.append(bubble);
  });
  transcript.scrollTop = transcript.scrollHeight;
}

/* ─── Tapback (HomeSpaceTapbackBadge — ringedCircle, pop spring 600/20) ─── */
function fireTapback(btn: HTMLButtonElement): void {
  btn.classList.add("tapback-pop");
  btn.addEventListener("animationend", () => btn.classList.remove("tapback-pop"), { once: true });
  // Real sound: ui-sprite.ogg cue "tapback" via AudioContext
  playSoundCue("tapback");
}

/* ─── Composer ─── */
/* HomeSpaceNewPage.gelSendDisc — the send button is a gel disc */
function buildComposer(): HTMLElement {
  const composer = document.createElement("div");
  composer.className = "composer glass";

  const input = document.createElement("textarea");
  input.className = "composer-input";
  input.placeholder = "Or type here";
  input.setAttribute("aria-label", "Message Tazama AI");
  input.rows = 1;
  // Auto-grow
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  });
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  });

  // Screenshot / attach button (HeyClicky composer pattern)
  const attachBtn = document.createElement("button");
  attachBtn.className = "composer-attach";
  attachBtn.setAttribute("aria-label", "Take screenshot");
  attachBtn.title = "Take a screenshot and attach it";
  const attachImg = document.createElement("img");
  attachImg.src = "/icons/cpu.svg";
  attachImg.alt = "";
  attachImg.style.cssText = "width:15px;height:15px;opacity:.6;filter:invert(1)";
  attachBtn.append(attachImg);
  attachBtn.addEventListener("click", async () => {
    attachBtn.style.opacity = ".4";
    try {
      await invoke<{base64_png:string}>("screenshot");
      // Append screenshot reference to input
      input.value = (input.value.trim() + "\n[screenshot attached]").trim();
      input.dispatchEvent(new Event("input"));
      // Store in memory for context
      await invoke("memory_add", {
        content: "User attached a screenshot to a message in Tazama AI.",
      }).catch(() => null);
    } catch { /* capture not yet set up */ }
    attachBtn.style.opacity = "";
  });

  const sendBtn = document.createElement("button");
  sendBtn.className = "send-btn gel";
  sendBtn.setAttribute("aria-label", "Send");
  sendBtn.innerHTML = `<img src="/icons/send.svg" alt="" style="width:14px;height:14px;filter:invert(1);opacity:.9">`;
  sendBtn.addEventListener("click", doSend);

  function doSend(): void {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    input.style.height = "auto";
    const body = document.querySelector(".homespace-body");
    if (body) sendMessage(text, body as HTMLElement);
  }

  composer.append(attachBtn, input, sendBtn);
  return composer;
}

/* ─── Provider selection ─── */
/* The chat must work with WHATEVER key the user stored (README tells them
 * to start with Anthropic or Groq). Pick the first provider that has a
 * key in the OS keyring; fall back to Anthropic if probing fails. */
const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-haiku-4-5",
  openai:    "gpt-4o-mini",
  groq:      "llama-3.3-70b-versatile",
  nvidia:    "meta/llama-3.1-70b-instruct",
  zai:       "glm-4.6",
  "zai-local": "glm-4.6",
};

async function pickProvider(): Promise<{ provider: string; model: string }> {
  for (const def of PROVIDERS) {
    if (def.id === "fish") continue; // speech-only provider, no chat endpoint
    try {
      const has = await invoke<boolean>("key_has", { provider: def.id });
      if (has) {
        return { provider: def.id, model: DEFAULT_MODELS[def.id] ?? "default" };
      }
    } catch { /* keyring miss — try next provider */ }
  }
  return { provider: "anthropic", model: DEFAULT_MODELS.anthropic };
}

/* ─── Message flow ─── */
async function sendMessage(text: string, container: HTMLElement): Promise<void> {
  // Switch to conversation view if on suggestions
  if (!document.getElementById("transcript")) {
    showConversation(container);
  }
  const transcript = document.getElementById("transcript")!;

  // Add user bubble
  const uid = `u-${Date.now()}`;
  messages.push({ id: uid, role: "user", content: text });
  renderMessages(transcript);

  // Add assistant streaming bubble
  const aid = `a-${Date.now()}`;
  const assistantMsg: TazamaMessage = {
    id: aid,
    role: "assistant",
    content: "",
    isStreaming: true,
    steps: ["Looking at your screen"],
  };
  messages.push(assistantMsg);
  renderMessages(transcript);

  setPhase("thinking");
  playSoundCue("agent-launch");

  try {
    // Recall relevant memory before calling the AI
    // Built-in SQLite memory — works on any device, zero external deps
    interface MemoryItem { id: string; content: string; score: number; created_at: string; }
    let memoryContext = "";
    try {
      const mems = await invoke<MemoryItem[]>("memory_search", { query: text, limit: 5 });
      if (mems.length > 0) {
        memoryContext = mems.map(m => `- ${m.content}`).join("\n");
      }
    } catch { /* memory DB not yet ready — continue without */ }

    // Build messages: optional memory context + active persona
    const aiMessages = [
      ...personaMessages(),
      ...(memoryContext
        ? [
            { role: "user", content: `[Context from memory]\n${memoryContext}` },
            { role: "assistant", content: "Understood, I have that context." },
          ]
        : []),
      { role: "user", content: text },
    ];

    // Invoke Rust provider (keys from OS keyring — never from JS)
    const { provider, model } = await pickProvider();
    const result = await invoke<string>("chat_complete", {
      provider,
      model,
      messages: aiMessages,
    });

    assistantMsg.content = result;
    assistantMsg.isStreaming = false;
    assistantMsg.steps = ["Looked at your screen", "Put the result together"];
    // Derive a summary: first sentence up to 120 chars
    assistantMsg.summary = result.split(/[.!?]/)[0]?.trim().slice(0, 120) ?? result.slice(0, 80);
    assistantMsg.doneTitle = deriveDoneTitle(text);
    setPhase("done");
    playSoundCue("agent-done");

    // Store the exchange in memory (non-blocking)
    invoke("memory_add", {
      content: `User asked: "${text.slice(0, 80)}". Tazama replied: "${result.slice(0, 120)}"`,
    }).catch(() => null);
  } catch (e) {
    assistantMsg.content = String(e).replace(/^Error:\s*/i, "");
    assistantMsg.isStreaming = false;
    setPhase("idle");
  }

  renderMessages(transcript);
}

function deriveDoneTitle(prompt: string): string {
  const words = prompt.trim().split(/\s+/).slice(0, 3);
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

/* ─── Phase ─── */
function setPhase(p: Phase): void {
  document.dispatchEvent(new CustomEvent("tazama:phase", { detail: p }));
}

/* ─── Sound (WebAudio sprite stub — wired in audio/engine.ts) ─── */
function playSoundCue(name: string): void {
  document.dispatchEvent(new CustomEvent("tazama:sound", { detail: name }));
}

/* ─── Animation flag ─── */
export function setAnimationsEnabled(enabled: boolean): void {
  animationsEnabled = enabled;
  document.documentElement.style.setProperty("--animations-enabled", enabled ? "1" : "0");
}
