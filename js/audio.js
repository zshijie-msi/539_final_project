/**
 * audio.js — pooled audio with rate limiting + pitch variation.
 *
 * Why pooled?  HTMLAudioElement plays the same element exclusively;
 * rapid-fire events (20 balls hitting bricks in a second) need multiple
 * clones so they can overlap.
 *
 * Why rate-limited?  Without a cooldown the cascade of ball-vs-wall
 * bounces becomes a machine-gun of clicks. We throttle per-sound with
 * a short minimum interval.
 */

const POOL_SIZE = 6;   // overlapping voices per sound
const BASE_VOL  = 0.55;

class Sfx {
  constructor(src, { volume = BASE_VOL, minIntervalMs = 30, pitch = 0 } = {}) {
    this.src = src;
    this.volume = volume;
    this.minIntervalMs = minIntervalMs;
    this.pitchRange = pitch; // ± playbackRate range; 0 disables pitch variation
    this.pool = [];
    this.cursor = 0;
    this.lastPlayedAt = 0;
  }

  _ensurePool() {
    if (this.pool.length) return;
    for (let i = 0; i < POOL_SIZE; i++) {
      const a = new Audio(this.src);
      a.preload = "auto";
      a.volume = this.volume;
      this.pool.push(a);
    }
  }

  play() {
    const now = performance.now();
    if (now - this.lastPlayedAt < this.minIntervalMs) return;
    this._ensurePool();
    const a = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    try {
      a.currentTime = 0;
      if (this.pitchRange > 0) {
        const r = 1 + (Math.random() * 2 - 1) * this.pitchRange;
        a.playbackRate = r;
      }
      a.volume = this.volume;
      a.play().catch(() => { /* autoplay may block — ignored */ });
    } catch {}
    this.lastPlayedAt = now;
  }

  setVolume(v) {
    this.volume = v;
    this.pool.forEach((a) => (a.volume = v));
  }
}

// ---------- Registry ---------------------------------------------------
// Tuning philosophy: bounces are very short + rate-limited + pitch-varied
// so the "bip bip bip" doesn't feel mechanical.
export const audio = {
  whoosh:   new Sfx("assets/sounds/whoosh_short.ogg", { volume: 0.5, minIntervalMs: 40 }),
  // Wall bounce — dry, short click
  bounce:   new Sfx("assets/sounds/arcade_bounce.wav", { volume: 0.3, minIntervalMs: 22, pitch: 0.10 }),
  // Brick hit (damaged but not destroyed) — warmer, punchier
  brickHit: new Sfx("assets/sounds/ball_hit.wav",   { volume: 0.55, minIntervalMs: 15, pitch: 0.09 }),
  // Brick destroyed — same source but louder and lower-pitched for impact
  brickBreak: new Sfx("assets/sounds/ball_hit.wav", { volume: 0.8, minIntervalMs: 28, pitch: 0.06 }),
  coin:     new Sfx("assets/sounds/coin_pickup.wav", { volume: 0.08, minIntervalMs: 60 }),
  laser:    new Sfx("assets/sounds/laser_short.wav", { volume: 0.35, minIntervalMs: 60 }),
  gameOver: new Sfx("assets/sounds/game_over.wav",   { volume: 0.7 }),
  // Gacha SFX
  capsulePop:      new Sfx("assets/sounds/capsule_pop.wav",        { volume: 0.7, minIntervalMs: 100 }),
  fanfareEpic:     new Sfx("assets/sounds/fanfare_epic.wav",       { volume: 0.7, minIntervalMs: 200 }),
  fanfareLegendary:new Sfx("assets/sounds/fanfare_legendary.wav",  { volume: 0.85, minIntervalMs: 200 }),

  masterVolume: 0.85,
  muted: false,
};

// Master toggle (used by Step 11 settings menu — stubbed now).
export function setMuted(on) {
  audio.muted = on;
  const targets = ["whoosh", "bounce", "brickHit", "brickBreak", "coin", "laser",
                   "gameOver", "capsulePop", "fanfareEpic", "fanfareLegendary"];
  for (const k of targets) {
    audio[k].setVolume(on ? 0 : audio[k].volume || 0.5);
  }
}
