/**
 * Onboarding shell — Tazama AI
 *
 * Permission guide cards with success badges + guided copy.
 * Mirrors HeyClicky's OnboardingInterviewStage, OnboardingInterviewTranscriptLine,
 * NotchOnboardingCardSurface.permissionSuccessBadge, PermissionGuidePanel.
 *
 * Windows replacements vs macOS:
 *   - Screen Recording drag-source → "Pick a display" button (Graphics Capture picker)
 *   - Accessibility drag-source    → UIA requires no explicit user action on Windows
 *   - Mic privacy                  → Windows Settings privacy prompt (automatic)
 *
 * Copy voice: first-person-benefit, one sentence, no legalese.
 * Mascot turns it into imperatives ("Drag me into…" → "Pick a display and I'll see your screen").
 */

import { invoke } from "@tauri-apps/api/core";

interface PermissionCard {
  id:          string;
  icon:        string;
  title:       string;
  description: string; // first-person benefit
  mascotLine:  string; // imperative with mascot as subject
  ctaLabel:    string;
  action?:     () => Promise<void>;
}

const CARDS: PermissionCard[] = [
  {
    id:          "screen",
    icon:        "◈",
    title:       "See your screen",
    description: "Tazama AI looks at your screen only while you're asking, so it can point at the right thing.",
    mascotLine:  "Pick a display and I'll see your screen.",
    ctaLabel:    "Pick a display",
    action:      async () => { await invoke("screenshot"); },
  },
  {
    id:          "mic",
    icon:        "◎",
    title:       "Hear you talk",
    description: "Tazama AI uses your mic so you can just say it.",
    mascotLine:  "This lets me hear your voice.",
    ctaLabel:    "Allow microphone",
    // Windows mic prompt fires automatically on first getUserMedia call
    action:      async () => {
      await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
    },
  },
  {
    id:          "hotkey",
    icon:        "⌘",
    title:       "A hotkey to call me",
    description: "Set a global shortcut so Tazama AI opens from anywhere without leaving your work.",
    mascotLine:  "Press the keys you want. I'll be ready.",
    ctaLabel:    "Set hotkey",
  },
];

let completedCards = new Set<string>();

/* ── Mount ── */
export function mountOnboarding(root: HTMLElement, onComplete: () => void): void {
  root.innerHTML = "";
  root.className = "onboarding";

  const intro = buildIntro();
  const cards  = buildCardList(onComplete);

  root.append(intro, cards);
}

/* ── Intro thought-bubble block ── */
/* Mirrors OnboardingInterviewStage / InterviewThoughtBubbles */
function buildIntro(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "onboarding-intro";

  const portrait = document.createElement("div");
  portrait.className = "onboarding-portrait ambient-only";
  portrait.textContent = "◉"; // placeholder mascot glyph
  portrait.setAttribute("aria-hidden", "true");

  const bubble = document.createElement("div");
  bubble.className = "thought-bubble";
  bubble.innerHTML = `
    <strong>Four quick things</strong> so I can actually help.<br>
    <span class="secondary">Takes about 30 seconds. Finish it and I'm all yours.</span>
  `;

  wrap.append(portrait, bubble);
  return wrap;
}

/* ── Card list ── */
function buildCardList(onComplete: () => void): HTMLElement {
  const list = document.createElement("div");
  list.className = "permission-cards";

  CARDS.forEach((card, i) => {
    list.append(buildCard(card, i, list, onComplete));
  });

  return list;
}

/* ── Individual permission card ── */
/* NotchOnboardingCardSurface pattern — grows with permissionSuccessBadge on done */
function buildCard(
  card: PermissionCard,
  index: number,
  list: HTMLElement,
  onComplete: () => void
): HTMLElement {
  const el = document.createElement("div");
  el.className = "permission-card card";
  el.dataset.id = card.id;
  if (index > 0) el.setAttribute("aria-disabled", "true");

  const iconEl = document.createElement("span");
  iconEl.className = "perm-icon";
  iconEl.textContent = card.icon;
  iconEl.setAttribute("aria-hidden", "true");

  const body = document.createElement("div");
  body.className = "perm-body";

  const title = document.createElement("strong");
  title.textContent = card.title;

  const desc = document.createElement("p");
  desc.className = "perm-desc";
  desc.textContent = card.description;

  const mascot = document.createElement("p");
  mascot.className = "perm-mascot";
  mascot.textContent = card.mascotLine;

  body.append(title, desc, mascot);

  const cta = document.createElement("button");
  cta.className = "gel perm-cta";
  cta.textContent = card.ctaLabel;
  cta.addEventListener("click", () => handleCTA(card, el, list, index, onComplete));

  el.append(iconEl, body, cta);
  return el;
}

/* ── CTA action ── */
async function handleCTA(
  card: PermissionCard,
  el: HTMLElement,
  list: HTMLElement,
  index: number,
  onComplete: () => void
): Promise<void> {
  const cta = el.querySelector(".perm-cta") as HTMLButtonElement;
  cta.disabled = true;
  cta.textContent = "…";

  try {
    if (card.action) await card.action();
    markSuccess(card, el);
    completedCards.add(card.id);

    // Enable next card
    const nextCard = list.children[index + 1] as HTMLElement | undefined;
    if (nextCard) {
      nextCard.removeAttribute("aria-disabled");
      nextCard.classList.add("card-reveal");
    }

    if (completedCards.size >= CARDS.length) {
      setTimeout(onComplete, 600);
    }
  } catch {
    cta.disabled = false;
    cta.textContent = card.ctaLabel;
  }
}

/* ── Success badge ── */
/* NotchOnboardingCardSurface.permissionSuccessBadge pattern */
function markSuccess(card: PermissionCard, el: HTMLElement): void {
  el.classList.add("is-done");

  const badge = document.createElement("div");
  badge.className = "success-badge";
  badge.textContent = `${card.title.split(" ")[1] ?? card.title} is ready.`;

  const checkmark = document.createElement("span");
  checkmark.className = "success-check";
  checkmark.textContent = "✓";
  checkmark.setAttribute("aria-hidden", "true");
  badge.prepend(checkmark);

  el.append(badge);

  // Animate badge entrance
  badge.classList.add("badge-pop");
}
