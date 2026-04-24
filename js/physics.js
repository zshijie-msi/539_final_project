/**
 * physics.js — ball movement, wall/brick collisions, landing.
 *
 * Collision model:
 *   - Circle vs AABB (axis-aligned bounding box) for bricks.
 *   - For each candidate brick, find the nearest point on the rect to the
 *     ball's center.  If distance <= radius, there's overlap.
 *   - We resolve using the smallest-penetration axis (standard trick):
 *     push the ball out of the brick along X or Y, and flip that velocity
 *     component.
 *   - To avoid tunneling through a stack of bricks in one frame, we check
 *     bricks twice per update and accept up to 2 brick hits per ball per
 *     frame. At baseSpeed=720 and radius=7 this is plenty.
 *
 * We do NOT implement ball-ball collisions.  Classic BBTAN balls pass
 * through each other, which is actually what makes the physics feel
 * predictable.
 */

import {
  VIEW, FIELD, FIELD_LEFT, FIELD_RIGHT, FIELD_TOP, BRICK_SIZE,
  PHYS, state, STATUS, clamp, brickWorldPos,
} from "./state.js";
import { audio } from "./audio.js";
import { spawnBounceSpark, spawnBrickFx, spawnBrickShards, spawnLaserBeam } from "./fx.js";
import { checkPowerupCollisions } from "./powerups.js";
import { getBall } from "./balls.js";

/**
 * Advance a single ball by `dt` seconds, handling walls and bricks.
 * Returns true if the ball is now at rest (landed); false otherwise.
 */
export function stepBall(ball, dt) {
  if (ball.stopped) return true;

  // --- Integrate position
  let nx = ball.x + ball.vx * dt;
  let ny = ball.y + ball.vy * dt;

  // --- Wall collisions (left, right, ceiling)
  const r = ball.radius;

  if (nx - r < FIELD_LEFT) {
    nx = FIELD_LEFT + r;
    ball.vx = Math.abs(ball.vx);
    onWallHit(ball, nx, ny, "left");
  } else if (nx + r > FIELD_RIGHT) {
    nx = FIELD_RIGHT - r;
    ball.vx = -Math.abs(ball.vx);
    onWallHit(ball, nx, ny, "right");
  }

  if (ny - r < FIELD_TOP) {
    ny = FIELD_TOP + r;
    ball.vy = Math.abs(ball.vy);
    onWallHit(ball, nx, ny, "top");
  }

  ball.x = nx;
  ball.y = ny;

  // --- Brick collisions (up to 2 resolutions per frame)
  for (let pass = 0; pass < 2; pass++) {
    const hit = findFirstBrickHit(ball);
    if (!hit) break;
    resolveBrickHit(ball, hit);
  }

  // --- Power-up collisions (ball passes through; effects apply)
  checkPowerupCollisions(ball);

  // --- Landing: has the ball crossed below the launch line heading down?
  if (ball.y >= FIELD.launchLineY && ball.vy > 0) {
    landBall(ball);
    return true;
  }

  // --- Clamp vy-near-zero to avoid horizontal stuck loop
  enforceMinVy(ball);

  return false;
}

function enforceMinVy(ball) {
  const speed = Math.hypot(ball.vx, ball.vy) || 1;
  const minVy = speed * PHYS.minVyFrac;
  if (Math.abs(ball.vy) < minVy) {
    // Nudge vy toward its current sign (or down if zero), preserving speed.
    const sign = ball.vy === 0 ? 1 : Math.sign(ball.vy);
    const newVy = sign * minVy;
    // Rebalance vx to keep |v| roughly constant (so ball doesn't speed up).
    const vxMag = Math.sqrt(Math.max(0, speed * speed - newVy * newVy));
    ball.vx = Math.sign(ball.vx || 1) * vxMag;
    ball.vy = newVy;
  }
}

function landBall(ball) {
  ball.stopped = true;
  ball.y = FIELD.launchLineY;
  ball.vx = 0;
  ball.vy = 0;
  ball.sliding = true;
  ball.trail = [];   // ← clear immediately; no ghost trails during slide
  // Record first landed x to set the next launcher position.
  if (state.firstLandedX === null) {
    state.firstLandedX = clamp(
      ball.x,
      FIELD_LEFT + ball.radius,
      FIELD_RIGHT - ball.radius
    );
  }
}

/**
 * During the SETTLING phase, all landed balls glide along the launch line
 * toward the collection point (state.firstLandedX). Call this each frame
 * with the current target x so balls converge regardless of where they
 * happened to fall. Returns true when every ball is at the target.
 *
 * Called from game.js during SETTLING.
 */
