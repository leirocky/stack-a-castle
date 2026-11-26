# Project progress

_Last updated: 26 Nov 2026_

## Where things stand

The game is complete and playable, and it's now hosted on GitHub Pages. Saving works on the device and through file backups. **Next up is online saving with Google sign-in**, which is waiting on a Firebase project (see [FIREBASE_SETUP.md](FIREBASE_SETUP.md)).

## Done

| Date | What changed |
|---|---|
| 23 Nov 2026 | First version: 3D builder with orbit camera, tap-to-place and erase, 13 castle pieces, sample castle, undo, day/night, sound, browser saving. Built as a Claude artifact. |
| 23 Nov 2026 | Island enlarged from 24 × 24 to 40 × 40, then 60 × 60. |
| 23 Nov 2026 | Saving to the player's Claude account (artifact version only). 22 new blocks in **Nature** and **Build** tabs. Island enlarged to 100 × 100; shadows follow the camera so they stay sharp. |
| 26 Nov 2026 | **Bug fix:** the game ignored taps for up to 10 seconds while connecting to the online save, so building seemed broken. Building now always works; anything built while connecting is kept. |
| 26 Nov 2026 | Six characters added in a **Characters** tab, with walking, tapping, sounds and saving. |
| 26 Nov 2026 | Moved to this GitHub repo and GitHub Pages. Split into `index.html`, `css/style.css` and `js/game.js`. Added **Save to a file** and **Open a saved file**. |

## Next up

1. **Online saving with Google sign-in (Firebase).**
   - Owner: create the Firebase project and send the web-app config ([steps](FIREBASE_SETUP.md)).
   - Then: add an optional "Sign in to save online" button. The game stays playable without signing in. On first sign-in, the castle on that device is uploaded. After that, the castle loads on any signed-in device and changes sync live.
2. After that, retire the Claude-account saving code in `js/game.js`, which is inactive on GitHub Pages.

## Ideas for later

- More characters (horse, dog, ghost for night mode), and characters that follow paths.
- A "dragon attack" challenge that knocks down weak walls.
- Resources and costs (collect stone and gold to build), turning it into a light strategy game.
- Screenshot button.
- Multiple saved castles to switch between.
- Building together with someone else in real time.

## Known issues and limits

- **Browser saves live in one browser on one device.** Clearing site data deletes them. Use **Save to a file** for backups until online saving is ready.
- **Performance:** older phones may slow down with several hundred blocks plus many characters, because each block is drawn separately. Possible fix: draw identical blocks as one batch (instancing).
- **Glass and ice:** see-through blocks stacked together can show sorting glitches from some angles.
- **Characters** walk in four directions, step up at most one block, and drop at most two. Characters placed on a very tall build stay up there. The dragon only flies in circles.
- **Older saves** (from before characters existed) load with a starter set of characters.
- **Two copies exist:** this repo is the source of truth. The Claude artifact version is an earlier copy that saves to a Claude account; changes here are not copied there automatically.

## Decisions

| Decision | Why |
|---|---|
| Plain HTML/CSS/JS, no build step | Easy to read and edit; GitHub Pages serves it as-is. |
| Three.js **r128**, pinned | One of the last versions that ships `OrbitControls` as a plain script (`examples/js`), so no bundler is needed. |
| All art drawn in code | No asset files to manage, nothing licensed, small download. |
| Original characters only | Designs are our own, so there are no copyright problems with characters from other games. |
| **Firebase** for online saving | Free at this size, has Google sign-in built in, needs no server, and per-user security rules keep each castle private. Supabase would also work. Saving into the GitHub repo was ruled out because it would need a GitHub key in the browser. |
| Sign-in is optional | A child can play right away; a parent signs in on devices that should sync. |
