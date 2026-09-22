/**
 * Settings page rendered inside HomeSpace body.
 * Thin wrapper: delegates key management to settings.ts (Plan A),
 * adds the new Tazama-AI-specific settings rows.
 */

import { initSettings } from "../settings.js";

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

  // ── Accent colour (HomeSpaceCursorColorSwatch) ──
  const accentRow = buildAccentRow();
  appearGroup.append(accentRow);

  scaffold.append(keysGroup, appearGroup);
  container.append(scaffold);

  // Wire keys UI from Plan A
  initSettings();
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
  hint.textContent = "Sets cursor, caret, selection, and button tint. HeyClicky's HomeSpaceCursorColorSwatch pattern.";

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
