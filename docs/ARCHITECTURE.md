# How the code works

Everything runs in the browser. `index.html` holds the markup, `css/style.css` the styles, and `js/game.js` the game. `game.js` is one script wrapped in a function, organized into sections with banner comments (`/* ---------- name ---------- */`).

## The world

- The island is a grid of cells, `x` and `z` from `−half` to `half − 1`, `y` from −3 to 31. Blocks stand on the grass at `y = 0`.
- **Under the grass** (`y` from −1 to −3, `DEPTH`) is solid ground, except squares that have been dug out with the **Dig** tool. Those are kept in the `dug` set and can hold blocks, water and characters like any other square. `isEarth()` says whether a square is solid ground; `canHold()` whether a block can go there.
- **Island size.** Every castle starts on a 300 × 300 island (`START_HALF = 150`). **⋯ → Bigger island** adds 50 squares on every side (`GROW`), up to 1000 × 1000 (`MAX_HALF = 500`); Undo shrinks it again, but never past a block. `setIsland(h)` changes the edges used for building and tapping, how far the camera can zoom out, and keeps characters on the island. The island mesh is built at 100 × 100 and scaled (`sizeIsland`), easing smoothly to the new size; the grass texture is shifted as it grows so each grass square stays lined up with the grid. The size is saved with the castle; `islandFor()` works out the island a castle needs (its saved size, at least the starting size, and room for every block).
- When zoomed far out, the camera's near limit moves out with it, so distant surfaces don't flicker.
- Placed blocks live in a `Map` called `world`, keyed `"x,y,z"`. Each record holds the piece type (`t`), rotation (`r`), its `x, y, z`, and how it is drawn (see **Drawing blocks**).
- Tapping casts a ray from the camera and walks it square by square through the grid (a "voxel walk", `pickCell`) until it reaches a filled square or the grass. Hitting the side of a block places a new block against that face; hitting the grass places it on the ground. The whole square counts as the block, so odd shapes like flags and roofs are easy to tap. The walk takes the same time whether the castle has 10 blocks or 10,000.
- Characters are tapped with an ordinary raycast against an invisible box on each one. Whichever is nearer, character or block, wins.
- A tap is a press and release that moved less than 5 px (mouse) or 10 px (touch). Anything longer is treated as spinning the camera.

### Digging holes

- **Dig** is the first tile in the Nature tab (`TILES` entry with `tool: true`; its icon is drawn on a canvas). Tapping the grass digs that square; tapping inside a hole digs it deeper (the first solid square straight down); at the bottom (3 deep) it digs sideways instead. Each dig is an undo step (`dig`), and Undo fills it back in.
- Tapping finds the ground the same way it finds blocks: the voxel walk treats solid ground squares as hits and returns them as `dig`.
- **Drawing:** the grass on top of the island skips every square whose top layer is dug out. It reads a mask texture (`holeTex`, one pixel per square of the biggest island) in a small addition to the grass shader (`onBeforeCompile`). Inside the holes, `buildPits()` builds one mesh of dirt walls, floors and ceilings facing into the dug squares. A layer of plain dirt under the island (`under`) makes room for holes 3 deep.
- Characters can walk into holes, fall into one dug under them, and stand on its floor. They can't climb more than one square, so a deep hole can trap them.

## Drawing blocks

Drawing one mesh per block got slow on tablets once a castle had a few hundred blocks, so blocks are drawn in batches.

