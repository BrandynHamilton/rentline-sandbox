'use client';

// Web Audio API synthesizer — no audio files needed
// All sounds generated programmatically

type SoundType = 'trade' | 'rent' | 'levelup' | 'danger' | 'macro_positive' | 'turn_complete' | 'fomc' | 'error';

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    return new AudioContext();
  } catch {
    return null;
  }
}

function playTone(
  ctx: AudioContext,
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  gain = 0.18,
  delay = 0
) {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
  gainNode.gain.setValueAtTime(0, ctx.currentTime + delay);
  gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + delay + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
  osc.start(ctx.currentTime + delay);
  osc.stop(ctx.currentTime + delay + duration + 0.05);
}

const SOUNDS: Record<SoundType, () => void> = {
  trade: () => {
    const ctx = getCtx();
    if (!ctx) return;
    playTone(ctx, 523, 0.12, 'sine', 0.14);       // C5
    playTone(ctx, 659, 0.12, 'sine', 0.12, 0.1);  // E5
  },

  rent: () => {
    const ctx = getCtx();
    if (!ctx) return;
    playTone(ctx, 440, 0.08, 'sine', 0.1);
    playTone(ctx, 554, 0.12, 'sine', 0.12, 0.08);
  },

  turn_complete: () => {
    const ctx = getCtx();
    if (!ctx) return;
    // Ascending 3-note chime
    playTone(ctx, 523, 0.15, 'sine', 0.15);
    playTone(ctx, 659, 0.15, 'sine', 0.13, 0.15);
    playTone(ctx, 784, 0.25, 'sine', 0.15, 0.3);
  },

  levelup: () => {
    const ctx = getCtx();
    if (!ctx) return;
    // C major arpeggio ascending
    [523, 659, 784, 1047].forEach((freq, i) => {
      playTone(ctx, freq, 0.2, 'sine', 0.16, i * 0.1);
    });
  },

  macro_positive: () => {
    const ctx = getCtx();
    if (!ctx) return;
    playTone(ctx, 659, 0.2, 'sine', 0.14);
    playTone(ctx, 784, 0.2, 'sine', 0.14, 0.18);
  },

  danger: () => {
    const ctx = getCtx();
    if (!ctx) return;
    // Low descending minor 2nd — ominous
    playTone(ctx, 220, 0.3, 'sawtooth', 0.1);
    playTone(ctx, 207, 0.4, 'sawtooth', 0.1, 0.25);
  },

  fomc: () => {
    const ctx = getCtx();
    if (!ctx) return;
    // Bell-like tone — formal/official
    playTone(ctx, 880, 0.05, 'sine', 0.2);
    playTone(ctx, 880, 0.6, 'sine', 0.1, 0.05);
  },

  error: () => {
    const ctx = getCtx();
    if (!ctx) return;
    playTone(ctx, 200, 0.15, 'square', 0.08);
    playTone(ctx, 180, 0.2, 'square', 0.08, 0.15);
  },
};

let soundEnabled = true;

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
  if (typeof window !== 'undefined') {
    localStorage.setItem('rl_sound', enabled ? '1' : '0');
  }
}

export function getSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem('rl_sound');
  return stored === null ? true : stored === '1';
}

export function playSound(type: SoundType) {
  if (!getSoundEnabled()) return;
  try {
    SOUNDS[type]?.();
  } catch {
    // AudioContext can fail silently if user hasn't interacted with page yet
  }
}
