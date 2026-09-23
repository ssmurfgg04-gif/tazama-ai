#!/usr/bin/env node
/**
 * Visual QA harness — Tazama AI frontend under Playwright (Chromium).
 *
 * The Tauri Linux binary builds and runs, but this GPU-less container aborts
 * WebKit's EGL init, so we render the EXACT built frontend (dist/) in
 * Chromium with a faithful mock of the Tauri v2 IPC internals:
 *   - key_has / key_set / key_remove  → local fixture
 *   - memory_search / memory_add      → in-memory fixture
 *   - chat_complete                   → REAL AI via the local zai proxy
 *   - screenshot / cu_exec            → graceful stubs
 *
 * Usage: node scripts/visual-harness.mjs [scene]
 *   scenes: home | characters | settings | chat | onboarding | all
 */
import { chromium } from "/home/z/.npm-global/lib/node_modules/playwright/index.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const SHOTS = path.join(ROOT, "..", "download", "tazama-shots");
const PORT = 1430;
const SCENE = process.argv[2] || "all";

fs.mkdirSync(SHOTS, { recursive: true });

/* ── static server for dist/ ── */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ogg": "audio/ogg" };
const server = http.createServer((req, res) => {
  let p = req.url.split("?")[0];
  if (p === "/") p = "/index.html";
  const file = path.join(DIST, p);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(fs.readFileSync(file));
  } else {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(fs.readFileSync(path.join(DIST, "index.html")));
  }
});
await new Promise(r => server.listen(PORT, r));

/* ── Tauri v2 IPC mock ── */
const state = { keys: { "zai-local": "local-key" } };
const mockInvoke = async (cmd, args) => {
  switch (cmd) {
    case "key_has":    return Boolean(state.keys[args?.provider]);
    case "key_set":    { state.keys[args?.provider] = args?.key ?? "k"; return null; }
    case "key_remove": { delete state.keys[args?.provider]; return null; }
    case "key_test":   return Boolean(state.keys[args?.provider]);
    case "memory_count": return 3;
    case "memory_search": return [
      { id: "m1", content: "User prefers concise answers", score: 0.9, created_at: "2026-09-22T10:00:00Z" },
      { id: "m2", content: "Working on a Tauri app called Tazama", score: 0.8, created_at: "2026-09-22T09:00:00Z" },
    ];
    case "memory_add": case "memory_recall": case "agent_list":
    case "note_list": case "routine_list": case "goal_list": return [];
    case "agent_get": return null;
    case "chat_complete": {
      // REAL AI through the local zai proxy — same call the Rust core makes
      const provider = args?.provider ?? "zai-local";
      if (provider !== "zai-local") return "[mock] Provider not wired in this harness";
      const res = await fetch("http://127.0.0.1:8788/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: args?.model ?? "glm-4.6", messages: args?.messages ?? [] }),
      });
      const body = await res.json();
      return body?.choices?.[0]?.message?.content ?? "[empty]";
    }
    case "screenshot": throw new Error("capture not set up in harness");
    case "cu_exec": return "OK";
    default:
      if (cmd.startsWith("plugin:")) return null;
      return null;
  }
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 400, height: 680 }, deviceScaleFactor: 2 });
page.on("console", m => { if (m.type() === "error") console.log("[page-error]", m.text().slice(0, 160)); });

