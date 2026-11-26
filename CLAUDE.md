# Stack-a-Castle — notes for Claude

A 3D castle builder played in the browser by a family with young kids. Live at https://leirocky.github.io/stack-a-castle/ (GitHub Pages, deployed from `main`, root folder).

## Start here

- `docs/PROGRESS.md`: where things stand and what's next. Read it first.
- `docs/ROADMAP.md`: milestones. Current version is v1.1.0 ("Smooth and solid", plus furniture); work is toward **v1.2 "A livelier island"**.
- `docs/ARCHITECTURE.md`: how `js/game.js` is organized, how saving works, and the save format.

## Ground rules

- **No build step.** Plain HTML, CSS and JS. Three.js **r128** (UMD build plus `examples/js` OrbitControls) and Firebase **10.12 compat** come from CDNs. Ask before adding a bundler, framework or npm dependency to the site.
- **All art and sound are made in code.** There are no image or audio assets. New pieces and characters must be **original designs**: never copy characters, textures or names from other games or media.
- **Kid-friendly:** plain, friendly wording; no ads, analytics or tracking.
- **The game must stay playable without signing in.** Online saving is optional.
- **Never break old saves.** The save format is versioned (`v: 3`). If it changes, raise `v`, keep loading older versions, and document it in `docs/ARCHITECTURE.md`.
- **Firebase:** `js/firebase-config.js` holds public values by design. Security comes from the Firestore rules in `docs/FIREBASE_SETUP.md`; don't loosen them. Each player's castle is `castles/{uid}`.
- `main` is the live site. Prefer a branch and a pull request for anything beyond a small fix.

## Run and check

- `python3 -m http.server 8000`, then open http://localhost:8000.
- There are no automated tests yet. Check by hand in a browser at desktop and phone width (about 390 px): place and erase, each tab, characters, undo, reload (the castle should still be there), save to a file and open it, the How to play card, Save a picture, glass and ice stacks, and the browser console for errors.
- Google sign-in works only on the live site (its domain is the one allowed in Firebase).

## When shipping a change

1. Raise the `?v=` number on the three CSS/JS links in `index.html` and the version line at the bottom of the menu (browsers cache these files for 10 minutes).
2. Update `docs/PROGRESS.md`. When a roadmap item lands, also tick it off in `docs/ROADMAP.md` and add it to `CHANGELOG.md`.
3. Write docs for human readers: plain language, short sentences, what changed and why.
