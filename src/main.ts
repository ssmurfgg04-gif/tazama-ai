/**
 * Tazama AI — main entry point
 *
 * Decides which surface to mount based on first-run state:
 *   - First run → Onboarding
 *   - Subsequent runs → HomeSpace
 * The Agent HUD is always mounted (it's always-on-top, click-through when idle).
 * Sound engine wires itself via event bus import side-effect.
 */

import { mountHomeSpace }  from "./ui/homespace.js";
import { mountHUD }        from "./ui/hud.js";
import { mountOnboarding } from "./ui/onboarding.js";
import "./audio/engine.js";  // side-effect: registers sound event listeners

// Restore accent from storage
const savedAccent = localStorage.getItem("accent");
if (savedAccent) {
  document.documentElement.style.setProperty("--accent", savedAccent);
}

// Restore animations preference
if (localStorage.getItem("animations-enabled") === "false") {
  document.documentElement.style.setProperty("--animations-enabled", "0");
}

window.addEventListener("DOMContentLoaded", () => {
  const appRoot = document.getElementById("app");
  const hudRoot = document.getElementById("hud");

  if (!appRoot || !hudRoot) return;

  // Always mount the floating HUD overlay
  mountHUD(hudRoot);

  // Decide main surface: onboarding on first launch, HomeSpace thereafter
  const isFirstRun = !localStorage.getItem("tazama-onboarded");

  if (isFirstRun) {
    mountOnboarding(appRoot, () => {
      localStorage.setItem("tazama-onboarded", "1");
      mountHomeSpace(appRoot);
    });
  } else {
    mountHomeSpace(appRoot);
  }
});
