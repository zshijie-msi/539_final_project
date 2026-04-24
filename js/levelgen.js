/**
 * levelgen.js — procedural per-turn row generation.
 *
 * Each turn, we produce:
 *   - 2–5 numbered bricks (count grows with turn)
 *   - optionally a "+1 ball" power-up (very likely)
 *   - optionally a coin (sometimes)
 *   - optionally a special power-up: shuffle / laser-H / laser-V (rare)
 *
 * HP scaling mirrors the classic BBTAN feel:
 *   HP in [turn, 2*turn], with a small chance of a "chunky" brick at 2*turn
 *   to create the occasional wall that forces you to plan.
 */

import { FIELD } from "./state.js";

const COLS = FIELD.columns;

// Weighted pick helper
function weighted(pairs) {
  const total = pairs.reduce((s, [_, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of pairs) {
    r -= w;
    if (r <= 0) return v;
  }
  return pairs[pairs.length - 1][0];
}

function randInt(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function brickCountForTurn(turn) {
  // Early turns are gentle; late turns pack the row.
  const minB = Math.min(3, 2 + Math.floor(turn / 4));
  const maxB = Math.min(5, 3 + Math.floor(turn / 6));
  return randInt(minB, Math.max(minB, maxB));
}

function hpForTurn(turn) {
  const hi = turn * 2;
  const lo = turn;
  // ~20% chance of the upper bound to create "wall" bricks
  if (Math.random() < 0.2) return hi;
  return randInt(lo, hi);
}

/**
 * Generate a new top row.
 *
 * Returns { bricks: [...], powerups: [...] } where each item has
 *   { col, row: 0, ... }.
 * The caller is responsible for inserting them into state and for
 * tagging their drop animation offset.
 */
export function generateTopRow(turn) {
  // 1) Pick brick columns
  const slots = shuffleArray([0, 1, 2, 3, 4, 5, 6]);
  const brickCount = brickCountForTurn(turn);
  const brickCols = slots.slice(0, brickCount).sort((a, b) => a - b);

  const bricks = brickCols.map((col) => {
    const hp = hpForTurn(turn);
    return {
      col,
      row: 0,
      hp,
      hpMax: hp,
      hitT: 0,
      shakeT: 0,
      fromRow: -2, // animate in from 2 rows above
    };
  });

  // 2) Pick power-up slots from remaining empty columns
  const freeCols = slots.slice(brickCount);
  const powerups = [];

  // +1 ball: very likely (classic BBTAN gives one almost every turn)
  if (freeCols.length > 0 && Math.random() < 0.88) {
    const col = freeCols.shift();
    powerups.push(makePowerup("plus", col));
  }

  // Coin: common
  if (freeCols.length > 0 && Math.random() < 0.55) {
    const col = freeCols.shift();
    powerups.push(makePowerup("coin", col));
  }

  // Specials unlock with progression
  if (freeCols.length > 0 && turn >= 3) {
    const kind = weighted([
      [null, 78],     // 78%: no special this turn
      ["shuffle", 6],
      ["laserH", 8],
      ["laserV", 8],
    ]);
    if (kind) {
      const col = freeCols.shift();
      powerups.push(makePowerup(kind, col));
    }
  }

  return { bricks, powerups };
}

function makePowerup(kind, col) {
  return {
    kind,                 // 'plus' | 'coin' | 'shuffle' | 'laserH' | 'laserV'
    col,
    row: 0,
    alive: true,
    pulseT: Math.random() * Math.PI * 2, // pulse phase offset so they don't sync
    fromRow: -2,
  };
}
