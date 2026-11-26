# Roadmap

_Current version: **v1.1.0** (26 Nov 2026). Last updated: 26 Nov 2026._

This lists planned milestones in order. Each one has a goal, what's in it, and how we'll know it's done. Sizes are rough: **S** is an evening, **M** a few sessions, **L** a week or more of sessions. Plans can change; when they do, update this file and [PROGRESS.md](PROGRESS.md).

| Version | Theme | Status |
|---|---|---|
| [v1.0](#v10--the-castle-builder-released) | The castle builder | ✅ Released 26 Nov 2026 |
| [v1.1](#v11--smooth-and-solid) | Smooth and solid (plus furniture) | ✅ Built 26 Nov 2026 · two checks on real devices left |
| [v1.2](#v12--a-livelier-island) | A livelier island | 🔜 Next |
| [v1.3](#v13--many-castles) | Many castles | Planned |
| [v2.0](#v20--quests-and-challenges) | Quests and challenges | Planned |
| [v3.0](#v30--build-together) | Build together | Idea |

---

## v1.0 — The castle builder (released)

Everything in the first release. Details are in [CHANGELOG.md](../CHANGELOG.md).

- 3D island (100 × 100, up to 32 high), spin / zoom / pan on phones and computers
- 35 blocks in Castle, Nature and Build tabs; 6 original characters that walk around
- Day and night, sounds, undo
- Saving: in the browser, to a file, and online with Google sign-in (Firebase)
- Hosted on GitHub Pages, with docs

## v1.1 — Smooth and solid

**Goal:** the game feels fast and reliable on every family device, including older tablets, and a new player can figure it out alone.

| Item | Size |
|---|---|
| ✅ Confirm online saving end to end: real Google sign-in saves online (confirmed 26 Nov 2026). Remaining: edit on two devices at once to watch live sync | S |
| ✅ Faster drawing for big castles: identical blocks drawn in one batch (instancing). A 2,000-block castle with 20 characters dropped from about 4,400 to about 200 draw calls per frame | M |
| ✅ Fix see-through glitches when glass or ice blocks are stacked | S |
| ✅ "How to play" card on first visit (spin, zoom, build, erase), reopenable from the ⋯ menu | S |
| ✅ Screenshot button that saves a picture of the castle (⋯ → **Save a picture**) | S |
| ✅ Show a short message when the device is offline, and confirm saves resume when it's back | S |
| ✅ Added on request: a **Furniture** tab with 12 pieces (table, chair, bed, bookshelf, fireplace, candles, throne, chest, rug, flowers, bench, barrel) | M |

**Done when:** a 2,000-block castle with 20 characters runs smoothly on the oldest tablet in the house, and online saves work across two devices. _Both still need a check on real devices (see [PROGRESS.md](PROGRESS.md))._

## v1.2 — A livelier island

**Goal:** more to build and more going on around the castle.

| Item | Size |
|---|---|
| New characters, all original designs: horse, dog, owl, and a friendly ghost that only appears at night | M |
| Smarter characters: follow paths, sit on benches, chairs and thrones, sleep in beds at night, gather around torches and fireplaces; the dragon lands on towers | M |
| New pieces: arch, bridge, ladder, well, banner (in colors), flower bed (the bench arrived early, in v1.1's Furniture tab) | M |
| Automatic day–night cycle (optional), with a sunrise and sunset | S |
| Weather: rain and snow you can turn on | S |

**Done when:** the new pieces and characters are in their tabs, characters visibly use paths and benches, and weather and the cycle can be switched on and off.

## v1.3 — Many castles

**Goal:** keep several castles and pick which one to play.

| Item | Size |
|---|---|
| Castle slots: create, name, switch and delete castles (each saved online and on the device) | M |
| A "My castles" screen with a small picture of each | M |
| Starter templates besides the sample castle (village, tower, island fort) | S |
| Save format v4: one document per castle; older saves move over automatically | S |

**Done when:** a signed-in player can keep at least five named castles that appear on every device, and v3 saves still load.

## v2.0 — Quests and challenges

**Goal:** an optional game mode with goals, alongside free building.

| Item | Size |
|---|---|
| Quests with clear goals, for example "build a tower 10 blocks tall", "give the queen a garden", "light up the castle at night" | M |
| Resources (optional mode): collect stone, wood and gold around the island and spend them to build | L |
| Dragon challenge: a friendly dragon tests the walls, and weak spots wobble or fall; rebuild to win | L |
| Badges for finished quests, shown on a badge board | S |
| Free-build mode stays exactly as it is today | — |

**Done when:** at least 10 quests can be completed, badges save online, and free-build mode is unchanged.

## v3.0 — Build together

**Goal:** share castles and build with family on different devices.

| Item | Size |
|---|---|
| Share a castle with a link that opens a view-only copy | M |
| Invite someone to build together in real time, with their character visible | L |
| Family gallery of castles (only people you invite can see it) | M |
| Updated Firestore rules for shared castles, plus a review of who can see what | M |

**Done when:** two people on different devices can build the same castle at the same time without losing each other's work.

---

## Releasing a version

1. Make the changes and test them (see [ARCHITECTURE.md](ARCHITECTURE.md)).
2. Set the new version number in `index.html`: the `?v=` on the three CSS and JS links, and the version line at the bottom of the menu.
3. Add an entry to [CHANGELOG.md](../CHANGELOG.md), and update [PROGRESS.md](PROGRESS.md) and this file.
4. Commit and push to `main`.
5. Create the release on GitHub: **Releases → Draft a new release → Choose a tag**, type the new tag (for example `v1.1.0`), pick **Create new tag on publish**, target `main`, use the version as the title, paste the changelog entry, and click **Publish release**. (From a terminal, `git tag -a v1.1.0 -m "v1.1.0" && git push origin v1.1.0` creates the tag too.)

Version numbers: the **last** number goes up for fixes (1.0.0 → 1.0.1), the **middle** one for new features (1.0 → 1.1), and the **first** one for big changes to how the game is played (1.x → 2.0).
