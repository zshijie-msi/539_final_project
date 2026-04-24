/**
 * balls.js — ball catalog + persistence.
 *
 * Ten balls across four rarity tiers:
 *
 *   COMMON   (gray halo)      — pull weight 60
 *     classic       — default ball, balanced
 *     cube          — square ball, wider hitbox
 *
 *   RARE     (blue halo)      — pull weight 25
 *     speedy        — faster + smaller; more balls per second
 *     heavy         — slow but large, each hit deals 2 damage
 *
 *   EPIC     (purple halo)    — pull weight 12
 *     fire          — pierces through bricks without bouncing back
 *     ice           — hit bricks freeze for one turn (won't descend)
 *     split         — on first brick hit, spawns 2 more balls
 *
 *   LEGENDARY (gold halo)     — pull weight 3
 *     giant         — 3× radius, visually massive, does +1 damage
 *     laser         — each wall bounce fires a horizontal sweep laser
 *     void          — huge + pierces + does +2 damage (endgame god ball)
 *
 * Each ball defines visual properties (colors, radius, glow) and an
 * `effects` object the physics layer consults when that ball is equipped.
 *
 * Persistence: unlocked IDs and equipped ID are saved in localStorage.
 */

export const RARITY = Object.freeze({
  COMMON:    { key: "common",    label: "Common",    tier: 0,
               halo: "#8fa3c4", textGlow: "rgba(143,163,196,0.6)", weight: 60 },
  RARE:      { key: "rare",      label: "Rare",      tier: 1,
               halo: "#5ea9e8", textGlow: "rgba(94,169,232,0.7)",  weight: 25 },
  EPIC:      { key: "epic",      label: "Epic",      tier: 2,
               halo: "#b87be8", textGlow: "rgba(184,123,232,0.75)", weight: 12 },
  LEGENDARY: { key: "legendary", label: "Legendary", tier: 3,
               halo: "#ffd54f", textGlow: "rgba(255,213,79,0.85)",  weight: 3 },
});

/**
 * Ball catalog. Every ball is a shipped unlock candidate.
 *
 * Effect flags consumed by physics.js:
 *   damage         — base damage per brick hit (default 1)
 *   pierce         — bool, ball passes through without bouncing
 *   freezeOnHit    — bool, bricks hit this turn skip next descent
 *   splitOnFirstHit — bool, spawn 2 more balls on first brick contact
 *   bounceLaser    — bool, each wall bounce fires a horizontal laser
 *   shape          — "circle" | "square"
 */
