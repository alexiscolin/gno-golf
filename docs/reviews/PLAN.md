# Fix plan after the deep review (2026-09-25)

Sources are the review files in this folder: `deep-security`, `deep-code-gno`, `deep-physics`, `deep-perf-gno`, `deep-perf-3d`, `deep-code-js`, `deep-robustness-scale`, `deep-ux`. The IDs below refer to those files.

## 0. Before any deploy (human decisions)

- **Namespace.** Register the name `gnogolf` on the target chain and check that `r/sys/names.IsEnabled()` is true. Until then, anyone can take over the cups (security R1).
- **Frozen values to decide:**
  - `playURL`: the real site address.
  - Hole registration: from `init` (it works; this removes 74 `Register` funcs and the scripts), or keep the scripts.
  - The extras (hole10, hole16): should they count in the course ranking?
  - The upgrade path for `physics/v2`: an adapter, or a new hub (README).

## A. Chain: physics correctness (changes replays; do it all in one pass, then re-verify every par)

1. The seesaw parks the ball: timed hills must pull while they are up (physics 1).
2. Calm vs weather: reset `surface` at every move (physics 2). This changes calm replays on 10 holes.
3. The island7 tube mouth is narrower than one move: widen it to 2.0 (physics 3).
4. A ball passes through a free wall end: use a swept test against a round cap (physics 4).
5. A ball at rest under a timed hazard is checked at a single tick (physics 5).
6. Timed trams and bars appear on a rolling ball and swallow it: push the ball out, or refuse to place a wall on it (physics 6).
7. Slopes at or below Drag: fix the holes whose skin says the ball should roll (island18 banks, island5, mountain11, mountain15, hole16, mountain12). Fix their docs too (physics 7).
8. `Fit` leaves band zones outside the board. Clip them.
9. Skins drive physics: replace them with explicit fields (air, closed tube). Remove the dead code: `Push`, `LoopOver` and the open-loop branch. Also fix the ±360° replay edge.
10. **Test:** add a per-hole shot fingerprint (a golden for each of the 74 holes), then re-verify every hole in every weather and set the final pars.

## B. Chain: gas (no change to replays)

1. Remove the `sqrt` calls from the rain and storm puddles, from 892M down to about 50M (gas 1).
2. Reuse the values computed in Step's setup, and add a bounding-box broad phase: −57% per shot (gas 2 and 3).
3. An integer `jnum`, and no paths in `State`'s round list (gas 5).
4. Cap commits by work done, not by a fixed 12 shots: 24 holes can exceed 1.9e9 today (gas 4).
5. Store the shots, not the path; rebuild the path by replaying. This cuts the storage deposit by about 4x (scale 4).
6. Add `SimulateFrom(hole, ball, shot, stroke, period)`: a preview costs one shot instead of the whole round (scale 1).

## C. Chain: hub API and security

1. Quantize before validating (security Y6). Reject a non-finite `Rest()` (Y2).
2. Keep `totals` rows for official finishes only. Keep sorted indexes, so the top ten and the hole boards are prefix reads (Y3, Y4, scale 5).
3. Show unofficial holes in a separate "Community holes" section, and add an `official` field to `Holes()` (Y5).
4. Make `noAdmin()` state what the namespace holder can do (Y1). Make `named` a plain func (Y8).
5. Fix the 0-holes rows in the top ten. An unknown mode returns an error instead of silently falling back to assisted. Add a `mode` field to the Leaderboard JSON. Make the `players` count consistent.
6. Add paged per-player reads and a `version` field, so a future golf/v2 can migrate the data.
7. Check the weather period on every stroke, not only the first one (scale).

## D. Client: UX and robustness (in `deep-ux` and `deep-robustness-scale`)

- **Blockers:**
  - The `.note` toast bug (win card and Play for real notes vanish).
  - Toasts under reduced motion.
  - The blank screen when the chain is down.
  - Escape and focus in sheets.
- **Copy:** rewrite every overclaim (share texts, Play for real, the Mountain Cup unlock, the hub's no-admin line). "Play for real" becomes "Save on-chain". Add a reload hint after installing Adena.
- **Rounds:**
  - A save-before countdown on each round, with a replay in the current weather.
  - Show the storage deposit next to the fee.
- **Errors:**
  - A timeout shows "course not reachable" and retries.
  - A WebGL error boundary, and a handler for context loss.
  - Remove `?won` and the test hooks from production.
  - An `AbortSignal.timeout` polyfill for iOS 15.
- **Previews:** debounce them, cancel stale ones, cache them, and switch to `SimulateFrom` once it exists.

## E. Client: performance (the perf agent is on it)

Goal: the laptop fan stays silent. The idle frame rate, the fog and lightning recompiles, empty groups, chunked decor, instanced smoke and confetti, build time, a quality tier, React re-renders, and RPC debounce.

## F. Client: code cleanup (after E, following the consolidation order in `deep-code-js`)

Delete the dead loop code (~330 lines) and the other dead exports and CSS. Then:
1. shared geometry into `terrain.js`;
2. `bake.js` to break the import cycles;
3. fades and merges into `materials.js`;
4. split `engine.js` into camera, replay and probe;
5. clean up the CSS overrides;
6. lint `media/` and `scripts/`.

## Order and agents

- **Batch 1** (chain, in parallel on separate packages): one agent for physics and gas (A + B, in `p/gnogolf/*`), one for the hub (C, in `r/gnogolf/golf`). The hub agent waits for A to land before changing the golden hashes.
- **Batch 2:** re-verify every hole (A.10) with the new physics; fingerprints and pars.
- **Batch 3** (client, after the perf agent finishes): one agent for UX and robustness (D), one for cleanup (F). They coordinate on `engine.js`.
- **After each batch:** a commit (author: Alexis Colin, no co-author).
