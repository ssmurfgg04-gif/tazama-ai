"""
Generate Tazama AI UI sound chimes as real WAV files.
Uses only Python stdlib (struct + wave module) — no dependencies.
Produces 14 chimes matching HeyClicky's sound map, all < 50KB each.
Technique: additive sine synthesis with exponential decay envelope.
"""
import wave, struct, math, os

SR = 44100   # sample rate
CHANNELS = 1
WIDTH = 2    # 16-bit

def sine_wave(freq, dur, sr=SR, amp=0.4, decay=6.0):
    """Exponentially decaying sine tone."""
    n = int(dur * sr)
    samples = []
    for i in range(n):
        t = i / sr
        env = math.exp(-decay * t)
        val = amp * env * math.sin(2 * math.pi * freq * t)
        samples.append(int(val * 32767))
    return samples

def chord(freqs, dur, sr=SR, amp=0.3, decay=5.0):
    """Mix multiple sine waves."""
    n = int(dur * sr)
    out = [0.0] * n
    for freq in freqs:
        for i in range(n):
            t = i / sr
            env = math.exp(-decay * t)
            out[i] += amp * env * math.sin(2 * math.pi * freq * t)
    # Normalise
    mx = max(abs(x) for x in out) or 1
    return [int(x / mx * 0.9 * 32767) for x in out]

def two_tone(f1, f2, t_gap, dur1, dur2, sr=SR):
    """Two successive notes with a gap between them."""
    s1 = sine_wave(f1, dur1, sr, amp=0.35, decay=7)
    gap = [0] * int(t_gap * sr)
    s2 = sine_wave(f2, dur2, sr, amp=0.35, decay=7)
    return s1 + gap + s2

def write_wav(path, samples):
    with wave.open(path, 'w') as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(WIDTH)
        wf.setframerate(SR)
        wf.writeframes(struct.pack(f'<{len(samples)}h', *samples))
    sz = os.path.getsize(path)
    print(f'  {os.path.basename(path)} ({sz:,}b, {len(samples)/SR:.2f}s)')

os.makedirs('.', exist_ok=True)

# ── 14 chimes matching HeyClicky's sound map ─────────────────────────────────

# agent-launch: rising two-tone (C5→E5) — "task starting"
write_wav('agent-launch.wav', two_tone(523, 659, 0.04, 0.12, 0.18))

# agent-done: warm chord (E5+G5+C6) — "task complete"
write_wav('agent-done.wav', chord([659, 784, 1047], 0.45, decay=4.0))

# agent-needs-you: urgent two-ping (A5+A5 with gap) — "attention needed"
write_wav('agent-needs-you.wav', two_tone(880, 880, 0.10, 0.08, 0.12))

# agent-close: descending tone (G5→E5) — "dismissed"
write_wav('agent-close.wav', two_tone(784, 659, 0.03, 0.10, 0.15))

# text-open: light click-up (C6) — "input surface opens"
write_wav('text-open.wav', sine_wave(1047, 0.10, decay=10))

# text-send: whoosh-pop (D6 fast decay) — "message sent"
write_wav('text-send.wav', sine_wave(1175, 0.08, decay=14))

# text-close: soft down (A4) — "surface closes"
write_wav('text-close.wav', sine_wave(440, 0.14, decay=6))

# text-receive: double-tone (G5→A5) — "response arrived"
write_wav('text-receive.wav', two_tone(784, 880, 0.03, 0.07, 0.14))

# tapback: pop (E6 very fast) — "thumbs up"
write_wav('tapback.wav', sine_wave(1319, 0.06, decay=18))

# skill-up: arpeggio rising (C5-E5-G5-C6 staccato)
def arp(freqs, note_dur=0.07, gap=0.02, sr=SR):
    out = []
    for f in freqs:
        out += sine_wave(f, note_dur, sr, amp=0.32, decay=10)
        out += [0] * int(gap * sr)
    return out
write_wav('skill-up.wav', arp([523, 659, 784, 1047]))

# skill-down: arpeggio falling (C6-G5-E5-C5)
write_wav('skill-down.wav', arp([1047, 784, 659, 523]))

# reveal-boot: sparkle chord (C5+E5+G5+C6 fast bloom)
write_wav('reveal-boot.wav', chord([523, 659, 784, 1047], 0.6, decay=3.5))

# home-reveal: warm bloom (E4+B4+E5 long)
write_wav('home-reveal.wav', chord([330, 494, 659], 0.8, decay=3.0))

# connection-question: question-inflection (A5 then B5)
write_wav('connection-question.wav', two_tone(880, 988, 0.06, 0.10, 0.16))

# enter: crisp tick (F6 ultra-short)
write_wav('enter.wav', sine_wave(1397, 0.04, decay=20))

print(f'\nGenerated 15 chimes (total: {sum(os.path.getsize(f) for f in os.listdir(".") if f.endswith(".wav")):,}b)')
