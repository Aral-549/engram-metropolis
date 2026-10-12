/**
 * Procedural WebAudio synthesizer for Engram reactive glass and memory seals.
 *
 * Synthesizes pure harmonic crystal pings and resonant Monad bell frequencies
 * without external audio assets. Off by default; persistent preference in localStorage.
 * AudioContext is initialized strictly upon user gesture (toggle click or canvas tap).
 */

const KEY = "engram-glass-sound";
let enabled: boolean | null = null;
let ctx: AudioContext | null = null;
const listeners = new Set<() => void>();

function read(): boolean {
  if (enabled === null) {
    try {
      enabled = typeof window !== "undefined" && window.localStorage.getItem(KEY) === "on";
    } catch {
      enabled = false;
    }
  }
  return enabled;
}

export const soundStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  getSnapshot: read,
  getServerSnapshot: () => false,
};

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) ctx = new AudioCtx();
    } catch {
      return null;
    }
  }
  if (ctx && ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
  return ctx;
}

export function setGlassSound(on: boolean) {
  enabled = on;
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Storage blocked in iframe or private mode
  }
  if (on) audio();
  listeners.forEach((cb) => cb());
}

/**
 * Procedural harmonic chime.
 * level:
 *  -1: Subtle refraction pulse (light button or hover)
 *   0: Inscription tick (passkey shard)
 *   1: Memory disclosure ping
 *   2: Consensus harmonic ring
 *   3: Vault cryptographic seal stamp
 */
export function playHit(level: number) {
  if (!read()) return;
  const ac = audio();
  if (!ac) return;

  const t = ac.currentTime + 0.01;
  const master = ac.createGain();
  master.gain.value = level < 0 ? 0.06 : 0.15;
  master.connect(ac.destination);

  // Crystal pentatonic harmonics tuned around Monad / Engram palette
  const freqs = [
    [1046.5, 1567.98], // C6, G6
    [1318.5, 1975.5],  // E6, B6
    [1567.98, 2349.3], // G6, D7
    [1760.0, 2637.0],  // A6, E7
  ];

  const chord = freqs[Math.max(0, Math.min(level, freqs.length - 1))];
  const mults = level < 0 ? [1400] : chord;

  for (let i = 0; i < mults.length; i++) {
    const freq = mults[i];
    const osc = ac.createOscillator();
    const gain = ac.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.98, t + 0.35);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(i === 0 ? 0.9 : 0.4, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + (level < 0 ? 0.15 : 0.45 + level * 0.12));

    osc.connect(gain);
    gain.connect(master);

    osc.start(t);
    osc.stop(t + 0.8);
  }

  // Harmonic sub-bass resonance for Seal (level >= 2)
  if (level >= 2) {
    const subOsc = ac.createOscillator();
    const subGain = ac.createGain();
    subOsc.type = "triangle";
    subOsc.frequency.setValueAtTime(level === 3 ? 146.83 : 220, t); // D3 or A3
    subOsc.frequency.exponentialRampToValueAtTime(110, t + 0.4);

    subGain.gain.setValueAtTime(0.0001, t);
    subGain.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);

    subOsc.connect(subGain);
    subGain.connect(master);

    subOsc.start(t);
    subOsc.stop(t + 0.6);
  }
}
