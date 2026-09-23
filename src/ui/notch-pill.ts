/**
 * Top-edge docked pill -- Tazama AI
 *
 * Windows equivalent of HeyClicky's NotchWindowManager.
 * A pill anchored to the top-centre of the primary display, always-on-top,
 * with: resting silhouette â†’ hover-dwell ring â†’ expand surface â†’ live-event glow â†’ auto-dismiss.
 *
 * Better than HeyClicky's Notch because:
 *   - Works on ANY Windows machine (no physical notch required)
 *   - Dwell ring uses a crisp CSS conic-gradient (no canvas needed)
 *   - Corner glow uses two accent-tinted radial blobs with parallax drift
 *   - Auto-dismiss clock is visible and click-to-cancel
 *   - Surface grows from the pill naturally with a spring (not just fade)
 *   - Phase indicator uses the mascot eye mini version, not just dots
 */

import { buildMascot, setExpression, MascotExpression } from "./mascot.js";
import { playSoundCue } from "./sound-bus.js";

// type PillPhase = "resting" | "hover" | "expanded" | "live" | "auto-dismiss";

let pillEl: HTMLElement | null = null;
let dwellTimer: ReturnType<typeof setTimeout> | null = null;
let dismissTimer: ReturnType<typeof setInterval> | null = null;
let dismissSecondsLeft = 8;

// â”€â”€â”€ Mount â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function mountNotchPill(root: HTMLElement): void {
  root.innerHTML = "";

  const pill = document.createElement("div");
  pill.className = "notch-pill";
  pill.id = "notch-pill";

  // Silhouette content (resting: mascot eye tiny + app name)
  const silhouette = document.createElement("div");
  silhouette.className = "notch-silhouette";
  const eye = buildMascot(20);
  eye.classList.add("notch-eye");
  const label = document.createElement("span");
  label.className = "notch-label";
  label.textContent = "Tazama";
  silhouette.append(eye, label);

  // Dwell ring (conic-gradient progress ring)
  const dwellRing = document.createElement("div");
  dwellRing.className = "notch-dwell-ring";
  dwellRing.id = "notch-dwell-ring";

  // Corner glow blobs (live event)
  const glowLeft  = document.createElement("div");
  const glowRight = document.createElement("div");
  glowLeft.className  = "notch-glow notch-glow-left";
  glowRight.className = "notch-glow notch-glow-right";

  // Expanded surface
  const surface = document.createElement("div");
  surface.className = "notch-surface";
  surface.id = "notch-surface";
  surface.style.display = "none";

  // Auto-dismiss clock
  const dismissClock = document.createElement("button");
  dismissClock.className = "notch-dismiss-clock";
  dismissClock.id = "notch-dismiss-clock";
  dismissClock.setAttribute("aria-label", "Cancel auto-dismiss");
  dismissClock.style.display = "none";
  dismissClock.addEventListener("click", cancelAutoDismiss);

  pill.append(silhouette, dwellRing, glowLeft, glowRight, surface, dismissClock);
  root.append(pill);
  pillEl = pill;

  // Hover triggers dwell â†’ expand
  pill.addEventListener("mouseenter", onHover);
  pill.addEventListener("mouseleave", onLeave);

  // Listen for phase events from HomeSpace
  document.addEventListener("tazama:phase", (e: Event) => {
    const phase = (e as CustomEvent<string>).detail;
    onAgentPhase(phase as MascotExpression);
  });
}

// â”€â”€â”€ Hover / dwell â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function onHover(): void {
  if (!pillEl) return;
  pillEl.classList.add("is-hovered");
  startDwellRing(() => expandSurface());
}

function onLeave(): void {
  if (!pillEl) return;
  pillEl.classList.remove("is-hovered");
  stopDwellRing();
  if (pillEl.classList.contains("is-expanded")) {
    // Keep expanded while pointer is inside surface -- collapse on leave
    // (surface has pointer-events so this only fires when truly leaving)
    collapseSurface();
  }
}

