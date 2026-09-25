# Deploy v1, Phase 0: measurements (2026-09-25)

What the numbers in `deploy-v1.md` and `deploy-v1-review.md` were checked against, and the decode-cost decision (D6).

## Toolchain

- `gno` built from the pearl tag `chain/pearl` = `c4c72fdd288c757e8da0d93aae867fa479b1b15c` (the tag and the branch head agree), into `~/.cache/gno-toolchains/pearl/gno`, run with `GNOROOT` pinned to its own module-cache source.
- Every `gno test` number below comes from that binary (`gno test -v` prints each test's gas).
- The on-chain numbers come from the local gnodev (`:26757`, `test-gnogolf`), through gnomcp `gno_run` simulations. That node runs the operator's local toolchain, not the pearl tag, so its store costs are close to pearl's but not guaranteed to match.
- The local `gno` on `PATH` (`feat/gnoweb-pkg-overview`) cannot run tests: `pubKeyAddress does not have a body`.

## Codec and prep: compute gas (`gno test`, pearl toolchain)

"First" is the straightforward decoder. "Tuned" has the two D6 changes described below.

| Step | hole4 (30 walls) | mountain7 (48 walls) | town18 (pulses) | island6 (4 walls) |
|---|---|---|---|---|
| GG1 size | 2,237 B | 3,003 B | 2,357 B | 995 B |
| `Decode`, `PrepareWith` included, first | 13.2M | 18.5M | 12.3M | 4.7M |
| `Decode`, `PrepareWith` included, **tuned** | **8.8M** | **11.6M** | **9.0M** | **3.8M** |
| `PrepareWith` alone, first | 5.2M | 8.1M | | |
| `PrepareWith` alone, **tuned** | **3.3M** | **5.0M** | | |
| `Prepare` (3 square roots per wall) | 18.9M | 32.1M | | |
| `Exact` (the check at publish: `Prepare` + a bit compare) | 21.3M | 36.0M | | |
| `Encode` | 34.0M | | | |
| `hex.DecodeString` of the argument | 32.0M | 45.5M | | |
| One shot at power 10 (for scale) | 25.8M | 24.5M | | |

- **Tuning 1:** `linesWith` is written out by hand, with no closure, no slice literal and no `Vec2` method calls. Each operation keeps the same operands in the same order, so the bits don't change. `lines()` itself is untouched (D4). Result: `PrepareWith` costs −37%.
- **Tuning 2:** the wall block (4 coordinates and 3 lengths per wall, most of a hole's floats) is read in one pass. After one length check, each float costs one call to `le()` plus a bounds check. Result: the parse costs −16 to −19%.
- **Cost of a float read:** a method read with its checks costs 19.3K gas per float, an inlined 8-byte read 11.9K, and an empty call 1.5K. The byte arithmetic itself is the floor.
- **Keep the lengths:** `Prepare` − `PrepareWith` = 15.6M on hole4 and 27.1M on mountain7. The §7 gate ("drop the stored lengths if `Prepare` is under 5% of a preview") doesn't trigger.

## Per call on chain (gnodev, MsgRun simulate)

The probe realm (`gno.land/r/g1zgrx…/gg1probe` on gnodev) stores each hole two ways: as its GG1 string, and as the decoded, prepared `*course.Simple`. The second form is the D6 "cache per version" option, and it is also what a realm hole costs to load.

| Call | hole4 | mountain7 |
|---|---|---|
| Empty MsgRun into the probe | 3.29M | 3.29M |
| Load the GG1 string (`len`) | 3.48M | |
| `Decode`, first → tuned | 22.1M → **17.3M** | **20.3M** (tuned) |
| Load the cached `*Simple` and touch every wall and the prep | 13.1M | 17.2M |
| **Decode + one shot** (tuned) | **45.2M** | **46.8M** |
| **Cached object + one shot** | **45.5M** | **49.2M** |
| Data as a share of cached | **99%** | **95%** |
| `Put` (hex decode, `Decode`, `Exact`, store both forms) | 79.8M | 109.0M |

Before tuning, decode + shot on hole4 was 50.0M, 110% of the cached form: exactly at the §14.4 gate.

## Storage (filetest `Storage:` deltas)

### A hole stored as data vs decoded

| Hole | GG1 string in realm state | Decoded `*course.Simple` in realm state | Ratio |
|---|---|---|---|
| hole4 | 2,275 B | 100,873 B | 44× |
| mountain7 | 3,041 B | 145,632 B | 48× |
| island6 | 1,033 B | 38,019 B | 37× |

At pearl's `storage_price` of 100 ugnot/byte, hole4 costs 0.23 GNOT as data and 10.1 GNOT decoded. That price is from the skill's network reference; it wasn't read live (see "Not measured").

### Index trees: avl vs bptree

N entries are set in one transaction, in a fresh realm. The key is about 40 B and the value an int.

| N | avl | bptree fanout 32 | bptree fanout 8 |
|---|---|---|---|
| 1 | 1,766 B | 5,660 B | 3,404 B |
| 2 | 3,792 B | 6,071 B | 3,815 B |
| 5 | 9,870 B | 7,304 B | 5,048 B |
| 10 | 20,000 B | 9,359 B | 12,066 B |
| 100 | 203,425 B | 65,173 B | 89,017 B |
| Gas for the 100 sets | 31.1M | 11.6M | 14.2M |

- avl costs about 2,030 B per entry.
- bptree32 costs 5.7 KB for its first leaf, then about 410 B per entry, and about 590 B on average at 100 entries, splits included. It wins from 4 entries up, and is also cheaper in gas.

## The hole at the frozen limits (the Y5 gate)

The synthetic hole sits at every limit at once:
- a 96×48 board;
- 160 walls (132 fixed, 28 in pulses);
- 32 posts;
- 32 zones, 8 of them 64-point polygons (512 points);
- 16 pulses;
- 60 substeps.

| Step | Gas |
|---|---|
| GG1 size | 20,885 B |
| `Decode` | 71.1M |
| One storm shot, power 10, stroke 3, tick 7 | 66.5M |
| Rain forecast (`WeatherFor`, puddle placement) | 51.9M |
| Storm forecast | 35.2M |

Everything is well inside `workBudget` (1.4e9) and `maxGasQuery` (3e9). The other half of the gate (a 12-shot commit on this hole must be refused by the estimator) needs golf's estimator to count polygon edges and pulse extras. That is Phase 3.

## Decision (D6): decode per call, tuned; no cache in realm state

- **Caching the decoded, prepared hole per version** is rejected.
  - It stores 37–48× the bytes: about 10 GNOT per hole, about 750 GNOT for the course. That undoes the reason for holes-as-data.
  - Once the decoder is tuned, it isn't cheaper per call: 45.5M vs 45.2M on hole4, and 49.2M vs 46.8M on mountain7.
- **Storing the prep instead of the lengths** is also rejected. Reading 23 floats per wall costs about 275K, against 105K for the tuned `PrepareWith`.
- **Kept:** decode the GG1 string on every call, with the tuned `linesWith` and wall reader. A data hole's call then costs 95–99% of the same hole held as an object: the §14.4 target (≤ 110% of realm-hole gas) holds.
- **Publish is where the cost lands.**
  - Hex decode is 32–45M; `Exact` (D4's bit check) is 21–36M.
  - Measured `Put` is 80–109M, far under any limit, once per version.

## The cost model against the design (±50% gate)

| Item | Design (`deploy-v1.md`) | Measured | Holds? |
|---|---|---|---|
| Decode per call | 1–1.5M | 8.8–11.6M (tuned) | no, as the review found; parity with a realm hole instead |
| `PrepareWith` | 0.15M | 3.3–5.0M | no |
| Data per hole | ~2.5 KB (hole1) | 1.0–3.0 KB | yes |
| Stored data entry | ~3.3 KB with index | 2.3–3.0 KB string, plus the index entry | yes |
| bptree entry | ~660 B | ~410 B marginal, 5.7 KB fixed per tree | marginal yes, fixed cost no (D5) |
| Per-call total vs realm hole | 5× cheaper | 0.95–0.99× | parity: the saving is the deposit only (D6) |

## What Phase 1 took from this (D5)

The global indexes are the trees that hold every hole or every player: `holes`, `slots`, `totals` and `ranks`, and later `aliases`. They move to `bptree.NewBPTree32()`.

A hole's own trees stay on avl, because most of them hold a handful of entries: `rounds`, `bests` and `board`. The two tree kinds iterate in the same order (T7 checks it), so every read and golden output is unchanged.

## Not measured (T9, needs pearl)

- `storage_price` live on pearl. Neither gnomcp's eval nor render can read `params/vm:p:storage_price`. The skill reference gives 100 ugnot.
- `cur.Previous().Address()` under a session MsgCall on pearl.
- Whether gnoweb serves `golf:garden/7/v2`.
- A hex Publish on pearl itself. On gnodev, the equivalent `Put` is measured above.

The pearl profile has no agent key here, and keys are not to be created or imported for this work. These checks belong to the Phase 3 or Phase 6 rehearsal.
