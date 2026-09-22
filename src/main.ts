/**
 * Tazama AI — main entry point
 *
 * Mounts all surfaces and wires the full feature set:
 *   - Notch pill (top-edge docked, always-on-top ambient)
 *   - HomeSpace (main companion window)
 *   - Agent HUD (floating chip stack)
 *   - Onboarding (permission cards + portrait constellation)
 *   - Memory (context-m warm-up, shared with opencode)
 *   - Sound engine (real WAV chimes, 15 events)
 *   - Morning ritual (time-gated suggestions, memory-personalised)
 */

import { mountHomeSpace }    from "./ui/homespace.js";
import { mountHUD }          from "./ui/hud.js";
import { mountOnboarding }   from "./ui/onboarding.js";
import { mountNotchPill }    from "./ui/notch-pill.js";
import { startMorningRitual, buildSuggestionCard, buildConstellation } from "./ui/morning.js";
import "./audio/engine.js";   // side-effect: registers sound event listeners

// ─── Restore user preferences ─────────────────────────────────────────────────

const savedAccent = localStorage.getItem("accent");
if (savedAccent) document.documentElement.style.setProperty("--accent", savedAccent);
if (localStorage.getItem("animations-enabled") === "false")
  document.documentElement.style.setProperty("--animations-enabled", "0");

// ─── Feature stylesheet ────────────────────────────────────────────────────────

const link = document.createElement("link");
link.rel = "stylesheet";
link.href = "/src/styles/features.css";
document.head.append(link);

// ─── Mount all surfaces ────────────────────────────────────────────────────────

window.addEventListener("DOMContentLoaded", () => {
  const appRoot  = document.getElementById("app");
  const hudRoot  = document.getElementById("hud");

  if (!appRoot || !hudRoot) return;

  // ── Always-on HUD overlay (chip stack, radio-dispatch)
  mountHUD(hudRoot);

  // ── Top-edge notch pill (always visible after onboarding)
  const notchRoot = document.createElement("div");
  notchRoot.id = "notch-pill-root";
  document.body.append(notchRoot);

  // ── Main surface: onboarding → HomeSpace
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

// ─── Morning ritual ───────────────────────────────────────────────────────────

function startMorningIfTime(container: HTMLElement): void {
  startMorningRitual(suggestions => {
    // Show constellation above the suggestions
    const body = container.querySelector(".homespace-body");
    if (!body) return;
    body.innerHTML = "";

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
