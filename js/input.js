/**
 * input.js — pointer (mouse + touch) aim + release-to-launch.
 *
 * Interaction model (classic BBTAN):
 *   - Pointerdown anywhere on the canvas → start aiming.
 *   - Move → update aim line. The launcher stays fixed; we measure
 *     direction from launcher to pointer.
 *   - Pointerup → if the aim is valid (above launcher, within angle
 *     limits), launch the ball stream. Otherwise cancel.
 *
 * The aim angle is stored in radians, 0 = straight up, + = right.
 */

import { state, STATUS, VIEW, PHYS, clamp, rad } from "./state.js";
import { beginTurn } from "./physics.js";

const MAX_ANG = rad(PHYS.maxAimDegFromVertical);
const KEY_AIM_STEP = rad(3);

let canvasEl = null;

export function attachInput(canvas) {
  canvasEl = canvas;

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);
  canvas.addEventListener("pointerleave", onCancel);

  // Prevent native touch scroll / pinch interfering.
  canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener("touchmove",  (e) => e.preventDefault(), { passive: false });

  // Keyboard aiming + launch support.
  document.addEventListener("keydown", onKeyDown);
}

function pointerToCanvas(ev) {
  const r = canvasEl.getBoundingClientRect();
  const x = ((ev.clientX - r.left) * VIEW.width) / r.width;
  const y = ((ev.clientY - r.top) * VIEW.height) / r.height;
  return { x, y };
}

function updateAimFromPoint(px, py) {
  const dx = px - state.launcher.x;
  const dy = state.launcher.y - py; // upward positive

  // Only valid when the pointer is ABOVE the launcher by a small margin.
  const above = dy > 8;

  let angle = Math.atan2(dx, Math.max(dy, 0.0001));
  const clamped = clamp(angle, -MAX_ANG, MAX_ANG);

  state.aim.angle = clamped;
  state.aim.valid = above && Math.abs(angle) <= MAX_ANG;
}

function onDown(ev) {
  if (state.atTitle || state.overlay) return;
  if (state.status !== STATUS.READY) return;
  canvasEl.setPointerCapture?.(ev.pointerId);
  state.aim.active = true;
  const { x, y } = pointerToCanvas(ev);
  updateAimFromPoint(x, y);
}

function onMove(ev) {
  if (!state.aim.active) return;
  const { x, y } = pointerToCanvas(ev);
  updateAimFromPoint(x, y);
}

function onUp(ev) {
  if (!state.aim.active) return;
  canvasEl.releasePointerCapture?.(ev.pointerId);
  const launch = state.aim.valid && state.status === STATUS.READY;
  state.aim.active = false;
  if (launch) beginTurn(state.aim.angle);
}

function onCancel() {
  state.aim.active = false;
}


function onKeyDown(ev) {
  if (state.atTitle || state.overlay) return;

  const key = ev.key;
  const aimingKey = key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "a" || key === "A" || key === "d" || key === "D";
  const launchKey = key === " " || key === "Spacebar" || key === "Enter";

  if (aimingKey) ev.preventDefault();
  if (launchKey) ev.preventDefault();

  if (state.status !== STATUS.READY) return;

  if (key === "ArrowLeft" || key === "a" || key === "A") {
    state.aim.active = true;
    state.aim.angle = clamp(state.aim.angle - KEY_AIM_STEP, -MAX_ANG, MAX_ANG);
    state.aim.valid = true;
    canvasEl?.focus();
    return;
  }

  if (key === "ArrowRight" || key === "d" || key === "D") {
    state.aim.active = true;
    state.aim.angle = clamp(state.aim.angle + KEY_AIM_STEP, -MAX_ANG, MAX_ANG);
    state.aim.valid = true;
    canvasEl?.focus();
    return;
  }

  if (key === "ArrowUp") {
    state.aim.active = true;
    state.aim.angle = 0;
    state.aim.valid = true;
    canvasEl?.focus();
    return;
  }

  if (launchKey && state.aim.valid) {
    state.aim.active = false;
    beginTurn(state.aim.angle);
  }
}
