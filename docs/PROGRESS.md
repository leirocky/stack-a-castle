# Project progress

_Last updated: 26 Nov 2026 (online saving added)_

## Where things stand

The game is complete, playable and hosted on GitHub Pages. Saving works on the device, through file backups, and online with Google sign-in (Firebase). **Next: a first real sign-in on the live site to confirm the Firebase setup end to end.**

## Done

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

1. **Confirm online saving on the live site.** Sign in on one device, build something, then sign in on a second device and check the castle appears. If sign-in shows an error, the message names the Firebase setting to check.
2. Pick the next feature from the ideas below.

## Ideas for later

- More characters (horse, dog, ghost for night mode), and characters that follow paths.
- A "dragon attack" challenge that knocks down weak walls.
- Resources and costs (collect stone and gold to build), turning it into a light strategy game.
- Screenshot button.
- Multiple saved castles to switch between.
- Building together with someone else in real time.

## Known issues and limits

- **Without signing in, saves live in one browser on one device.** Clearing site data deletes them. Sign in, or use **Save to a file**.
- **Two devices editing at once:** the last save wins. Edits made on both devices within the same second or two can overwrite each other.
- **Sign-in popups:** if a browser blocks the Google popup, the game falls back to a full-page redirect. Safari's privacy settings can make that redirect fail; allowing popups for the site fixes it.
- **Performance:** older phones may slow down with several hundred blocks plus many characters, because each block is drawn separately. Possible fix: draw identical blocks as one batch (instancing).
- **Glass and ice:** see-through blocks stacked together can show sorting glitches from some angles.
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