export function updateBallsSliding(dt, targetX) {
  if (!state.balls.length) return true;
  const SLIDE_SPEED = 1400; // px/sec — fast enough to look snappy
  let allArrived = true;
  for (const b of state.balls) {
    if (!b.stopped) { allArrived = false; continue; }
    b.trail = [];  // ← keep clear while sliding; no mid-slide ghost dots
    const diff = targetX - b.x;
    const absDiff = Math.abs(diff);
    if (absDiff < 1) {
      b.x = targetX;
      continue;
    }
    const step = Math.min(absDiff, SLIDE_SPEED * dt);
    b.x += Math.sign(diff) * step;
    allArrived = false;
  }
  return allArrived;
}

// ---------- Brick collision helpers -----------------------------------

function findFirstBrickHit(ball) {
  // Return the brick with the deepest overlap.  With stacks of bricks
  // this yields stable "resolve the one we're most inside first".
  let best = null;
  let bestDepth = 0;
  for (const b of state.bricks) {
    if (b.hp <= 0) continue;
    const pos = brickWorldPos(b.col, b.row);
    const depth = circleRectOverlap(ball.x, ball.y, ball.radius, pos.x, pos.y, BRICK_SIZE, BRICK_SIZE);
    if (depth > 0 && depth > bestDepth) {
      bestDepth = depth;
      best = { brick: b, rectX: pos.x, rectY: pos.y };
    }
  }
  return best;
}

/**
 * Returns 0 if no overlap, else approximate penetration depth (px).
 */
function circleRectOverlap(cx, cy, cr, rx, ry, rw, rh) {
  const closestX = clamp(cx, rx, rx + rw);
  const closestY = clamp(cy, ry, ry + rh);
  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;
  if (distSq >= cr * cr) return 0;
  return cr - Math.sqrt(distSq);
}

function resolveBrickHit(ball, hit) {
  const { brick, rectX, rectY } = hit;
  const rw = BRICK_SIZE;
  const rh = BRICK_SIZE;
  const bt = getBall(state.equippedBall);
  const eff = bt.effects || {};

  // ---- Pierce: pass through without flipping velocity; avoid re-hitting
  if (eff.pierce) {
    ball._pierceIds = ball._pierceIds || new Set();
    if (ball._pierceIds.has(brick)) return;
    ball._pierceIds.add(brick);

    const dmg = eff.damage || 1;
    brick.hp -= dmg;
    brick.hitT = 1.0;
    brick.shakeT = 0.35;
    if (eff.freezeOnHit) brick.frozen = true;
    spawnBrickFx(rectX + rw / 2, rectY + rh / 2, brick);
    if (brick.hp <= 0) {
      brick.destroyed = true;
      spawnBrickShards(rectX + rw / 2, rectY + rh / 2, brick);
      audio.brickBreak.play();
    } else {
      audio.brickHit.play();
    }
    return;
  }

  // Previous position (approximate, sufficient for slow frame-to-frame motion).
  // Determine the axis of smallest separation to flip velocity.
  const closestX = clamp(ball.x, rectX, rectX + rw);
  const closestY = clamp(ball.y, rectY, rectY + rh);

  const dxL = ball.x - rectX;
  const dxR = rectX + rw - ball.x;
  const dyT = ball.y - rectY;
  const dyB = rectY + rh - ball.y;

  // How far the ball is from each rect edge (inside or near).
  const minDx = Math.min(dxL, dxR);
  const minDy = Math.min(dyT, dyB);

  // If ball center is inside the rect on X but outside on Y → Y collision.
  // If inside on Y but outside on X → X collision.
  // If inside on both → pick axis with smaller overlap to flip.
  let flipAxis;
  const insideX = ball.x > rectX && ball.x < rectX + rw;
  const insideY = ball.y > rectY && ball.y < rectY + rh;

  if (insideX && !insideY) {
    flipAxis = "y";
  } else if (insideY && !insideX) {
    flipAxis = "x";
  } else if (insideX && insideY) {
    flipAxis = minDx < minDy ? "x" : "y";
  } else {
    // Corner case: pick based on velocity — the axis whose velocity moves
    // the ball into the rect is the one we reflect.
    flipAxis = Math.abs(ball.vx) > Math.abs(ball.vy) ? "x" : "y";
  }

  if (flipAxis === "x") {
    // Push ball out horizontally.
    if (ball.x < rectX + rw / 2) {
      ball.x = rectX - ball.radius - 0.01;
    } else {
      ball.x = rectX + rw + ball.radius + 0.01;
    }
    ball.vx = -ball.vx;
  } else {
    if (ball.y < rectY + rh / 2) {
      ball.y = rectY - ball.radius - 0.01;
    } else {
      ball.y = rectY + rh + ball.radius + 0.01;
    }
    ball.vy = -ball.vy;
  }

  // Damage the brick
  const dmg = eff.damage || 1;
  brick.hp -= dmg;
  brick.hitT = 1.0;  // visual pulse (1.0 → 0 over ~180ms)
  brick.shakeT = 0.35;
  if (eff.freezeOnHit) brick.frozen = true;

  // FX + audio
  spawnBrickFx(
    rectX + rw / 2,
    rectY + rh / 2,
    brick
  );

  if (brick.hp <= 0) {
    brick.destroyed = true;
    spawnBrickShards(rectX + rw / 2, rectY + rh / 2, brick);
    audio.brickBreak.play();
  } else {
    audio.brickHit.play();
  }

  // ---- Split: on first brick contact, spawn two extra balls
  if (eff.splitOnFirstHit && !ball._splitUsed) {
    ball._splitUsed = true;
    const speed = Math.hypot(ball.vx, ball.vy) || PHYS.baseSpeed;
    const baseAngle = Math.atan2(ball.vx, -ball.vy);
    for (const dA of [-0.45, 0.45]) {
      const a = baseAngle + dA;
      state.balls.push({
        x: ball.x, y: ball.y,
        vx: Math.sin(a) * speed,
        vy: -Math.cos(a) * speed,
        radius: ball.radius,
        stopped: false,
        trail: [],
        _splitUsed: true,
      });
    }
  }
}

