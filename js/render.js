/**
 * render.js — all drawing routines. Reads state; never mutates it.
 */

import {
  VIEW, FIELD, FIELD_LEFT, FIELD_RIGHT, BRICK_SIZE, BRICK_ROW_STRIDE, BRICK_TOP,
  PALETTE, PHYS, state, STATUS, tierForHp, brickWorldPos,
} from "./state.js";
import { getBall } from "./balls.js";

let ctx = null;

export function initRender(canvas) {
  ctx = canvas.getContext("2d");
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = VIEW.width * dpr;
  canvas.height = VIEW.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
}

// -------- Primitives --------------------------------------------------
function roundRect(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/** Current shift animation offset (px) for a brick given its fromRow. */
function shiftOffsetFor(fromRow, row) {
  if (state.status !== STATUS.SHIFTING) return 0;
  if (fromRow == null) return 0;
  const t = state.shiftT; // 0→1 during SHIFTING
  // ease-out cubic
  const e = 1 - Math.pow(1 - t, 3);
  return (fromRow - row) * BRICK_ROW_STRIDE * (1 - e);
}

// -------- Layers -----------------------------------------------------
function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  g.addColorStop(0, PALETTE.bgTop);
  g.addColorStop(0.6, PALETTE.bgBottom);
  g.addColorStop(1, PALETTE.bgTop);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  const glow = ctx.createRadialGradient(
    VIEW.width / 2, VIEW.height * 0.35, 20,
    VIEW.width / 2, VIEW.height * 0.35, VIEW.width * 0.85
  );
  glow.addColorStop(0, "rgba(180, 210, 255, 0.09)");
  glow.addColorStop(0.5, "rgba(180, 210, 255, 0.03)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  for (let y = FIELD.topBand; y < FIELD.launchLineY; y += BRICK_ROW_STRIDE) {
    ctx.beginPath();
    ctx.moveTo(FIELD.marginX, y);
    ctx.lineTo(VIEW.width - FIELD.marginX, y);
    ctx.stroke();
  }
}

function drawBricks(dt) {
  for (const b of state.bricks) {
    if (b.hp <= 0) continue;
    const pos = brickWorldPos(b.col, b.row);
    const off = shiftOffsetFor(b.fromRow, b.row);
    const tier = tierForHp(b.hp);

    b.hitT = Math.max(0, (b.hitT || 0) - dt * 6);
    b.shakeT = Math.max(0, (b.shakeT || 0) - dt * 3);

    const shake = b.shakeT > 0 ? (Math.random() - 0.5) * 2.2 * b.shakeT : 0;
    const scale = 1 + (b.hitT > 0 ? 0.04 * b.hitT : 0);
    const drawX = pos.x + shake;
    const drawY = pos.y + off + shake;
    const inset = BRICK_SIZE * (1 - scale) / 2;

    ctx.save();
    ctx.shadowColor = tier.fill;
    ctx.shadowBlur = 12 + b.hitT * 8;

    const grad = ctx.createLinearGradient(drawX, drawY, drawX, drawY + BRICK_SIZE);
    grad.addColorStop(0, tier.edge);
    grad.addColorStop(1, tier.fill);
    ctx.fillStyle = grad;
    roundRect(drawX + inset, drawY + inset, BRICK_SIZE - inset * 2, BRICK_SIZE - inset * 2, 6);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = b.hitT > 0
      ? `rgba(255,255,255,${0.35 + b.hitT * 0.4})`
      : "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    roundRect(drawX + inset + 0.5, drawY + inset + 0.5, BRICK_SIZE - inset * 2 - 1, BRICK_SIZE - inset * 2 - 1, 6);
    ctx.stroke();

    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    roundRect(drawX + inset - 0.5, drawY + inset - 0.5, BRICK_SIZE - inset * 2 + 1, BRICK_SIZE - inset * 2 + 1, 6.5);
    ctx.stroke();

    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 5;
    ctx.fillStyle = "#1a1530";
    const baseFont = Math.floor(BRICK_SIZE * 0.5);
    const bumpFont = Math.floor(baseFont * (1 + b.hitT * 0.18));
    ctx.font = `800 ${bumpFont}px "Baloo 2", Fredoka, sans-serif`;
    ctx.fillText(String(b.hp), drawX + BRICK_SIZE / 2, drawY + BRICK_SIZE / 2 + 1);
    ctx.restore();
  }
}

