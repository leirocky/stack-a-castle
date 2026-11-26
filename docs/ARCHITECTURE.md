# How the code works

Everything runs in the browser. `index.html` holds the markup, `css/style.css` the styles, and `js/game.js` the game. `game.js` is one script wrapped in a function, organized into sections with banner comments (`/* ---------- name ---------- */`).

## The world

- The island is a grid of cells, `x` and `z` from −50 to 49, `y` from 0 to 31. Ground level is `y = 0`.
- Placed blocks live in a `Map` called `world`, keyed `"x,y,z"`, with the piece type (`t`) and rotation (`r`).
- Each block is drawn with its own mesh. An invisible 1 × 1 × 1 box for each block (`hitGroup`) is used for tap detection, so odd shapes like flags and roofs are still easy to tap.
- Tapping casts a ray from the camera. Hitting the side of a block places a new block against that face; hitting the grass places it on the ground.
- A tap is a press and release that moved less than 5 px (mouse) or 10 px (touch). Anything longer is treated as spinning the camera.

## Pieces

`PIECES` lists every piece with its id, name, tray color and tab (`castle`, `nature`, `build`, `characters`). `makePiece(id, rot)` builds the 3D object. Textures are drawn on `<canvas>` by the functions in the **procedural textures** section and shared between blocks. Tray icons are rendered once at startup with a second, temporary WebGL renderer.

To add a block: add an entry to `PIECES`, a `case` in `makePiece`, and any new texture or material.

## Characters

Characters (`chars`) are separate from blocks and are not part of the grid map. Each one stores a cell, a home cell, and a small state machine:

- **Idle:** wait a random time, then pick a neighboring cell. Steps can go up one block or down one or two. The character is pulled back toward home if it wanders more than 9 cells away.
- **Walking:** move to the chosen cell over a set time, with a bounce and a turn toward the direction of travel.
- A cell is walkable if it's empty, or is a gate or door, and it stands on the ground or a solid block. Water, lava, roofs, flags, torches, trees, fences, lanterns and doors don't count as solid ground.
- If a block is placed where a character stands, or the block under it is removed, it moves to the nearest standing spot in that column.
- The dragon ignores the grid and circles 7 cells around its home, 7 cells up.

## Undo

Every change pushes an entry onto `undoStack`: `add`, `remove`, `addChar`, `removeChar`, or `bulk` (sample castle, clear, open file). A `bulk` entry stores the whole previous castle.

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

## Save format (version 3)

Used for online saves and for **Save to a file**:

```json
{
  "v": 3,
  "pieces": ["stone", "brick", "..."],
  "cells": [0, 0, 5, 3, 0,   1, 0, 5, 0, 0],
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
