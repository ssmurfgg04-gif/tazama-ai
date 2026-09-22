/**
 * Agent HUD — Tazama AI
 *
 * Floating chip stack with accordion handle pill.
 * Mirrors CodexHUDView: hudColumn, chipStack, accordionHandlePill.
 *
 * Windows: anchored to top-centre of primary display.
 * States: idle (click-through) → thinking → done → needs-you → interrupted.
 * Radio-dispatch copy from HeyClicky ModelInstructions.md.
 */

type HUDPhase = "idle" | "thinking" | "listening" | "speaking" | "done" | "needs-you" | "interrupted";

interface HUDState {
  phase: HUDPhase;
  label: string;    // radio-dispatch 2-4 word present-participle
  summary?: string; // <SUMMARY> one-sentence spoken line shown on done chip
  doneTitle?: string;
}

/* ── Radio-dispatch labels (present-participle, 2-4 words) ── */
const PHASE_LABELS: Record<HUDPhase, string> = {
  idle:        "Ready",
  thinking:    "Working on it",
  listening:   "Listening",
  speaking:    "Speaking",
  done:        "Done",
  "needs-you": "Wants to click Save for you",
  interrupted: "Interrupted",
};

let isExpanded = true;
let currentState: HUDState = { phase: "idle", label: PHASE_LABELS.idle };

/* ── Mount ── */
export function mountHUD(root: HTMLElement): void {
  root.innerHTML = "";
  root.className = "hud-root";

  const column = buildColumn();
  root.append(column);

  // Listen for phase changes from HomeSpace
  document.addEventListener("tazama:phase", (e: Event) => {
    const phase = (e as CustomEvent<HUDPhase>).detail;
    updatePhase(phase, column);
  });

  // Initial render
  updatePhase("idle", column);
}

/* ── Column: handle + chip stack ── */
function buildColumn(): HTMLElement {
  const col = document.createElement("div");
  col.className = "hud-column";

  /* Accordion handle pill — accordionHandlePill */
  const handle = document.createElement("button");
  handle.className = "hud-handle pill";
  handle.setAttribute("aria-label", isExpanded ? "Collapse agent HUD" : "Expand agent HUD");
  handle.textContent = "Tazama";
  handle.addEventListener("click", () => toggleAccordion(col, handle));

  /* Chip stack */
  const stack = document.createElement("div");
  stack.className = "hud-chip-stack";
  stack.id = "hud-chip-stack";

  col.append(handle, stack);
  return col;
}

/* ── Accordion ── */
function toggleAccordion(col: HTMLElement, handle: HTMLButtonElement): void {
  isExpanded = !isExpanded;
  const stack = col.querySelector(".hud-chip-stack") as HTMLElement;
  handle.setAttribute("aria-label", isExpanded ? "Collapse agent HUD" : "Expand agent HUD");
  handle.classList.toggle("is-collapsed", !isExpanded);
  if (stack) {
    stack.style.display = isExpanded ? "" : "none";
  }
}

/* ── Chip ── */
function buildChip(state: HUDState): HTMLElement {
  const chip = document.createElement("div");
  chip.className = `hud-chip pill ${state.phase}`;

  /* Phase dots / bars (thinking = dots, speaking = bars) */
  const indicator = document.createElement("span");
  indicator.className = "hud-indicator";
  indicator.setAttribute("aria-hidden", "true");

  if (state.phase === "thinking") {
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("span");
      dot.className = "hud-dot ambient-only";
      dot.style.animationDelay = `${i * 150}ms`;
      indicator.append(dot);
    }
  } else if (state.phase === "speaking" || state.phase === "listening") {
    for (let i = 0; i < 5; i++) {
      const bar = document.createElement("span");
      bar.className = "hud-bar ambient-only";
      bar.style.animationDelay = `${i * 80}ms`;
      indicator.append(bar);
    }
  } else {
    const dot = document.createElement("span");
    dot.className = "breathing-dot";
    dot.style.background = stateColor(state.phase);
    indicator.append(dot);
  }

  /* Label */
  const label = document.createElement("span");
  label.className = "hud-label";
  label.textContent = state.label;

  chip.append(indicator, label);

  /* Done chip: show summary + dismiss */
  if (state.phase === "done" && state.summary) {
    const summary = document.createElement("span");
    summary.className = "hud-summary";
    summary.textContent = state.summary;
    chip.append(summary);

    const dismiss = document.createElement("button");
    dismiss.className = "hud-dismiss";
    dismiss.setAttribute("aria-label", "Dismiss");
    dismiss.textContent = "✕";
    dismiss.addEventListener("click", () => {
      chip.classList.add("chip-exit");
      chip.addEventListener("animationend", () => chip.remove(), { once: true });
    });
    chip.append(dismiss);
  }

  /* Needs-you chip: approval button */
  if (state.phase === "needs-you") {
    const approve = document.createElement("button");
    approve.className = "gel hud-approve-btn";
    approve.textContent = "Allow";
    approve.addEventListener("click", () => {
      document.dispatchEvent(new CustomEvent("tazama:approve"));
    });
    chip.append(approve);
  }

  return chip;
}

/* ── Update ── */
function updatePhase(phase: HUDPhase, col: HTMLElement): void {
  currentState = {
    phase,
    label: PHASE_LABELS[phase],
    summary: undefined,
    doneTitle: undefined,
  };

  const stack = col.querySelector(".hud-chip-stack") as HTMLElement;
  if (!stack) return;

  // Replace active chip
  const existing = stack.querySelector(".hud-chip");
  if (existing) {
    existing.classList.add("chip-exit");
    existing.addEventListener("animationend", () => {
      existing.remove();
      appendChip(stack);
    }, { once: true });
  } else {
    appendChip(stack);
  }
}

function appendChip(stack: HTMLElement): void {
  const chip = buildChip(currentState);
  chip.classList.add("chip-enter");
  chip.addEventListener("animationend", () => chip.classList.remove("chip-enter"), { once: true });
  stack.append(chip);
}

function stateColor(phase: HUDPhase): string {
  switch (phase) {
    case "done":        return "var(--ok)";
    case "needs-you":   return "var(--warn)";
    case "interrupted": return "var(--error)";
    default:            return "var(--accent)";
  }
}

/* Phase is driven exclusively via the "tazama:phase" DOM event bus.
 * External callers: dispatch that event rather than calling a function
 * so the single wiring path stays clear and testable.
 * Example: document.dispatchEvent(new CustomEvent("tazama:phase", { detail: "done" }));
 */
