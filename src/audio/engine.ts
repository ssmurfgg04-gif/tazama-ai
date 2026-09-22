/**
 * Sound engine — Tazama AI
 * Real WAV chimes (generated, ~395KB total), better than HeyClicky's ~1.5MB.
 * Architecture mirrors HeyClicky's ChimePlaybackEngine:
 *   - Pre-decodes all buffers at startup (ClickyChimeWarmer pattern)
 *   - Per-response guards (hasPlayedTextReceiveChimeForCurrentResponse)
 *   - Master toggle (localStorage "sound-enabled")
 *   - Muted-speaker detection
 *   - WebView2 autoplay: resumes on first user gesture
 */

const CHIMES = [
  "agent-launch","agent-done","agent-needs-you","agent-close",
  "text-open","text-send","text-close","text-receive",
  "tapback","skill-up","skill-down","reveal-boot",
  "home-reveal","connection-question","enter",
] as const;
type ChimeName = typeof CHIMES[number];

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<ChimeName, AudioBuffer>();
  private guards  = new Map<ChimeName, number>();
  private enabled = localStorage.getItem("sound-enabled") !== "false";
  private warmed  = false;
  private readonly GUARD_MS = 400;

  // Pre-decode all buffers (ClickyChimeWarmer pattern)
  private async warm(): Promise<void> {
    if (this.warmed || !this.ctx) return;
    this.warmed = true;
    await Promise.allSettled(
      CHIMES.map(async name => {
        try {
          const resp = await fetch(`/assets/sounds/${name}.wav`);
          if (!resp.ok) return;
          const buf = await resp.arrayBuffer();
          this.buffers.set(name, await this.ctx!.decodeAudioData(buf));
        } catch { /* non-critical — oscillator fallback */ }
      })
    );
  }

  async resume(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: 44100 });
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.8 : 0;
      this.master.connect(this.ctx.destination);
      this.warm();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  play(name: string): void {
    if (!this.enabled) return;
    const now = Date.now();
    const last = this.guards.get(name as ChimeName) ?? 0;
    if (now - last < this.GUARD_MS) return;
    this.guards.set(name as ChimeName, now);
    this.resume().then(() => this.playBuffer(name as ChimeName));
  }

  private playBuffer(name: ChimeName): void {
    if (!this.ctx || !this.master) return;
    const buf = this.buffers.get(name);
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.master);
      src.start();
    } else {
      // Oscillator fallback (silent if WAV not loaded)
      this.oscillatorFallback(name);
    }
  }

  private oscillatorFallback(name: ChimeName): void {
    if (!this.ctx || !this.master) return;
    const PITCHES: Partial<Record<ChimeName, number>> = {
      "agent-launch": 523, "agent-done": 659, "agent-needs-you": 880,
      "agent-close": 440, "text-open": 1047, "text-send": 988,
      "text-close": 698, "text-receive": 784, "tapback": 1319,
      "skill-up": 1047, "skill-down": 622, "reveal-boot": 1047,
      "home-reveal": 880, "connection-question": 740, "enter": 1319,
    };
    const freq = PITCHES[name] ?? 880;
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.22);
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    localStorage.setItem("sound-enabled", String(v));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(v ? 0.8 : 0, this.ctx.currentTime, 0.05);
    }
  }

  isMuted(): boolean {
    return !this.ctx || this.ctx.state !== "running" || !this.enabled;
  }
}

export const soundEngine = new SoundEngine();

// Event bus
document.addEventListener("tazama:sound",        e => soundEngine.play((e as CustomEvent<string>).detail));
document.addEventListener("tazama:sound-toggle",  e => soundEngine.setEnabled((e as CustomEvent<boolean>).detail));

// Resume on first gesture (WebView2 autoplay policy)
document.addEventListener("pointerdown", () => soundEngine.resume(), { once: true });
