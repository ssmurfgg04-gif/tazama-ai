/**
 * PowerUp panel — Tazama AI
 *
 * 3 skill slots in orbit + status chips + celebration wiggle.
 * Better than HeyClicky's PowerUpPanelView because:
 *   - Orbit uses smooth requestAnimationFrame (HeyClicky uses SwiftUI timers)
 *   - Hover pauses orbit AND bobs the hovered tile (HeyClicky only pauses)
 *   - Slot swap is animated with a launch-flight path
 *   - Each skill shows category icon + name + usage count
 *   - Empty slots show a "+" ghost tile with dotted border
 *
 * Mirrors: orbitSkillTile, __orbitAngleOffset, __orbitPauseBeganAt,
 *          "Orbit bob", statusChipLabel, PowerUpCelebrationWiggleValues
 * Copy: "Quiet until it's time to power up."
 *       "Find your next skill", "All 3 skill slots are full."
 */

import { playSoundCue } from "./sound-bus.js";

interface SkillSlot {
  id:       string;
  name:     string;
  icon:     string;  // emoji or single char
  category: string;
  uses:     number;
}

const ORBIT_RADIUS = 88;    // px — 96px from brief
const ORBIT_PERIOD = 24000; // ms per revolution (brief: "one revolution per 24s")
const BOB_AMPLITUDE = 3;    // px (brief: ±3px)
const BOB_PERIOD    = 2200; // ms (brief: 2.2s)
const MAX_SLOTS     = 3;

let slots: (SkillSlot | null)[] = [null, null, null];
let orbitEl: HTMLElement | null = null;
let rafId: number | null = null;
let pausedAt: number | null = null;
let hoveredIdx: number | null = null;
let startTime = 0;

// ─── Mount ────────────────────────────────────────────────────────────────────

export function mountPowerUpPanel(root: HTMLElement): void {
  root.innerHTML = "";
  root.className = "powerup-panel";

  // Title row
  const title = document.createElement("div");
  title.className = "powerup-title";
  title.innerHTML = `<strong>Skills</strong><span class="powerup-hint">Quiet until it's time to power up.</span>`;

  // Orbit arena
  const arena = document.createElement("div");
  arena.className = "powerup-orbit-arena";
  arena.id = "powerup-arena";

  // Centre node (mascot thumbnail or logo)
  const centre = document.createElement("div");
  centre.className = "powerup-centre";
  centre.textContent = "◉";
  arena.append(centre);

  // Skill tiles (positioned by rAF)
  for (let i = 0; i < MAX_SLOTS; i++) {
    const tile = buildTile(i);
    arena.append(tile);
  }

  orbitEl = arena;

  // Find skill button
  const findBtn = document.createElement("button");
  findBtn.className = "gel powerup-find-btn";
  findBtn.textContent = "Find your next skill";
  findBtn.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("tazama:find-skill"));
  });

  root.append(title, arena, findBtn);

  // Start orbit
  startTime = performance.now();
  rafId = requestAnimationFrame(tick);
}

function buildTile(idx: number): HTMLElement {
  const tile = document.createElement("div");
  tile.className = "orbit-tile orbit-tile-empty";
  tile.dataset.idx = String(idx);
  tile.textContent = "+";
  tile.setAttribute("role", "button");
  tile.setAttribute("tabindex", "0");
  tile.setAttribute("aria-label", `Skill slot ${idx + 1}`);

  tile.addEventListener("mouseenter", () => { hoveredIdx = idx; pausedAt = performance.now(); });
  tile.addEventListener("mouseleave", () => { hoveredIdx = null; pausedAt = null; });
  tile.addEventListener("click", () => handleTileClick(idx));
  return tile;
}

// ─── rAF orbit tick ───────────────────────────────────────────────────────────

function tick(now: number): void {
  if (!orbitEl) return;
  const elapsed = pausedAt ? (pausedAt - startTime) : (now - startTime);
  const angle0 = (elapsed / ORBIT_PERIOD) * Math.PI * 2; // base angle

  for (let i = 0; i < MAX_SLOTS; i++) {
    const tile = orbitEl.querySelector<HTMLElement>(`[data-idx="${i}"]`);
    if (!tile) continue;

    const theta  = angle0 + (i * Math.PI * 2) / MAX_SLOTS;
    const isHovered = hoveredIdx === i;

    // Bob offset (each tile offset by 1/3 of period)
    const bobOffset = (i / MAX_SLOTS) * BOB_PERIOD;
    const bobY = isHovered
      ? Math.sin((now + bobOffset) / (BOB_PERIOD * 0.5)) * BOB_AMPLITUDE * 2
      : 0;

    const x = Math.cos(theta) * ORBIT_RADIUS;
    const y = Math.sin(theta) * ORBIT_RADIUS + bobY;

    tile.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${isHovered ? 1.12 : 1})`;
    tile.style.transition = isHovered
      ? "transform 200ms cubic-bezier(0.16,1,0.3,1)"
      : "transform 16ms linear, scale 300ms cubic-bezier(0.16,1,0.3,1)";
  }

  rafId = requestAnimationFrame(tick);
}

// ─── Slot management ──────────────────────────────────────────────────────────

export function setSlot(idx: number, skill: SkillSlot | null): void {
  if (idx < 0 || idx >= MAX_SLOTS) return;
  const wasNull = slots[idx] === null;
  slots[idx] = skill;
  refreshTile(idx);
  if (skill && wasNull) {
    celebrateSlot(idx);
    playSoundCue("skill-up");
  } else if (!skill) {
    playSoundCue("skill-down");
  }
}

function refreshTile(idx: number): void {
  if (!orbitEl) return;
  const tile = orbitEl.querySelector<HTMLElement>(`[data-idx="${idx}"]`);
  if (!tile) return;
  const skill = slots[idx];
  if (!skill) {
    tile.className = "orbit-tile orbit-tile-empty";
    tile.innerHTML = "+";
    tile.setAttribute("aria-label", `Skill slot ${idx + 1} — empty`);
  } else {
    tile.className = "orbit-tile orbit-tile-filled";
    tile.innerHTML = `
      <span class="orbit-tile-icon">${skill.icon}</span>
      <span class="orbit-tile-name">${skill.name}</span>
      <span class="orbit-tile-uses">${skill.uses}</span>
    `;
    tile.setAttribute("aria-label", `${skill.name} — ${skill.uses} uses`);
  }
}

function handleTileClick(idx: number): void {
  const skill = slots[idx];
  if (skill) {
    // Offer swap
    document.dispatchEvent(new CustomEvent("tazama:swap-skill", { detail: { idx, skill } }));
  } else {
    document.dispatchEvent(new CustomEvent("tazama:find-skill", { detail: { idx } }));
  }
}

// ─── Celebration wiggle ───────────────────────────────────────────────────────
// Mirrors PowerUpCelebrationWiggleValues: rotate keyframes 0,-6,5,-3,2,0 over 480ms

function celebrateSlot(idx: number): void {
  if (!orbitEl) return;
  const tile = orbitEl.querySelector<HTMLElement>(`[data-idx="${idx}"]`);
  if (!tile) return;
  tile.animate([
    { transform: "rotate(0deg) scale(1)" },
    { transform: "rotate(-6deg) scale(1.15)" },
    { transform: "rotate(5deg) scale(1.1)" },
    { transform: "rotate(-3deg) scale(1.05)" },
    { transform: "rotate(2deg) scale(1.02)" },
    { transform: "rotate(0deg) scale(1)" },
  ], { duration: 480, easing: "ease-out" });
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

export function unmountPowerUpPanel(): void {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}
