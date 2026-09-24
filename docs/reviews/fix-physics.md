# Physics and gas fixes (PLAN A1-A10, B1-B2), 2026-09-25

Scope: `p/gnogolf/physics`, `p/gnogolf/course`, and the hole realms named below. The item numbers are PLAN.md's. The finding numbers refer to `deep-physics.md` and `deep-perf-gno.md`. golf (the hub) was not touched.

## The per-hole fingerprint (A10, the test part)

- **Harness.** `gno.land/p/gnogolf/course/fingerprint` (`fingerprint.gno`).
  - `Of(h)` plays 24 angles (every 15°) × powers {3, 6.5, 10} × 2 clock states (stroke 0 at tick 0, stroke 1 at tick 5) from the tee, in calm, rain (`WeatherFor(Rain, h, 7)`) and wind (`WeatherFor(Wind, h, 11)`). That is 432 shots per hole.
  - It hashes every path point (as float bits), the air flags, the cause letters, the bounces and the holed flag. It also hashes the rain and wind zones themselves, which pins the puddle placement.
  - `Check` logs the hash and fails when it differs.
- **Per-hole goldens.** Every hole realm has a `fingerprint_test.gno` with its golden: 74 files, mountain8's included (see the note at the end).
  - A test file can read the hole's unexported `me`, so no getter was added to any realm.
