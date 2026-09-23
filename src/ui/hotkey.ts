/**
 * Hotkey UX -- Tazama AI
 *
 * Full keycap chip recorder with collision detection.
 * Better than HeyClicky's ClickyHotkeyRecorder because:
 *   - Shows a live preview of pressed keys as keycap chips while recording
 *   - Checks against system shortcuts AND registered Tazama shortcuts
 *   - Push-to-talk mode with visual hold indicator
 *   - Renders modifier order correctly (Ctrl+Shift+Alt+Key)
 *
 * Mirrors: KeyCapChipRow, ClickyHotkeyConfiguration, ClickyHotkeyRecorder
 * Copy: "Press the modifiers you want", "Press your keys",
 *        "That matches one of your shortcuts. Pick a different combo."
 *        "Hold to talk... Release to send."
 */

import { playSoundCue } from "./sound-bus.js";

export interface HotkeyConfig {
  id:       string;
  label:    string;
  shortcut: string;  // "Ctrl+Shift+Space" format
  action:   () => void;
}

// const MODIFIER_ORDER = ["Ctrl", "Shift", "Alt", "Meta"];  // reserved for recorder order enforcement
const RESERVED: string[] = ["Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+Z", "Ctrl+A", "Alt+F4", "Win"];

let registeredHotkeys: HotkeyConfig[] = [];

// â”€â”€â”€ Keycap chip renderer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Render a shortcut string as a row of keycap chips. */
export function renderKeycaps(shortcut: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "keycap-row";
  const parts = shortcut.split("+").filter(Boolean);
  parts.forEach((key, i) => {
    const chip = document.createElement("kbd");
    chip.className = "keycap";
    chip.textContent = formatKeyName(key);
    row.append(chip);
    if (i < parts.length - 1) {
      const plus = document.createElement("span");
      plus.className = "keycap-plus";
      plus.textContent = "+";
      row.append(plus);
    }
  });
  return row;
}

function formatKeyName(key: string): string {
  const map: Record<string, string> = {
    "Ctrl": "âŒƒ", "Shift": "â‡§", "Alt": "âŒ¥", "Meta": "â–",
    " ": "Space", "ArrowUp": "â†‘", "ArrowDown": "â†“",
    "ArrowLeft": "â†", "ArrowRight": "â†’",
  };
  return map[key] ?? key;
}

// â”€â”€â”€ Recorder widget â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function buildHotkeyRecorder(
  currentShortcut: string,
  onSave: (shortcut: string) => void
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "hotkey-recorder";

  const display = document.createElement("div");
  display.className = "hotkey-display";
  display.append(renderKeycaps(currentShortcut || "Not set"));

  const recordBtn = document.createElement("button");
  recordBtn.className = "hotkey-record-btn";
  recordBtn.textContent = "Change";

  const hint = document.createElement("p");
  hint.className = "hotkey-hint";
  hint.textContent = "Press the modifiers you want, then your key.";
  hint.style.display = "none";

  const errorMsg = document.createElement("p");
  errorMsg.className = "hotkey-error";
  errorMsg.style.display = "none";

  wrap.append(display, recordBtn, hint, errorMsg);

  let recording = false;
  let captured: string[] = [];

  recordBtn.addEventListener("click", () => {
    recording = !recording;
    if (recording) {
      recordBtn.textContent = "Cancel";
      hint.style.display = "";
      errorMsg.style.display = "none";
      captured = [];
      display.innerHTML = "";
      display.append(renderKeycaps("_"));
    } else {
      recordBtn.textContent = "Change";
      hint.style.display = "none";
      display.innerHTML = "";
      display.append(renderKeycaps(currentShortcut || "Not set"));
    }
  });

  wrap.addEventListener("keydown", (e: KeyboardEvent) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();

    const mods: string[] = [];
    if (e.ctrlKey)  mods.push("Ctrl");
    if (e.shiftKey) mods.push("Shift");
    if (e.altKey)   mods.push("Alt");
    if (e.metaKey)  mods.push("Meta");

    if (!["Control","Shift","Alt","Meta"].includes(e.key)) {
      mods.push(e.key === " " ? "Space" : e.key.toUpperCase());
    }

    captured = mods;
    display.innerHTML = "";
    display.append(renderKeycaps(mods.join("+")));
  }, { capture: true });

  wrap.addEventListener("keyup", (e: KeyboardEvent) => {
    if (!recording || captured.length === 0) return;
    if (["Control","Shift","Alt","Meta"].includes(e.key)) return; // still holding mods
    e.preventDefault();

    const shortcut = captured.join("+");
    const collision = checkCollision(shortcut);
    if (collision) {
      errorMsg.textContent = `That matches ${collision}. Pick a different combo.`;
      errorMsg.style.display = "";
      captured = [];
      display.innerHTML = "";
      display.append(renderKeycaps("_"));
      return;
    }

    recording = false;
    recordBtn.textContent = "Change";
    hint.style.display = "none";
    errorMsg.style.display = "none";
    onSave(shortcut);
    playSoundCue("enter");
  }, { capture: true });

  wrap.setAttribute("tabindex", "0");
  return wrap;
}

function checkCollision(shortcut: string): string | null {
  if (RESERVED.some(r => r.toLowerCase() === shortcut.toLowerCase())) {
    return "a system shortcut";
  }
  const existing = registeredHotkeys.find(h => h.shortcut.toLowerCase() === shortcut.toLowerCase());
  if (existing) return `your "${existing.label}" shortcut`;
  return null;
}

// â”€â”€â”€ Global shortcut registration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import {
  register as gsRegister,
  unregister as gsUnregister,
} from "@tauri-apps/plugin-global-shortcut";
import { getCurrentWindow } from "@tauri-apps/api/window";

export async function registerHotkey(config: HotkeyConfig): Promise<boolean> {
  try {
    await gsUnregister(config.shortcut).catch(() => null);
    await gsRegister(config.shortcut, () => config.action());
    registeredHotkeys = registeredHotkeys.filter(h => h.id !== config.id);
    registeredHotkeys.push(config);
    return true;
  } catch {
    return false;
  }
}

export async function unregisterHotkey(id: string): Promise<void> {
  const h = registeredHotkeys.find(c => c.id === id);
  if (!h) return;
  try {
    await gsUnregister(h.shortcut);
  } catch { /* ignore */ }
  registeredHotkeys = registeredHotkeys.filter(c => c.id !== id);
}

/** Toggle the main window (used by the built-in show/hide hotkey). */
export async function toggleMainWindow(): Promise<void> {
  try {
    const win = getCurrentWindow();
    const visible = await win.isVisible();
    if (visible) await win.hide();
    else { await win.show(); await win.setFocus(); }
  } catch { /* ignore */ }
}

// â”€â”€â”€ Push-to-talk â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Shows a push-to-talk pill overlay. Returns a cleanup fn. */
export function showPushToTalkPill(): () => void {
  const pill = document.createElement("div");
  pill.className = "ptt-pill glass";
  pill.innerHTML = `<span class="ptt-dot"></span><span>Hold to talk... Release to send.</span>`;
  Object.assign(pill.style, {
    position: "fixed", bottom: "80px", left: "50%",
    transform: "translateX(-50%)", zIndex: "9100",
  });
  document.body.append(pill);
  return () => pill.remove();
}
