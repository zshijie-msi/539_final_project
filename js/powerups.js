/**
 * powerups.js — power-up collision + effects.
 *
 * Power-ups are collectibles that sit in grid cells like bricks, but
 * balls pass through them. When a ball's center enters a power-up's
 * activation radius, the effect triggers and the power-up is removed
 * (one-shot).
 *
 *   plus     → +1 ball for next turn (state.pendingBallIncrement++)
 *   coin     → +1 coin (state.coins++)
 *   shuffle  → random velocity direction, same speed
 *   laserH   → damage every brick in that row by 1 (+ visual beam)
 *   laserV   → damage every brick in that column by 1 (+ visual beam)
 *
 * For lasers, we still trigger brick visual FX but suppress per-brick
 * sounds to avoid a rapid-fire cascade; the laser sound itself covers it.
 */

import { state, brickWorldPos, BRICK_SIZE, BRICK_ROW_STRIDE, BRICK_TOP, FIELD, VIEW } from "./state.js";
import { audio } from "./audio.js";
import { spawnBrickFx, spawnBrickShards, spawnLaserBeam, spawnCollectBurst } from "./fx.js";

const POWERUP_HIT_RADIUS = 18; // px — generous so fast balls still collect

/**
 * Returns the world-space center position of a power-up, accounting for
 * its drop-in animation offset (if animating).
 */
export function powerupCenter(pu, animFrac = 1) {
  const baseY = BRICK_TOP + pu.row * BRICK_ROW_STRIDE + BRICK_SIZE / 2;
  const baseX = FIELD.marginX + pu.col * BRICK_ROW_STRIDE + BRICK_SIZE / 2;
  const offsetY = pu.fromRow != null ? (pu.fromRow - pu.row) * BRICK_ROW_STRIDE * (1 - animFrac) : 0;
  return { x: baseX, y: baseY + offsetY };
}

/**
 * Check each alive power-up against a ball. Mutates state on hit.
 */
export function checkPowerupCollisions(ball) {
  if (!state.powerups.length) return;
  for (const pu of state.powerups) {
    if (!pu.alive) continue;
    const { x, y } = powerupCenter(pu, 1);
    const dx = ball.x - x;
    const dy = ball.y - y;
    const r = POWERUP_HIT_RADIUS + ball.radius - 4;
    if (dx * dx + dy * dy <= r * r) {
      applyPowerup(pu, ball);
      pu.alive = false;
    }
  }
}

function applyPowerup(pu, ball) {
  const { x, y } = powerupCenter(pu, 1);
  switch (pu.kind) {
    case "plus":
      state.pendingBallIncrement += 1;
      spawnCollectBurst(x, y, "#7fe7ce");
      audio.coin.play();
      break;

    case "coin":
      state.coins += 1;
      spawnCollectBurst(x, y, "#ffd54f");
      audio.coin.play();
      break;

    case "shuffle": {
      const speed = Math.hypot(ball.vx, ball.vy);
      // Pick a random direction biased to keep some upward/downward movement,
      // avoiding perfectly horizontal redirect.
      const angle = Math.random() * Math.PI * 2;
      ball.vx = Math.cos(angle) * speed;
      ball.vy = Math.sin(angle) * speed;
      spawnCollectBurst(x, y, "#b38be0");
      audio.laser.play();
      break;
    }

    case "laserH":
      fireLaser(pu.row, "H");
      spawnLaserBeam("H", pu.row);
      audio.laser.play();
      break;

    case "laserV":
      fireLaser(pu.col, "V");
      spawnLaserBeam("V", pu.col);
      audio.laser.play();
      break;
  }
}

/**
 * Damage every brick in a row or column by 1 HP.
 * Silent per-brick (no bounce sound) — the laser SFX already covers it.
 */
function fireLaser(index, axis) {
  for (const b of state.bricks) {
    if (b.hp <= 0) continue;
    const match = axis === "H" ? b.row === index : b.col === index;
    if (!match) continue;

    b.hp -= 1;
    b.hitT = 1.0;
    b.shakeT = 0.4;
    const pos = brickWorldPos(b.col, b.row);
    spawnBrickFx(pos.x + BRICK_SIZE / 2, pos.y + BRICK_SIZE / 2, b);
    if (b.hp <= 0) {
      b.destroyed = true;
      spawnBrickShards(pos.x + BRICK_SIZE / 2, pos.y + BRICK_SIZE / 2, b);
    }
  }
}

/** Remove consumed power-ups. */
export function reapPowerups() {
  if (!state.powerups.length) return;
  state.powerups = state.powerups.filter((p) => p.alive);
}
