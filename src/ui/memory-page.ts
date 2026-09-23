/**
 * Memory page — Tazama AI
 *
 * Search, browse, and delete memories stored in the local
 * SQLite + FTS5 database (memory.rs). Also shows the live count.
 */

import { invoke } from "@tauri-apps/api/core";

interface MemoryItem {
  id:         string;
  content:    string;
  created_at: string;
  score:      number;
}

export async function renderMemoryPage(container: HTMLElement): Promise<void> {
  container.innerHTML = "";
  container.className = "memory-page";

  const header = document.createElement("div");
  header.className = "page-header";

  const title = document.createElement("h2");
  title.className = "page-title";
  title.textContent = "Memory";

  const sub = document.createElement("p");
  sub.className = "page-sub";
  sub.textContent = "Everything Tazama remembers. Stored locally, searchable, deletable.";

  const count = document.createElement("p");
  count.className = "memory-count";
  count.textContent = "…";
  try {
    const n = await invoke<number>("memory_count");
    count.textContent = `${n} ${n === 1 ? "memory" : "memories"} stored`;
  } catch {
    count.textContent = "Memory unavailable";
  }

  header.append(title, sub, count);
  container.append(header);

  // Search row
  const row = document.createElement("div");
  row.className = "memory-search-row";

  const input = document.createElement("input");
  input.className = "memory-search-input";
  input.placeholder = "Search memories…";
  input.setAttribute("aria-label", "Search memories");

  const btn = document.createElement("button");
  btn.className = "gel memory-search-btn";
  btn.textContent = "Search";

  row.append(input, btn);
  container.append(row);

  const list = document.createElement("div");
  list.className = "memory-list";
  container.append(list);

  const doSearch = async () => {
    const q = input.value.trim();
    list.innerHTML = "";
    try {
      const items = q
        ? await invoke<MemoryItem[]>("memory_search", { query: q, limit: 20 })
        : await invoke<MemoryItem[]>("memory_recall", { n: 20 });
      if (items.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-note";
        empty.textContent = q ? "No memories match." : "No memories yet. Talk to Tazama and it will remember.";
        list.append(empty);
        return;
      }
      items.forEach(m => list.append(buildMemoryRow(m, async () => {
        try { await invoke("memory_delete", { id: m.id }); } catch { /* ignore */ }
        await doSearch();
        try {
          const n = await invoke<number>("memory_count");
          count.textContent = `${n} ${n === 1 ? "memory" : "memories"} stored`;
        } catch { /* ignore */ }
      })));
    } catch {
      const empty = document.createElement("p");
      empty.className = "empty-note";
      empty.textContent = "Memory unavailable.";
      list.append(empty);
    }
  };

  btn.addEventListener("click", doSearch);
  input.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });

  await doSearch();
}

function buildMemoryRow(m: MemoryItem, onDelete: () => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "memory-row card";

  const text = document.createElement("p");
  text.className = "memory-text";
  text.textContent = m.content;

  const meta = document.createElement("p");
  meta.className = "memory-meta";
  meta.textContent = formatDate(m.created_at);

  const del = document.createElement("button");
  del.className = "memory-del-btn";
  del.textContent = "Forget";
  del.setAttribute("aria-label", "Forget this memory");
  del.addEventListener("click", onDelete);

  row.append(text, meta, del);
  return row;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
