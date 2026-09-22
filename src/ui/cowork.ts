/**
 * Cowork step log — Tazama AI
 *
 * Copyable command blocks with Dark+ syntax highlighting and collapsible diffs.
 * Better than HeyClicky's CoworkCommandBlock because:
 *   - Syntax highlighting uses CSS classes (no runtime JS parser needed for basic cases)
 *   - Copy button with "Copied ✓" feedback animation
 *   - Expandable/collapsible blocks (HeyClicky is always expanded)
 *   - Step icons match the action type (file write → 📄, git → 🔀, etc.)
 *   - Cost footer shows token estimate (Tazama AI has Rust-side tracking)
 *
 * Mirrors: CoworkStepRow, CoworkCommandBlock, CopyableBlock,
 *          CoworkMarkdownBlockView, ClickyAgentTurnCostFooter
 * Dark+ palette: #1E1E1E #D4D4D4 #569CD6 #9CDCFE #CE9178 #DCDCAA #C586C0 #B5CEA8
 */

export interface CoworkStep {
  type:    "thinking" | "read" | "write" | "edit" | "shell" | "web" | "done" | "error";
  label:   string;      // past tense: "Checked git status"
  detail?: string;      // optional command / output (shown in expandable block)
  cost?:   number;      // token count
}

const STEP_ICONS: Record<CoworkStep["type"], string> = {
  thinking: "◌",
  read:     "📄",
  write:    "✏️",
  edit:     "✏️",
  shell:    "⌘",
  web:      "🌐",
  done:     "✓",
  error:    "✗",
};

// ─── Step row ─────────────────────────────────────────────────────────────────

export function buildCoworkStep(step: CoworkStep): HTMLElement {
  const row = document.createElement("div");
  row.className = `cowork-step-row cowork-step-${step.type}`;

  const icon = document.createElement("span");
  icon.className = "cowork-step-icon";
  icon.textContent = STEP_ICONS[step.type] ?? "·";
  icon.setAttribute("aria-hidden", "true");

  const lbl = document.createElement("span");
  lbl.className = "cowork-step-label";
  lbl.textContent = step.label;

  row.append(icon, lbl);

  if (step.detail) {
    const toggle = document.createElement("button");
    toggle.className = "cowork-expand-btn";
    toggle.textContent = "···";
    toggle.setAttribute("aria-label", "Show command details");

    const block = buildCommandBlock(step.detail);
    block.style.display = "none";

    toggle.addEventListener("click", () => {
      const open = block.style.display !== "none";
      block.style.display = open ? "none" : "";
      toggle.textContent = open ? "···" : "▲";
    });

    row.append(toggle, block);
  }

  if (step.cost) {
    const cost = document.createElement("span");
    cost.className = "cowork-step-cost";
    cost.textContent = `~${formatTokens(step.cost)}`;
    row.append(cost);
  }

  return row;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k tok`;
  return `${n} tok`;
}

// ─── Command block with copy ───────────────────────────────────────────────────

export function buildCommandBlock(content: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "cowork-cmd-block";

  const pre = document.createElement("pre");
  pre.className = "cowork-code";
  pre.innerHTML = syntaxHighlight(content);

  const copyBtn = document.createElement("button");
  copyBtn.className = "cowork-copy-btn";
  copyBtn.textContent = "Copy";
  copyBtn.setAttribute("aria-label", "Copy to clipboard");

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(content);
      copyBtn.textContent = "Copied ✓";
      copyBtn.classList.add("is-copied");
      setTimeout(() => {
        copyBtn.textContent = "Copy";
        copyBtn.classList.remove("is-copied");
      }, 1500);
    } catch {
      copyBtn.textContent = "Failed";
    }
  });

  wrap.append(copyBtn, pre);
  return wrap;
}

// ─── Dark+ syntax highlight (CSS class injection, no runtime parser) ───────────

function syntaxHighlight(code: string): string {
  const escaped = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Very lightweight tokeniser for common patterns
  return escaped
    // Strings (single and double quoted)
    .replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, '<span class="tok-str">$&</span>')
    // Shell keywords
    .replace(/\b(git|npm|cargo|cd|ls|mkdir|rm|cp|mv|cat|echo|curl|python|node)\b/g,
             '<span class="tok-kw">$&</span>')
    // Flags --flag / -f
    .replace(/( --?[\w-]+)/g, '<span class="tok-flag">$&</span>')
    // Comments
    .replace(/(#[^\n]*)/g, '<span class="tok-comment">$&</span>')
    // Numbers
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-num">$&</span>');
}

// ─── Full turn block ───────────────────────────────────────────────────────────

export function buildTurnBlock(steps: CoworkStep[], totalCost?: number): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "cowork-turn";
  steps.forEach(s => wrap.append(buildCoworkStep(s)));
  if (totalCost) {
    const footer = document.createElement("div");
    footer.className = "cowork-cost-footer";
    footer.textContent = `${formatTokens(totalCost)} used this turn`;
    wrap.append(footer);
  }
  return wrap;
}
