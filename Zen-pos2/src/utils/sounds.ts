/**
 * Sound system using Web Audio API — no external audio files required.
 * All sounds are generated programmatically.
 *
 * Config is persisted to localStorage so user preferences survive page reloads.
 */

export type SoundType = 'new_order' | 'urgent' | 'status_done' | 'ready';

export interface SoundConfig {
  masterEnabled: boolean;
  volume: number; // 0.0 – 1.0
  sounds: Record<SoundType, boolean>;
}

const STORAGE_KEY = 'zen_pos_sound_config';

export function getSoundConfig(): SoundConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SoundConfig;
  } catch { /* ignore */ }
  return {
    masterEnabled: true,
    volume: 0.6,
    sounds: {
      new_order:   true,
      urgent:      true,
      status_done: true,
      ready:       true,
    },
  };
}

export function saveSoundConfig(config: SoundConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

// Lazily created AudioContext (avoids autoplay policy until first user interaction)
let _ctx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new AudioContext();
  }
  if (_ctx.state === 'suspended') {
    _ctx.resume().catch(() => {});
  }
  return _ctx;
}

function playTone(
  freq: number,
  duration: number,
  gain: number,
  type: OscillatorType = 'sine',
  delay = 0,
): void {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.type = type;
  osc.frequency.value = freq;

  const t0 = ctx.currentTime + delay;
  gainNode.gain.setValueAtTime(0, t0);
  gainNode.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.001, t0 + duration);

  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

// ── Sound definitions ──────────────────────────────────────────────────────────

function playNewOrder(vol: number): void {
  // Ascending chime: C5 → E5 → G5
  playTone(523, 0.15, vol * 0.6, 'sine', 0);
  playTone(659, 0.15, vol * 0.6, 'sine', 0.12);
  playTone(784, 0.25, vol * 0.7, 'sine', 0.24);
}

function playUrgent(vol: number): void {
  // Double sharp beep
  playTone(880, 0.12, vol * 0.8, 'square', 0);
  playTone(880, 0.12, vol * 0.8, 'square', 0.20);
  playTone(1100, 0.18, vol * 0.7, 'square', 0.40);
}

function playStatusDone(vol: number): void {
  // Soft descending ping
  playTone(784, 0.20, vol * 0.5, 'sine', 0);
  playTone(659, 0.30, vol * 0.4, 'sine', 0.15);
}

function playReady(vol: number): void {
  // Two-tone chime
  playTone(659, 0.20, vol * 0.5, 'sine', 0);
  playTone(784, 0.30, vol * 0.5, 'sine', 0.15);
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function playSound(type: SoundType): void {
  const config = getSoundConfig();
  if (!config.masterEnabled) return;
  if (!config.sounds[type]) return;

  const vol = Math.max(0, Math.min(1, config.volume));
  try {
    switch (type) {
      case 'new_order':   playNewOrder(vol); break;
      case 'urgent':      playUrgent(vol);   break;
      case 'status_done': playStatusDone(vol); break;
      case 'ready':       playReady(vol);    break;
    }
  } catch (err) {
    // AudioContext may not be available (e.g. tests, headless)
    console.warn('[SoundSystem] Could not play sound:', err);
  }
}

/** Call once after a user gesture to unlock the AudioContext */
export function unlockAudio(): void {
  try { getCtx(); } catch { /* ignore */ }
}
