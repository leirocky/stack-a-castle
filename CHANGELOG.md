# Changelog

All notable changes, newest first. Planned work is in [docs/ROADMAP.md](docs/ROADMAP.md).

## v1.3.0 — 27 Nov 2026

A much bigger island.

- Every island now starts at **300 × 300** squares (it was 100 × 100). Existing castles move onto the bigger island automatically, right where they were.
- **⋯ → Bigger island** makes it grow by 50 squares on every side, up to **1000 × 1000**. The grass spreads out smoothly, and Undo makes it smaller again.
- The rock under the island gets deeper and the clouds bigger as the island grows, and zooming far out no longer makes the grass flicker.
- If a landmark doesn't fit near the edge, the message suggests making the island bigger.
- Save format version 4 stores the island size. Older saves still load. Older copies of the game (1.1 and 1.2) left open in a tab say "Update needed" instead of overwriting a bigger island.

## v1.2.0 — 26 Nov 2026

Landmarks.

**New: Landmarks**
- A new **Landmarks** tab with 9 famous places from around the world: the Great Pyramid, the Eiffel Tower, Big Ben, the Statue of Liberty, the Leaning Tower of Pisa, the Colosseum, Stonehenge, the Great Wall and the Moai.
- Pick one and tap the grass: the whole landmark pops up out of ordinary blocks, turned to face you, with a little fanfare. A short message says where it is in the world.
- On a computer, an outline shows the space it will fill (red if there isn't room).
- Landmarks are made of normal blocks, so kids can change or erase any part. One Undo takes the whole landmark away.
- Some have surprises: the pyramid has a doorway and treasure inside, and characters can walk into the Colosseum through its arches.

**New blocks** (Build tab)
- **Iron**: see-through iron girders (the Eiffel Tower is made of them).
- **Clock**: a clock face that glows at night (on Big Ben).
- **Teal**: a green-blue color (the Statue of Liberty).

## v1.1.0 — 26 Nov 2026

"Smooth and solid", plus furniture.

**New: Furniture**
- A new **Furniture** tab with 12 pieces: table, chair, bed, bookshelf, fireplace, candles, throne, chest, rug, flowers, bench and barrel. All are original designs.
- Furniture turns to face you when placed. Tables side by side make one long table.
- Candles, flowers and rugs sit down onto tables, beds, chests, benches and slabs instead of floating above them.
- Candles and the fireplace flicker, and glow at night.
- Characters walk around furniture, walk over rugs, and can hop up onto beds, chests and barrels.

**Faster**
- Blocks are drawn in batches. A 2,000-block castle with 20 characters needs about 200 draw calls per frame instead of about 4,400.
- Characters are drawn with fewer pieces each.
- Tapping finds the block with a quick walk through the grid, so it stays instant in big castles.
- If a device can't keep up, the game lowers its drawing resolution a little to stay smooth.

**Fixes**
- Stacked glass and ice no longer flicker or hide each other: shared inside faces are left out and the rest are drawn from far to near.
- Glass next to a solid block no longer flickers where they touch.

**Easier to use**
- A **How to play** card on the first visit, also in the ⋯ menu.
- **Save a picture** in the ⋯ menu saves a picture of your castle (on phones and tablets it opens the share sheet, with "Save image").
- A message when the device goes offline, and when it's back. While signed in, the save status shows "Offline" and saving resumes by itself.
- If an online save or file was made by a newer version of the game, the game asks you to reload instead of overwriting it.
- On narrow screens the tab row fades at the edge to show there are more tabs. The ⋯ menu scrolls on short screens.

## v1.0.0 — 26 Nov 2026

The first release.

**Building**
- 3D floating island, 100 × 100 squares, blocks up to 32 high
- Spin, zoom and pan with touch or mouse; tap or click to place, Erase mode or right-click to remove
- 35 blocks in three tabs: Castle (10), Nature (11), Build (14)
- Gates, doors, fences and stairs turn to face you when placed
- Sample castle, undo, auto-spin, sound effects
- Day and night: windows, lamps, lanterns, torches and lava glow at night

**Characters**
- Six original characters: knight, queen, sheep, chicken, cat, dragon
- They wander, walk through gates and doors, climb one block at a time and avoid water and lava; the dragon circles overhead
- Tap one to make it jump and make its sound; up to 40 per island

**Saving**
- Every change saved in the browser
- Save to a file and open a saved file
- Optional Google sign-in (Firebase) to save online and sync across devices, with a choice of which castle to keep when the account and the device differ

**Project**
- Hosted on GitHub Pages; no build step
- Docs: README, progress, architecture, Firebase setup, roadmap