function onWallHit(ball, x, y, side) {
  audio.bounce.play();
  spawnBounceSpark(x, y, side);

  // Laser ball: each bounce triggers a horizontal beam at the ball's row
  const bt = getBall(state.equippedBall);
  if (bt.effects?.bounceLaser) {
    // Compute row index from y
    const row = Math.max(0, Math.floor((y - (FIELD_TOP + 16)) / (BRICK_SIZE + FIELD.brickGap)));
    fireLaserRow(row);
    audio.laser.play();
    spawnLaserBeam("H", row);
  }
}

/** Direct row-damage helper used by laser ball. */
function fireLaserRow(row) {
  for (const b of state.bricks) {
    if (b.hp <= 0 || b.row !== row) continue;
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

// ---------- Stream management -----------------------------------------

/** Begin a flying turn: queue N balls, lock aim. */
export function beginTurn(angle) {
  state.status = STATUS.FLYING;
  state.pendingLaunches = state.ballCount;
  state.nextSpawnAt = performance.now();
  state.lockedAimAngle = angle;
  state.firstLandedX = null;
  state.turnBallsLaunched = 0;
  state.balls = [];
  audio.whoosh.play();
}

/** Spawn any queued balls whose time has come. */
export function progressStream(nowMs) {
  if (state.pendingLaunches <= 0) return;
  if (nowMs < state.nextSpawnAt) return;

  const bt = getBall(state.equippedBall);
  const speed = PHYS.baseSpeed * (bt.speedScale || 1);
  const radius = bt.radius || PHYS.ballRadius;
  const gap = bt.launchGap || PHYS.launchIntervalMs;

  const ang = state.lockedAimAngle; // 0 = straight up, + = right
  const vx = Math.sin(ang) * speed;
  const vy = -Math.cos(ang) * speed; // upward is negative y

  state.balls.push({
    x: state.launcher.x,
    y: state.launcher.y,
    vx,
    vy,
    radius,
    stopped: false,
    trail: [],
  });
  state.pendingLaunches -= 1;
  state.turnBallsLaunched += 1;
  state.nextSpawnAt = nowMs + gap;
}

/** Returns true when every ball is stopped and queue is empty. */
export function allBallsSettled() {
  if (state.pendingLaunches > 0) return false;
  for (const b of state.balls) if (!b.stopped) return false;
  return true;
}

/** Remove bricks that were destroyed this frame. */
export function reapDestroyedBricks() {
  if (!state.bricks.length) return;
  state.bricks = state.bricks.filter((b) => b.hp > 0);
}

/** Write a short trail sample for each ball, for motion-blur effect. */
export function sampleBallTrails() {
  for (const b of state.balls) {
    if (b.stopped) continue;
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 6) b.trail.shift();
  }
}
