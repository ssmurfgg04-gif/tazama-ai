import { invoke } from "@tauri-apps/api/core";

export interface ProviderDef {
  id: string;
  label: string;
}

export const PROVIDERS: ProviderDef[] = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "groq", label: "Groq" },
  { id: "nvidia", label: "NVIDIA" },
  { id: "zai", label: "Z.ai (GLM)" },
  { id: "zai-local", label: "Z.AI Local" },
  { id: "fish", label: "Fish Audio" },
];

async function refreshBadge(provider: string): Promise<void> {
  const badge = document.querySelector<HTMLSpanElement>(
    `[data-badge="${provider}"]`,
  );
  if (!badge) return;
  try {
    const has = await invoke<boolean>("key_has", { provider });
    badge.textContent = has ? "Set" : "Unset";
    badge.dataset.state = has ? "set" : "unset";
  } catch {
    badge.textContent = "Unset";
    badge.dataset.state = "unknown";
  }
}

export async function refreshAllBadges(): Promise<void> {
  await Promise.all(PROVIDERS.map((p) => refreshBadge(p.id)));
}

function buildRow(def: ProviderDef): HTMLElement {
  const row = document.createElement("div");
  row.className = "settings-row";
  row.dataset.provider = def.id;

  const name = document.createElement("span");
  name.className = "settings-name";
  name.textContent = def.label;

  const badge = document.createElement("span");
  badge.className = "settings-badge";
  badge.dataset.badge = def.id;
  badge.textContent = "Unset";
  badge.dataset.state = "unset";

  const input = document.createElement("input");
  input.type = "password";
  input.autocomplete = "new-password";
  input.placeholder = `${def.label} key`;
  input.dataset.keyInput = def.id;
  input.setAttribute("aria-label", `${def.label} API key`);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Save";
  saveBtn.dataset.save = def.id;

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.textContent = "Remove";
  removeBtn.dataset.remove = def.id;

  const testBtn = document.createElement("button");
  testBtn.type = "button";
  testBtn.textContent = "Test";
  testBtn.dataset.test = def.id;

  const testResult = document.createElement("span");
  testResult.className = "settings-test";
  testResult.dataset.testResult = def.id;
  testResult.textContent = "";

  const status = document.createElement("span");
  status.className = "settings-status";
  status.dataset.status = def.id;
  status.textContent = "";

  saveBtn.addEventListener("click", async () => {
    const key = input.value;
    input.value = "";
    if (!key) {
      status.textContent = "Enter a key first";
      return;
    }
    try {
      // Single key_set call site: the entered value goes here and nowhere else.
      await invoke("key_set", { provider: def.id, key });
      status.textContent = "Saved";
    } catch (e) {
      status.textContent = `Save failed: ${String(e)}`;
    }
    await refreshBadge(def.id);
  });

  removeBtn.addEventListener("click", async () => {
    input.value = "";
    testResult.textContent = "";
    try {
      await invoke("key_remove", { provider: def.id });
      status.textContent = "Removed";
    } catch (e) {
      status.textContent = `Remove failed: ${String(e)}`;
    }
    await refreshBadge(def.id);
  });

  testBtn.addEventListener("click", async () => {
    testResult.textContent = "";
    status.textContent = "Testing…";
    try {
      const ok = await invoke<boolean>("key_test", { provider: def.id });
      testResult.textContent = ok ? "✓" : "✗";
      status.textContent = ok ? "Key valid" : "Key invalid";
    } catch (e) {
      testResult.textContent = "✗";
      status.textContent = `Test failed: ${String(e)}`;
    }
  });

  const actions = document.createElement("div");
  actions.className = "settings-row-actions";
  actions.append(saveBtn, removeBtn, testBtn);

  row.append(name, badge, input, actions, testResult, status);
  return row;
}

export function initSettings(): void {
  const list = document.querySelector("#settings-list");
  if (!list || list.childElementCount > 0) return;
  for (const def of PROVIDERS) {
    list.appendChild(buildRow(def));
  }
  void refreshAllBadges();
}
