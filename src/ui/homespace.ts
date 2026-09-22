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
}

/* ─── Compact rail ─── */
/* HomeSpaceCompactRail + HomeSpaceIconRail pattern */
function buildRail(): HTMLElement {
  const rail = document.createElement("nav");
  rail.className = "compact-rail";
  rail.setAttribute("aria-label", "Pages");

  const pages = [
    { icon: "◎", label: "Home",    id: "home"    },
    { icon: "⌘", label: "Agents",  id: "agents"  },
    { icon: "✦", label: "Skills",  id: "skills"  },
    { icon: "⚙", label: "Settings",id: "settings" },
  ];

  pages.forEach((p, i) => {
    const btn = document.createElement("button");
    btn.className = "rail-row" + (i === 0 ? " is-selected" : "");
    btn.dataset.page = p.id;
    btn.setAttribute("aria-label", p.label);
    btn.title = p.label;

    const icon = document.createElement("span");
    icon.className = "rail-icon";
    icon.textContent = p.icon;
    icon.setAttribute("aria-hidden", "true");

    btn.append(icon);
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
  } else {
    showSuggestions(body as HTMLElement);
  }
}

/* ─── Header ─── */
function buildHeader(): HTMLElement {
  const hdr = document.createElement("header");
  hdr.className = "homespace-header";

  const title = document.createElement("span");
  title.className = "homespace-title";
  title.textContent = "Tazama AI";

  const closeBtn = document.createElement("button");
  closeBtn.className = "header-btn";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => invoke("plugin:window|close"));

  hdr.append(title, closeBtn);
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
/* Mirrors HomeSpaceSuggestionsPage / HomeSpaceSuggestedTaskCard */
function showSuggestions(container: HTMLElement): void {
  container.innerHTML = "";

  const label = document.createElement("p");
  label.className = "section-label";
  label.textContent = "SUGGESTED FOR YOU";

  container.append(label);

  const suggestions = [
    "Summarise what's on my screen",
    "What's my next calendar event?",
    "Draft a reply to the top email",
    "Help me debug this error",
  ];

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
  footer.textContent = "Come back tomorrow for fresh ideas from your Tazama agents.";
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

  const sendBtn = document.createElement("button");
  sendBtn.className = "send-btn gel";
  sendBtn.setAttribute("aria-label", "Send");
  sendBtn.textContent = "↑";
  sendBtn.addEventListener("click", doSend);

  function doSend(): void {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    input.style.height = "auto";
    const body = document.querySelector(".homespace-body");
    if (body) sendMessage(text, body as HTMLElement);
  }

  composer.append(input, sendBtn);
  return composer;
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
    // Invoke Rust provider (Phase A: Anthropic default; key from keyring)
    const result = await invoke<string>("chat_complete", {
      provider: "anthropic",
      model: "claude-haiku-4-5",
      messages: [{ role: "user", content: text }],
    });

    assistantMsg.content = result;
    assistantMsg.isStreaming = false;
    assistantMsg.steps = ["Looked at your screen", "Put the result together"];
    // Derive a summary: first sentence up to 120 chars
    assistantMsg.summary = result.split(/[.!?]/)[0]?.trim().slice(0, 120) ?? result.slice(0, 80);
    assistantMsg.doneTitle = deriveDoneTitle(text);
    setPhase("done");
    playSoundCue("agent-done");
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
