/**
 * Settings page rendered inside HomeSpace body.
 * Thin wrapper: delegates key management to settings.ts (Plan A),
 * adds the new Tazama-AI-specific settings rows.
 */

import { initSettings } from "../settings.js";
import {
  buildHotkeyRecorder,
  registerHotkey,
  renderKeycaps,
  toggleMainWindow,
} from "./hotkey.js";

export function renderSettings(container: HTMLElement): void {
  container.innerHTML = "";

  const scaffold = document.createElement("div");
  scaffold.className = "settings-scaffold";

  // ── API Keys (Plan A) ──
  const keysGroup = document.createElement("section");
  keysGroup.className = "settings-group";

  const keysTitle = document.createElement("h2");
  keysTitle.className = "settings-group-title";
  keysTitle.textContent = "AI Providers";

  const keysList = document.createElement("div");
  keysList.id = "settings-list";

  keysGroup.append(keysTitle, keysList);

  // ── Appearance ──
  const appearGroup = document.createElement("section");
  appearGroup.className = "settings-group";

  const appearTitle = document.createElement("h2");
  appearTitle.className = "settings-group-title";
  appearTitle.textContent = "Appearance";

  const animRow = buildToggleRow(
    "Animations",
    "Clicky animations — ambient off, reactive on under reduced-motion.",
    "animations-enabled",
    true,
    (val) => {
      document.documentElement.style.setProperty("--animations-enabled", val ? "1" : "0");
    }
  );

  const soundRow = buildToggleRow(
    "Sound",
    "UI chimes for agent events.",
    "sound-enabled",
    true,
    (val) => {
      document.dispatchEvent(new CustomEvent("tazama:sound-toggle", { detail: val }));
    }
  );

  appearGroup.append(appearTitle, animRow, soundRow);

  // ── Accent colour ──
  const accentRow = buildAccentRow();
  appearGroup.append(accentRow);

  // ── Shortcuts ──
  const keys2Group = document.createElement("section");
  keys2Group.className = "settings-group";

  const keys2Title = document.createElement("h2");
  keys2Title.className = "settings-group-title";
  keys2Title.textContent = "Shortcuts";

  const fixedRow = document.createElement("div");
  fixedRow.className = "settings-row";

  const fixedInfo = document.createElement("div");
  fixedInfo.className = "settings-row-info";

  const fixedTitle = document.createElement("span");
  fixedTitle.className = "settings-name";
  fixedTitle.textContent = "Toggle window";

  const fixedHint = document.createElement("span");
  fixedHint.className = "settings-hint";
  fixedHint.textContent = "Built-in shortcut, always available.";

  fixedInfo.append(fixedTitle, fixedHint);
  fixedRow.append(fixedInfo, renderKeycaps("Alt+Q"));

  const customRow = document.createElement("div");
  customRow.className = "settings-row settings-row-col";

  const customInfo = document.createElement("div");
  customInfo.className = "settings-row-info";

  const customTitle = document.createElement("span");
  customTitle.className = "settings-name";
  customTitle.textContent = "Custom toggle shortcut";

  const customHint = document.createElement("span");
  customHint.className = "settings-hint";
  customHint.textContent = "Record your own key combo to show or hide Tazama.";

  customInfo.append(customTitle, customHint);
  customRow.append(customInfo);

  const savedCustom = loadCustomShortcut();
  const recorder = buildHotkeyRecorder(savedCustom ?? "", async shortcut => {
    saveCustomShortcut(shortcut);
    await registerHotkey({
      id: "toggle-window",
      label: "Toggle window",
      shortcut,
      action: () => { void toggleMainWindow(); },
    });
  });
  customRow.append(recorder);

  keys2Group.append(keys2Title, fixedRow, customRow);

  scaffold.append(keysGroup, appearGroup, keys2Group);
  container.append(scaffold);

  // Register the built-in toggle + any saved custom shortcut.
  void registerHotkey({
    id: "toggle-window-builtin",
    label: "Toggle window",
    shortcut: "Alt+Q",
    action: () => { void toggleMainWindow(); },
  });
  const restored = loadCustomShortcut();
  if (restored) {
    void registerHotkey({
      id: "toggle-window",
      label: "Toggle window",
      shortcut: restored,
      action: () => { void toggleMainWindow(); },
    });
  }

  // Wire keys UI from Plan A
  initSettings();
}

function loadCustomShortcut(): string | null {
  try {
    return localStorage.getItem("tazama-custom-shortcut");
  } catch {
    return null;
  }
}

function saveCustomShortcut(shortcut: string): void {
  try {
    localStorage.setItem("tazama-custom-shortcut", shortcut);
  } catch { /* ignore */ }
}

function buildToggleRow(
  label: string,
  hint: string,
  storageKey: string,
  defaultVal: boolean,
  onChange: (v: boolean) => void
): HTMLElement {
  const row = document.createElement("div");
  row.className = "settings-row";

  const info = document.createElement("div");
  info.className = "settings-row-info";

  const title = document.createElement("span");
  title.className = "settings-name";
  title.textContent = label;

  const hintEl = document.createElement("span");
  hintEl.className = "settings-hint";
  hintEl.textContent = hint;

  info.append(title, hintEl);

  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.className = "settings-toggle";
  toggle.checked = localStorage.getItem(storageKey) !== "false" ? defaultVal : false;
  toggle.addEventListener("change", () => {
    localStorage.setItem(storageKey, String(toggle.checked));
    onChange(toggle.checked);
  });

  row.append(info, toggle);
  return row;
}

function buildAccentRow(): HTMLElement {
  const row = document.createElement("div");
  row.className = "settings-row";

  const info = document.createElement("div");
  info.className = "settings-row-info";

  const title = document.createElement("span");
  title.className = "settings-name";
  title.textContent = "Accent colour";

  const hint = document.createElement("span");
  hint.className = "settings-hint";
  hint.textContent = "Sets cursor, caret, selection, and button tint.";

  info.append(title, hint);

  const swatches = document.createElement("div");
  swatches.className = "accent-swatches";

  const palette = [
    { color: "#3380FF", label: "Blue (default)" },
    { color: "#26C281", label: "Green"           },
    { color: "#E5484D", label: "Red"             },
    { color: "#FFB224", label: "Amber"           },
    { color: "#8B5CF6", label: "Purple"          },
  ];

  palette.forEach(({ color, label }) => {
    const swatch = document.createElement("button");
    swatch.className = "accent-swatch";
    swatch.style.background = color;
    swatch.setAttribute("aria-label", label);
    swatch.title = label;
    swatch.addEventListener("click", () => {
      document.documentElement.style.setProperty("--accent", color);
      localStorage.setItem("accent", color);
      swatches.querySelectorAll(".accent-swatch").forEach(s => s.classList.remove("is-active"));
      swatch.classList.add("is-active");
    });
    // Restore saved accent
    if (localStorage.getItem("accent") === color) swatch.classList.add("is-active");
    swatches.append(swatch);
  });

  row.append(info, swatches);
  return row;
}