export const BALLS = [
  {
    id: "classic",
    name: "Classic",
    rarity: RARITY.COMMON,
    blurb: "Balanced and honest. The ball you start with.",
    radius: 7,
    speedScale: 1.0,
    shape: "circle",
    colorCore: "#ffffff",
    colorMid:  "#fff3c2",
    colorEdge: "#f7c04e",
    glow: "rgba(255, 213, 79, 0.6)",
    effects: { damage: 1 },
  },
  {
    id: "cube",
    name: "Cube",
    rarity: RARITY.COMMON,
    blurb: "Square profile gives a slightly wider strike zone.",
    radius: 8,
    speedScale: 0.98,
    shape: "square",
    colorCore: "#f5f0e1",
    colorMid:  "#cdd6e8",
    colorEdge: "#6c7a99",
    glow: "rgba(205, 214, 232, 0.55)",
    effects: { damage: 1 },
  },

  {
    id: "speedy",
    name: "Speedy",
    rarity: RARITY.RARE,
    blurb: "Lean and fast. Smaller hitbox but fires in tight sequence.",
    radius: 6,
    speedScale: 1.22,
    launchGap: 62,  // ms between balls in stream
    shape: "circle",
    colorCore: "#f0ffff",
    colorMid:  "#9fe8f5",
    colorEdge: "#39b7d4",
    glow: "rgba(57, 183, 212, 0.7)",
    effects: { damage: 1 },
  },
  {
    id: "heavy",
    name: "Heavy",
    rarity: RARITY.RARE,
    blurb: "Slow, dense, and pays double. Every hit deals 2.",
    radius: 10,
    speedScale: 0.78,
    launchGap: 110,
    shape: "circle",
    colorCore: "#f5f0e1",
    colorMid:  "#c9a876",
    colorEdge: "#6d5233",
    glow: "rgba(201, 168, 118, 0.5)",
    effects: { damage: 2 },
  },

  {
    id: "fire",
    name: "Fire",
    rarity: RARITY.EPIC,
    blurb: "Pierces every brick it touches. No bouncing back.",
    radius: 8,
    speedScale: 1.08,
    shape: "circle",
    colorCore: "#fff1d6",
    colorMid:  "#ff9f59",
    colorEdge: "#ef4535",
    glow: "rgba(239, 69, 53, 0.8)",
    effects: { damage: 1, pierce: true },
  },
  {
    id: "ice",
    name: "Ice",
    rarity: RARITY.EPIC,
    blurb: "Bricks hit this turn freeze — they skip next descent.",
    radius: 8,
    speedScale: 1.0,
    shape: "circle",
    colorCore: "#eafcff",
    colorMid:  "#9dd9f0",
    colorEdge: "#3d7aa8",
    glow: "rgba(61, 122, 168, 0.8)",
    effects: { damage: 1, freezeOnHit: true },
  },
  {
    id: "split",
    name: "Split",
    rarity: RARITY.EPIC,
    blurb: "On first brick contact, splits into 3 balls.",
    radius: 7,
    speedScale: 1.02,
    shape: "circle",
    colorCore: "#fff0fb",
    colorMid:  "#f0a8d8",
    colorEdge: "#b94b9c",
    glow: "rgba(185, 75, 156, 0.8)",
    effects: { damage: 1, splitOnFirstHit: true },
  },

  {
    id: "giant",
    name: "Giant",
    rarity: RARITY.LEGENDARY,
    blurb: "A massive sphere. Wide hitbox, deals +1 damage.",
    radius: 16,
    speedScale: 0.9,
    launchGap: 140,
    shape: "circle",
    colorCore: "#fff9e7",
    colorMid:  "#ffe598",
    colorEdge: "#d08e29",
    glow: "rgba(255, 213, 79, 0.9)",
    effects: { damage: 2 },
  },
  {
    id: "laser",
    name: "Laser",
    rarity: RARITY.LEGENDARY,
    blurb: "Every wall bounce fires a horizontal sweep beam.",
    radius: 8,
    speedScale: 1.1,
    shape: "circle",
    colorCore: "#e8fff0",
    colorMid:  "#7be3a5",
    colorEdge: "#2a8a52",
    glow: "rgba(123, 227, 165, 0.9)",
    effects: { damage: 1, bounceLaser: true },
  },
  {
    id: "void",
    name: "Void",
    rarity: RARITY.LEGENDARY,
    blurb: "Giant + pierce + doubled damage. End-game menace.",
    radius: 14,
    speedScale: 1.0,
    launchGap: 100,
    shape: "circle",
    colorCore: "#f2eaff",
    colorMid:  "#9b6bd6",
    colorEdge: "#3a1d5c",
    glow: "rgba(155, 107, 214, 1)",
    effects: { damage: 3, pierce: true },
  },
];

export function getBall(id) {
  return BALLS.find((b) => b.id === id) || BALLS[0];
}

// ---------- Persistence -----------------------------------------------
const KEY_UNLOCKED = "bbtan.unlocked";
const KEY_EQUIPPED = "bbtan.equipped";

export function loadUnlocked() {
  try {
    const raw = localStorage.getItem(KEY_UNLOCKED);
    if (!raw) return new Set(["classic"]);
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set(["classic"]);
    const set = new Set(arr);
    set.add("classic");
    return set;
  } catch {
    return new Set(["classic"]);
  }
}

export function saveUnlocked(set) {
  try {
    localStorage.setItem(KEY_UNLOCKED, JSON.stringify([...set]));
  } catch {}
}

export function loadEquipped() {
  try {
    return localStorage.getItem(KEY_EQUIPPED) || "classic";
  } catch {
    return "classic";
  }
}

export function saveEquipped(id) {
  try {
    localStorage.setItem(KEY_EQUIPPED, id);
  } catch {}
}

// ---------- Gacha roll -------------------------------------------------
/**
 * Weighted roll across all balls using rarity.weight.
 * Returns the full ball object.
 */
export function rollGacha() {
  const totalWeight = BALLS.reduce((s, b) => s + b.rarity.weight, 0);
  let r = Math.random() * totalWeight;
  for (const ball of BALLS) {
    r -= ball.rarity.weight;
    if (r <= 0) return ball;
  }
  return BALLS[0];
}

export const GACHA_COST = 20;
