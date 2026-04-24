# BBTAN Classic — Product Requirements

**Study Break Arcade — MSI course project**

## Product Summary

BBTAN Classic is a faithful browser recreation of the pre-renewal era of *BBTAN by 111%*, the mobile brick-breaker where you fling streams of balls at descending walls of numbered bricks. The player's only verb is "aim"; every shot must count because each missed brick brings the wall one row closer to death. It is a pure skill-expression game with a long runway, light meta-progression through a capsule machine, and the same minute-to-minute tension that made the original one of the all-time great casual mobile games.

The MVP is fully self-contained: one HTML page, vanilla CSS, and modular vanilla JavaScript — no framework, no build step. It runs as a static site from any HTTP server and plays on desktop and mobile browsers with identical mechanics.

## Audience and Goals

- **Primary audience**: MSI students who want a 5–15 minute study break that is instantly playable but deep enough to reward session-over-session improvement.
- **Primary goal**: deliver a BBTAN clone so faithful that a longtime player feels genuine muscle memory within the first three turns.
- **Secondary goal**: practice production-quality frontend fundamentals — responsive layout, canvas rendering, state machines, audio design, persistence, and component isolation — in a project that can be shipped as a course deliverable.

## Core Gameplay

### Loop

1. Brick wall sits at the top of a 7-column grid. Bottom of the playfield has a launch line.
2. The player drags upward from the launcher to aim; a dotted prediction line shows the ball's first-bounce trajectory.
3. On release, all of the player's balls (starting at 1, grows over time) fire in a timed stream from the launcher.
4. Balls bounce off walls, bricks, and each other (passively — balls don't collide with each other, faithful to the original).
5. Every brick hit reduces its HP by 1 (or more, depending on equipped ball). HP-zero bricks explode.
6. Ballistic collectibles (+1 ball, coin, direction shuffle, row laser, column laser) are passed through and activated on contact.
7. When every ball has landed, they slide to the location of the first ball that landed — this becomes the next launcher position.
8. The entire brick wall shifts down one row; a new row is procedurally generated at the top.
9. If any brick crosses the launch line, the run ends.

### Stage and difficulty curve

- Turn HP band: `[turn, turn × 2]`, with ~20% chance of a "chunky" brick at the top of the band.
- Bricks per row: 2–5, scaling gently with turn count.
- Power-up density per row: one `+1 ball` (88% chance), one coin (55%), plus a chance of one specialty (shuffle / row laser / column laser) from turn 3 onward.
- **Aim assist shortens with progress**: at turn 20 the full prediction line is visible; by turn 100 it's reduced to an 18% stub. This is the classic BBTAN "mastery gate."

### Meta-progression

- **Coins** drop from `$` power-ups (~55% of turns) and survive run deaths.
- **Capsule Machine**: 20 coins per pull, weighted by rarity. 10 balls across four tiers:
  - **Common** (weight 60): Classic, Cube
  - **Rare** (weight 25): Speedy, Heavy
  - **Epic** (weight 12): Fire, Ice, Split
  - **Legendary** (weight 3): Giant, Laser, Void
- **Collection / Album**: shows all 10 slots; locked slots show `?`; unlocks persist in localStorage; tap-to-equip.
- **Duplicates** refund half the pull cost.

### Ball effects (mechanics layer)

Balls vary along five axes that physics.js actually respects:

- **Radius** and **shape** (`circle` or rounded `square` for Cube)
- **Speed** multiplier
- **Launch gap** (ms between sequential balls in the stream)
- **Damage** per brick hit (1 for most; 2 for Heavy and Giant; 3 for Void)
- **Special effect flag**: `pierce` / `freezeOnHit` / `splitOnFirstHit` / `bounceLaser`

## Art Direction

**Theme**: *"darkness with a spark of light"* — deep indigo background with a central radial glow suggesting a single beacon against night. Bricks are high-saturation jewel tones that shift through a heat-coded palette (mint → lime → gold → coral → crimson → plum → violet) to signal HP at a glance. Balls are warm cream-to-amber with soft bloom. Power-up icons use distinct shapes plus color so they read at small sizes without relying on hue alone.

**UI**: Fredoka and Baloo 2 for display, with rounded arcade aesthetics. Modal overlays (gacha, album, settings) use frosted-backdrop blur over the playfield rather than navigating away — the game remains visible as context.

**Motion**: micro-animations everywhere. Bricks shake and flash on hit. Bricks drop into new rows from above. Launcher glides to the next shot origin. Capsule machine shakes and lever rotates during gacha. Rarity reveals have proportional halo animations (higher rarity = stronger pulse). Game Over triggers a screen shake and a fade-to-dark panel.

## Audio Design

Five-channel pooled SFX with per-channel rate-limiting and ±8–10% pitch variation to prevent the "machine gun" effect at high ball counts:

- **whoosh** — launch
- **arcade_bounce** — wall bounces (throttled)
- **brick_hit** — brick damaged (throttled)
- **brick_break** — brick destroyed (same sample, louder + lower pitch)
- **coin_pickup** — +1 ball, coin, album equip
- **laser_short** — direction shuffle + lasers
- **game_over** — run ended
- **capsule_pop** — gacha capsule drop
- **fanfare_epic** / **fanfare_legendary** — rarity reveals

All audio routes through a single `setMuted()` master toggle exposed in Settings.

## Accessibility

- **Keyboard**: `Esc` closes any open modal. `R` restarts the current run.
- **Pointer**: unified pointer events cover mouse and touch; the canvas disables native scroll/pinch to prevent touch scrolling during aim.
- **Focus**: visible gold focus rings on all interactive elements.
- **Color**: power-up icons ship with both hue *and* a distinct symbol to avoid color-only communication. Brick HP shows as a readable numeral on top of the color code.
- **High-DPI**: canvas is sized with `devicePixelRatio` up to 2× for Retina sharpness.

## Scope Boundaries

**Shipped**:
- Complete core loop
- 10-ball catalog with full effect implementations
- Gacha + album + settings modals
- Title screen
- localStorage persistence (best, coins, unlocked set, equipped ball, mute, aim-assist-fade toggle)
- Screen shake, particles, trails, beams

**Deliberately out of scope** (to keep it shippable):
- No new-era BBTAN blocks (2x, division, thorn, invisible, lock/key)
- No leveled/limited game modes — endless only
- No accounts or online leaderboards
- No custom themes beyond the default
- No full BGM loop (SFX only)

## Technical Overview

```
bbtan/
├── index.html               page shell + modals + title screen
├── css/style.css            theme, HUD, modals, animations
├── assets/sounds/*.wav,ogg  SFX library
└── js/
    ├── state.js             shared constants + runtime state
    ├── audio.js             pooled SFX manager with rate limit + pitch jitter
    ├── balls.js             ball catalog, rarity weighted roll, persistence
    ├── levelgen.js          per-turn row generation (bricks + power-ups)
    ├── physics.js           ball integration, wall/brick collision, ball effects
    ├── powerups.js          collectible detection + effect dispatch
    ├── fx.js                particle pool + screen shake + beams
    ├── render.js            all canvas drawing (pure read of state)
    ├── input.js             pointer aim + release-to-launch
    ├── ui.js                DOM overlays: title / gacha / album / settings
    └── game.js              main loop, turn state machine, HUD sync
```

**Core architecture**: a single shared `state` object mutated in place; a 5-phase state machine (`READY → FLYING → SETTLING → SHIFTING → READY | GAMEOVER`); render pass is read-only on state and runs last each frame.

## Acceptance Criteria

- Title screen displays on first load, dismissable with "Tap to Start" or any click on the backdrop.
- Aim, launch, bounce, brick damage, and power-up collection all work for every equipped ball.
- All 10 balls equip and visibly change the ball visual AND physics.
- Capsule machine: pulls cost 20 coins, disabled when not affordable, shows rarity-tiered reveal with correct halo color, plays correct sound; duplicates refund 10 coins.
- Album: accurate unlocked count, locked slots obscured, equipped slot visibly highlighted.
- Settings: Sound toggle mutes and unmutes all channels; aim assist toggle is respected immediately on next draw; Reset Progress clears persistence after confirmation and reloads.
- Game Over triggers screen shake + audio + overlay; Reset returns to turn 1 with the equipped ball retained.
- `Best`, `coins`, `unlocked balls`, `equipped ball`, and settings all persist across reloads via localStorage.

## Success Metric

A first-time player — one who has played original BBTAN — opens the page, understands what to do without reading a single line of instruction, and within three minutes says "oh, this is actually BBTAN."
