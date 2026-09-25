# Phase 5 pars (IC-B physics fixes), 2026-09-25

The physics changes are bug 1 (a free wall end is met as a round cap from any distance along the wall's line), bug 2 (`Unstick` pushes a ball out of a bar along the nearest side's normal) and N3 (a timed bar's push never carries the ball across an untimed wall). Only the physics changed: `data/holes.txt` is byte-identical.

## How the pars were checked

- **Holes checked:** the 29 whose fingerprint moved, and nothing else.
- **Solver:** the native solver (`vsolve`), synced to the fixed physics. On all 74 holes it reproduces the gno fingerprints bit for bit.
- **Run:** calm, a 30 s budget per hole, one process (`GOMAXPROCS=1 nice -n 20`).
- **Old plans:** every stored plan in `scripts/hole-bests.json` (as of daa81b4) was also replayed under the old and the new physics.
- **Old best:** from `hole-bests.json`. A calm run under the old physics of hole13, island12 and island2 finds the same counts as the new one. Their lower old bests came from the earlier all-weather runs, so the fixes do not touch them.
- **New best and robust:** the calm solver's fewest strokes, and the stroke count of its robust plan.

| slot | hole | moved by | par | old best | old robust | new best | new robust | robust plan (calm) |
|---|---|---|---|---|---|---|---|---|
| garden/1 | hole1 | bug 1 | 3 | 2 | 2 | 2 | 2 | `18,7.25 ; 278,8.75` |
| garden/12 | hole13 | bug 1 | 3 | 1 | 2 | 2 | 2 | `332,10 ; 0,3.25` |
| garden/13 | hole14 | bug 1 | 4 | 3 | 3 | 3 | 3 | `6,10 ; 316,10 ; 4,6` |
| garden/16 | hole18 | bug 1 | 3 | 2 | 2 | 2 | 2 | `16,10 ; 40,7.75` |
| garden/17 | hole19 | bug 1 | 5 | 4 | 4 | 4 | 4 | `192,10 ; 314,9.75 ; 134,8.25 ; 248,6.75` |
| garden/4 | hole4 | bug 2 | 2 | 1 | 1 | 1 | 1 | `0,7.5,3` |
| island/1 | island1 | bug 1 | 2 | 1 | 1 | 1 | 1 | `12,9.25` |
| island/11 | island11 | bug 1 and bug 2 | 2 | 1 | 1 | 1 | 1 | `348,9.5,2` |
| island/12 | island12 | bug 1 | 3 | 1 | 2 | 2 | 2 | `348,8.25 ; 2,4` |
| island/14 | island14 | bug 1 | 3 | 2 | 2 | 2 | 2 | `170,7.25 ; 6,3.5` |
| island/18 | island18 | bug 1 | 3 | 2 | 2 | 2 | 2 | `336,9 ; 110,6.5` |
| island/2 | island2 | bug 1 | 4 | 2 | 3 | 3 | 3 | `352,9.5 ; 130,9.75 ; 8,3.75` |
| island/3 | island3 | bug 1 | 2 | 1 | 1 | 1 | 1 | `18,9.5` |
| mountain/10 | mountain10 | bug 1 | 3 | 2 | 2 | 2 | 2 | `333,4,6 ; 357,8.5,1` |
| mountain/11 | mountain11 | bug 1 | 3 | 2 | 2 | 2 | 2 | `28,10 ; 250,8.25` |
| mountain/14 | mountain14 | bug 1 | 2 | 1 | 1 | 1 | 1 | `26,8.75` |
| mountain/16 | mountain16 | bug 1 | 3 | 2 | 2 | 2 | 2 | `4,5.75 ; 0,2.25` |
| mountain/18 | mountain18 | bug 1 | 4 | 3 | 3 | 3 | 3 | `262,9.75 ; 36,10 ; 250,8` |
| mountain/5 | mountain5 | bug 1 | 2 | 1 | 1 | 1 | 1 | `0,8.5` |
| mountain/7 | mountain7 | bug 1 | 2 | 1 | 1 | 1 | 1 | `8,7.75` |
| mountain/8 | mountain8 | bug 2 | 3 | 2 | 2 | 2 | 2 | `18,10,8 ; 0,5` |
| mountain/9 | mountain9 | bug 1 | 4 | 3 | 3 | 3 | 3 | `26,8.5 ; 332,9.5 ; 18,4.75` |
| town/1 | town1 | bug 1 | 2 | 1 | 1 | 1 | 1 | `36,9.5` |
| town/10 | town10 | bug 1 | 3 | 2 | 2 | 2 | 2 | `112,7.75 ; 20,6.5` |
| town/12 | town12 | bug 1 | 3 | 2 | 2 | 2 | 2 | `90,10 ; 294,3.5` |
| town/14 | town14 | bug 1 | 3 | 2 | 2 | 2 | 2 | `0,6.25 ; 38,7.5` |
| town/18 | town18 | bug 2 | 4 | 3 | 3 | 3 | 3 | `348,10,2 ; 351,10 ; 30,2` |
| town/4 | town4 | bug 2 | 3 | 2 | 2 | 2 | 2 | `204,10,4 ; 150,4.5` |
| town/8 | town8 | bug 2 | 2 | 1 | 1 | 1 | 1 | `27,9,3` |
## Result

- **Pars:** no par changes. Every moved hole's robust plan still takes par − 1 strokes, the same as before. No hole gained an easier route, and none lost its route.
- **Old plans:** every stored plan still holes under the new physics.
  - One exception: garden/17's fragile `raw` plan (`190,10 ; 344,9 ; 124,10 ; 196,6.25`) no longer holes. Its new raw plan is in `scripts/hole-bests.phase5.json`.
- **`scripts/hole-bests.phase5.json`:** it holds the new plans for the 29 moved holes, plus a period fix for garden/5 (below).
  - Each period is the first period from 5907470 that is calm for the data version's own weather (`<slot>/v1`).
  - Every plan in the file was replayed at its period and holes. garden/5, garden/17 and town/18 were also checked on the local chain.
- **garden/5 is not a physics change.** Its fingerprint and plan are identical under the old and the new physics.
  - Its stored period, 5907474, was calm for the realm hole's weather seed (`gno.land/r/gnogolf/hole5`). The data version seeds its weather with `garden/5/v1`, and at that period it gets weather that stops the plan.
  - At 5907470, which is calm for `garden/5/v1`, both of its plans hole on chain.
  - The other stored periods in `hole-bests.json` were chosen the same way and may have the same problem.
