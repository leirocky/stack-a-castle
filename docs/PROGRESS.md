# Project progress

_Last updated: 27 Nov 2026 · Current version: **v1.3.0**_

## Where things stand

**v1.3.0 is live** (27 Nov 2026): islands start at 300 × 300 and can grow to 1000 × 1000 from the ⋯ menu. It is the first part of **v1.3, "A bigger, livelier island"**; the rest (new and smarter characters, more pieces, a day–night cycle, weather) comes next as v1.3 updates. **v1.2.0** (Landmarks) and **v1.1.0** ("Smooth and solid", plus furniture) are live too; two checks on real devices are still open (see **Next up**).

v1.0.0 was released on 26 Nov 2026. Saving works on the device, through file backups, and online with Google sign-in (Firebase), confirmed with a real Google sign-in on the live site.

## History (v1.3)

| Date | What changed |
|---|---|
| 27 Nov 2026 | **Bigger island:** starts at 300 × 300 (was 100 × 100) and grows from **⋯ → Bigger island** by 50 squares a side, up to 1000 × 1000; Undo shrinks it. Existing castles move over automatically. The rock and clouds scale with it, and the camera's near limit moves out when zoomed far out (this stopped stripes flickering on the grass). Save format v4 stores the size. |
| 27 Nov 2026 | Tested: an old saved castle opening on the bigger island, building at the new edge, growing to the limit, Undo, reload, save to a file and open it, opening an old file, online saving (simulated Firebase), and the earlier checks. The live **v1.2** game was run against a v4 online save: it showed "Update needed" and did not overwrite it, both when the save was already there and when it arrived live. |

## History (v1.2)

| Date | What changed |
|---|---|
| 26 Nov 2026 | **Landmarks tab:** the Great Pyramid, Eiffel Tower, Big Ben, Statue of Liberty, Leaning Tower of Pisa, Colosseum, Stonehenge, Great Wall and Moai, each built from ordinary blocks. Tap to place (it faces you); an outline shows the space first on a computer; one Undo removes it; a message says where it is in the world. New blocks: Iron, Clock (glows at night) and Teal. |
| 26 Nov 2026 | Tested in a headless browser: every landmark placed and photographed, placing by click, the outline, Undo, reload, the "no room" message near the edge, turning to face the camera, and the earlier checks (glass and ice, furniture, online saving against a simulated Firebase). No console errors. |

## History (v1.1)

| Date | What changed |
|---|---|
| 26 Nov 2026 | **Furniture tab:** table, chair, bed, bookshelf, fireplace, candles, throne, chest, rug, flowers, bench, barrel. They turn to face you; candles, flowers and rugs sit down onto low furniture; candles and the fireplace glow at night; characters walk around furniture, over rugs, and onto beds, chests and barrels. |
| 26 Nov 2026 | **Faster drawing:** blocks drawn in batches (instancing), characters merged into fewer meshes, glow sprites skipped by day. Measured in a test browser with a 2,000-block castle and 21 characters: about 4,400 draw calls per frame before, about 200 after. The sample castle went from about 980 to about 160. Tapping now walks the grid instead of testing one hidden box per block. The game lowers its resolution a little if a device can't keep up. |
| 26 Nov 2026 | **Glass and ice fix:** one merged mesh with hidden inside faces, sorted far to near whenever the camera moves. |
| 26 Nov 2026 | **How to play** card (first visit, and ⋯ menu), **Save a picture** (⋯ menu), and **offline** messages. Saves from a newer game version are no longer loaded or overwritten. |
| 26 Nov 2026 | Tested in a headless browser at desktop and phone width: placing and erasing by click and tap, every tab, undo, the animated sample castle, reload, save and open a file, the picture, offline and back, and online saving against a simulated Firebase (first upload, live update from another device, offline catch-up, newer-version save). No console errors. |

## History (v1.0 development)

| Date | What changed |
|---|---|
| 23 Nov 2026 | First version: 3D builder with orbit camera, tap-to-place and erase, 13 castle pieces, sample castle, undo, day/night, sound, browser saving. Built as a Claude artifact. |
| 23 Nov 2026 | Island enlarged from 24 × 24 to 40 × 40, then 60 × 60. |
| 23 Nov 2026 | Saving to the player's Claude account (artifact version only). 22 new blocks in **Nature** and **Build** tabs. Island enlarged to 100 × 100; shadows follow the camera so they stay sharp. |
| 26 Nov 2026 | **Bug fix:** the game ignored taps for up to 10 seconds while connecting to the online save, so building seemed broken. Building now always works; anything built while connecting is kept. |
| 26 Nov 2026 | Six characters added in a **Characters** tab, with walking, tapping, sounds and saving. |
| 26 Nov 2026 | Moved to this GitHub repo and GitHub Pages. Split into `index.html`, `css/style.css` and `js/game.js`. Added **Save to a file** and **Open a saved file**. |
| 26 Nov 2026 | Firebase project `stack-a-castle` created (Spark plan): Google sign-in, Firestore, rules, and `leirocky.github.io` allowed. |
| 26 Nov 2026 | **Online saving:** optional Google sign-in in the ⋯ menu; castles stored in Firestore and synced live across devices. If the account and the device have different castles at sign-in, the player picks which to keep, and Undo can switch back. The Claude-only save code was removed. Tested with a simulated Firebase: first sign-in, both choices, returning visits, sign-out, and refused saves. |
| 26 Nov 2026 | Version numbers (`?v=`) on the CSS and JS links, so browsers load new code right after a deploy instead of a cached copy. |

