/**
 * game.js — main loop + full turn orchestration.
 *
 * Turn phases:
 *   READY    — user aims/launches
 *   FLYING   — balls in motion, bricks take damage
 *   SETTLING — launcher glides to the first landed ball's x
 *   SHIFTING — existing bricks descend one row + new top row drops in
 *   GAMEOVER — a brick hit row >= GAMEOVER_ROW; overlay shown
 */

import {
  state, STATUS, VIEW, FIELD, clamp, saveBest,
  FIELD_LEFT, FIELD_RIGHT, PHYS, GAMEOVER_ROW,
} from "./state.js";
import { initRender, render } from "./render.js";
import { attachInput } from "./input.js";
import {
  stepBall, progressStream, allBallsSettled, reapDestroyedBricks,
  sampleBallTrails, updateBallsSliding,
} from "./physics.js";
import { reapPowerups } from "./powerups.js";
import { tickParticles, spawnLaunchPulse, triggerScreenShake } from "./fx.js";
import { generateTopRow } from "./levelgen.js";
import { audio } from "./audio.js";
import { initUI, openGacha, refreshGachaButton } from "./ui.js";
import { getBall } from "./balls.js";

const canvas = document.getElementById("gameCanvas");
const hud = {
  turn:  document.getElementById("turnValue"),
  best:  document.getElementById("bestValue"),
  coins: document.getElementById("coinsValue"),
  status: document.getElementById("statusLine"),
};
const buttons = {
  gacha:      document.getElementById("gachaBtn"),
  speed:      document.getElementById("speedBtn"),
  speedLabel: document.getElementById("speedLabel"),
  restart:    document.getElementById("restartBtn"),
};

// ---------- Run lifecycle --------------------------------------------
function resetRun() {
  state.turn = 1;
  // state.coins = 0;  // 保留coins不重置
  state.ballCount = 1;
  state.pendingBallIncrement = 0;
  state.status = STATUS.READY;
  state.launcher = { x: VIEW.width / 2, y: FIELD.launchLineY };
  state.balls = [];
  state.particles = [];
  state.firstLandedX = null;
  state.aim.active = false;
  state.bricks = [];
  state.powerups = [];
  state.shiftT = 0;
  state.shakeT = 0;
  state.shakeMag = 0;
  state.gameOver = { reachedTurn: 0, coinsEarned: 0, newBest: false };

  const gen = generateTopRow(state.turn);
  for (const b of gen.bricks) { b.fromRow = null; state.bricks.push(b); }
  for (const p of gen.powerups) { p.fromRow = null; state.powerups.push(p); }

  syncHud();
  flashStatus(`Ball: ${getBall(state.equippedBall).name}  ·  Drag upward to aim.`);
}

// ---------- Settling phase (launcher glides to new x) -----------------
let settleStartAt = 0;
let settleFromX = 0;
let settleToX = 0;
const SETTLE_MS = 280;

function enterSettling() {
  state.status = STATUS.SETTLING;
  settleFromX = state.launcher.x;
  settleToX = clamp(
    state.firstLandedX ?? state.launcher.x,
    FIELD_LEFT + PHYS.ballRadius + 2,
    FIELD_RIGHT - PHYS.ballRadius - 2
  );
  settleStartAt = performance.now();
}

function updateSettling(nowMs, dt) {
  // Launcher glides toward the target x
  const t = Math.min(1, (nowMs - settleStartAt) / SETTLE_MS);
  const e = 1 - Math.pow(1 - t, 3);
  state.launcher.x = settleFromX + (settleToX - settleFromX) * e;

  // Balls slide to the collection point in parallel using real dt
  const ballsArrived = updateBallsSliding(dt, settleToX);

  // Transition only after BOTH the launcher easing completes AND all balls
  // have converged. This is what guarantees balls "collect" visually.
  if (t >= 1 && ballsArrived) enterShifting();
}

// ---------- Shifting phase (bricks descend, new row drops in) ---------
let shiftStartAt = 0;
const SHIFT_MS = 340;

function enterShifting() {
  state.turn += 1;
  state.ballCount += state.pendingBallIncrement;
  state.pendingBallIncrement = 0;

  for (const b of state.bricks) {
    b.fromRow = b.row;
    if (b.frozen) {
      // Frozen bricks don't descend this turn; thaw for next turn.
      b.frozen = false;
      b.fromRow = null;  // no shift animation for this brick
    } else {
      b.row += 1;
    }
  }
  for (const p of state.powerups) {
    p.fromRow = p.row;
    p.row += 1;
  }

  const gen = generateTopRow(state.turn);
  for (const b of gen.bricks) state.bricks.push(b);
  for (const p of gen.powerups) state.powerups.push(p);

  state.status = STATUS.SHIFTING;
  state.shiftT = 0;
  shiftStartAt = performance.now();
}