// -------- Power-up drawing -----------------------------------------
function drawPowerups(dt) {
  for (const pu of state.powerups) {
    if (!pu.alive) continue;
    pu.pulseT += dt * 3;

    const basePos = brickWorldPos(pu.col, pu.row);
    const off = shiftOffsetFor(pu.fromRow, pu.row);
    const cx = basePos.x + BRICK_SIZE / 2;
    const cy = basePos.y + BRICK_SIZE / 2 + off;

    const pulse = 1 + Math.sin(pu.pulseT) * 0.06;
    const r = 16 * pulse;

    drawPowerupIcon(pu.kind, cx, cy, r);
  }
}

function drawPowerupIcon(kind, cx, cy, r) {
  ctx.save();

  // Per-kind color palettes
  const palette = {
    plus:    { fill: "#7fe7ce", edge: "#b9f3e3", glow: "rgba(127,231,206,0.55)" },
    coin:    { fill: "#ffd54f", edge: "#ffecaa", glow: "rgba(255,213,79,0.55)" },
    shuffle: { fill: "#b38be0", edge: "#d0b3ee", glow: "rgba(179,139,224,0.55)" },
    laserH:  { fill: "#7ec9ff", edge: "#c5e3ff", glow: "rgba(126,201,255,0.55)" },
    laserV:  { fill: "#7ec9ff", edge: "#c5e3ff", glow: "rgba(126,201,255,0.55)" },
  }[kind];

  // Outer glow
  ctx.shadowColor = palette.glow;
  ctx.shadowBlur = 14;

  // Circle background
  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 1, cx, cy, r);
  grad.addColorStop(0, palette.edge);
  grad.addColorStop(1, palette.fill);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Symbol inside
  ctx.fillStyle = "#1a1530";
  ctx.strokeStyle = "#1a1530";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (kind === "plus") {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.5, cy);
    ctx.lineTo(cx + r * 0.5, cy);
    ctx.moveTo(cx, cy - r * 0.5);
    ctx.lineTo(cx, cy + r * 0.5);
    ctx.stroke();
  } else if (kind === "coin") {
    ctx.font = `800 ${Math.floor(r * 1.25)}px "Baloo 2", Fredoka, sans-serif`;
    ctx.fillText("$", cx, cy + 1);
  } else if (kind === "shuffle") {
    // Two chevrons facing opposite directions
    const s = r * 0.55;
    ctx.lineWidth = 2.2;
    // Left chevron pointing left
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.15, cy - s * 0.45);
    ctx.lineTo(cx - s * 0.75, cy);
    ctx.lineTo(cx - s * 0.15, cy + s * 0.45);
    ctx.stroke();
    // Right chevron pointing right
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.15, cy - s * 0.45);
    ctx.lineTo(cx + s * 0.75, cy);
    ctx.lineTo(cx + s * 0.15, cy + s * 0.45);
    ctx.stroke();
  } else if (kind === "laserH") {
    // Two arrow heads pointing outward horizontally
    const s = r * 0.55;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.2, cy - s * 0.45);
    ctx.lineTo(cx - s * 0.75, cy);
    ctx.lineTo(cx - s * 0.2, cy + s * 0.45);
    ctx.moveTo(cx + s * 0.2, cy - s * 0.45);
    ctx.lineTo(cx + s * 0.75, cy);
    ctx.lineTo(cx + s * 0.2, cy + s * 0.45);
    ctx.stroke();
  } else if (kind === "laserV") {
    const s = r * 0.55;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.45, cy - s * 0.2);
    ctx.lineTo(cx, cy - s * 0.75);
    ctx.lineTo(cx + s * 0.45, cy - s * 0.2);
    ctx.moveTo(cx - s * 0.45, cy + s * 0.2);
    ctx.lineTo(cx, cy + s * 0.75);
    ctx.lineTo(cx + s * 0.45, cy + s * 0.2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawLaunchLine() {
  const nearDanger = bricksCloseToLine();
  ctx.save();
  ctx.strokeStyle = nearDanger ? PALETTE.launchLineDanger : PALETTE.launchLine;
  ctx.lineWidth = nearDanger ? 1.5 : 1;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(FIELD.marginX, FIELD.launchLineY);
  ctx.lineTo(VIEW.width - FIELD.marginX, FIELD.launchLineY);
  ctx.stroke();
  ctx.restore();
}

function bricksCloseToLine() {
  const threshold = FIELD.launchLineY - BRICK_ROW_STRIDE * 2;
  for (const b of state.bricks) {
    if (b.hp <= 0) continue;
    const pos = brickWorldPos(b.col, b.row);
    if (pos.y + BRICK_SIZE > threshold) return true;
  }
  return false;
}

function drawAim() {
  if (!state.aim.active || !state.aim.valid) return;
  const ang = state.aim.angle;
  const ox = state.launcher.x;
  const oy = state.launcher.y;

  const dx = Math.sin(ang);
  const dy = -Math.cos(ang);

  const tLeft  = dx < 0 ? (FIELD_LEFT  + PHYS.ballRadius - ox) / dx : Infinity;
  const tRight = dx > 0 ? (FIELD_RIGHT - PHYS.ballRadius - ox) / dx : Infinity;
  const tTop   = dy < 0 ? (FIELD.topBand + PHYS.ballRadius - oy) / dy : Infinity;
  const tWall  = Math.min(tLeft, tRight, tTop);
  const tBrick = raycastBricks(ox, oy, dx, dy);
  let t = Math.min(tWall, tBrick);

  // Step 10 — difficulty curve: aim assist shortens as turns accumulate.
  // Disabled when state.assistFade is false (see settings).
  const turn = state.turn;
  let assistScale;
  if (!state.assistFade)  assistScale = 1.0;
  else if (turn <= 20)    assistScale = 1.0;
  else if (turn >= 100)   assistScale = 0.18;
  else                    assistScale = 1.0 - ((turn - 20) / 80) * 0.82;
  t = t * assistScale;

  const ex = ox + dx * t;
  const ey = oy + dy * t;

  ctx.save();
  const grad = ctx.createLinearGradient(ox, oy, ex, ey);
  grad.addColorStop(0, PALETTE.aimLine);
  grad.addColorStop(1, PALETTE.aimLineDim);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2;
  ctx.setLineDash([2, 8]);
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  ctx.setLineDash([]);
  // Hide the end-dot once the line is just a stub — it would land inside
  // the launcher halo and look confusing.
  if (assistScale > 0.35) {
    ctx.fillStyle = "rgba(255, 251, 234, 0.5)";
    ctx.beginPath();
    ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function raycastBricks(ox, oy, dx, dy) {
  let best = Infinity;
  const r = PHYS.ballRadius;
  for (const b of state.bricks) {
    if (b.hp <= 0) continue;
    const p = brickWorldPos(b.col, b.row);
    const rx0 = p.x - r, ry0 = p.y - r;
    const rx1 = p.x + BRICK_SIZE + r, ry1 = p.y + BRICK_SIZE + r;
    let tmin = 0, tmax = Infinity;

    for (const [o, d, lo, hi] of [[ox, dx, rx0, rx1], [oy, dy, ry0, ry1]]) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) { tmin = Infinity; break; }
        continue;
      }
      const t1 = (lo - o) / d;
      const t2 = (hi - o) / d;
      const ta = Math.min(t1, t2), tb = Math.max(t1, t2);
      if (ta > tmin) tmin = ta;
      if (tb < tmax) tmax = tb;
      if (tmin > tmax) { tmin = Infinity; break; }
    }
    if (tmin > 0 && tmin < best) best = tmin;
  }
  return best;
}

