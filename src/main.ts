/**
 * Tazama AI - main entry point
 *
 * Two modes, selected by URL query:
 *   main window          -> full app (HomeSpace / onboarding / pages)
 *   hud window (?overlay=hud) -> Agent HUD only (always-on-top overlay)
 *
 * Surfaces mounted in main mode:
 *   - HomeSpace (main companion window)
 *   - Agent HUD (floating chip stack)
 *   - Top-edge notch pill
 *   - Cursor/annotation overlay root (Plan C draws here)
 *   - Onboarding on first run
 *   - Morning ritual (time-gated, never wipes a conversation)
 *   - Sound engine (side-effect import)
 */

import { mountHomeSpace }    from "./ui/homespace.js";
import { mountHUD }          from "./ui/hud.js";
import { mountOnboarding }   from "./ui/onboarding.js";
import { mountNotchPill }    from "./ui/notch-pill.js";
import { mountCursorOverlay } from "./ui/cursor-overlay.js";
import {
  startMorningRitual,
  buildSuggestionCard,
  buildConstellation,
  markMorningShown,
} from "./ui/morning.js";
import "./audio/engine.js";   // side-effect: registers sound event listeners

// --- Restore user preferences ---

const savedAccent = localStorage.getItem("accent");
if (savedAccent) document.documentElement.style.setProperty("--accent", savedAccent);
if (localStorage.getItem("animations-enabled") === "false")
  document.documentElement.style.setProperty("--animations-enabled", "0");

// --- Mount all surfaces ---

// --- Feature stylesheet ---

const link = document.createElement("link");
link.rel = "stylesheet";
link.href = "/src/styles/features.css";
document.head.append(link);

// --- Mode routing ---

const OVERLAY_MODE =
  new URLSearchParams(window.location.search).get("overlay") === "hud";

window.addEventListener("DOMContentLoaded", () => {
  if (OVERLAY_MODE) {
    // HUD-only window: transparent body, HUD chips, nothing else.
    document.body.classList.add("overlay-mode");
    const hudRoot = document.getElementById("hud");
    if (hudRoot) mountHUD(hudRoot);
    return;
  }

  const appRoot  = document.getElementById("app");
  const hudRoot  = document.getElementById("hud");

  if (!appRoot || !hudRoot) return;

  // Always-on HUD overlay (chip stack, radio-dispatch)
  mountHUD(hudRoot);

  // Cursor / annotation overlay root (Plan C draws strokes here)
  const cursorRoot = document.createElement("div");
  cursorRoot.id = "cursor-overlay-root";
  document.body.append(cursorRoot);
  mountCursorOverlay(cursorRoot);

  // Top-edge notch pill (always visible after onboarding)
  const notchRoot = document.createElement("div");
  notchRoot.id = "notch-pill-root";
  document.body.append(notchRoot);

  // Main surface: onboarding on first run, else HomeSpace
  const isFirstRun = !localStorage.getItem("tazama-onboarded");
  if (isFirstRun) {
    mountOnboarding(appRoot, () => {
      localStorage.setItem("tazama-onboarded", "1");
      mountHomeSpace(appRoot);
      mountNotchPill(notchRoot);
      startMorningIfTime(appRoot);
    });
  } else {
    mountHomeSpace(appRoot);
    mountNotchPill(notchRoot);
    startMorningIfTime(appRoot);
  }
});

// --- Morning ritual ---
// Renders ONLY when the body is showing the suggestions view
// (never wipes an active conversation transcript).

function startMorningIfTime(container: HTMLElement): void {
  startMorningRitual(suggestions => {
    const body = container.querySelector(".homespace-body");
    if (!body) return;
    // Guard: do not destroy an active conversation.
    if (body.querySelector("#transcript")) return;
    body.innerHTML = "";
    markMorningShown();

    const constellation = buildConstellation(3);
    body.append(constellation);

    const label = document.createElement("p");
    label.className = "section-label";
    label.textContent = "GOOD MORNING";
    body.append(label);

    suggestions.forEach((s, i) => {
      const card = buildSuggestionCard(
        s,
        (accepted) => {
          document.dispatchEvent(
            new CustomEvent("tazama:send-message", { detail: accepted.text })
          );
        },
        (_id, _useful) => { /* stored in memory by the component */ }
      );
      if (i < 3) {
        card.style.setProperty("--stagger-delay", `${i * 40}ms`);
        card.classList.add("entrance-stagger");
      }
      body.append(card);
    });
  });
}
