# Changelog

## [0.2.0] — 2026-09-22

### Characters — cast your buddy

- 16 original castable characters across 8 archetype families (Sci-Fi Chaos,
  Office Sitcom, Meadowcore, Fantasy Quest, Detective Noir, Saturday Morning,
  Deep Sea Radio, Cozy Slice-of-Life) plus the Tazama classic eye
- Gleam-inspired "Cast a buddy" page: search, family filters, persona detail
  with traits and sample line, one-click cast, Surprise me shuffle
- Casting changes everything: accent colour, header buddy chip, name-tag
  greeting, personalised starter prompts, and the AI's voice via a persona
  system prompt prepended to chat completions

### Personality & Apple-taste UI overhaul

- Ambient aurora background replaces the flat black canvas (accent-tinted,
  drifts slowly, honours the animations toggle and reduced motion)
- Liquid-Glass material pass: floating dock rail with gel active pill and
  hover tooltips, glass suggested cards with accent lift, elevated composer
  with scroll-edge shadow, glass settings groups
- HeyClicky "Hello my name is" name-tag sticker as the Home identity moment
- Settings rows rebuilt as a predictable grid with pill action buttons
- Visible keyboard focus rings everywhere (HIG)
- Notch pill + HUD step aside inside the app window (they are ambient
  overlays; the header buddy chip is the in-app presence)

### AI providers

- New `zai` provider for the Z.ai open platform (GLM models, Bearer key)
- New `zai-local` provider: chat through the locally-authenticated
  z-ai-web-dev-sdk via `scripts/zai-proxy.mjs` (OpenAI-compatible localhost
  proxy on 127.0.0.1:8788 — zero keys needed)

### Linux support

- Full Linux port: UIA/SendKeys code paths are Windows-gated; Linux ships
  screenshot capture (xcap) with graceful fallbacks for computer-use
- Keys: Linux sessions without a secret service fall back to a 0600 file
  store inside the app-data dir
- Release pipeline now builds Linux AppImage + deb alongside the Windows
  NSIS + MSI; build-check runs the full Rust test suite on Linux too

### Fixed

- Conversation transcript duplicated every bubble on each message render
  (append-only renderMessages never cleared the container first)

### QA

- Windows QA workflow now quiets the desktop before screenshots: minimises
  all windows and hides the runner host console so evidence shows only the app


All notable changes to Tazama AI are documented here.

## [0.1.0] — 2026-09-22

### First release

**Core**
- Tauri v2 + Rust + TypeScript (Vite) — 7.45 MB exe
- All AI provider calls in Rust — keys never touch the browser
- API keys stored in Windows Credential Manager via `tauri-plugin-keyring`
- Strict CSP, `core:*`-only capabilities, bulletproof leak gate in CI
- 31 automated tests (keyring roundtrip, provider auth, migration, memory, capture)

**AI Providers**
- Anthropic (chat: Haiku, Fable, Sonnet)
- OpenAI (chat + Whisper transcription + TTS)
- Groq (fast chat + Whisper)
- NVIDIA NIM (chat)
- Fish Audio (STT + TTS)

**Memory**
- Built-in SQLite + FTS5 memory store — zero external dependencies
- Persists across sessions, fully local, no account required
- Auto-recalled before each AI call for personalised context

**Screen Awareness**
- Screenshot capture via `xcap` (cross-platform, DPI-aware)
- Windows UI Automation element walk via `uiautomation` crate
- Computer-use executor: click, type, key, scroll, move, wait
- Follows Anthropic `computer_toolset_20260801` coordinate spec

**UI**
- Dark-first design system with 12-stop neutral ramp (exact binary-derived tokens)
- Glass surfaces — `backdrop-filter: blur(28px) saturate(160%)`
- Gel buttons — 3-stop gradient + stacked inner shadows + spring press
- Eye mascot — SVG, pointer-tracking iris, phase-reactive expressions
- Top-edge notch pill with 350ms dwell ring + corner glow
- Floating agent HUD with radio-dispatch chip stack
- Morning ritual — time-gated AI-personalised suggestions at 6 check-in times
- 3-slot PowerUp panel with 24s orbital animation
- Cowork step log — Dark+ palette, copyable, collapsible
- 15 real WAV chimes (395 KB, additive synthesis)
- 20 SVG icons (Phosphor Light style, generated)
- Full `prefers-reduced-motion` support

**Agents & Productivity**
- Persistent named agents with per-agent AGENTS.md notes
- Notes, routines, and goals with CRUD + step-toggle
- One-time migration from legacy plaintext key stores
- Global shortcut support via `tauri-plugin-global-shortcut`

[0.1.0]: https://github.com/ssmurfgg04-gif/tazama-ai/releases/tag/v0.1.0