- **Batches.** Each part of a piece (a tree's trunk, its two leaf clumps) is one `InstancedMesh` that holds every block of that kind. A batch is built from `makePiece(id, 0)` the first time that piece appears. Adding a block writes its position and turn into the next free slot; removing one moves the last block into the gap. A 2,000-block castle with 20 characters went from about 4,400 draw calls per frame to about 200.
- Batches have `frustumCulled = false`. Three.js r128 would otherwise decide whether to draw the whole batch from the first block's position alone.
- **Solo pieces** (`SOLO`: torch, candles, fireplace, door) are each their own object. Torches, candles and fireplaces have flickering flames, animated through the `flickers` set; a door swings open (see **Doors**). Lamps and lanterns are batched; only their glow sprites are separate.
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

Thirteen pieces in the **Furniture** tab: table, chair, bed, bookshelf, fireplace, candles, throne, chest, rug, flowers, bench, barrel and well. All are original designs built from simple shapes, and each fits in one square. Tables placed side by side join into one long table. Candles and the fireplace glow at night.

### More pieces (v1.3.4)

- **Arch** (Castle): a stone block with an arched opening. Characters walk through it (`PASS`).
- **Banners** (Castle): red, blue, gold and green cloths with a little castle on them (`bannerCanvas`), hanging from a rod at the back of the square, so placed in front of a wall they hang on it. The cloth casts a banner-shaped shadow (`customDepthMaterial`).
- **Flower bed** (Nature): a low planter full of flowers.
- **Bridge** (Build): a deck at the bottom of the square with railings on both sides. Characters walk on it, even with nothing under it (`HOLDS`).
- **Ladder** (Build): hangs on the back of its square like a banner. Characters climb straight up and down a column of ladders, and step off at the top (`moves()`).
- **Well** (Furniture): a stone ring with water, a wooden frame, a little roof and a bucket.

New pieces go at the end of their tab, so the number keys for older pieces stay the same.

### Doors

A door's panel and knob hang in a hinge group at one side (`userData.hinge`). Tapping a door in any mode except Erase calls `setDoor()` instead of building against it; the hinge eases to about 100 degrees open (`DOOR_OPEN`) in a third of a second (`stepDoors()`, run each frame while a door is moving). A character stepping into a closed door opens it (`stepTo()`); doors opened that way (`autoDoors`) close again once the doorway has been empty for 1.2 seconds. Whether a door is open is kept on the block (`rec.open`, `rec.swing`) only for the view: it isn't saved and isn't an undo step. Characters could always walk through doors (`PASS`).

### Landmarks

The **Landmarks** tab holds famous places (`LANDMARKS`): the Great Pyramid, Eiffel Tower, Big Ben, Statue of Liberty, Leaning Tower of Pisa, Colosseum, Stonehenge, Great Wall and Moai. Each is a recipe (`build(s)`) that lists ordinary blocks around its own center, front facing +z, using small helpers (`put`, `box`, `square`, and `outline` for round or oval floor plans).

- Landmarks are not pieces and are never saved as such. Once placed, a landmark is just blocks, so kids can change it and old copies of the save format still apply.
- The tray is built from `TILES`: all of `PIECES`, then one tile per landmark. Icons for landmarks are drawn from their blocks (`previewBlocks`).
- Placing (`placeLandmark`): the landmark turns so its front faces the camera (`facing4`, `turnXZ`, and `turnRot` for pieces inside it that turn). It is placed only if its whole box fits on the island (`landmarkSpot`); squares that already have a block are skipped. Blocks pop in from the bottom up.
- On a computer the build cursor becomes an outline of the landmark's box, red if it doesn't fit.
- Three blocks were added for landmarks: `iron` (see-through girders with shadows, like leaves), `clock` (glows at night, like windows) and the `teal` paint.

To add a landmark: add an entry to `LANDMARKS` with an `id` that isn't a piece id, a short `name` for the tile, `called` and `where` for messages, and a `build(s)` recipe. Keep it under the height limit (32) and roughly 30 × 30.

### Nature

When **Nature** is on (⋯ menu, saved in `stack-a-castle:nature`), some blocks act on their own after a player changes something next to them:

| Block | What it does | Wait |
|---|---|---|
| Water | Falls into an empty square below; otherwise spreads into empty squares beside it, up to 3 squares from where it started | 0.2 s |
| Lava | The same, but only 1 square; turns into cobblestone if it touches water | 0.75 s |
| Ice | Melts into water if something hot (lava, torch, fireplace, candles, lamp, lantern) is next to it, diagonals included | 1.1 s |
| Snow | Melts into a little water the same way | 1.1 s |
| Sand | Falls while the square below is empty | 0.07 s |

How it works (the **nature** section):

- Nothing happens on its own, and opening a castle never changes it. A player's action calls `natureAfter()`, which "wakes" the blocks in the 3 × 3 × 3 cube around each changed square. A woken block runs its rule after its wait; anything the rule changes wakes the blocks around it, so water keeps running until it settles.
- Each change made by nature (`natureSet`) is stored on the undo entry of the action that started it (`effects`), up to 600 per action. Undo puts those back, newest first, then undoes the action (`undoNature`). Pending wake-ups for an undone action are dropped.
- For water and lava, the rotation number holds the **flow step**: 0 for a placed block, 1–3 as it spreads (lava: 1), plus 4 while it is falling. The step limits how far it spreads. Water spreads on solid ground and on still water (so a hole dug beside a moat fills), but a falling stream doesn't spread, and neither does anything on top of one.
- Flowing water and lava are drawn shallower the farther they have spread (`FLOW_DEPTH`); water with more water above it fills its whole square, so a waterfall looks like one stream.
- Changes are saved like any other change, at most about once every 0.7 seconds while nature is busy.

### The sample castle

`sampleWorld()` builds the castle a new player starts with (and **⋯ → Build sample castle**): a moat dug two squares deep and filled with water (so it has banks and stays put when nature is on), a bridge level with the grass, a cobblestone path set into the ground, a gatehouse with an open gateway, curtain walls (31 × 31), four round towers with turrets, and a 19 × 13 keep. The keep has three stories, 4 squares each (ground floor y 0–3, wooden floors at y 4 and 8, roof at 12), so Peek shows one story at a time. Inner walls split the lower two stories into three rooms each, with open doorways (`doorway()`: an empty square with a gate arch above). `stairs()` builds a staircase and opens the floor above it, so characters can climb from floor to floor. Banners hang on the keep and the gatehouse, and the courtyard has a fountain, benches, a well and flower beds. It returns its blocks and its dug squares; `sampleChars()` puts the characters in their rooms.

Castles of more than about 2,000 blocks above ground rise out of the ground when built (the block group is stretched up from flat) instead of popping in block by block, which would mean thousands of separate objects for a moment.

### Peek

The eye button (or **P**) cuts away everything above a height so you can look into rooms. All block materials share one clipping plane (`peekPlane`). Off, it sits far above the sky. Each tap lowers it by one floor, 4 squares: from the highest multiple of 4 below the top of the castle, down to 4 (the ground floor), then off.

- The cut sits a hair above the floor line, so the tops of the floor you look at stay whole. While peeking, only upward-facing surfaces cast shadows, so the bottoms of the hidden floor above (on the same line) don't shade the room.
- The voxel walk treats hidden blocks as air, nothing can be placed above the cut, and characters above it are hidden.
- When Peek starts, the camera glides to look down from above (`lookDownInto`), unless it already is.
- It changes only the view; nothing is saved.

## Characters

Characters (`chars`) are separate from blocks and are not part of the grid map. There are ten kinds (`CHAR_IDS`): knight, queen, sheep, chicken, cat, dragon, horse, dog, owl and ghost. Each one stores a cell, a home cell, and what it's doing:

- **Idle:** wait a random time (`CHAR_SPEC`: the horse is slow and calm, the dog quick), then `think()` decides what's next.
- **Walking:** move to the chosen cell over a set time, with a bounce and a turn toward the direction of travel. Steps can go up one block or down one or two (`moves()`), and up or down a column of ladders.
- **Ladders:** a character on a ladder sometimes starts climbing (`c.climbing`); it keeps going to the top, steps off onto the highest square there, or climbs down to the bottom.
- **Wandering** (`wander()`): a random step, preferring path squares (cobblestone, planks, bridges, slabs, stairs and rugs, `PATHY`) and carrying on along a path instead of turning back. A character more than 9 squares from home is pulled back.
- **Trips** (`planTrip()`): a short walk found with a breadth-first search (`findPath()`, at most 2,500 squares searched) to a seat, a bed or something warm. A seat or bed is kept for the character as soon as it sets off (`taken`, `c.claim`), so two characters don't head for the same one. When it arrives (`arrive()`), it sits or lies down. If the way gets blocked or the piece is removed (`tripFailed()`), it lets go and, at night, thinks again.
- **Sitting:** now and then by day, the knight, queen, cat and dog (`SITTERS`) walk to a chair, bench or throne and sit for a while.
- **Night** (`isNight()`, the night amount above 0.6): once each night the same four look for a free bed they can reach and sleep in it, lying down with a floating "Zzz". The others (and those without a bed) gather around the nearest torch, fireplace, lamp, lantern or candles (`WARM`) and stay within 2 squares of it. At sunrise everyone gets up.
- A cell is walkable if it's empty, or is a gate, door, rug, arch, bridge or ladder (`PASS`), and it stands on the ground or a solid block (or is a bridge or ladder itself, `HOLDS`). Water, lava, roofs, flags, banners, torches, trees, fences, lanterns, doors, wells and flower beds don't count as solid ground, and nor do tables, chairs, benches, thrones, candles, flowers and rugs (`NOSTAND`). Characters can climb onto beds, chests, barrels, bookshelves and fireplaces, and stand at the piece's real height (`TOP`).
- Each character is built from many small shapes. Shapes that share a material are merged into one mesh, once per kind, so a character costs a handful of draw calls instead of about 15.
- If a block is placed where a character stands, or the block under it is removed, it moves to the nearest standing spot in that column.
- **Flyers** (`FLYERS`: dragon, owl, ghost) ignore the grid and are saved at their home. The dragon circles 7 cells around its home, 7 cells up; now and then it lands on the highest nearby spot it can stand on (a tower top, `perchFor()`), rests, and takes off again. The owl sits on its home square by day, turning its head, and flies small circles at night. The ghost drifts around its home, through walls, and fades in only after dark (`driftGhost()`).

## Sky: day, night and weather

- **Night amount.** `nightT` goes from 0 (day) to 1 (night). `applyNight()` blends the lights, glowing windows, clouds and water between the `DAY` and `NIGHT` settings; `applySky()` adds the sunrise and sunset glow and the weather on top. The moon button sets `nightTarget`, and `nightT` eases toward it in under a second.
- **Day and night cycle** (⋯ menu, kept in `stack-a-castle:cycle`, off by default). A clock runs through a loop (`DAYLEN`): 150 seconds of day, a 20-second sunset, 90 seconds of night and a 20-second sunrise. `cyclePhase()` turns the clock into the night amount, a glow (0 to 1, highest halfway through sunset and sunrise) and the sun's place in the sky, which moves the sun light from east to west so shadows swing round. The glow tints the light orange and fades in an orange sky layer (`.sky-dusk`). The moon button skips ahead to halfway through the next sunset or sunrise, and the change eases in. Automatic changes aren't saved; the castle only saves day or night when someone presses the button. While the cycle runs, day or night from another device is ignored.
- **Weather** (⋯ menu, kept in `stack-a-castle:weather`: clear, rain or snow). One `THREE.Points` cloud of 2,400 drops or flakes fills a box a little in front of the camera, sized to the zoom. Drops fall, wrap round to the top, and wrap sideways as the camera moves, so the box never runs out. Flakes drift as they fall. Their size on screen is clamped (a small addition to the points shader), so drops right by the camera don't grow huge. Rain and snow dim the light a little and fade in a grey sky layer (`.sky-grey`). With sound on, rain plays a soft noise (filtered white noise, made in code).
- Neither switch changes the castle or the save.

## Undo

Every change pushes an entry onto `undoStack`: `add`, `remove`, `addChar`, `removeChar`, `many` (a landmark: the list of blocks it added), `dig`, `island`, or `bulk` (sample castle, clear, open file). A `bulk` entry stores the whole previous castle, holes included. Each entry also collects what nature did because of it (see **Nature**).

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

## Save format (version 5)

Used for online saves and for **Save to a file**:

```json
{
  "v": 5,
  "island": 300,
  "dug": [14, -1, 0,   14, -2, 0],
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

**What changed in version 5** (game v1.3.1):

- `dug` lists the dug-out squares of ground, 3 numbers each: `x, y, z` (`y` from −1 to −3). On the device it is kept in `stack-a-castle:dug`. Saves without it have no holes.
- Water and lava may have rotation numbers 1–7 (their flow step; see **Nature**). Older copies of the game draw them as ordinary water and lava.
- Blocks can have `y` from −3 (inside holes).
- Version 1.3.0 counts a version 5 save as being from a newer version (it says "Update needed" and stops saving online). Versions 1.1 and 1.2 are stopped by the marker below.

**What changed in version 4** (game v1.3.0):

- `island` is the island's width in squares (300 to 1000). On the device it is kept in `stack-a-castle:island`.
- The last entry in `pieces` is always the made-up name `needs-newer-game`, and the last 5 numbers in `cells` use it. This is a guard for older copies of the game: versions 1.1 and 1.2 don't know that name, so they show "Update needed" and stop saving online instead of loading the castle and later overwriting it with a smaller one. The game skips that entry when it loads.
- Version 3 saves (no `island`) still load: they get the 300 × 300 starting island, with the castle in the middle where it was.
- A save with `v` above 5 (above 4 in game v1.3.0), or an island bigger than this copy allows, counts as being from a newer version.
