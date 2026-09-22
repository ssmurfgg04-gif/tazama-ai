/**
 * Sound engine — Tazama AI
 *
 * Mirrors HeyClicky's ChimePlaybackEngine:
 *   - Single AudioContext, resumes on first user gesture (WebView2 autoplay rules)
 *   - ClickyChimeWarmer: pre-decodes buffers on startup
 *   - Per-response guards (hasPlayedTextReceiveChimeForCurrentResponse)
 *   - Master toggle (ClickyNotchSoundsEnabled → stored in localStorage)
 *   - Muted-speaker detection: check AudioContext.state and system volume
 *
 * Sprite map: ui-sprite.ogg (Opus, not yet bundled — stub uses oscillator tones)
 * Each cue name maps to a [startSeconds, durationSeconds] pair in the sprite.
 *
 * See docs/design/heyclicky-ui-brief.md §4 for the full sound map.
 */

interface CueDef { start: number; duration: number; }

// Sprite cue map (placeholder — fill in after ui-sprite.ogg is authored)
const CUE_MAP: Record<string, CueDef> = {
  "agent-launch":      { start:  0.00, duration: 0.70 },
  "agent-done":        { start:  0.75, duration: 0.80 },
  "agent-needs-you":   { start:  1.60, duration: 0.75 },
  "agent-close":       { start:  2.40, duration: 0.70 },
  "text-open":         { start:  3.15, duration: 0.60 },
  "text-send":         { start:  3.80, duration: 0.45 },
  "text-close":        { start:  4.30, duration: 0.65 },
  "tapback":           { start:  5.00, duration: 0.30 },
  "skill-up":          { start:  5.35, duration: 0.60 },
  "skill-down":        { start:  6.00, duration: 0.70 },
  "reveal-boot":       { start:  6.75, duration: 0.90 },
  "home-reveal":       { start:  7.70, duration: 1.00 },
  "connection-question":{ start: 8.75, duration: 0.80 },
  "enter":             { start:  9.60, duration: 0.20 },
};

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private spriteBuffer: AudioBuffer | null = null;
  private enabled = localStorage.getItem("sound-enabled") !== "false";
  private guards: Map<string, number> = new Map(); // name → last play time
  private readonly GUARD_MS = 500; // debounce per cue

  /** Resume/create AudioContext on first user gesture */
  async resume(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: 48000 });
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = this.enabled ? 1 : 0;
      // Pre-warm (ClickyChimeWarmer pattern): load sprite in background
      this.loadSprite().catch(() => null);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  private async loadSprite(): Promise<void> {
    // Sprite not yet bundled — this is the wiring stub.
    // When ui-sprite.ogg exists at the path below, uncomment:
    // const res = await fetch("/ui-sprite.ogg");
    // const buf = await res.arrayBuffer();
    // this.spriteBuffer = await this.ctx!.decodeAudioData(buf);
  }

  /** Play a UI cue by name. Falls back to a short oscillator tone if no sprite. */
  play(name: string): void {
    if (!this.enabled) return;
    const now = Date.now();
    const last = this.guards.get(name) ?? 0;
    if (now - last < this.GUARD_MS) return; // per-response guard
    this.guards.set(name, now);

    this.resume().then(() => {
      if (this.spriteBuffer && CUE_MAP[name]) {
        this.playFromSprite(name);
      } else {
        this.playTone(name);
      }
    });
  }

  private playFromSprite(name: string): void {
    if (!this.ctx || !this.spriteBuffer || !this.masterGain) return;
    const cue = CUE_MAP[name];
    const src = this.ctx.createBufferSource();
    src.buffer = this.spriteBuffer;
    src.connect(this.masterGain);
    src.start(0, cue.start, cue.duration);
  }

  /** Oscillator fallback — pitches approximate the role of each cue */
  private playTone(name: string): void {
    if (!this.ctx || !this.masterGain) return;
    const TONES: Record<string, number> = {
      "agent-launch":  880,
      "agent-done":    1047,
      "agent-needs-you": 660,
      "agent-close":   523,
      "text-open":     784,
      "text-send":     988,
      "text-close":    698,
      "tapback":       1175,
      "skill-up":      1047,
      "skill-down":    622,
      "reveal-boot":   1047,
      "home-reveal":   880,
      "connection-question": 740,
      "enter":         1319,
    };
    const freq = TONES[name] ?? 880;
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.frequency.value = freq;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.18);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.20);
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    localStorage.setItem("sound-enabled", String(v));
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(v ? 1 : 0, this.ctx!.currentTime, 0.05);
    }
  }

  /** True if the system audio context is running and not muted */
  isMuted(): boolean {
    return !this.ctx || this.ctx.state !== "running" || !this.enabled;
  }
}

export const soundEngine = new SoundEngine();

// Wire global event bus
document.addEventListener("tazama:sound", (e: Event) => {
  soundEngine.play((e as CustomEvent<string>).detail);
});
document.addEventListener("tazama:sound-toggle", (e: Event) => {
  soundEngine.setEnabled((e as CustomEvent<boolean>).detail);
});
// Resume on first gesture
document.addEventListener("pointerdown", () => soundEngine.resume(), { once: true });
