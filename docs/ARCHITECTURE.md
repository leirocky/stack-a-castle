# How the code works

Everything runs in the browser. `index.html` holds the markup, `css/style.css` the styles, and `js/game.js` the game. `game.js` is one script wrapped in a function, organized into sections with banner comments (`/* ---------- name ---------- */`).

## The world

- The island is a grid of cells, `x` and `z` from `−half` to `half − 1`, `y` from 0 to 31. Ground level is `y = 0`.
- **Island size.** Every castle starts on a 300 × 300 island (`START_HALF = 150`). **⋯ → Bigger island** adds 50 squares on every side (`GROW`), up to 1000 × 1000 (`MAX_HALF = 500`); Undo shrinks it again, but never past a block. `setIsland(h)` changes the edges used for building and tapping, how far the camera can zoom out, and keeps characters on the island. The island mesh is built at 100 × 100 and scaled (`sizeIsland`), easing smoothly to the new size; the grass texture is shifted as it grows so each grass square stays lined up with the grid. The size is saved with the castle; `islandFor()` works out the island a castle needs (its saved size, at least the starting size, and room for every block).
- When zoomed far out, the camera's near limit moves out with it, so distant surfaces don't flicker.
- Placed blocks live in a `Map` called `world`, keyed `"x,y,z"`. Each record holds the piece type (`t`), rotation (`r`), its `x, y, z`, and how it is drawn (see **Drawing blocks**).
- Tapping casts a ray from the camera and walks it square by square through the grid (a "voxel walk", `pickCell`) until it reaches a filled square or the grass. Hitting the side of a block places a new block against that face; hitting the grass places it on the ground. The whole square counts as the block, so odd shapes like flags and roofs are easy to tap. The walk takes the same time whether the castle has 10 blocks or 10,000.
- Characters are tapped with an ordinary raycast against an invisible box on each one. Whichever is nearer, character or block, wins.
- A tap is a press and release that moved less than 5 px (mouse) or 10 px (touch). Anything longer is treated as spinning the camera.

## Drawing blocks

Drawing one mesh per block got slow on tablets once a castle had a few hundred blocks, so blocks are drawn in batches.

