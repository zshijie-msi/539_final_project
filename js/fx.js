/**
 * fx.js — lightweight particle + effect system.
 *
 * Particles are plain objects pushed into state.particles; render.js
 * draws them and a tick() call in the game loop advances them.
 *
 * We cap particle count to keep perf sane when many balls are hitting.
 */

import { state, tierForHp } from "./state.js";

const MAX_PARTICLES = 280;

function push(p) {
  if (state.particles.length >= MAX_PARTICLES) {
    // Drop oldest; cheap and bounded.
    state.particles.shift();
  }
  state.particles.push(p);
}

// -------- Wall / generic spark (small bright dots, short life) ---------
export function spawnBounceSpark(x, y, side) {
  const count = 4;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 60 + Math.random() * 140;
    push({
      kind: "spark",
      x, y,
      vx: Math.cos(a) * spd * (side === "left" ? 1 : side === "right" ? -1 : 1),
      vy: Math.sin(a) * spd - (side === "top" ? 80 : 0),
      life: 0.22 + Math.random() * 0.1,
      maxLife: 0.32,
      size: 1.6 + Math.random() * 1.2,
      color: "rgba(255, 251, 234, 0.9)",
    });
  }
}

// -------- Brick-hit flash ring + damage puff (not destroyed) ----------
export function spawnBrickFx(cx, cy, brick) {
  const tier = tierForHp(Math.max(1, brick.hp + 1)); // color before the hit
  push({
    kind: "ring",
    x: cx, y: cy,
    r0: 4,
    r1: 28,
    life: 0.28,
    maxLife: 0.28,
    color: tier.edge,
  });
  // A few tiny chips
  for (let i = 0; i < 3; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 80 + Math.random() * 100;
    push({
      kind: "spark",
      x: cx, y: cy,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      life: 0.3,
      maxLife: 0.3,
      size: 1.2 + Math.random(),
      color: tier.fill,
    });
  }
}

// -------- Brick destroyed: shards explosion --------------------------
export function spawnBrickShards(cx, cy, brick) {
  const tier = tierForHp(1);
  const base = tierForHp(Math.max(1, brick.hpMax || 1));
  const count = 14;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    const spd = 140 + Math.random() * 180;
    push({
      kind: "shard",
      x: cx, y: cy,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 10,
      life: 0.55 + Math.random() * 0.25,
      maxLife: 0.8,
      size: 3 + Math.random() * 3,
      color: Math.random() < 0.5 ? base.fill : base.edge,
    });
  }
  // Big flash ring
  push({
    kind: "ring",
    x: cx, y: cy,
    r0: 6,
    r1: 44,
    life: 0.4,
    maxLife: 0.4,
    color: tier.edge,
  });
}

// -------- Launcher pulse on each ball spawn --------------------------
export function spawnLaunchPulse(x, y) {
  push({
    kind: "ring",
    x, y,
    r0: 4,
    r1: 22,
    life: 0.22,
    maxLife: 0.22,
    color: "rgba(255, 213, 79, 0.6)",
  });
}

// -------- Collect burst (plus / coin / shuffle pickup) ---------------
export function spawnCollectBurst(x, y, color) {
  // Expanding ring + outward sparks in the collected color.
  push({
    kind: "ring",
    x, y,
    r0: 6,
    r1: 38,
    life: 0.35,
    maxLife: 0.35,
    color,
  });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const spd = 150 + Math.random() * 80;
    push({
      kind: "spark",
      x, y,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      life: 0.45,
      maxLife: 0.45,
      size: 2 + Math.random() * 1.2,
      color,
    });
  }
}

// -------- Laser beam (row or column sweep) ---------------------------
import {
  FIELD, VIEW, BRICK_SIZE, BRICK_ROW_STRIDE, BRICK_TOP, FIELD_LEFT, FIELD_RIGHT,
} from "./state.js";

export function spawnLaserBeam(axis, index) {
  // axis: 'H' or 'V'. For 'H' we draw a horizontal beam across the row;
  // for 'V' a vertical one down the column.
  if (axis === "H") {
    const cy = BRICK_TOP + index * BRICK_ROW_STRIDE + BRICK_SIZE / 2;
    push({
      kind: "beam",
      axis: "H",
      x: FIELD_LEFT,
      y: cy,
      length: FIELD_RIGHT - FIELD_LEFT,
      thickness: 28,
      life: 0.38,
      maxLife: 0.38,
      color: "rgba(180, 230, 255, 0.85)",
    });
  } else {
    const cx = FIELD.marginX + index * BRICK_ROW_STRIDE + BRICK_SIZE / 2;
    push({
      kind: "beam",
      axis: "V",
      x: cx,
      y: FIELD.topBand,
      length: FIELD.launchLineY - FIELD.topBand,
      thickness: 28,
      life: 0.38,
      maxLife: 0.38,
      color: "rgba(180, 230, 255, 0.85)",
    });
  }
}

// -------- Screen shake trigger (used by game over) -------------------
export function triggerScreenShake(duration, magnitude) {
  state.shakeT = Math.max(state.shakeT, duration);
  state.shakeMag = Math.max(state.shakeMag, magnitude);
}

// -------- Physics: integrate particles ------------------------------
export function tickParticles(dt) {
  // Decay screen shake
  if (state.shakeT > 0) {
    state.shakeT = Math.max(0, state.shakeT - dt);
    if (state.shakeT === 0) state.shakeMag = 0;
  }

  const list = state.particles;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0) {
      list.splice(i, 1);
      continue;
    }
    if (p.kind === "spark" || p.kind === "shard") {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === "shard") p.vy += 420 * dt;
      p.vx *= 0.985;
      p.vy *= 0.985;
      if (p.kind === "shard") p.rot += p.vrot * dt;
    }
    // Rings + beams: just fade via life.
  }
}
