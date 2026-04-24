/**
 * ui.js — DOM overlay screens:
 *   - Title screen (shown at boot; "TAP TO START" to enter)
 *   - Gacha modal (spend coins, animate machine, reveal ball with rarity)
 *   - Album modal (collection of unlocked balls, tap to equip)
 *
 * The modals call back into game.js via the exposed API (setEquipped /
 * onCoinsChanged). We also maintain a small state.overlay flag so input.js
 * can block canvas aiming while a modal is open.
 */

import { state } from "./state.js";
import {
  BALLS, getBall, rollGacha, GACHA_COST,
  loadUnlocked, saveUnlocked, saveEquipped,
} from "./balls.js";
import { audio, setMuted } from "./audio.js";

// Element refs
const titleScreen   = document.getElementById("titleScreen");
const startBtn      = document.getElementById("titleStartBtn");

const gachaModal    = document.getElementById("gachaModal");
const gachaCloseBtn = document.getElementById("gachaCloseBtn");
const gachaPullBtn  = document.getElementById("gachaPullBtn");
const gachaCostLbl  = document.getElementById("gachaCostLabel");
const gachaAlbumBtn = document.getElementById("gachaAlbumBtn");
const gachaMachine  = document.getElementById("gachaMachine");
const gachaBody     = gachaMachine.querySelector(".gacha-body");
const gachaLever    = document.getElementById("gachaLever");
const gachaDropping = document.getElementById("gachaDropping");
const gachaReveal   = document.getElementById("gachaReveal");
const revealCanvas  = document.getElementById("revealBallCanvas");
const revealRarity  = document.getElementById("revealRarity");
const revealName    = document.getElementById("revealName");
const revealBlurb   = document.getElementById("revealBlurb");
const revealDup     = document.getElementById("revealDup");

const albumModal    = document.getElementById("albumModal");
const albumCloseBtn = document.getElementById("albumCloseBtn");
const albumBackBtn  = document.getElementById("albumBackBtn");
const albumGrid     = document.getElementById("albumGrid");
const albumProgress = document.getElementById("albumProgress");

const settingsModal    = document.getElementById("settingsModal");
const settingsBtn      = document.getElementById("settingsBtn");
const settingsCloseBtn = document.getElementById("settingsCloseBtn");
const soundToggle      = document.getElementById("soundToggle");
const assistFadeToggle = document.getElementById("assistFadeToggle");
const resetProgressBtn = document.getElementById("resetProgressBtn");

// External hooks injected by game.js
let syncHudCb = () => {};

export function initUI({ onHudNeedsSync }) {
  syncHudCb = onHudNeedsSync;

  // Load persistence
  state.unlockedBalls = loadUnlocked();
  state.equippedBall  = localStorage.getItem("bbtan.equipped") || "classic";
  if (!state.unlockedBalls.has(state.equippedBall)) state.equippedBall = "classic";

  // Settings persistence (boot-time load)
  const savedMuted = localStorage.getItem("bbtan.muted") === "1";
  const savedAssist = localStorage.getItem("bbtan.assistFade") !== "0";
  soundToggle.checked = !savedMuted;
  assistFadeToggle.checked = savedAssist;
  setMuted(savedMuted);
  state.assistFade = savedAssist;

  gachaCostLbl.textContent = String(GACHA_COST);

  // Title
  startBtn.addEventListener("click", closeTitle);
  titleScreen.addEventListener("click", (ev) => {
    if (ev.target === titleScreen || ev.target.classList.contains("title-content")) {
      closeTitle();
    }
  });

  // Gacha
  gachaCloseBtn.addEventListener("click", closeGacha);
  gachaPullBtn.addEventListener("click", onPull);
  gachaAlbumBtn.addEventListener("click", () => {
    closeGacha();
    openAlbum();
  });

  // Album
  albumCloseBtn.addEventListener("click", closeAlbum);
  albumBackBtn.addEventListener("click", () => {
    closeAlbum();
    openGacha();
  });

  // Settings
  settingsBtn.addEventListener("click", openSettings);
  settingsCloseBtn.addEventListener("click", closeSettings);
  soundToggle.addEventListener("change", () => {
    const muted = !soundToggle.checked;
    setMuted(muted);
    try { localStorage.setItem("bbtan.muted", muted ? "1" : "0"); } catch {}
    if (!muted) audio.coin.play();
  });
  assistFadeToggle.addEventListener("change", () => {
    state.assistFade = assistFadeToggle.checked;
    try { localStorage.setItem("bbtan.assistFade", assistFadeToggle.checked ? "1" : "0"); } catch {}
  });
  resetProgressBtn.addEventListener("click", () => {
    if (!confirm("Reset all progress?\n\nBest stage, coins, and unlocked balls will be lost.")) return;
    try {
      localStorage.removeItem("bbtan.best");
      localStorage.removeItem("bbtan.unlocked");
      localStorage.removeItem("bbtan.equipped");
    } catch {}
    location.reload();
  });

  // ESC closes open modal
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      if (state.overlay === "gacha")   closeGacha();
      else if (state.overlay === "album")   closeAlbum();
      else if (state.overlay === "settings") closeSettings();
    }
  });
}

