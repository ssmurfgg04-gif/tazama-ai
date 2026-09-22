<div align="center">

<br />

```
  ◎ TAZAMA AI
```

**Your screen buddy that watches along and shows you how.**

A Windows companion that sits on your screen, sees what you see,
remembers what you've done, and helps you do the next thing —
without ever leaving your workflow.

<br />

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%20v2-orange.svg)](https://tauri.app)
[![Rust](https://img.shields.io/badge/backend-Rust-red.svg)](https://www.rust-lang.org)
[![Windows](https://img.shields.io/badge/platform-Windows%2010%2B-0078d4.svg)](#)
[![Tests](https://img.shields.io/badge/tests-31%20passing-brightgreen.svg)](#)
[![Release](https://img.shields.io/badge/version-0.1.0-informational.svg)](#download)

<br />

<!-- Screenshot placeholder — replace with actual screenshot before release -->
<!-- Recommended: 1280×800 PNG showing the HomeSpace window + notch pill live -->

</div>

---

## What is Tazama AI?

*Tazama* means **"to observe"** in Swahili.

Tazama AI is a lightweight Windows desktop companion that:

- **Watches your screen** — takes a screenshot on demand and understands what you're looking at
- **Talks with you** — chat via text or voice using your own AI provider keys (Anthropic, OpenAI, Groq, NVIDIA, Fish Audio)
- **Remembers things** — built-in local memory store (SQLite + FTS5) that persists across sessions, no cloud required
- **Shows you where to click** — annotates your screen with visual guides and can perform actions for you
- **Stays out of the way** — transparent overlay window, click-through when idle, a tiny top-edge pill that grows on hover

It works entirely on your machine. No account required. No subscription. Your API keys stay in the Windows Credential Manager — they never leave your device.

---

## Demo

> Screenshot / GIF coming soon — run `npm run tauri dev` to see it live.

---

## Features

### 🧠 Built-in Memory
Persistent SQLite store with full-text search. The buddy remembers conversations, facts you tell it, and things it learns from your workflow — across every session. No cloud sync. No account. Just a database file in your AppData folder.

### 👁️ Screen Awareness
Takes a screenshot on demand, walks the Windows UI Automation element tree to understand what's on screen, and annotates specific elements with visual guides — arrows, highlights, click targets.

### 🤖 Computer Use
Can move your mouse, type text, press key combinations, and scroll — all via explicit approval gates. Every destructive action requires confirmation. Follows the Anthropic `computer_toolset_20260801` coordinate specification exactly.

### 🔐 Secure by Design
- All AI provider calls run in **Rust** — your API keys never touch the browser or JavaScript
- Keys stored in the **Windows Credential Manager** (not a config file, not localStorage)
- Strict CSP, pruned WebView capabilities, bulletproof leak gate in CI

### 🔊 Real Sound Design
15 synthesised WAV chimes (395 KB total) — one per UI event. Agent launch, message received, task done, skill activated, tapback. All pre-decoded at startup, per-response guards prevent double-firing. Master toggle in Settings.

### 🌅 Morning Ritual
Time-gated suggestion cards at 6 am / 9 am / noon / 3 pm / 6 pm — personalised using your memory store. Dismiss ("Not now"), snooze, or tell it the suggestion isn't useful (stored so it never resurfaces).

### ⚡ Skill Slots
Three orbital skill slots — assign skills, see them orbit the centre, celebrate with a physics wiggle when you activate one.

### 🎨 Pixel-Perfect UI
Dark-first design system derived from real binary token analysis. Glass surfaces with `backdrop-filter: blur(28px)`. Gel buttons with 3-stop gradients and stacked inner shadows. Staggered spring entrances. Shimmer skeletons. Breathing dot. All motion respects `prefers-reduced-motion`.

---

## Architecture

```
┌─ Vite + TypeScript (frontend) ──────────────────────────────┐
│  HomeSpace · Agent HUD · Notch Pill · Onboarding · Settings │
│  Morning suggestions · PowerUp panel · Cowork log           │
│  Sound engine (WebAudio, real WAVs) · Eye mascot (SVG)      │
└─── Tauri IPC (capability-gated, no secrets cross the bridge) ┘

┌─ Rust (src-tauri) ──────────────────────────────────────────┐
│  providers.rs    — AI calls (Anthropic/OpenAI/Groq/NVIDIA)  │
│  secrets.rs      — OS Credential Manager CRUD               │
│  memory.rs       — SQLite + FTS5 memory store               │
│  capture.rs      — screen capture (xcap) + UI Automation    │
│                    + computer-use executor (cu_exec)         │
│  agents.rs       — persistent named agents + AGENTS.md      │
│  notes.rs        — notes / routines / goals / clipboard     │
│  migrate.rs      — one-time plaintext key migration         │
└─────────────────────────────────────────────────────────────┘

Storage
  %APPDATA%\com.tazamaai.app\tazama-memory.db   ← memory
  %APPDATA%\com.tazamaai.app\brain.json         ← notes/routines/goals
  %APPDATA%\com.tazamaai.app\agents.json        ← saved agents
  Windows Credential Manager                    ← all API keys
```

---

## Getting Started

### Prerequisites

- Windows 10 or 11 (64-bit)
- [Rust stable](https://rustup.rs/) ≥ 1.77.2
- [Node.js](https://nodejs.org/) ≥ 20 LTS
- Visual Studio 2022 Build Tools with **Desktop development with C++** workload
- Edge WebView2 Runtime (pre-installed on Windows 11; auto-downloaded on Windows 10)

### Run in development

```powershell
# Clone
git clone https://github.com/ssmurfgg04-gif/tazama-ai.git
cd tazama-ai

# Install frontend deps
npm install

# Open a VS Developer shell, then:
npm run tauri dev
```

The first compile takes 5–8 minutes (Rust compiles ~40 crates). After that, hot-reload is instant for CSS/TypeScript and a few seconds for Rust changes.

### Build for release

```powershell
npm run tauri build
```

Output: `src-tauri/target/release/bundle/nsis/tazama-ai_0.1.0_x64-setup.exe` (~15 MB)

---

## Configuration

### Adding an AI provider key

Open the app → Settings → **AI Providers** → paste your key → Save.

Keys are stored immediately in the Windows Credential Manager. The UI only ever shows **Set** / **Unset** — the value is never displayed.

Supported providers:

| Provider | Used for |
|---|---|
| [Anthropic](https://console.anthropic.com/) | Chat (Haiku, Fable, Sonnet) |
| [OpenAI](https://platform.openai.com/) | Chat + Whisper transcription + TTS |
| [Groq](https://console.groq.com/) | Fast chat + Whisper transcription |
| [NVIDIA NIM](https://build.nvidia.com/) | Chat |
| [Fish Audio](https://fish.audio/) | Speech-to-text + Text-to-speech |

You need at least one key. Start with Anthropic or Groq (both have generous free tiers).

### Accent colour

Settings → Appearance → pick from 5 swatches. The accent drives the cursor caret, text selection, gel button tint, HUD chip colour, and the eye mascot's iris — all from one token (`--accent`).

### Hotkey

Settings → Shortcuts → click **Change** on the global hotkey row → press your combination. The recorder shows live keycap chips and warns you about collisions with system shortcuts.

---

## Memory

Tazama AI has a built-in memory system powered by SQLite and FTS5 full-text search. Every conversation can be remembered, searched, and deleted — all stored locally.

```
# What gets remembered (examples)
"User asked how to fix the ESLint error in routes.ts"
"User prefers dark mode. Uses Claude for code review."
"Project: tazama-ai. Stack: Tauri v2 + Rust + TypeScript."
```

Memory is searched before each AI call so the buddy has relevant context automatically. You can also call it directly:

| Command | What it does |
|---|---|
| `memory_add(content)` | Store a fact |
| `memory_search(query, limit)` | FTS5 search with relevance ranking |
| `memory_recall(n)` | Fetch N most recent memories |
| `memory_delete(id)` | Remove a specific memory |
| `memory_count()` | Total memories stored |

The database lives at `%APPDATA%\com.tazamaai.app\tazama-memory.db`. Back it up, move it between machines, open it in any SQLite browser.

---

## Computer Use

Tazama AI can control your computer — click buttons, type text, scroll, press keyboard shortcuts — following the Anthropic `computer_toolset_20260801` specification.

**Safety gates (always enforced):**
- Every destructive or irreversible action requires explicit user approval
- Screenshots are downscaled to ≤1280×720 before being sent to the AI (API spec)
- Coordinate scaling is tracked precisely — screenshot pixels map back to screen pixels
- All actions run through `cu_exec` in Rust — not arbitrary shell execution

**Supported actions:** `left_click`, `double_click`, `right_click`, `mouse_move`, `scroll`, `type`, `key` (with `+repeat`), `cursor_position`, `wait`.

Screen capture uses [xcap](https://github.com/nashaofu/xcap) (same library as the official Tauri screenshots plugin). UI element inspection uses the [uiautomation](https://crates.io/crates/uiautomation) crate.

---

## Persistent Agents

Create named AI personas with their own system prompts, skill lists, and accent colours. Each agent has an `AGENTS.md` notes file that persists between sessions — the buddy reads it before every conversation and updates it when it learns something new.

```json
{
  "name": "Code Buddy",
  "description": "Helps with Rust and TypeScript",
  "system_prompt": "You are a senior Rust developer...",
  "accent": "#26C281",
  "skills": ["code-review", "debugging"]
}
```

Agents are stored in `%APPDATA%\com.tazamaai.app\agents.json`.

---

## Security

Tazama AI was designed with security as a first-class constraint, not an afterthought.

**Key handling**
- Zero API keys in JavaScript. All provider calls happen in Rust via `reqwest` + `rustls`
- Keys stored in the Windows Credential Manager (`tauri-plugin-keyring`)
- Keys never appear in logs, error messages, IPC payloads, or the dist bundle
- A CI gate (`no-leak-check.mjs`) scans the production JS bundle on every build and fails if any secret pattern is found

**WebView isolation**
- Strict `Content-Security-Policy` — no eval, no inline scripts
- Capabilities pruned to `core:*` only — no plugin IPC exposed to the WebView
- DevTools disabled in release builds

**Data**
- All storage is local. No telemetry. No crash reporting. No analytics.
- Memory DB is plain SQLite — readable, auditable, fully under your control.

---

## Testing

```powershell
cd src-tauri
# Load VsDevCmd first (required on Windows — cl.exe not on plain PATH)
cargo test
```

**31 tests** covering:
- Keyring roundtrip (real Windows Credential Manager)
- Provider auth payload formation (wiremock, no real keys)
- Key migration persist-then-delete order
- Screenshot coordinate scaling
- Memory SQLite insert / FTS search / delete
- Agent and goal step logic
- Capability manifest (no blanket permissions, no null CSP)

---

## Project Structure

```
tazama-ai/
├── src/                        # TypeScript frontend (Vite)
│   ├── ui/
│   │   ├── homespace.ts        # Main companion window
│   │   ├── hud.ts              # Floating agent HUD
│   │   ├── mascot.ts           # SVG eye mascot with pointer tracking
│   │   ├── notch-pill.ts       # Top-edge docked pill
│   │   ├── onboarding.ts       # Permission cards + constellation
│   │   ├── morning.ts          # Time-gated suggestion ritual
│   │   ├── hotkey.ts           # Keycap recorder + global shortcuts
│   │   ├── powerup.ts          # Orbital skill slots
│   │   ├── cowork.ts           # Copyable command log (Dark+ palette)
│   │   └── cursor-overlay.ts   # Annotation canvas (Plan C)
│   ├── audio/
│   │   └── engine.ts           # WebAudio engine, 15 WAV chimes
│   ├── styles/
│   │   ├── tokens.css          # Full design token system
│   │   ├── app.css             # HomeSpace, HUD, onboarding, settings
│   │   └── features.css        # Mascot, notch, hotkey, PowerUp, cowork
│   └── assets/
│       ├── icons/              # 20 SVG icons (Phosphor Light style)
│       └── sounds/             # 15 WAV chimes (395 KB total)
│
└── src-tauri/                  # Rust backend
    └── src/
        ├── lib.rs              # App builder, plugin registration
        ├── providers.rs        # AI provider calls (5 providers)
        ├── secrets.rs          # OS Credential Manager CRUD
        ├── memory.rs           # SQLite + FTS5 memory store
        ├── capture.rs          # Screen capture + UI Automation + computer-use
        ├── agents.rs           # Persistent named agents
        ├── notes.rs            # Notes, routines, goals, clipboard
        └── migrate.rs          # Legacy plaintext key migration
```

---

## Roadmap

- [ ] **Auto-updater** — Tauri updater with static JSON feed, dual CDN endpoints, EV signing
- [ ] **Cursor annotation overlay** — real-time visual guides drawn on screen (`[TARGET] [HOVER] [POINT]` grammar)
- [ ] **Voice hotkey** — push-to-talk with global shortcut, visual hold indicator
- [ ] **Skills catalog** — installable workflow skills with a browser UI
- [ ] **Integrations** — Gmail, Google Calendar, Notion, Linear via Composio
- [ ] **Onboarding video** — short WebM demo instead of the current permission-card shell
- [ ] **ARM64 build** — for Copilot+ PCs and Surface Pro

---

## Contributing

Pull requests are welcome. For major changes, open an issue first.

**Before submitting:**
```powershell
cd src-tauri && cargo test      # all tests must pass
cd .. && npm run build          # frontend must build clean
npm run leakcheck               # no secrets in the bundle
```

The repository enforces:
- No secrets in the JS bundle (CI gate exits 1 on any match)
- CSP must be a real string, never `null`
- Capabilities must be `core:*` only — no plugin IPC without justification in `capabilities/README.md`

---

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">

Made with care on Windows · Rust + Tauri · Named from Swahili *"to observe"*

**[⭐ Star this repo](https://github.com/ssmurfgg04-gif/tazama-ai)** if Tazama AI is useful to you

</div>
