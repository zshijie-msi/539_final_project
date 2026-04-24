/**
 * state.js — central constants + shared game state
 *
 * Everything that multiple modules need to agree on lives here.
 * The `state` object is mutated in place; modules read & write it directly.
 * This is a deliberate choice for a small game — a message bus would be
 * overkill at this scale.
 */

// ---------- Coordinate system ------------------------------------------
export const VIEW = Object.freeze({
  width: 440,
  height: 720,
});

export const FIELD = Object.freeze({
  marginX: 12,
  topBand: 48,
  launchLineY: 652,
  bottomBand: 68,
  columns: 7,
  brickGap: 4,
});

export const BRICK_SIZE = Math.floor(
  (VIEW.width - FIELD.marginX * 2 - FIELD.brickGap * (FIELD.columns - 1)) /
    FIELD.columns
); // 56 px

export const BRICK_ROW_STRIDE = BRICK_SIZE + FIELD.brickGap; // 60 px
export const BRICK_TOP = FIELD.topBand + 16;                 // 64 px

// ---------- Physics ----------------------------------------------------
export const PHYS = Object.freeze({
  ballRadius: 7,
  baseSpeed: 720,              // px/sec — brisk but trackable
  minVyFrac: 0.18,             // |vy| must be at least this fraction of speed
                               // to avoid near-horizontal stuck loops
  launchIntervalMs: 82,        // gap between consecutive balls in the stream
  maxAimDegFromVertical: 82,   // ±82°: wide but never flat
  minAimDegFromVertical: 0,    // straight up allowed
  landReleaseEpsilon: 1.0,
});

// ---------- Palette ----------------------------------------------------
export const PALETTE = Object.freeze({
  bgTop:       "#05071a",
  bgBottom:    "#0a0e27",
  frame:       "rgba(245, 240, 225, 0.08)",
  grid:        "rgba(245, 240, 225, 0.045)",
  launchLine:  "rgba(245, 240, 225, 0.18)",
  launchLineDanger: "rgba(239, 100, 110, 0.35)",
  launchDot:   "#fffbea",
  launchGlow:  "rgba(255, 251, 234, 0.45)",
  launchRing:  "rgba(255, 213, 79, 0.55)",
  aimLine:     "rgba(255, 251, 234, 0.55)",
  aimLineDim:  "rgba(255, 251, 234, 0.22)",
  ball:        "#fffbea",
  ballGlow:    "rgba(255, 213, 79, 0.6)",
  cream:       "#f5f0e1",
  creamDim:    "rgba(245, 240, 225, 0.55)",
});

// Brick HP → color tier. Order matters: first match wins.
export const BRICK_TIERS = [
  { max: 2,   fill: "#7fe7ce", edge: "#a8f0de" },
  { max: 5,   fill: "#c9e4a3", edge: "#dff0c2" },
  { max: 10,  fill: "#f2d06b", edge: "#f8df8e" },
  { max: 20,  fill: "#ef8a7b", edge: "#f4a698" },
  { max: 40,  fill: "#e04a5c", edge: "#ea6c7b" },
  { max: 70,  fill: "#b7558a", edge: "#c97aa4" },
  { max: 999, fill: "#9b6bd6", edge: "#b38be0" },
];

export function tierForHp(hp) {
  for (const t of BRICK_TIERS) if (hp <= t.max) return t;
  return BRICK_TIERS[BRICK_TIERS.length - 1];
}

// ---------- Game status ------------------------------------------------
//  ready    → waiting for aim + launch
//  flying   → balls are in motion; aiming locked
//  settling → all balls landed, launcher gliding to new x
//  shifting → bricks descending one row + new top row dropping in
//  gameover → a brick crossed the launch line; overlay shown
export const STATUS = Object.freeze({
  READY:    "ready",
  FLYING:   "flying",
  SETTLING: "settling",
  SHIFTING: "shifting",
  GAMEOVER: "gameover",
});

// Max row index allowed before it's game over.
// At BRICK_TOP=64 + row*60 + BRICK_SIZE=56, row 9 reaches y=660 > launchLineY=652.
export const GAMEOVER_ROW = 9;

// ---------- Mutable runtime state --------------------------------------
export const state = {
  status: STATUS.READY,

  // Meta progress
  turn: 1,
  coins: 0,
  best: Number(localStorage.getItem("bbtan.best") || 0),
  ballCount: 1,                // balls per shot; grows via +1 pickups
  pendingBallIncrement: 0,     // accumulated during the turn

  // Equipped ball id + unlocked set (populated at boot from balls.js)
  equippedBall: "classic",
  unlockedBalls: null,          // Set of ball ids

  // Settings (loaded by ui.js at boot)
  assistFade: true,             // shrink aim assist at higher turns

  // Modal overlay: "gacha" | "album" | "settings" | null.
  overlay: null,

  // Title-screen: true until user taps start
  atTitle: true,

  // Speed multiplier for fast-forward (affects only flying phase)
  speedLevel: 0,               // 0,1,2 → 1×, 2×, 3×
  get speedMultiplier() {
    return [1, 2, 3][this.speedLevel];
  },

  // Launcher anchor (origin of the ball stream)
  launcher: { x: VIEW.width / 2, y: FIELD.launchLineY },

  // Aim, captured on pointerdown / updated on pointermove.
  // angle = radians from straight up; negative = left, positive = right.
  // active = true while the user is dragging.
  aim: {
    active: false,
    angle: 0,
    valid: false,               // within allowed angle range and above launcher
  },

  // Ball stream during FLYING phase
  pendingLaunches: 0,
  nextSpawnAt: 0,               // performance.now() timestamp
  lockedAimAngle: 0,
  balls: [],                    // active balls
  firstLandedX: null,           // x-coord where the NEXT turn will launch from
  turnBallsLaunched: 0,

  // Bricks live here
  bricks: [],                   // each: {col, row, hp, hpMax, shakeT, hitT, fromRow?}

  // Power-ups on the board (plus / coin / shuffle / laserH / laserV)
  powerups: [],                 // {kind, col, row, alive, pulseT, fromRow?}

  // Row-shift animation progress (0→1 during SHIFTING phase)
  shiftT: 0,

  // Screen shake (seconds remaining)
  shakeT: 0,
  shakeMag: 0,

  // Game-over overlay state
  gameOver: {
    reachedTurn: 0,
    coinsEarned: 0,
    newBest: false,
  },

  // Particles + floating FX
  particles: [],                // {x,y,vx,vy,life,maxLife,color,size,kind}

  // Timing
  lastFrameTime: 0,
};

// ---------- Small utilities --------------------------------------------
export function saveBest() {
  if (state.turn > state.best) {
    state.best = state.turn;
    try { localStorage.setItem("bbtan.best", String(state.best)); } catch {}
    return true;
  }
  return false;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function deg(rad) { return (rad * 180) / Math.PI; }
export function rad(deg) { return (deg * Math.PI) / 180; }

export function brickWorldPos(col, row) {
  return {
    x: FIELD.marginX + col * BRICK_ROW_STRIDE,
    y: BRICK_TOP + row * BRICK_ROW_STRIDE,
  };
}

// Playable width inside walls
export const FIELD_LEFT  = FIELD.marginX;
export const FIELD_RIGHT = VIEW.width - FIELD.marginX;
export const FIELD_TOP   = FIELD.topBand;
