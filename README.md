# Stack-a-Castle

A 3D castle builder that runs in any web browser, on phones and computers. Stack stone walls, towers, gates and moats on a floating island, add characters who walk around on their own, and switch between day and night.

**Play it:** https://leirocky.github.io/stack-a-castle/

**Version 1.0.0** (26 Nov 2026) · [What's new](CHANGELOG.md) · [Roadmap](docs/ROADMAP.md)

![The sample castle: stone walls with battlements, four round towers with red roofs, a brick keep with a flag, a moat, and a dragon flying overhead](docs/screenshot.jpg)

## How to play

| | Phone or tablet | Computer |
|---|---|---|
| Spin the view | Drag with one finger | Drag with the left mouse button |
| Zoom | Pinch | Scroll wheel |
| Move around the island | Drag with two fingers | Drag with the right mouse button |
| Place a piece | Pick it in the tray, then tap the ground or the side of a block | Same, with a click |
| Remove a piece | Switch to **Erase**, then tap it | Right-click it (or press **E** for Erase) |
| Undo | Undo button (top right) | Undo button or **Ctrl/Cmd + Z** |
| Day / night | Moon button | Moon button or **N** |
| Pick a piece by number | — | **1–9, 0** pick the pieces in the open tab |

More options are in the **⋯** menu: sign in to save online, build the sample castle, reset the view, auto-spin, sound on/off, save to a file, open a saved file, and clear everything.

## What's in the game

- **Castle (10):** stone, brick, window, gate, battlement, round tower, roof, flag, torch, gold
- **Nature (11):** grass, dirt, sand, cobblestone, water, tree, log, leaves, snow, ice, lava
- **Build (14):** wood, glass, slab, stairs, fence, door, lamp, lantern, and six colors
- **Characters (6):** knight, queen, sheep, chicken, cat, dragon. They wander, walk through gates and doors, climb one block at a time, and avoid water and lava. The dragon circles in the sky. Tap a character to make it jump and make its sound.
- A 100 × 100 island, blocks up to 32 high, up to 40 characters.
- Gates, doors, fences and stairs turn to face you when placed.
- At night, windows, lamps, lanterns, torches and lava glow.

All textures, models and sounds are generated in code; the game has no image or audio files. The characters are original designs.

## Saving

| Where | Status | What it does |
|---|---|---|
| This browser | ✅ Working | Every change is saved instantly on the device. Reopen the page to pick up where you left off. Clearing the browser's site data erases it. |
| A file | ✅ Working | **⋯ → Save to a file** downloads a `.json` backup. **⋯ → Open a saved file** loads it on any device. |
| Online, across devices | ✅ Working | **⋯ → Sign in to save online** with a Google account. The castle then loads on any device where you sign in, and changes sync live. Signing in is optional. Setup: [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md). |

## Run it on your computer

No build step and no install. From the project folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. (Opening `index.html` directly also works in most browsers.)

## Deploying

The site is served by **GitHub Pages** from the `main` branch, root folder. Pushing to `main` updates the live site within about a minute.

When you change `css/style.css`, `js/game.js` or `js/firebase-config.js`, **raise the `?v=` number** on the links in `index.html`. Browsers keep old copies of these files for up to 10 minutes; the new number makes them load the new version right away. The number matches the game's version, which also appears at the bottom of the ⋯ menu. The full release steps are in [docs/ROADMAP.md](docs/ROADMAP.md#releasing-a-version).

## Project layout

```
index.html            Page markup: the 3D stage, top bar, menu, and the tool dock
css/style.css         All styles (colors are tokens at the top)
js/game.js            The whole game: textures, pieces, characters, controls, saving
js/firebase-config.js Firebase project settings (public values) for online saving
CHANGELOG.md          What changed in each version
CLAUDE.md             Project rules and context for Claude Code
docs/PROGRESS.md      Current status, what's done, what's next, known issues
docs/ROADMAP.md       Future milestones (v1.1 → v3.0) and how to release a version
docs/ARCHITECTURE.md  How the code works and the save-file format
docs/FIREBASE_SETUP.md  How online saving is set up in Firebase
.nojekyll             Tells GitHub Pages to serve files as-is
```

The game uses [Three.js](https://threejs.org/) r128 from the jsDelivr CDN, [Firebase](https://firebase.google.com/) 10.12 (Google sign-in and Firestore, compat builds) from Google's CDN, and Google Fonts (Pirata One and Fredoka).

## Status

- **[docs/PROGRESS.md](docs/PROGRESS.md):** where things stand right now, known issues and decisions
- **[docs/ROADMAP.md](docs/ROADMAP.md):** future milestones, from v1.1 (smooth and solid) to v3.0 (build together)
- **[CHANGELOG.md](CHANGELOG.md):** what's in each released version
