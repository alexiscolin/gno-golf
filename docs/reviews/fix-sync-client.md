# Client fixes for gno2-sync.md, plus perf and the gnokey save

Scope: `web/` only. `gno.land/` was not touched, and nothing was committed. The chain-side items are listed at the end, for the redesign.

## How it was measured

- **Chain.** gnomcp only, on profile `gnogolf` (`test-gnogolf`, :26757): `gno_eval`, `gno_call simulate=true` and `gno_run simulate=true`. Nothing was broadcast.
- **Isolation.** The client was measured from two exported copies, each on its own `next dev`, so that other agents' edits in `web/` did not skew the numbers:
  - *before*: `git archive HEAD web`, on :3301;
  - *after*: an rsync of the working tree, on :3302.
- **Sessions.** `scratchpad/session2.mjs` is the review's `session.mjs` with two changes:
  - each stroke is let go through `__g.demo()`, a player-like pull that ends on the exact shot;
  - "release → replay" is timed from the frame where the elastic goes away to the first replay step.

  The flow is the same as the review's: title, Garden Cup, hole1, three aimed strokes (keyboard sway and mouse pull, then the pull), holed, "Save on-chain" with Adena stubbed.
- **Browser.** One headless Chrome at a time (`media/lib/cdp.mjs`: nice -n 20, muted, killed by PID). None of mine was left running. The other `gnogolf-cdp` Chromes seen during the run belonged to another agent's `check.mjs`.
- **Profiles.** `scratchpad/perf.mjs` records a CDP CPU profile (100 µs) and heap sampling while aiming (a 4.2 s mouse pull, one move per ~16 ms), during one replay and for 3 s idle.

## Fixes