function drawBalls() {
  const bt = getBall(state.equippedBall);
  for (const b of state.balls) {
    if (b.trail && b.trail.length > 1) {
      ctx.save();
      for (let i = 0; i < b.trail.length; i++) {
        const t = b.trail[i];
        const alpha = ((i + 1) / b.trail.length) * 0.35;
        // Trail color derived from the equipped ball's edge color
        ctx.fillStyle = hexWithAlpha(bt.colorEdge, alpha);
        ctx.beginPath();
        ctx.arc(t.x, t.y, b.radius * (0.4 + i * 0.1), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = bt.glow;
    ctx.shadowBlur = 12 + (bt.radius > 10 ? 8 : 0);

    if (bt.shape === "square") {
      const s = b.radius * 2;
      const x = b.x - s / 2;
      const y = b.y - s / 2;
      const rr = s * 0.18;
      const g = ctx.createLinearGradient(x, y, x, y + s);
      g.addColorStop(0, bt.colorCore);
      g.addColorStop(0.5, bt.colorMid);
      g.addColorStop(1, bt.colorEdge);
      ctx.fillStyle = g;
      roundRect(x, y, s, s, rr);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      const g = ctx.createRadialGradient(b.x - 2, b.y - 3, 1, b.x, b.y, b.radius + 4);
      g.addColorStop(0, bt.colorCore);
      g.addColorStop(0.55, bt.colorMid);
      g.addColorStop(1, bt.colorEdge);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** Convert a hex color + alpha → rgba() string. Accepts "#rgb", "#rrggbb". */
function hexWithAlpha(hex, alpha) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  const r = parseInt(h.substr(0, 2), 16);
  const g = parseInt(h.substr(2, 2), 16);
  const b = parseInt(h.substr(4, 2), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawLauncher() {
  if (state.status === STATUS.GAMEOVER) return;

  const hidden = state.status === STATUS.FLYING || state.status === STATUS.SETTLING;
  if (hidden) return;   // ← nothing to draw while balls are in flight

  const { x, y } = state.launcher;
  const bt = getBall(state.equippedBall);
  const r = bt.radius;

  ctx.save();
  // Soft halo sized to the ball
  const haloR = Math.max(24, r + 18);
  const glowGrad = ctx.createRadialGradient(x, y, 2, x, y, haloR);
  glowGrad.addColorStop(0, "rgba(255, 251, 234, 0.4)");
  glowGrad.addColorStop(0.5, hexWithAlpha(bt.colorEdge, 0.12));
  glowGrad.addColorStop(1, hexWithAlpha(bt.colorEdge, 0));
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(x, y, haloR, 0, Math.PI * 2);
  ctx.fill();

  // "Loaded" ring
  ctx.strokeStyle = PALETTE.launchRing;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r + 5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.shadowColor = bt.glow;
  ctx.shadowBlur = 10;

  if (bt.shape === "square") {
    const s = r * 2;
    const bx = x - s / 2;
    const by = y - s / 2;
    const rr = s * 0.18;
    const g = ctx.createLinearGradient(bx, by, bx, by + s);
    g.addColorStop(0, bt.colorCore);
    g.addColorStop(0.5, bt.colorMid);
    g.addColorStop(1, bt.colorEdge);
    ctx.fillStyle = g;
    roundRect(bx, by, s, s, rr);
    ctx.fill();
  } else {
    const g = ctx.createRadialGradient(x - 2, y - 3, 1, x, y, r + 2);
    g.addColorStop(0, bt.colorCore);
    g.addColorStop(0.6, bt.colorMid);
    g.addColorStop(1, bt.colorEdge);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (state.ballCount > 1 && state.status === STATUS.READY) {
    ctx.save();
    ctx.font = '700 12px "Baloo 2", Fredoka, sans-serif';
    ctx.fillStyle = PALETTE.cream;
    ctx.textAlign = "left";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 4;
    ctx.fillText(`×${state.ballCount}`, x + r + 8, y + 1);
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of state.particles) {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.save();
    if (p.kind === "spark") {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === "shard") {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot || 0);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    } else if (p.kind === "ring") {
      const t = 1 - a;
      const r = p.r0 + (p.r1 - p.r0) * t;
      ctx.globalAlpha = a * 0.7;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === "beam") {
      // Laser beam: bright core + soft outer glow, fading
      ctx.globalAlpha = a;
      const coreW = p.thickness * 0.35;
      const outerW = p.thickness;
      if (p.axis === "H") {
        // outer
        ctx.fillStyle = "rgba(126, 201, 255, 0.18)";
        ctx.fillRect(p.x, p.y - outerW / 2, p.length, outerW);
        // core
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y - coreW / 2, p.length, coreW);
        // white hot center
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fillRect(p.x, p.y - coreW * 0.15, p.length, coreW * 0.3);
      } else {
        ctx.fillStyle = "rgba(126, 201, 255, 0.18)";
        ctx.fillRect(p.x - outerW / 2, p.y, outerW, p.length);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - coreW / 2, p.y, coreW, p.length);
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fillRect(p.x - coreW * 0.15, p.y, coreW * 0.3, p.length);
      }
    }
    ctx.restore();
  }
}

// -------- Game-over overlay --------------------------------------
function drawGameOverOverlay() {
  if (state.status !== STATUS.GAMEOVER) return;
  const W = VIEW.width;
  const H = VIEW.height;

  // Dark film
  ctx.save();
  ctx.fillStyle = "rgba(5, 7, 26, 0.72)";
  ctx.fillRect(0, 0, W, H);

  // Centered panel
  const pw = 340, ph = 260;
  const px = (W - pw) / 2;
  const py = (H - ph) / 2 - 20;
  ctx.shadowColor = "rgba(239, 100, 110, 0.25)";
  ctx.shadowBlur = 30;
  const panel = ctx.createLinearGradient(px, py, px, py + ph);
  panel.addColorStop(0, "rgba(26, 33, 80, 0.92)");
  panel.addColorStop(1, "rgba(15, 20, 52, 0.92)");
  ctx.fillStyle = panel;
  roundRect(px, py, pw, ph, 18);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(245, 240, 225, 0.12)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Title
  ctx.textAlign = "center";
  ctx.fillStyle = "#ef646e";
  ctx.shadowColor = "rgba(239, 100, 110, 0.4)";
  ctx.shadowBlur = 16;
  ctx.font = '800 32px "Baloo 2", Fredoka, sans-serif';
  ctx.fillText("GAME OVER", W / 2, py + 52);
  ctx.shadowBlur = 0;

  // Stats
  ctx.fillStyle = PALETTE.creamDim;
  ctx.font = '500 12px Fredoka, sans-serif';
  ctx.fillText("A BRICK REACHED THE LINE", W / 2, py + 80);

  ctx.fillStyle = PALETTE.cream;
  ctx.font = '700 16px Fredoka, sans-serif';
  ctx.fillText(`Reached Stage ${state.gameOver.reachedTurn}`, W / 2, py + 120);

  // Coins earned
  ctx.font = '500 14px Fredoka, sans-serif';
  ctx.fillStyle = "#ffd54f";
  ctx.fillText(`+ ${state.gameOver.coinsEarned} coins earned`, W / 2, py + 148);

  // Best indicator
  if (state.gameOver.newBest) {
    ctx.fillStyle = "#ffd54f";
    ctx.font = '800 14px "Baloo 2", sans-serif';
    ctx.fillText("★ NEW BEST ★", W / 2, py + 176);
  } else {
    ctx.fillStyle = PALETTE.creamDim;
    ctx.font = '500 12px Fredoka, sans-serif';
    ctx.fillText(`Best: Stage ${state.best}`, W / 2, py + 176);
  }

  // CTA
  ctx.fillStyle = PALETTE.cream;
  ctx.font = '700 13px Fredoka, sans-serif';
  ctx.fillText("Tap Reset to run it back", W / 2, py + 220);

  ctx.restore();
}

// -------- Public entry ----------------------------------------------
export function render(dt) {
  // Apply screen shake via canvas translate — cheaper than redrawing.
  let shakeX = 0, shakeY = 0;
  if (state.shakeT > 0 && state.shakeMag > 0) {
    const intensity = Math.min(1, state.shakeT * 3); // fade out last ~300ms
    shakeX = (Math.random() - 0.5) * state.shakeMag * 2 * intensity;
    shakeY = (Math.random() - 0.5) * state.shakeMag * 2 * intensity;
  }

  ctx.save();
  ctx.translate(shakeX, shakeY);

  drawBackground();
  drawBricks(dt);
  drawPowerups(dt);
  drawLaunchLine();
  drawParticles();
  drawAim();
  drawBalls();
  drawLauncher();

  ctx.restore();

  // Overlay is drawn WITHOUT shake so the text stays stable.
  drawGameOverOverlay();
}
