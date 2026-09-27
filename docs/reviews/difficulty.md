# Difficulty brief (2026-09-24)

The user finds the game too easy. The verification (scratchpad `verify-progress.md`) found a repeatable hole-in-one on about 40 of the 74 holes. Some holes may stay simple, but not all of them.

## What changes

- **Aim preview:** the dots stop at the first contact (bounce or zone), at most about 7 units. The player sees the direction, not the outcome. The setting is `PREVIEW` in the engine.
- **Per cup, 18 holes:**
  - 4 to 5 simple holes, allowed to have a robust hole-in-one: holes 1 and 2, plus two or three breathers spread through the cup.
  - All the others have no repeatable hole-in-one: a robust best of 2 or more.
  - 3 to 4 long holes, par 4 or 5: a long, winding track.
  - 3 to 4 holes that chain obstacles, one after another: a gate, then a slope, then a bridge, and so on.
  - Difficulty rises over the cup, and hole 18 is a memorable finale.
- **Always finishable in the hole's worst weather**, with no fluke-only route.

## Par

- Par = robust best + 1, at least 2. A robust plan is one where at least 40% of the neighbouring shots (±0.5°, ±0.1 power) do as well.
- To check: `scratchpad/vsolve/sync.sh`, then `vsolve/solve -holes <names>`.
- The 19 par cuts the verification proposed were reverted, pending this pass.

## Limits

- The gas of a full round at par + 3 strokes stays under `MAX_GAS` in `web/lib/adena.js`.
- Same rules as ever: nothing overlapping or clipping, decor off the lane, the style of each world.