// Define the FULL mock inside addInitScript as a string so it runs BEFORE
// the app bundle captures window.__TAURI_INTERNALS__.
const mockInit = `
  window.__mockState = { keys: { "zai-local": "local-key" } };
  async function __mockInvoke(cmd, args) {
    switch (cmd) {
      case "key_has":    return Boolean(window.__mockState.keys[args && args.provider]);
      case "key_set":    { window.__mockState.keys[args && args.provider] = (args && args.key) || "k"; return null; }
      case "key_remove": { delete window.__mockState.keys[args && args.provider]; return null; }
      case "key_test":   return Boolean(window.__mockState.keys[args && args.provider]);
      case "memory_count": return 3;
      case "memory_search": return [
        { id: "m1", content: "User prefers concise answers", score: 0.9, created_at: "2026-09-22T10:00:00Z" },
        { id: "m2", content: "Working on a Tauri app called Tazama", score: 0.8, created_at: "2026-09-22T09:00:00Z" },
      ];
      case "memory_add": case "memory_recall": case "agent_list":
      case "note_list": case "routine_list": case "goal_list": return [];
      case "agent_get": return null;
      case "chat_complete": {
        const provider = (args && args.provider) || "zai-local";
        if (provider !== "zai-local") return "[mock] Provider not wired in this harness";
        const res = await fetch("http://127.0.0.1:8788/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: (args && args.model) || "glm-4.6", messages: (args && args.messages) || [] }),
        });
        const body = await res.json();
        return (body && body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content) || "[empty]";
      }
      case "screenshot": throw new Error("capture not set up in harness");
      case "cu_exec": return "OK";
      default:
        if (String(cmd).startsWith("plugin:")) return null;
        return null;
    }
  }
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    plugins: {},
    transformCallback: (cb) => cb,
    invoke: __mockInvoke,
  };
  window.__TAURI_IPC__ = () => {};
`;
await page.addInitScript(mockInit);

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });

async function shot(name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  console.log("shot:", `${name}.png`);
}

async function gotoScene(which) {
  if (which === "onboarding") {
    await page.evaluate(() => localStorage.removeItem("tazama-onboarded"));
  } else {
    await page.evaluate(() => localStorage.setItem("tazama-onboarded", "1"));
  }
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1400); // shimmer → suggestions transition
}

const scenes = SCENE === "all" ? ["home", "characters", "settings", "chat", "cast", "onboarding"] : [SCENE];

for (const s of scenes) {
  if (s === "home") {
    await gotoScene("home");
    await shot("v1-home");
  } else if (s === "characters") {
    await gotoScene("home");
    await page.click('.rail-row[data-page="characters"]');
    await page.waitForTimeout(600);
    await shot("v1-characters");
    // pick a character → detail (scroll the detail pane into view)
    const cards = await page.$$(".character-card");
    if (cards.length > 3) {
      await cards[3].click();
      await page.waitForTimeout(500);
      await page.locator(".character-detail").scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await shot("v1-character-detail");
      // family filter demo — SpongeBob show
      const chips = await page.$$(".family-chip");
      if (chips.length > 1) { await chips[1].click(); await page.waitForTimeout(400); }
      await page.locator(".character-detail").scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await shot("v1-character-filtered");
    }
  } else if (s === "settings") {
    await gotoScene("home");
    await page.click('.rail-row[data-page="settings"]');
    await page.waitForTimeout(600);
    await shot("v1-settings");
  } else if (s === "chat") {
    await gotoScene("home");
    await page.fill(".composer-input", "In one short sentence: what makes a desktop buddy app feel alive?");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(9000); // real AI reply
    await shot("v1-chat");
  } else if (s === "cast") {
    // Full cast flow: Characters → pick Vex → Cast → Home shows persona
    await gotoScene("home");
    await page.click('.rail-row[data-page="characters"]');
    await page.waitForTimeout(500);
    const vex = await page.$$(".character-card");
    if (vex.length > 1) {
      await vex[1].click(); // Vex
      await page.waitForTimeout(500);
      await page.locator(".character-detail").scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await shot("v1-cast-detail");
      await page.click(".cast-btn");
      await page.waitForTimeout(700);
      await shot("v1-cast-characters");
    }
    // Back to Home — name-tag + accent should be Vex
    await page.click('.rail-row[data-page="home"]');
    await page.waitForTimeout(800);
    await shot("v1-cast-home");
    // Chat as Vex — persona should drive the voice
    await page.fill(".composer-input", "Say hello and tell me what you can do, in character, two sentences max.");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(9000);
    await shot("v1-cast-chat");
  } else if (s === "onboarding") {
    await gotoScene("onboarding");
    await page.waitForTimeout(600);
    await shot("v1-onboarding");
  }
}

await browser.close();
server.close();
console.log("done");