- **Batches.** Each part of a piece (a tree's trunk, its two leaf clumps) is one `InstancedMesh` that holds every block of that kind. A batch is built from `makePiece(id, 0)` the first time that piece appears. Adding a block writes its position and turn into the next free slot; removing one moves the last block into the gap. A 2,000-block castle with 20 characters went from about 4,400 draw calls per frame to about 200.
- Batches have `frustumCulled = false`. Three.js r128 would otherwise decide whether to draw the whole batch from the first block's position alone.
- **Solo pieces** (`SOLO`: torch, candles, fireplace) have flickering flames, so each is its own object, animated through the `flickers` set. Lamps and lanterns are batched; only their glow sprites are separate.
- Glow sprites are switched off in daylight (`M.glow.visible`), so they cost nothing by day.
- **Popping in.** A newly placed block is shown as its own object (`rec.temp`) while it grows, then joins its batch. Castles over 1,200 blocks appear at once instead of popping.
- **Resting pieces** (`RESTS`: candles, flowers, rug) are drawn lower when the piece under them is shorter than a block (heights in `TOP`), so candles stand on a table instead of floating above it. They move when the piece under them is added or removed.

### See-through blocks (glass and ice)

All glass and ice blocks are built into one mesh (`buildClear`), using one texture that holds both looks. A face is left out when the block next to it is the same kind (so a glass wall has no inner walls) or a solid block from `FULL` (so the two faces don't flicker against each other). Whenever the camera moves, the faces are sorted from far to near (`sortClear`) and drawn in that order. This fixes the old glitches where stacked glass or ice hid or flickered over each other from some angles. The mesh is rebuilt when a glass or ice block, or a block next to one, changes.

### Keeping it smooth

The loop watches frame times. If frames take longer than 1/40 of a second for two 2-second stretches in a row, the drawing resolution drops by a quarter step, down to one pixel per screen point. It never goes back up during a visit.

## Pieces

`PIECES` lists every piece with its id, name, tray color and tab (`castle`, `nature`, `build`, `furniture`, `characters`). `makePiece(id, rot)` builds the 3D object. Textures are drawn on `<canvas>` by the functions in the **procedural textures** section and shared between blocks. Tray icons are rendered once at startup with a second, temporary WebGL renderer.

Pieces with a front turn to face the player when placed. `FACE4` pieces (stairs and most furniture) turn four ways, so their front points at the camera; `FACE2` pieces (gate, fence, door) line up across the view. The turn is saved as the rotation `r` (0–3).

To add a block:

1. Add an entry to `PIECES` and a `case` in `makePiece` (front facing +z), plus any new texture or material.
2. If it turns to face the player, add it to `FACE4` or `FACE2`.
3. If it is shorter than a block and characters or small items should sit on it, add its top height to `TOP`.
4. If it flickers, add it to `SOLO`. If it is a solid, full-size cube, add it to `FULL`.
5. Decide whether characters can stand on it (`NOSTAND`) or walk through it (`PASS`).
6. If its icon looks off, add a camera tweak to `ICON_VIEW`.

### Furniture

Twelve pieces in the **Furniture** tab: table, chair, bed, bookshelf, fireplace, candles, throne, chest, rug, flowers, bench and barrel. All are original designs built from simple shapes, and each fits in one square. Tables placed side by side join into one long table. Candles and the fireplace glow at night.

### Landmarks

The **Landmarks** tab holds famous places (`LANDMARKS`): the Great Pyramid, Eiffel Tower, Big Ben, Statue of Liberty, Leaning Tower of Pisa, Colosseum, Stonehenge, Great Wall and Moai. Each is a recipe (`build(s)`) that lists ordinary blocks around its own center, front facing +z, using small helpers (`put`, `box`, `square`, and `outline` for round or oval floor plans).

- Landmarks are not pieces and are never saved as such. Once placed, a landmark is just blocks, so kids can change it and old copies of the save format still apply.
- The tray is built from `TILES`: all of `PIECES`, then one tile per landmark. Icons for landmarks are drawn from their blocks (`previewBlocks`).
- Placing (`placeLandmark`): the landmark turns so its front faces the camera (`facing4`, `turnXZ`, and `turnRot` for pieces inside it that turn). It is placed only if its whole box fits on the island (`landmarkSpot`); squares that already have a block are skipped. Blocks pop in from the bottom up.
- On a computer the build cursor becomes an outline of the landmark's box, red if it doesn't fit.
- Three blocks were added for landmarks: `iron` (see-through girders with shadows, like leaves), `clock` (glows at night, like windows) and the `teal` paint.

To add a landmark: add an entry to `LANDMARKS` with an `id` that isn't a piece id, a short `name` for the tile, `called` and `where` for messages, and a `build(s)` recipe. Keep it under the height limit (32) and roughly 30 × 30.

## Characters

Characters (`chars`) are separate from blocks and are not part of the grid map. Each one stores a cell, a home cell, and a small state machine:

- **Idle:** wait a random time, then pick a neighboring cell. Steps can go up one block or down one or two. The character is pulled back toward home if it wanders more than 9 cells away.
- **Walking:** move to the chosen cell over a set time, with a bounce and a turn toward the direction of travel.
- A cell is walkable if it's empty, or is a gate, door or rug, and it stands on the ground or a solid block. Water, lava, roofs, flags, torches, trees, fences, lanterns and doors don't count as solid ground, and nor do tables, chairs, benches, thrones, candles, flowers and rugs. Characters can climb onto beds, chests, barrels, bookshelves and fireplaces, and stand at the piece's real height (`TOP`).
- Each character is built from many small shapes. Shapes that share a material are merged into one mesh, once per kind, so a character costs a handful of draw calls instead of about 15.
- If a block is placed where a character stands, or the block under it is removed, it moves to the nearest standing spot in that column.
- The dragon ignores the grid and circles 7 cells around its home, 7 cells up.

## Undo

Every change pushes an entry onto `undoStack`: `add`, `remove`, `addChar`, `removeChar`, `many` (a landmark: the list of blocks it added), or `bulk` (sample castle, clear, open file). A `bulk` entry stores the whole previous castle.

## Saving

After every change, `changed()` runs. It:

1. Writes the castle to `localStorage` (keys starting with `stack-a-castle:`).
2. Asks the online save, if one is active, to write in about a second.

### Online saving (Firebase)

- Settings are in `js/firebase-config.js`. If that file is missing or the Firebase scripts can't load, the sign-in item is hidden and the game saves on the device only.
- Sign-in is Google only, through a popup, with a full-page redirect if the popup is blocked. Firebase keeps the player signed in between visits.
- Each player's castle is one Firestore document, `castles/{uid}`, in the save format below. The security rules allow a signed-in player to read and write only their own document.
- The game listens to that document, so a change made on one device appears on the others within a second or two. Its own writes are recognized by a per-tab id (`writer`) and ignored.
- Saves are batched: about one second after the last change. A failed save is retried once. Errors that retrying won't fix (refused by rules, database missing) turn online saving off for that visit and show a message.

When the online save first answers, the game compares it with the castle on screen:

| Situation | What happens |
|---|---|
| No online castle yet | This device's castle is uploaded. |
| Same castle | Nothing to do. |
| Different, and the player **just tapped Sign in** while this device has its own edits | A dialog asks which castle to keep. Picking the account's castle is undoable. |
| Different, on a returning visit | Whichever was changed more recently wins (device edit time vs. `savedAt`). |

Anything built during the second or two of connecting is replayed on top of whichever castle is kept.

**Offline.** When the browser reports that it is offline, the game shows a short message, and while signed in the save status reads "Offline". Firebase holds the waiting save; when the connection comes back the game says so, the save goes through, and the status returns to "Saved online".

**Saves from a newer version.** If the online castle, or an opened file, uses pieces or characters this copy of the game doesn't know, it was saved by a newer version. The game leaves the castle on screen alone and asks the player to reload. For an online save it also stops saving online for that visit, so it can't overwrite the newer castle. (Version 1.0 doesn't have this check; see the known issues in PROGRESS.md.)

## Save format (version 4)

Used for online saves and for **Save to a file**:

```json
{
  "v": 4,
  "island": 300,
  "pieces": ["stone", "brick", "...", "needs-newer-game"],
  "cells": [0, 0, 5, 3, 0,   1, 0, 5, 0, 0,   0, 0, 0, 56, 0],
  "charKinds": ["knight", "queen", "sheep", "chicken", "cat", "dragon"],
  "chars": [0, 0, 0, 3],
  "night": false,
  "savedAt": 1795718960000
}
```

- `cells` is a flat list of 5 numbers per block: `x, y, z, piece index into pieces, rotation`.
- `chars` is a flat list of 4 numbers per character: `kind index into charKinds, x, y, z`. For the dragon, the cell is its home.
- Pieces are saved by name through the `pieces` list, so reordering or adding pieces never breaks old saves.
- Files without `chars` (version 2) load fine; the device keeps its own characters.
- Versions 1.1 and 1.2 added furniture and three blocks (iron, clock, teal) without changing the format: new pieces just add names to `pieces`. Landmarks are saved as their blocks.

**What changed in version 4** (game v1.3):

- `island` is the island's width in squares (300 to 1000). On the device it is kept in `stack-a-castle:island`.
- The last entry in `pieces` is always the made-up name `needs-newer-game`, and the last 5 numbers in `cells` use it. This is a guard for older copies of the game: versions 1.1 and 1.2 don't know that name, so they show "Update needed" and stop saving online instead of loading the castle and later overwriting it with a smaller one. The game skips that entry when it loads.
- Version 3 saves (no `island`) still load: they get the 300 × 300 starting island, with the castle in the middle where it was.
- A save with `v` above 4, or an island bigger than this copy allows, counts as being from a newer version.