| # | Where | What |
|---|---|---|
| 1 | `lib/engine/aim.js:281` (`known`), `lib/engine.js:918` | The release reuses the preview's answer when the key matches exactly: hole, period, round so far, and the shot string with its tick. Otherwise it asks again. The preview's "close enough, don't ask" guard used to leave the resting aim unasked, so the release almost never matched. Now, once the hand rests (120 ms) on an aim not yet asked, it is asked once (`aim.js:176`). |
| 2 | `lib/adena.js:156` `commitsOf`, `:198` `splitRound`; `lib/engine.js:170` | The split is the chain's own `work` model: the same constants and the same `next()` rule (spent + the heaviest so far > 1.4e9, checked before every shot but the first), and 12 at most per list. The snapshot now carries the model's inputs: `pieces` = walls + posts + zones + the forecast's zones. The old `+8` for timed holes was dropped, because newWork counts the Field, not the stroke extras. `kind` is the forecast's. So no later commit can be refused once an earlier one has landed. The first commit is pre-checked with SimulateRoundAt before Adena opens; if the chain's cut disagrees, its "commit the first N" wins. Self-check: `demoSplit()` (`:321`), which passes. |
| 3 | `lib/engine.js:573` `stale`, `:893`, `:591` | Before stroke 1, if the loaded period is over on the chain's clock, `freshWeather()` is awaited, so the round starts in the current weather. A 5 s timer also refreshes the HUD when a hole is left untouched past its period. Concurrent refreshes are deduped. |
| 4 | `lib/chain.js:106-164`; `components/Golf.jsx:124`, `:136`, `:568` | `chain.now()` is the device clock plus the skew to `latest_block_time`, re-read at most once a minute through `/status` (`sync()`, called when a hole is won). SaveClock and the pre-sign check use it, and the deadline is `(period+2)·300 s − 15 s`. The weather HUD's "for N min" is corrected by the same skew. |
| 5 | `lib/engine.js:150-152`; `components/Golf.jsx:654`, `:1280`, `:749`, `:1381`, popstate | A community or archived hole has `place: 0`. The address bar, the share link and Back/Forward then use `?hole=<id>`, and the HUD reads "Community hole · not ranked" or "Archived hole · not in the cup". It never says "Hole 1 of 18", and the number badge shows "–". |
| 6 | `lib/adena.js:179-189`, `:318` | The gas is 30M (the call and the Reset) + the forecast (rain 100M, storm 150M, otherwise 0) + the work model. It is calibrated below. `costOf` now shows gas × price; the ×1.5 margin for a rising price stays in the Adena ask and in the funds check. |
| 7 | `components/Golf.jsx:1815`, `:1833` | HoleLeaderboard paging uses the chain's offsets (`next = offset + PAGE`), and it is done at `offset + PAGE ≥ players`. A page with a deleted name no longer ends the board early. |
| 8 | `lib/scene/weather.js:328-337`, `:389-398`; `lib/engine.js:559` | The wind (flag, HUD, foliage) is the forecast's own `wind` when non-zero. The storm's timed `wind` zones are streaked like a hole's gusts, and whichever gust is on at the tick is drawn, so the alternating second gust now shows. |
| 9 | `lib/engine.js:31` | `MAX_SHOTS = 60`, the chain's `maxRoundStrokes`. A save of more than 12 goes in several commits (fix 2). Previews for stroke 2+ use SimulateFrom, which has no list cap. |
| 10 | `components/Worlds.jsx:128`, `:223`; `components/Golf.jsx:1551`; `lib/chain.js:228` | Community holes are listed 24 at a time with "Show more (N left)". Beyond the top ten, the win card's rank is counted from the paged `Players` read (5 × 100 at most), with a tooltip "among every player who saved, named or not". Past that cap it says "not in the top 10", and it shows "–" when nothing is saved. |
| 11 | `lib/chain.js:106` `memo`, `gasPrice`, `storagePrice`, `chainId`; `lib/engine.js:654`, `:408` `prefetch` | Chain id (60 s), gas price and storage price (10 min) are cached per session, and a failure is not cached. `Period()` is asked only when the loaded period is over, never right after State. When a hole is holed, the next hole in the cup is prefetched (State + world chunk), and "Next hole" uses it if it is under 60 s old. |
| 12a | `lib/chain.js:179` | `Holes()` is kept in `sessionStorage` for 10 min, so a reload or a Retry doesn't pay 163M of query gas. A link to an id the kept list lacks re-reads it (`engine.js:1040`). |
| 12b | `lib/terrain.js:25`, `lib/scene/cause.js:27` | The future `air` / `capped` zone fields are preferred when present, with a fallback to today's skin inference. A capped air zone names no gust. |
| 12c | `lib/adena.js:233` | A pro round with no period throws instead of sending `"0"` (sync #20). |
| 12d | `lib/chain.js:294` | `pullShot` maps its angle to [0, 360), so 359.996° is sent as `0.0000`, as the chain records it (§2, angle normalisation). |
| 12e | `lib/chain.js` | The stale "block time / 900" comment now says 300 (sync #19). |

### Fix 6: gas calibration (gno_call / gno_run simulate=true)

| hole (weather, period 5967686) | shots, path points | client ask (new) | measured, Reset 8.6M + PlayRoundAt | ask / used |
|---|---|---|---|---|
| hole2 (clear): 22 walls, 26 pieces | 3; 13 / 15 / 14 | 136.7M | 65.4 + 8.6 = 74.0M | 1.85× |
| hole16 (wind): 6 walls, 10 pieces | 3; 11 / 18 / 16 | 123.5M | 77.9 + 8.6 = 86.5M | 1.43× |
| hole1 (rain): 40 walls, 45 pieces | 3; 17 / 16 / 15 | 268.0M | 178.4 + 8.6 = 187.0M | 1.43× |
| hole1, the session's route (period 5967690) | 3, holed | 153.0M | 90.6 + 8.6 = 99.2M | 1.54× |

What the measurements say about the model:
- The work model alone is 1.2–1.6× the shots' gas.
- Rain adds about 90M of forecast. hole1 1 shot is 137M, against 36M on clear hole2.
- The old 170M flat constant asked 292–293M for every 3-shot hole1 save, and showed 0.440 GNOT against about 0.1 GNOT used.

The new ask for that route is 153M, shown as 0.153 GNOT.

## Before / after sessions (hole1, 3 strokes, holed)

**RPC and bytes.** The stub never finds the round, so it polls `Round` 8 times; these counts use the real case of 1. Query gas is the review's per-read costs × counts (Holes 163M, State 43M, SimulateRoundAt 40M, SimulateFrom 36M, the 3-shot save check 90M, Round 36M, Bests 3M, Leaderboard 2M, Players 1.2M, measured).

| | Assisted before | Assisted after | Pro before | Pro after |
|---|---|---|---|---|
| RPCs | 52 | 51 | 21 | 18 |
| bytes (wire) | 58.5 KB | 60.2 KB (4.2 KB of it the next hole's State) | 34.2 KB | 34.1 KB |
| `/status`, gasprice, storage_price | 3 + 2 + 2 | 1 + 1 + 1 | 3 + 2 + 2 | 1 + 1 + 1 |
| `Period()` | 1 (right after State) | 0 | 1 | 0 |
| SimulateRoundAt + SimulateFrom | 12 + 23 | 13 + 24 | 2 + 2 | 2 + 2 |
| RPCs at release (3 strokes) | 3 | **0** | 3 | 3 (pro asks nothing before) |
| release → replay start | 17 / 17 / 17 ms (1 RTT) | **≤ 1 frame, 0 RTT** | 33 / 17 / 33 ms | 19 / 17 / 17 ms |
| State prefetch (next hole) | 0 | 1 (Next hole then asks nothing) | 0 | 1 |
| query gas, estimated | ≈ 1.61 G | ≈ 1.73 G (≈ 1.69 G without the prefetch) | ≈ 0.45 G | ≈ 0.50 G (≈ 0.45 G without it) |
| save ask (gasWanted) | 293.0M | **153.0M** | 293.0M | **153.0M** (143.9M on another route) |
| fee shown | 0.440 GNOT | 0.153 GNOT | 0.440 GNOT | 0.153 GNOT |

What the table shows:
- **The release is free now.** An assisted release costs no RPC: 0 RTT instead of 1, which is 150–400 ms on a remote node. The price is about +2 previews a session, because the resting aim is now asked once. Net, the assisted session makes the same number of simulate reads, plus the next hole's State, which "Next hole" would have read anyway.
- **Params are read once.** Chain id, gas price and storage price are read once, not on every holing (−4 RPCs a hole, as the review counted).
- **Holes() is not re-read on reload.** It comes from sessionStorage for the tab, which saves 163M a reload. Not visible here: each run is a fresh profile.

## Perf pass (aiming, replay, idle)

hole1 in rain, dev build, headless Chrome with Metal. JS is the profile's total non-idle time in the window.

| | before | after |
|---|---|---|
| aim (4.2 s pull): JS | 296–323 ms | 184–194 ms |
| aim: worst frame gap | **100 ms** (a stall on the first creak) | 16.8 ms |
| aim: `audio()` self time | 84–90 ms | 0 (the context is made in idle time) |
| aim: page (`Golf`) renders | 10 | 6 |
| aim: frame JS p50 / p95 / max | 0.4 / 0.6 / 1.1 ms | 0.4 / 0.6 / 1.1 ms |
| input: event → listener p50 / p95 | 3.1 / 4.3 ms | 3.2 / 4.3 ms |
| replay: JS | 87 ms | 73–87 ms |
| replay: `updateProjectionMatrix` | 5.0 ms (two rebuilds a frame) | gone from the profile |
| replay: frame gap p95 / max | 16.8 / 16.8–33.3 ms | 16.7 / 16.8 ms |
| idle, 3 s: JS | 25–33 ms | 24–28 ms |

What was fixed:
- **`lib/feel.js:57-79`: the first-pull stall.** Creating the AudioContext costs about 87 ms, once (a micro-benchmark gave 86.9 ms, then 0.1 ms for a second one). The first creak of the first pull paid it in mid-drag. It is now made in `requestIdleCallback`, suspended, and the first gesture resumes it as before. The sounds' own `resume()` calls on a suspended context are deduped. The gesture and focus handlers still call `resume()` directly.
- **`components/Golf.jsx:387`: re-renders.** The snapshot is compared before `setS`, not in a `setS` updater. An updater that returns the same state still re-rendered the whole page.
- **`lib/engine/camera.js:432-448`: the projection matrix.** It is rebuilt only when aspect, fov, near, far or the view offset moved, and once: `setViewOffset` and `clearViewOffset` rebuild it themselves, and the explicit call made that two a frame. A camera at rest rebuilds nothing. All the fields are compared against the camera itself, so a lens changed elsewhere (`applyRig`, promo) is caught.
- **`lib/engine.js:705`: the canvas rect.** It is cached per resize, not read twice per pointer move. A read after the power bar's DOM changed forced a layout in the input path.

What was not changed:
- **Replay stepping and allocations.** The camera's per-frame scratch objects were already reused, and the remaining heap sampling is `?camlog`'s own log.
- **Replay smoothness.** Replay frames were already at vsync (p95 16.7 ms), and the frame JS medians are 0.4–0.6 ms.
- **What's left.** It is three.js's own draw work and React dev-mode rendering (`jsxDEV`), which production builds strip.

## The gnokey fallback (`components/Gnokey.jsx`, `lib/adena.js:274` `gnokeyPlan`)

It sits in the win card, next to the Save button (`Golf.jsx:1000`), in a native `<details>` "Use gnokey instead". It is collapsed by default and keyboard reachable (summary tabIndex 0). It uses the shared `Button`, and it shows with or without Adena.

What it shows:
- **One `gnokey maketx run` per commit**, so each commit stays one atomic transaction, as Adena's is. Each is a script file (`gnogolf-save.gno`, or `-1`/`-2`… when split), which Resets (first commit only) and then calls PlayRoundAt, PlayRoundPro or PlayRound with the exact hole id, the `;`-joined shot string and the period.
- **The split** is `commitsOf`, the same as Adena's.
- **The flags:**
  - `-gas-wanted` is `gasOf` + 20M for the script package (an empty run is about 19M);
  - `-gas-fee` is the same `feeFor`;
  - `-broadcast`, `-chainid` and `-remote` come from the page's chain;
  - `<your-key-name>` is a placeholder. No key or address appears anywhere.
- **Copy** puts a shell snippet on the clipboard: `cat > file <<'EOF' … EOF` and the command, for each part.
- **The note:** "Run this with your own gnokey key; the chain replays your shots exactly as recorded."

**Checked.** The script the page generated for the session's pro round was run through `gno_run simulate=true` with the agent key, unchanged. It answered "holed in 3 strokes" and used 108.9M against the 163.9M asked. The round lands on the signer's own address: a `Round(hole, signer)` read in the same script returned it.

## Verification

- **`npm run lint`:** clean.
- **`pulltest.mjs`** (town1, on the after copy): classic and third person, mouse and touch, all pass, with 8/8 directions in third person.
- **`camsuite.mjs`** (all 14 holes, on the after copy, with `OUT` in the scratchpad so the repo's media files were not overwritten): 12/14 on the first run.
  - hole7 failed once (32 lens frames, no mode switches) and passed on the rerun.
  - island7 fails on HEAD too, with 1–3 lens frames on 3 runs on HEAD and 1–2 on 2 runs after. It is pre-existing (a canopy piece, id 112, in the lens) and is not caused by these changes.
- **Chrome:** only one of my Chromes at a time, and none left running.

## Left for the chain redesign (not edited)

- **`render.gno:43` `playLink`:** emit `?hole=<id>` when `!official || next != ""`. The client already resolves it.
- **`render.gno:48`:** `playURL` is hard-wired to the netlify prod.
- **`state.gno:366-379`:** `"air"` and `"capped"` in the zone JSON. The client prefers them already (fix 12b).
- **`state.gno:56-66`:** a State without the 24 rounds and `plays`, since the client reads neither; or a `Hole(hole)` read.
- **`Holes()`, 163M a read:** `strconv` in place of `ufmt`, and a maintained order. The client now caches it per tab.
- **`HoleLeaderboard`:** return a `next` offset, so a client needs no arithmetic.
- **A `Rank(mode, addr)` read:** the client's rank beyond ten is a bounded `Players` scan, and it counts unnamed players too.
- **`course.gno:334` `wet`:** rain and storm forecasts cost 90–150M a read (this report's measurements: the fee model carries a +100M / +150M forecast term).
- **`SimulateRound*`:** the 12-shot list cap also caps a round preview from the tee. The client previews stroke 2+ with SimulateFrom, and the save pre-checks only the first commit with SimulateRoundAt. A later commit continues the round and no read replays from a mid-round state *with* its work check, so its check is the exact client-side work sum. A `SimulateCommit(hole, rest, stroke, shots, period)` would let every commit be pre-checked on chain.
- **The tick cap:** the chain clamps the tick to 0..1023, and the client's lcm is capped at 1024. A hole whose lcm is over 1024 would play pieces off-phase. No hole has one today.
- **Par clamps** (`course.gno:67` vs `golf.gno:251`) and the Poly 256-point cap (`state.gno:397`).
- **Product, not done:** unlocks and the grand slam are local only; a connected player's could be cross-checked against `Bests`.