- **Runtime.**
  - The whole suite: `GOMAXPROCS=2 nice -n 20 gno test -p 2 ./gno.land/r/gnogolf/...`, about 2m50s on this machine (the hub's own tests included).
  - Before B1-B2 the same grid took about 7 minutes. Most of the per-package time now goes to importing golf.
  - Only the fingerprints: `gno test -p 2 -run TestFingerprint ./gno.land/r/gnogolf/...`.
  - gno has no working test flags (`testing.Short()` is hard-wired to true), so the suite isn't gated. It's fast enough to run by default.
- **Baseline.** Each state below was measured in a scratch copy of the tree, with golf pinned at HEAD, and diffed against the previous state:
  - `pre` is the tree as the review found it;
  - `b` is B1-B2 applied;
  - then one state per A fix.

## B. Gas: no fingerprint moved

**Proof.**
- `pre` and `b` fingerprints are identical on all 73 holes, on both the 12-angle grid and the final 24-angle grid. mountain8 was left out of those runs while its rework was in progress.
- golf's goldens (HEAD golf, fixed physics) pass.

| Change | Where |
|---|---|
| `Vec2.LenCmp(r)`: an exact length comparison. It skips the square root unless `d²` is within 1e-12 of `r²`, and then asks `math.Sqrt`. Tested against `Len` in `TestLenCmpIsLen`. | `physics/vec2.gno:39` |
| `Segment.Crosses`: `Hit` without computing the normal (no square root). | `physics/shapes.gno:27` |
| B1 `dryLand`: no sqrt anywhere. The cheap exits run first (tee and cup, posts, zones), then the walls. It is a pure conjunction, so the order doesn't change the result. | `course/course.gno:370` |
| B1 `wet`: puddle clash test with `LenCmp`. | `course/course.gno:352` |
| B2 setup: `lines()` is the exact arithmetic of `Normal` and `Toward` twice, with each sqrt taken once (8 per wall down to 3). | `physics/walls.gno:25` |
| B2 per-wall offsets precomputed. `Prepare(f)` stores them as one flat `[]float64` in `Field.prep`, one object to load, and `course.Fit` calls it. `offsets()` checks each entry against its wall's ends and recomputes any that no longer match, including a stroke's extra walls. Tested in `TestPrepareChangesNothing`. | `physics/walls.gno:69`, `:88`, `course/fit.gno:111` |
| B2 broad phase: the move's box against each wall's box (its four offset end points, padded by 1e-6) and each post's box (`C ± (R + Radius + 1e-6)`). | `physics/step.gno:188`, `:252` |
| `Sink`: `LenCmp` for the two speed tests and the rest test. A step whose box lies more than `radius` from the pin is skipped before the sqrt. | `course/course.gno:609`, `:621` |
| Wind cap: squared compare. The two sqrt are taken only when the ball sped up. | `physics/step.gno:368` |
| Hill steepness `|Vec|` measured once per shot, not on every `pull` or `climbing` call. | `physics/step.gno:449-490` |

**Gas, local runner** (`gno test -v`, the gas of each test). The "worst angle" is deep-perf's (town14 0°, island14 315°, hole16 135°). The forecasts use seed 7.

| hole | operation | before | after B | final (after A) |
|---|---|---|---|---|
| town14 | rain forecast | 726.2M | 117.1M | 118.1M |
| town14 | storm forecast | 666.7M | 111.6M | 112.5M |
| town14 | full shot, calm | 163.3M | 20.6M | 20.8M |
| town14 | power 1, calm | 79.6M | 5.4M | 5.6M |
| town14 | full shot, wind | 165.8M | 24.7M | 24.9M |
| island14 | rain forecast | 608.2M | 103.2M | 104.1M |
| island14 | storm forecast | 744.2M | 134.0M | 135.1M |
| island14 | full shot, calm | 147.7M | 21.3M | 21.6M |
| island14 | power 1, calm | 82.4M | 8.8M | 9.1M |
| island14 | full shot, wind | 147.9M | 26.1M | 26.3M |
| hole16 | rain forecast | 50.9M | 9.7M | 9.8M |
| hole16 | storm forecast | 48.1M | 10.3M | 10.4M |
| hole16 | full shot, calm | 48.8M | 16.5M | 16.0M |
| hole16 | power 1, calm | 13.8M | 3.3M | 3.3M |
| hole16 | full shot, wind | 187.2M | 74.0M | 61.2M (A7 changed its slope) |

- **Local vs on-chain.** Local gas pays no store reads. On-chain, a shot also loads the prepared slice (one object per hole), so expect the on-chain figures a little higher than the savings shown here.
- **Deploy.** `Field` gained an unexported field, so physics, course and every hole redeploy together.

## A. Correctness: replays changed on purpose

| # | Change | Where | Fingerprints moved (24-angle grid) | deep-physics.md said |
|---|---|---|---|---|
| A1 | Timed hills (the seesaw) are hills while they're there. `isAir` no longer means "timed". `pull` and `climbing` take the tick, and roll-on past the stroke is for untimed hills only (f2b). The hole20 doc now says a slow ball rocks on the plank and stops where it is. | `physics/step.gno:446`, `:469`, `:482` (calls at `:138`, `:170`, `:284`, `:314`); `hole20/hole20.gno:3-6` | hole20 | hole20. The rests match f2b: p4 16.52, p5 19.70. |
| A2 | The surface resets to grass at every move (f1), so calm plays like fog. | `physics/step.gno:166` | hole3, hole5, hole6, hole11, hole13, mountain1, mountain7, mountain14, mountain17, town12 | the same, plus island1. My grid misses island1 but catches mountain17 through its wind shots. |
| A3 | island7's tube mouth is 2.0 deep (x 11.4 to 13.4). The `MaxMove` comment was fixed. | `island7/island7.gno:41`, `physics/step.gno:78` | island7 | island7 |
| A4 | A free wall end is a round cap. Past an end, a ball that isn't touching the end yet is swept against `Circle{end, Radius}` instead of skipped (f4). | `physics/step.gno:217-240` | mountain18 | mountain12 and mountain18. My grid misses mountain12, which A7 moves anyway. |
| A5 | A ball at rest in a timed Hazard or Tunnel meets it at any tick: it is on again within its period. The rest resolution also honours a hazard it already found. | `physics/step.gno:329-347` | island15, mountain15 | island15, mountain15 |
| A6 | Timed bars (four timed walls with one timing that close, as from `Timed(Bar(…))`) push the ball out through their nearest side on the substep they come back, and on substep 0 whenever they stand. `Unstick` moved from course to physics, unchanged; `course.PreviewWith` calls `physics.Unstick`. The rule: a wall never stands on the ball. | `physics/step.gno:142-151`, `physics/walls.gno:114` (`timedBars`), `:143` (`Unstick`) | hole4, island11, town4, town8, town18 | town4, town8, town18, island11 (expected, not measured). hole4's sails are timed bars too. |
| A7 | Slopes at or under Drag, hole side: see the next table. | the holes | hole16, mountain11, mountain12 | the same holes |
| A8 | `Fit` clips non-Round, non-Poly zone rectangles to the board. | `course/fit.gno:88` | mountain11 in the hash only | none. With the zone part of the hash left out, mountain11's shots are identical (checked). What moved is the wet-ice zone the rain copies, whose box is now clipped. Mountains get snow, not rain, so nothing on chain changes. |
| A9 | `Zone.Air` and `Zone.Capped` replace the skin tests. The weather wind is `Air` + `Capped` (`course/course.gno:297`); mountain10's gust is `Air`. `Push`, `LoopOver`, `closedLoop` and the open-loop fly-off were removed: every Loop is a closed tube now, so no `Closed` field is needed and nothing reads a skin. The stale comments about lively bumpers were fixed. | `physics/field.gno:163`, `physics/step.gno:368`, `:419`, `:446`, `mountain10/mountain10.gno:38` | none | none |
| A9 ±360° | Fixed by the hub agent in `golf.gno` `validShot`, which is not my file. | | | |

**A7 per hole.** The threshold for a stopped ball to really roll is `(Drag/s + 0.02) / keep`: about 0.152 on grass at friction 0.86-0.87, 0.132 on ice at 1.1.

| hole | slope | behaviour | fix |
|---|---|---|---|
| island18 | banks at 0.12 (the tee and the pin sit on them) | a stopped ball stays | doc: the bank steers only a rolling ball (`island18.gno:1-4`, `:29-30`) |
| island5 | beach at 0.08 | stops | the doc already says "gently enough for a ball to stop"; unchanged |
| mountain15 | whole board at 0.054 | stops | the comment no longer claims a short ball rolls back (`mountain15.gno:40-41`) |
| mountain11 | bank at 0.12 on ice | held a stopped ball | raised to 0.16 (`mountain11.gno:36`) |
| mountain11 | braking stretch at 0.07 (the cup sits on it) | stops | doc: a soft ball stops short (`mountain11.gno:1-7`, `:38-39`) |
| hole16 | downhill at 0.15 (the creep band) | crept 0.15 a substep | raised to 0.17 (`hole16.gno:28-30`) |
| mountain12 | saddle at ±0.14 (the creep band) | crept back | raised to ±0.17 (`mountain12.gno:34-37`) |

Not done: the physics-side `holds()` threshold from deep-physics finding 7. With the holes fixed, no slope sits in the creep band any more except mountain11 and mountain14's 0.16 downhills, which do accelerate.

**Regression tests.** In `physics_test.gno`:
- `TestATimedHillPullsWhileItIsThere`, `TestCalmPlaysLikeFog`, `TestAFreeWallEndCannotBeCut`, `TestABallAtRestUnderATimedHazardMeetsIt` and `TestATimedBarArrivingOnTheBallPushesItOut` each fail on the pre-A code.
- `TestLoopWantsTheRightSpeedAndTheMouth` now expects a fast ball to go round.
- `TestLenCmpIsLen` and `TestPrepareChangesNothing` cover B.

In `fit_test.gno`, `TestFitPutsTheWallsInsideTheBoard` also checks the band clipping.

Docs updated: `docs/physics.md` (the substep list, bounces, slopes and air, loops, constants, skins, zone width, sqrt) and `docs/course.md` (`Unstick` moved, the wind's `Air`/`Capped`).

## Goldens (golf `zz_golden_test.gno`)

Only fixture **timed**, column 1 (SimulateRoundAt), moves, and only from A6 on. Forecast and State, and the other five fixtures, are unchanged at every step.
- **Why.** Stroke 3 of `goldShots` comes to rest at x=20.009, inside the fixture's tram bar (x 19.75 to 20.25).
- **Before.** Stroke 4 jittered inside the bar: 5 bounces, not moving.
- **Now.** The bar pushes the ball out and it rolls to (22.97, 5.79).

The hub agent recomputes the hash against its new JSON.

## Holes to re-verify (pars)

24 holes: the union of the measured fingerprint changes and the review's measured lists.

- hole3, hole4, hole5, hole6, hole11, hole13, hole16, hole20
- island1, island7, island11, island15
- mountain1, mountain7, mountain11, mountain12, mountain14, mountain15, mountain17, mountain18
- town4, town8, town12, town18

## Notes

- **mountain8** is being reworked by another agent. Its golden (`357d7be6965f6255`) is its state at the end of this pass. Re-record it when the rework lands: run its test, paste the logged hash.
- **Client.** island7's tube mouth centre moved 0.5 to the left, and `zones.js` draws the castle tube from the zone centre. hub `zonesJSON` doesn't carry `Air`/`Capped`, and the client still reads skins for wind. Adding an `air` field to the JSON is the hub's call.
- **Scratch.** The scratch tests used here (gas, peek) are deleted. The scratch trees live in the session scratchpad only.