function startDwellRing(onComplete: () => void): void {
  stopDwellRing();
  const ring = document.getElementById("notch-dwell-ring");
  if (!ring) return;
  ring.style.setProperty("--dwell-progress", "0%");
  ring.classList.add("is-filling");
  // Animate progress 0â†’100% over dwell-duration (350ms from tokens)
  const start = performance.now();
  const DWELL_MS = 350;
  const tick = (now: number) => {
    const pct = Math.min(((now - start) / DWELL_MS) * 100, 100);
    ring.style.setProperty("--dwell-progress", `${pct}%`);
    if (pct < 100) {
      dwellTimer = setTimeout(() => tick(performance.now()), 16);
    } else {
      ring.classList.remove("is-filling");
      onComplete();
    }
  };
  dwellTimer = setTimeout(() => tick(performance.now()), 16);
}

function stopDwellRing(): void {
  if (dwellTimer) { clearTimeout(dwellTimer); dwellTimer = null; }
  const ring = document.getElementById("notch-dwell-ring");
  if (ring) { ring.classList.remove("is-filling"); ring.style.setProperty("--dwell-progress", "0%"); }
}

// â”€â”€â”€ Expand / collapse â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function expandSurface(content?: string): void {
  const pill    = document.getElementById("notch-pill");
  const surface = document.getElementById("notch-surface");
  if (!pill || !surface) return;
  pill.classList.add("is-expanded");
  surface.style.display = "";
  if (content) surface.innerHTML = content;
  playSoundCue("text-open");
}

function collapseSurface(): void {
  const pill    = document.getElementById("notch-pill");
  const surface = document.getElementById("notch-surface");
  if (!pill || !surface) return;
  pill.classList.remove("is-expanded");
  setTimeout(() => { surface.style.display = "none"; surface.innerHTML = ""; }, 200);
  playSoundCue("text-close");
}

// â”€â”€â”€ Live-event corner glow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function flashLiveEvent(durationMs = 3000): void {
  const pill = document.getElementById("notch-pill");
  if (!pill) return;
  pill.classList.add("has-live-event");
  setTimeout(() => pill.classList.remove("has-live-event"), durationMs);
}

// â”€â”€â”€ Auto-dismiss â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function showAutoDismiss(message: string, onDismiss?: () => void): void {
  expandSurface(`<p class="notch-message">${message}</p>`);
  dismissSecondsLeft = 8;
  const clock = document.getElementById("notch-dismiss-clock");
  if (clock) {
    clock.style.display = "";
    clock.textContent = `${dismissSecondsLeft}s`;
  }
  dismissTimer = setInterval(() => {
    dismissSecondsLeft--;
    if (clock) clock.textContent = `${dismissSecondsLeft}s`;
    if (dismissSecondsLeft <= 0) {
      cancelAutoDismiss();
      onDismiss?.();
    }
  }, 1000);
}

function cancelAutoDismiss(): void {
  if (dismissTimer) { clearInterval(dismissTimer); dismissTimer = null; }
  const clock = document.getElementById("notch-dismiss-clock");
  if (clock) clock.style.display = "none";
}

// â”€â”€â”€ Phase sync â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function onAgentPhase(phase: MascotExpression): void {
  setExpression(phase);
  const notchEye = document.querySelector<SVGSVGElement>(".notch-eye");
  if (notchEye) {
    // Propagate expression state to the small notch eye too
    const iris = notchEye.getElementById("iris");
    if (iris) {
      if (phase === "thinking")    iris.setAttribute("fill", "var(--accent-light)");
      else if (phase === "done")   iris.setAttribute("fill", "var(--ok)");
      else if (phase === "needs-you") iris.setAttribute("fill", "var(--warn)");
      else iris.setAttribute("fill", "var(--accent)");
    }
  }
  if (phase === "done") {
    showAutoDismiss("Done", () => collapseSurface());
    flashLiveEvent(1500);
  }
}
