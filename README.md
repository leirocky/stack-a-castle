# Stack-a-Castle

A 3D castle builder that runs in any web browser, on phones and computers. Stack stone walls, towers, gates and moats on a floating island, furnish the rooms, add characters who walk around on their own, and switch between day and night.

**Play it:** https://leirocky.github.io/stack-a-castle/

**Version 1.3.0** (27 Nov 2026) · [What's new](CHANGELOG.md) · [Roadmap](docs/ROADMAP.md)

![The sample castle: stone walls with battlements, four round towers with red roofs, a brick keep with a flag, a moat, and a dragon flying overhead](docs/screenshot.jpg)

## How to play

| | Phone or tablet | Computer |
|---|---|---|
| Spin the view | Drag with one finger | Drag with the left mouse button |
| Zoom | Pinch | Scroll wheel |
| Move around the island | Drag with two fingers | Drag with the right mouse button |
| Place a piece | Pick it in the tray, then tap the ground or the side of a block | Same, with a click |
| Place a landmark | Pick it in the **Landmarks** tab, then tap an open patch of grass | Same, with a click (an outline shows where it will go) |
| Remove a piece | Switch to **Erase**, then tap it | Right-click it (or press **E** for Erase) |
| Undo | Undo button (top right) | Undo button or **Ctrl/Cmd + Z** |
| Day / night | Moon button | Moon button or **N** |
| Pick a piece by number | — | **1–9, 0** pick the pieces in the open tab |

A **How to play** card appears on the first visit. More options are in the **⋯** menu: sign in to save online, build the sample castle, make the island bigger, save a picture, reset the view, auto-spin, sound on/off, save to a file, open a saved file, how to play, and clear everything.

## What's in the game

- **Castle (10):** stone, brick, window, gate, battlement, round tower, roof, flag, torch, gold
- **Nature (11):** grass, dirt, sand, cobblestone, water, tree, log, leaves, snow, ice, lava
- **Build (17):** wood, glass, slab, stairs, fence, door, lamp, lantern, seven colors, iron and clock
- **Furniture (12):** table, chair, bed, bookshelf, fireplace, candles, throne, chest, rug, flowers, bench, barrel
- **Landmarks (9):** the Great Pyramid, Eiffel Tower, Big Ben, Statue of Liberty, Leaning Tower of Pisa, Colosseum, Stonehenge, Great Wall and Moai. Tap the grass and the whole landmark pops up out of ordinary blocks, facing you. You can change any part of it, and one Undo takes it away.
- **Characters (6):** knight, queen, sheep, chicken, cat, dragon. They wander, walk through gates and doors, walk around furniture and over rugs, climb one block at a time, and avoid water and lava. The dragon circles in the sky. Tap a character to make it jump and make its sound.
- A 300 × 300 island that can grow to 1000 × 1000 (**⋯ → Bigger island**), blocks up to 32 high, up to 40 characters. Big castles (thousands of blocks) stay smooth.
- Gates, doors, fences, stairs and furniture turn to face you when placed. Candles, flowers and rugs sit down onto tables and other low furniture.
- At night, windows, clocks, lamps, lanterns, torches, candles, fireplaces and lava glow.
- **Save a picture** of your castle from the ⋯ menu.

All textures, models and sounds are generated in code; the game has no image or audio files. The characters are original designs.

## Saving

| Where | Status | What it does |
|---|---|---|
| This browser | ✅ Working | Every change is saved instantly on the device, even offline. Reopen the page to pick up where you left off. Clearing the browser's site data erases it. |
| A file | ✅ Working | **⋯ → Save to a file** downloads a `.json` backup. **⋯ → Open a saved file** loads it on any device. |
| Online, across devices | ✅ Working | **⋯ → Sign in to save online** with a Google account. The castle then loads on any device where you sign in, and changes sync live. If the device goes offline, saving online resumes by itself when it's back. Signing in is optional. Setup: [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md). |

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
js/game.js            The whole game: textures, pieces, furniture, characters, drawing, controls, saving
js/firebase-config.js Firebase project settings (public values) for online saving
CHANGELOG.md          What changed in each version
CLAUDE.md             Project rules and context for Claude Code
docs/PROGRESS.md      Current status, what's done, what's next, known issues
docs/ROADMAP.md       Milestones (v1.0 → v3.0) and how to release a version
docs/ARCHITECTURE.md  How the code works and the save-file format
docs/FIREBASE_SETUP.md  How online saving is set up in Firebase
.nojekyll             Tells GitHub Pages to serve files as-is
```

The game uses [Three.js](https://threejs.org/) r128 from the jsDelivr CDN, [Firebase](https://firebase.google.com/) 10.12 (Google sign-in and Firestore, compat builds) from Google's CDN, and Google Fonts (Pirata One and Fredoka).

## Status

- **[docs/PROGRESS.md](docs/PROGRESS.md):** where things stand right now, known issues and decisions
- **[docs/ROADMAP.md](docs/ROADMAP.md):** future milestones, from v1.3 (a bigger, livelier island) to v3.0 (build together)
- **[CHANGELOG.md](CHANGELOG.md):** what's in each released version