## Next up

1. **Reload the game on every family device** (see the first known issue). Publish the GitHub releases for v1.1.0, v1.2.0 and v1.3.0 (this session can't push tags, so they are made on GitHub's Releases page).
2. **Check on the oldest tablet:** open a big castle (about 2,000 blocks, 20 characters) and see that spinning and building feel smooth. This finishes v1.1's "done when".
3. **Check live sync:** sign in on two devices, build on one, and watch the other update.
4. Then the rest of **v1.3, "A bigger, livelier island"**: new characters, smarter characters (sitting on chairs, sleeping in beds), more pieces, a day–night cycle, weather, and nature effects (water flowing into holes, lava cooling into stone, ice and snow melting, sand falling).

The full list, and the milestones after it (v1.4 many castles, v2.0 quests, v3.0 build together), are in [ROADMAP.md](ROADMAP.md).

## Known issues and limits

- **After an update, reload the game on every device.** A copy of v1.0 left open in a tab can't read newer castles, and its next save online could overwrite them. Reloading the page fixes it. (Versions 1.1 and later spot saves from a newer version, say "Update needed" and stop saving instead.)
- **A huge island is mostly empty grass.** Getting around a 1000 × 1000 island takes a lot of panning (two fingers, or the right mouse button). Shadows are only drawn near the middle of the view.
- **Landmarks need open space.** A landmark is only placed if all of it fits on the island; squares that already have a block are skipped, so it builds around what's there. Placing one on a tall building can push it over the height limit.
- **Pieces placed on a rug or slab** sit a full block up, like in other block-building games. Candles, flowers and rugs are the exception: they sit down onto low furniture.
- **Without signing in, saves live in one browser on one device.** Clearing site data deletes them. Sign in, or use **Save to a file**.
- **Two devices editing at once:** the last save wins. Edits made on both devices within the same second or two can overwrite each other.
- **Sign-in popups:** if a browser blocks the Google popup, the game falls back to a full-page redirect. Safari's privacy settings can make that redirect fail; allowing popups for the site fixes it.
- **Performance:** big castles are now drawn in batches. It has not been timed on a real old tablet yet (see **Next up**). Torches, candles and fireplaces are still drawn one by one, so hundreds of them would cost more.
- **Glass and ice:** they no longer glitch with each other. Other see-through things (the build cursor, glow at night) can still overlap them slightly wrongly from some angles.
- **Characters** walk in four directions, step up at most one block, and drop at most two. Characters placed on a very tall build stay up there. The dragon only flies in circles.
- **Older saves** (from before characters existed) load with a starter set of characters.
- **Two copies exist:** this repo is the source of truth. The Claude artifact version is an earlier copy that saves to a Claude account; changes here are not copied there automatically. To move a castle across, use **Save to a file** in one and **Open a saved file** in the other.

## Decisions

| Decision | Why |
|---|---|
| Plain HTML/CSS/JS, no build step | Easy to read and edit; GitHub Pages serves it as-is. |
| Three.js **r128**, pinned | One of the last versions that ships `OrbitControls` as a plain script (`examples/js`), so no bundler is needed. |
| All art drawn in code | No asset files to manage, nothing licensed, small download. |
| Original characters only | Designs are our own, so there are no copyright problems with characters from other games. |
| **Firebase** for online saving | Free at this size, has Google sign-in built in, needs no server, and per-user security rules keep each castle private. Supabase would also work. Saving into the GitHub repo was ruled out because it would need a GitHub key in the browser. |
| Sign-in is optional | A child can play right away; a parent signs in on devices that should sync. |
| Firebase **compat** SDK from Google's CDN | Works with plain `<script>` tags and the existing non-module code. |
| Ask, don't guess, at first sign-in | If the account and the device both have castles that differ, guessing could silently lose one. Later visits sync automatically using timestamps. |
| Batches (instancing) for blocks, not merging them into one big mesh | Placing or erasing a block only updates one slot, so building stays instant even in huge castles. |
| One sorted mesh for glass and ice | Sorting faces is the reliable way to draw see-through blocks in the right order. There are few glass and ice blocks, so re-sorting when the camera moves is cheap. |
| Furniture fits in one square | Keeps the grid, saving and undo simple. A one-square bed is just the right size for the characters. |
| No save-format change for furniture | Pieces are saved by name, so new pieces need no new version. Older saves load as before. |
| Landmarks are built from ordinary blocks | Kids can change any part, Undo works, and saving needs no change. A single big model would look smoother but couldn't be edited. |
| Landmarks of real places, made blocky | Famous buildings are fine to show; they are simple block versions, not copies of anyone's artwork. |
| One island, scaled, instead of tiles of land | The island is a single box however big it is, so a 1000 × 1000 island costs no more to draw than a small one. |
| A marker entry in v4 saves | It's the only way to make the already-released v1.1 and v1.2 games refuse a bigger island instead of overwriting it. |