// --------- Title ----------------------------------------------------
function closeTitle() {
  titleScreen.setAttribute("aria-hidden", "true");
  state.atTitle = false;
}

// --------- Settings ------------------------------------------------
function openSettings() {
  state.overlay = "settings";
  settingsModal.setAttribute("aria-hidden", "false");
}
function closeSettings() {
  settingsModal.setAttribute("aria-hidden", "true");
  state.overlay = null;
}

// --------- Gacha ----------------------------------------------------
export function openGacha() {
  state.overlay = "gacha";
  gachaModal.setAttribute("aria-hidden", "false");
  gachaReveal.classList.remove("visible");
  gachaReveal.removeAttribute("data-rarity");
  gachaReveal.className = "gacha-reveal"; // reset rarity class
  updatePullButton();
}

export function closeGacha() {
  gachaModal.setAttribute("aria-hidden", "true");
  state.overlay = null;
}

function updatePullButton() {
  gachaPullBtn.disabled = state.coins < GACHA_COST;
}

let pulling = false;
function onPull() {
  if (pulling) return;
  if (state.coins < GACHA_COST) return;
  pulling = true;

  // Pay
  state.coins -= GACHA_COST;
  syncHudCb();
  updatePullButton();

  // Animate: shake machine + spin lever
  gachaBody.classList.add("shaking");
  gachaLever.classList.add("turning");

  // Roll and reveal
  const rolled = rollGacha();
  const isDup = state.unlockedBalls.has(rolled.id);
  if (!isDup) {
    state.unlockedBalls.add(rolled.id);
    saveUnlocked(state.unlockedBalls);
  } else {
    // Duplicate refund: half the pull cost
    state.coins += Math.floor(GACHA_COST / 2);
    syncHudCb();
  }

  // Drop capsule after shake
  setTimeout(() => {
    gachaDropping.style.background = `radial-gradient(circle at 35% 30%, ${rolled.colorMid}, ${rolled.colorEdge})`;
    gachaDropping.classList.add("active");
    audio.capsulePop.play();
  }, 380);

  // Reveal after capsule drop
  setTimeout(() => {
    showReveal(rolled, isDup);
  }, 1050);

  // Reset for next pull
  setTimeout(() => {
    gachaBody.classList.remove("shaking");
    gachaLever.classList.remove("turning");
    gachaDropping.classList.remove("active");
    pulling = false;
    updatePullButton();
  }, 2800);
}

function showReveal(ball, isDup) {
  // Draw the ball preview
  drawBallPreview(revealCanvas, ball, { large: true });

  // Set rarity-specific styling
  gachaReveal.className = `gacha-reveal rarity-${ball.rarity.key} visible`;
  gachaReveal.style.setProperty("--reveal-color", ball.rarity.halo);

  revealRarity.textContent = ball.rarity.label.toUpperCase();
  revealName.textContent = ball.name;
  revealBlurb.textContent = ball.blurb;
  revealDup.hidden = !isDup;
  if (isDup) revealDup.textContent = `Duplicate — refunded ${Math.floor(GACHA_COST / 2)} coins.`;

  // Sound: rarity-tiered fanfare
  if (ball.rarity.tier >= 3) {
    audio.fanfareLegendary.play();
  } else if (ball.rarity.tier >= 2) {
    audio.fanfareEpic.play();
  } else if (ball.rarity.tier >= 1) {
    audio.coin.play();
  } else {
    audio.coin.play();
  }
}

