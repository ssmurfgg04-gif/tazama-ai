/**
 * Skills page — Tazama AI
 *
 * Mounts the PowerUp orbit panel and persists slot assignments
 * in localStorage (slots reference the static catalog below).
 * A backend skills registry is Plan-D follow-up; the panel,
 * celebration, and sounds all work today.
 */

import { mountPowerUpPanel, setSlot, unmountPowerUpPanel } from "./powerup.js";

interface CatalogSkill {
  id:       string;
  name:     string;
  icon:     string;
  category: string;
}

const CATALOG: CatalogSkill[] = [
  { id: "web-search",   name: "Web Search",   icon: "◎", category: "Research" },
  { id: "code-review",  name: "Code Review",  icon: "◇", category: "Code" },
  { id: "summarise",    name: "Summarise",    icon: "≡", category: "Writing" },
  { id: "screenshot",   name: "Screenshot",   icon: "◈", category: "Vision" },
  { id: "dictation",    name: "Dictation",    icon: "◉", category: "Voice" },
  { id: "translate",    name: "Translate",    icon: "≋", category: "Writing" },
];

const SLOTS_KEY = "tazama-skill-slots";

function loadSlots(): (string | null)[] {
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as (string | null)[];
      if (Array.isArray(arr)) return [arr[0] ?? null, arr[1] ?? null, arr[2] ?? null];
    }
  } catch { /* ignore */ }
  return [null, null, null];
}

function saveSlots(slots: (string | null)[]): void {
  try { localStorage.setItem(SLOTS_KEY, JSON.stringify(slots)); } catch { /* ignore */ }
}

export function renderSkillsPage(container: HTMLElement): void {
  container.innerHTML = "";
  container.className = "skills-page";
  unmountPowerUpPanel();

  const header = document.createElement("div");
  header.className = "page-header";

  const title = document.createElement("h2");
  title.className = "page-title";
  title.textContent = "Skills";

  const sub = document.createElement("p");
  sub.className = "page-sub";
  sub.textContent = "Three slots. Tap a slot, then pick a skill.";

  header.append(title, sub);
  container.append(header);

  // Orbit panel mount point
  const arena = document.createElement("div");
  arena.id = "skills-arena";
  container.append(arena);
  mountPowerUpPanel(arena);

  // Restore persisted slots
  const saved = loadSlots();
  saved.forEach((skillId, idx) => {
    if (!skillId) return;
    const found = CATALOG.find(c => c.id === skillId);
    if (found) setSlot(idx, { ...found, uses: 0 });
  });

  // Pending slot selection (set when an empty tile is clicked)
  let pendingSlot: number | null = null;
  document.addEventListener("tazama:find-skill", (e: Event) => {
    const detail = (e as CustomEvent<{ idx?: number }>).detail ?? {};
    pendingSlot = typeof detail.idx === "number" ? detail.idx : firstEmptySlot();
    renderCatalog(container, pendingSlot);
  });

  renderCatalog(container, null);

  function firstEmptySlot(): number | null {
    const current = loadSlots();
    const idx = current.findIndex(s => s === null);
    return idx >= 0 ? idx : null;
  }

  function renderCatalog(root: HTMLElement, targetSlot: number | null): void {
    root.querySelector(".skills-catalog")?.remove();
    const wrap = document.createElement("div");
    wrap.className = "skills-catalog";

    const label = document.createElement("p");
    label.className = "section-label";
    label.textContent = targetSlot === null ? "CATALOG" : `PICK A SKILL FOR SLOT ${targetSlot + 1}`;
    wrap.append(label);

    CATALOG.forEach(c => {
      const row = document.createElement("button");
      row.className = "skill-row card";

      const icon = document.createElement("span");
      icon.className = "skill-row-icon";
      icon.textContent = c.icon;

      const body = document.createElement("span");
      body.className = "skill-row-body";

      const name = document.createElement("strong");
      name.textContent = c.name;

      const cat = document.createElement("span");
      cat.className = "skill-row-cat";
      cat.textContent = c.category;

      body.append(name, cat);
      row.append(icon, body);

      row.addEventListener("click", () => {
        const slotIdx = targetSlot ?? firstEmptySlot();
        if (slotIdx === null) {
          label.textContent = "ALL 3 SKILL SLOTS ARE FULL — TAP A SLOT TO SWAP";
          return;
        }
        const current = loadSlots();
        current[slotIdx] = c.id;
        saveSlots(current);
        setSlot(slotIdx, { ...c, uses: 0 });
        pendingSlot = null;
        renderCatalog(root, null);
      });

      wrap.append(row);
    });

    root.append(wrap);
  }

  // Swap flow: clicking a filled tile re-opens the catalog for that slot
  document.addEventListener("tazama:swap-skill", (e: Event) => {
    const detail = (e as CustomEvent<{ idx: number }>).detail;
    if (typeof detail?.idx === "number") renderCatalog(container, detail.idx);
  });
}
