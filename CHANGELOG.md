# Changelog

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