// --------- Album ----------------------------------------------------
export function openAlbum() {
  state.overlay = "album";
  albumModal.setAttribute("aria-hidden", "false");
  buildAlbumGrid();
}

export function closeAlbum() {
  albumModal.setAttribute("aria-hidden", "true");
  state.overlay = null;
}

function buildAlbumGrid() {
  albumGrid.innerHTML = "";
  const unlocked = state.unlockedBalls;
  albumProgress.textContent = `${unlocked.size} / ${BALLS.length}`;

  for (const ball of BALLS) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "album-card";
    card.dataset.rarity = ball.rarity.key;

    const isUnlocked = unlocked.has(ball.id);
    const isEquipped = state.equippedBall === ball.id;
    if (!isUnlocked) card.classList.add("locked");
    if (isEquipped)  card.classList.add("equipped");

    // Canvas preview
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    canvas.setAttribute("aria-hidden", "true");
    card.appendChild(canvas);
    drawBallPreview(canvas, ball, { locked: !isUnlocked });

    const nameEl = document.createElement("div");
    nameEl.className = "album-name";
    nameEl.textContent = isUnlocked ? ball.name : "???";
    card.appendChild(nameEl);

    const rarityEl = document.createElement("div");
    rarityEl.className = "album-rarity";
    rarityEl.textContent = ball.rarity.label;
    card.appendChild(rarityEl);

    if (isUnlocked) {
      card.setAttribute("aria-label", `${ball.name}, ${ball.rarity.label}${isEquipped ? ", equipped" : ""}`);
      card.addEventListener("click", () => equipBall(ball.id));
    } else {
      card.setAttribute("aria-label", "Locked ball");
    }

    albumGrid.appendChild(card);
  }
}

function equipBall(id) {
  state.equippedBall = id;
  saveEquipped(id);
  audio.coin.play();
  buildAlbumGrid(); // refresh to show new equipped badge
  syncHudCb();
  // Nudge the status line to reflect the new ball name
  const hint = document.getElementById("statusLine");
  if (hint) {
    const { getBall } = { getBall: (i) => BALLS.find(b => b.id === i) };
    const b = getBall(id);
    if (b) hint.textContent = `Equipped: ${b.name}`;
  }
}

// --------- Ball preview drawing (shared) ---------------------------
function drawBallPreview(canvas, ball, { large = false, locked = false } = {}) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H / 2;
  const r = large ? W * 0.28 : W * 0.3;

  // Glow
  ctx.save();
  if (!locked) {
    ctx.shadowColor = ball.glow;
    ctx.shadowBlur = large ? 30 : 12;
  }

  // Ball body
  if (ball.shape === "square") {
    // Rounded square
    const size = r * 1.7;
    const x = cx - size / 2;
    const y = cy - size / 2;
    const rr = size * 0.18;
    const g = ctx.createLinearGradient(x, y, x, y + size);
    g.addColorStop(0, ball.colorCore);
    g.addColorStop(0.5, ball.colorMid);
    g.addColorStop(1, ball.colorEdge);
    ctx.fillStyle = locked ? "#222" : g;
    roundRect(ctx, x, y, size, size, rr);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    const g = ctx.createRadialGradient(cx - r*0.3, cy - r*0.4, r*0.1, cx, cy, r);
    g.addColorStop(0, ball.colorCore);
    g.addColorStop(0.55, ball.colorMid);
    g.addColorStop(1, ball.colorEdge);
    ctx.fillStyle = locked ? "#222" : g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // Specular highlight
    if (!locked) {
      const hl = ctx.createRadialGradient(cx - r*0.4, cy - r*0.45, 0, cx - r*0.4, cy - r*0.45, r*0.6);
      hl.addColorStop(0, "rgba(255,255,255,0.55)");
      hl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hl;
      ctx.beginPath();
      ctx.arc(cx - r*0.35, cy - r*0.35, r*0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (locked) {
    // Draw lock icon on top
    ctx.fillStyle = "#555";
    ctx.font = `700 ${Math.floor(W*0.3)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowBlur = 0;
    ctx.fillText("?", cx, cy);
  }

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Called from game.js when coins change — re-enable/disable pull button
export function refreshGachaButton() {
  if (state.overlay === "gacha") updatePullButton();
}