function updateShifting(nowMs) {
  const t = Math.min(1, (nowMs - shiftStartAt) / SHIFT_MS);
  state.shiftT = t;
  if (t >= 1) {
    for (const b of state.bricks) b.fromRow = null;
    for (const p of state.powerups) p.fromRow = null;

    if (bricksCrossedLine()) {
      enterGameOver();
    } else {
      state.status = STATUS.READY;
      syncHud();
    }
  }
}

function bricksCrossedLine() {
  for (const b of state.bricks) {
    if (b.hp <= 0) continue;
    if (b.row >= GAMEOVER_ROW) return true;
  }
  return false;
}

// ---------- Game over -------------------------------------------------
function enterGameOver() {
  state.status = STATUS.GAMEOVER;
  state.gameOver = {
    reachedTurn: state.turn - 1,
    coinsEarned: state.coins,
    newBest: false,
  };
  if (saveBest()) state.gameOver.newBest = true;
  triggerScreenShake(0.55, 7);
  audio.gameOver.play();
  syncHud();
  flashStatus("Run ended. Tap Reset to try again.");
}

// ---------- Main loop -------------------------------------------------
function tick(nowMs) {
  const last = state.lastFrameTime || nowMs;
  let dtReal = (nowMs - last) / 1000;
  dtReal = Math.min(dtReal, 1 / 30);
  state.lastFrameTime = nowMs;

  const mult = state.status === STATUS.FLYING ? state.speedMultiplier : 1;
  const steps = mult <= 1 ? 1 : mult;
  const dtSub = (dtReal * mult) / steps;

  for (let s = 0; s < steps; s++) step(dtSub, nowMs);

  render(dtReal);
  requestAnimationFrame(tick);
}

function step(dt, nowMs) {
  tickParticles(dt);

  if (state.status === STATUS.FLYING) {
    const before = state.pendingLaunches;
    progressStream(nowMs);
    if (state.pendingLaunches !== before) {
      spawnLaunchPulse(state.launcher.x, state.launcher.y);
    }

    sampleBallTrails();
    for (const ball of state.balls) stepBall(ball, dt);

    // Slide already-landed balls toward the collection point immediately —
    // don't wait for SETTLING. This gives the classic BBTAN feel where each
    // ball snaps toward the landing position the moment it touches down,
    // while the remaining balls are still in flight.
    if (state.firstLandedX !== null) {
      updateBallsSliding(dt, state.firstLandedX);
    }

    reapDestroyedBricks();
    reapPowerups();

    if (allBallsSettled()) {
      enterSettling();
      syncHud();
    }
  } else if (state.status === STATUS.SETTLING) {
    updateSettling(nowMs, dt);
  } else if (state.status === STATUS.SHIFTING) {
    updateShifting(nowMs);
  }
}

// ---------- HUD + buttons --------------------------------------------
function syncHud() {
  hud.turn.textContent  = String(state.turn);
  hud.best.textContent  = String(state.best);
  hud.coins.textContent = String(state.coins);
  const labels = ["1×", "2×", "3×"];
  buttons.speedLabel.textContent = labels[state.speedLevel];
  buttons.speed.dataset.active = state.speedLevel > 0 ? "true" : "false";
  refreshGachaButton();

  // Keep status line in sync with the equipped ball when no flash is active.
  if (!flashActive && state.status !== STATUS.GAMEOVER) {
    hud.status.textContent = DEFAULT_STATUS();
  }
}

let statusTimer = 0;
let flashActive = false;
const DEFAULT_STATUS = () => {
  const bt = getBall(state.equippedBall);
  return `Ball: ${bt.name}  ·  Drag upward to aim.`;
};
function flashStatus(msg) {
  hud.status.textContent = msg;
  flashActive = true;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    flashActive = false;
    if (state.status !== STATUS.GAMEOVER) hud.status.textContent = DEFAULT_STATUS();
  }, 2500);
}

buttons.gacha.addEventListener("click", () => {
  openGacha();
});
buttons.speed.addEventListener("click", () => {
  state.speedLevel = (state.speedLevel + 1) % 3;
  syncHud();
});
buttons.restart.addEventListener("click", () => {
  resetRun();
});

// ---------- Boot ------------------------------------------------------
initUI({ onHudNeedsSync: syncHud });
initRender(canvas);
attachInput(canvas);
resetRun();
requestAnimationFrame((t) => {
  state.lastFrameTime = t;
  requestAnimationFrame(tick);
});

// Dev helpers (exposed on window). Handy during development; cost nothing
// in production. Access via browser console:
//    bbtan.grantCoins(500)
//    bbtan.unlockAll()
//    bbtan.state  // inspect
if (typeof window !== "undefined") {
  window.bbtan = {
    state,
    grantCoins(n) { state.coins += n; syncHud(); return state.coins; },
    unlockAll() {
      import("./balls.js").then(({ BALLS, saveUnlocked }) => {
        for (const b of BALLS) state.unlockedBalls.add(b.id);
        saveUnlocked(state.unlockedBalls);
        console.log("all balls unlocked:", [...state.unlockedBalls]);
      });
    },
    reset() { resetRun(); },
  };
}
