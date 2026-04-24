# BBTAN Classic — Study Break Arcade

A faithful browser recreation of the classic BBTAN by 111% (pre-renewal, with the capsule machine and unlockable balls). Built as a Study Break Arcade project — vanilla HTML/CSS/JS, no framework, no build step.

## Quick Start

```bash
cd bbtan
python3 -m http.server 8000
# open http://localhost:8000
```

Any static server works (`npx serve`, Python, nginx, Live Server). ES modules require HTTP — don't open `index.html` via `file://`.

## What's in the game

- **Endless survival BBTAN core loop** — aim, launch a ball stream, bricks descend, survive.
- **7-column grid**, 440×720 vertical canvas, responsive scaling.
- **Procedural row generation**: brick count scales 2→5, HP scales `[turn, turn×2]`.
- **Power-ups**: +1 ball, coin, direction shuffle, row laser, column laser.
- **Classic difficulty gate**: aim-assist prediction line shortens gradually from turn 20, ends at an 18% stub by turn 100.
- **Capsule Machine (gacha)**: 10 balls across 4 rarity tiers (Common/Rare/Epic/Legendary), 20 coins per pull.
- **10 unique balls** each affecting physics: Classic, Cube, Speedy, Heavy, Fire (pierce), Ice (freeze bricks), Split (splits on first hit), Giant (+1 dmg, huge), Laser (bounce-fires beams), Void (giant + pierce + 3 dmg).
- **Persistence** (localStorage): best stage, coins, unlocked set, equipped ball, sound setting, aim-assist setting.
- **Settings menu**: sound toggle, assist-fade toggle, full-reset.
- **Title screen** with pulsing start button.

## Project Layout

```
bbtan/
├── index.html               page shell + modals + title screen
├── css/style.css            theme, HUD, modals, animations
├── assets/sounds/           SFX library (.wav/.ogg)
├── docs/prd.md              product requirements (matches shipped game)
└── js/
    ├── state.js             constants + runtime state object
    ├── audio.js             pooled SFX with rate limit + pitch jitter
    ├── balls.js             ball catalog, rarity roll, persistence
    ├── levelgen.js          per-turn row generation
    ├── physics.js           ball motion, collisions, effects
    ├── powerups.js          collectible collision + effect dispatch
    ├── fx.js                particle pool + screen shake + beams
    ├── render.js            all canvas drawing
    ├── input.js             pointer aim + release-to-launch
    ├── ui.js                DOM overlays: title / gacha / album / settings
    └── game.js              main loop + turn state machine + HUD sync
```

## Controls

- **Drag upward** anywhere on the board to aim. **Release** to launch.
- **⏩** button cycles 1× → 2× → 3× fast-forward (flying phase only).
- **↻** button restarts the run.
- **🎰** button opens the Capsule Machine.
- **⚙** (top-right) opens Settings.
- **Esc** closes any open modal.

## Dev helpers

Open browser console; `window.bbtan` is exposed during development:

```js
bbtan.grantCoins(200)    // give yourself coins to test gacha
bbtan.unlockAll()        // unlock every ball (localhost dev only)
bbtan.reset()            // hard reset current run
bbtan.state              // inspect live state
```

## Credits

Original BBTAN by 111%. Sounds from user-provided freesound.org / zapsplat.com. Fonts from Google Fonts (Fredoka, Baloo 2). Everything else is original.
