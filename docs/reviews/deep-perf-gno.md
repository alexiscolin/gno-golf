# Deep review: gas and performance of the gno packages

Scope: `p/gnogolf/physics`, `p/gnogolf/course`, `r/gnogolf/golf` and the 74 hole realms, at the working tree of 2026-09-24 (the pin check included). This is a review only. Nothing in the repo was edited, and every scratch test was deleted.

## How it was measured

- **On-chain:** gnomcp `gno_call` / `gno_run` with `simulate=true` on profile `gnogolf` (chain `test-gnogolf`). The deployed physics matches the tree (`pinCheck` = 8 on-chain).
- **Locally:** throwaway `*_filetest.gno` files in `r/gnogolf/golf`, run with `/tmp/claude-501/gnobin test -v` at `nice -n 20`. The runner prints gas and storage per filetest. This covered 592 full-power shots (74 holes × 8 angles), 74 rain/storm forecasts, storage per round, and State with 24 rounds.
- Local gas runs about 20–40M below on-chain gas for the same call, because a filetest pays no tx overhead and loads no objects from the KV store. town14, full power at 0°: 177.5M locally in clear weather, 219.5M on-chain in wind.
- gnomcp caps a simulate at 1e9 gas-wanted. Calls that need more than that were measured locally.

### Unit costs (on-chain, measured)

| operation | gas |
|---|---|
| empty MsgRun | 0.68M |
| importing `r/gnogolf/golf` (package loads) | ~10M |
| `Reset` | 8.7M |
| **`math.Sqrt`**: software, a 54-iteration bit loop in `gnovm/stdlibs/math/sqrt.gno` | **~160K per call** |
| correctly rounded Newton + Dekker sqrt (prototype, see item 6) | ~43K |
| `physics.FromPolar` (software Sin + Cos) | ~81K |
| **`ufmt.Sprintf("%.3f", x)`**, which is what `jnum` does | **~690K per number** |
| `strconv.FormatFloat(x,'f',3,64)` | ~620K |
| integer-based 3-decimal formatter | ~45K |
| `ufmt.Sprintf("%.4f,%.4f,%d", …)`, the shot record | ~1.1M |
| Step set-up, per wall (8 sqrt) | **~1.33M per wall per shot** |
| Step wall test, per wall per move | **~45K** |
| `PlayRound` town14, 1 shot of power 0.1 | 103.0M |
| `PlayRound` town14, 1 full-power shot (wind) | 219.5M |
| `PlayRound` town14, 6 full-power shots | 968M |
| `PlayRound` town14, 12 full-power shots | **out of gas** (1.917e9 locally, in clear weather) |
| `SimulateRound` town14, 1 full-power shot | 234.8M (more than recording it) |
| `State` town14, no rounds | 182M |
| `Render` of the town14 page / of the hub | 201M / 133M |

The fixed cost of a trivial town14 shot is about 100M, and ~58M of that is Step's per-wall set-up (44 walls × 8 software sqrt). Gas does scale with the walls. The loop over them is heavy, but the heaviest single thing is the software `math.Sqrt`, run hundreds of times per shot. Rain goes further: it runs sqrt tens of thousands of times before the ball even moves.

## Ranked findings

Items are ranked by the gas they cost at the worst case. "Physics" says whether the fix changes any shot's result. **CHANGES PHYSICS** means every recorded replay and every golden hash changes.

### 1. Rain and storm cost up to ~890M gas before the ball moves

- **Where:** `p/gnogolf/course/course.gno:332-360` (`wet`), `:365-399` (`dryLand`), `:375` (`segDist` → `Len` → sqrt), `:378` (`wl.Seg.Hit` → `Segment.Normal` → sqrt, in `physics/shapes.gno:21-23`). It is reached through `weatherOf` in `golf/weather.gno:23`, which is called by `playRound` (`golf.go:321`, once per commit), `Launch` (`golf.go:261`), `Simulate` (`state.gno:189`), `simulateRound` (`state.gno:216`), `State` (`state.gno:37`), `Weather`, and `Render` through `weatherNote` (`render.gno:150`).
- **What is wrong:** puddle placement makes up to 60 tries. Each try tests every fixed wall with `segDist` (1 sqrt) and with `Seg.Hit`, whose normal is thrown away but still costs 1 sqrt. On lane holes the lane is narrower than a puddle plus its clearance, so every try fails and all 60 run: 60 × ~42 walls × 2 sqrt × 160K.
- **Measured:** the forecast alone, per rain/storm period sampled:

  | hole | weather | forecast gas |
  |---|---|---|
  | island14 | storm | **892M** |
  | island14 | rain | 874M |
  | island10 | storm | 768M |
  | island18 | storm | 728M |
  | hole18 | rain | 691M |
  | island2 | storm | 684M |
  | hole1 | rain | 632M |
  | town1 | rain | 585M |

  Most garden, island and town holes pay 100–600M. Mountains have snow, which places no puddles, so they pay nothing here. In rain, a single `Launch` on island14 costs about 1.05e9, and so does every `Simulate` or `State` read of it.
- **Fix:** none of these three changes the result.
  1. Use a crossing test without the normal for the even-odd ray cast. It is the same `t`/`u` arithmetic as `hitN`, minus the `Normal()`.
  2. Compare squared distances: `dist² < (rad+0.3)²`. Fall back to the sqrt only when `dist²` lies within ~1e-12 relative of the threshold, so the decision is exactly the one `sqrt` would give.
  3. Test the cheap exits first (posts, zones), then the walls. `dryLand` is a pure conjunction, so order doesn't change it.

  This removes every sqrt from `wet`. Expect roughly 40–60M in the worst case instead of 890M.
- **Physics:** unchanged by 1–3. Reducing the 60 tries, or dropping puddles on lane holes, would change the forecast and so **CHANGES PHYSICS** (it changes the weather zones).

### 2. Step recomputes 8 software sqrt per wall on every shot

- **Where:** `p/gnogolf/physics/step.gno:131-143`. `Seg.Normal()` takes 1 sqrt, each `Toward` takes 2 (its own `d.Len()` and `Normal()`) and there are two of them, `plus.Normal()` and `minus.Normal()` take 2, and `o.length` takes 1.
- **What is wrong:** 1.33M per wall per shot, measured (4 walls: +5.7M, 44 walls: +59M on a 1-move shot). It is paid again for every shot of a commit: town14 pays ~58M per shot, ~700M across 12 shots.
- **Fix:**
  - **(a) Bit-identical.** Take `d := B−A` and `l := d.Len()` once. `Normal`, `Toward` (both calls) and `length` then reuse `l` and `n`, because they recompute exactly those values. `Toward`'s side test keeps `+n` for `A+n` and yields exactly `−n` for `A−n`. Only the two offset normals need sqrt of their own. That is 8 → 3 sqrt, saving ~0.8M per wall per shot (35M on town14). This is in the prototype below.
  - **(b)** Also precompute the offsets once per field, at hole init (for example `physics.Prepare(f)`, stored as one flat `[]float64` so it loads as a single object) or once per commit in golf. That takes the remaining 3 sqrt/wall off every shot.
- **Physics:** (a) unchanged (0/648 shots differ in the prototype). (b) unchanged if it runs the same arithmetic.

### 3. No broad phase: every wall and post is tested on every move, at ~45K per wall

- **Where:** the wall loop `step.gno:187-239` and the post loop `step.gno:240-248`.
- **What is wrong:** a wall that is nowhere near the ball still pays for `there()`, the side test, and a full `hitN`: ~8 Vec2 method calls plus 2 native calls in `math.Abs`. That comes to ~45K per wall-move, measured (40 walls × 42 moves = 75.7M). A lane hole has 28–48 walls and the ball is near 2–6 of them.
- **Fix:** precompute an AABB per wall in the set-up: `minmax(A,B) ± (Radius + skin)`, grown to hold the four offset end points, plus an ε of 1e-9. Per move, form the move's AABB from `pos` and `next`. Skip the wall when the two boxes are disjoint, before `there()`. Do the same for posts, with `C ± (R+Radius+ε)`. It is four float compares.
- **Measured, prototype (2)+(3):** 8 full-power shots on town14 with its wind zone went from **1325M to 574M**, i.e. ~162M → ~69M per shot, **−57%**. A comparison over 648 shots (calm and wind; 36 angles × 3 powers × 3 start points) found **0 differences** in Path, Air, Cause or Bounces. Of that saving, ~35M is item 2(a) and ~58M is the culling.
- **Physics:** unchanged. The skipped walls could not have produced a hit, and the ε covers rounding in `hitN`. The goldens should still be run to confirm.

### 4. `maxShots = 12` does not bound a commit under 1.9e9

- **Where:** `golf.go:40` (the comment says "~1.8B at most") and `golf.go:316-319`.
- **Measured:** 6 full-power shots on town14 cost 968M on-chain. 12 shots ran out of gas on-chain and cost 1.917e9 locally in clear weather. A rain forecast adds up to 0.9e9 on top. The table at the end puts **24 of the 74 holes** above 1.9e9 for 12 worst-case shots.
- **Fix:** items 1–3 bring the worst case down about 2.5×. Until then:
  - Either lower `maxShots` to 6, or budget by work instead of by shot count: abort when `sum(len(path))` or the move count passes a cap.
  - Have the client split long rounds. `PlayRound` already continues a round, so splitting only means more commits.
- **Physics:** unchanged.

### 5. JSON numbers go through `ufmt "%.3f"` at ~690K each: `State` can exceed the query limit

- **Where:** `state.gno:128-135` (`jnum`, `jvec`). It is used by `pathJSON` (`:87-94`), `roundJSON` (`:69-84`), `wallsJSON`, `postsJSON`, `zonesJSON`, `forecastJSON`, `Holes`, `Simulate` and `SimulateRound`.
- **Measured:**
  - `State` of town14 with no rounds costs 182M; its ~200 numbers account for ~140M of that.
  - A 26-point `Simulate` path adds ~36M.
  - **`State` of hole16 with 24 rounds of long roll-on paths costs 3.03e9, over the 3e9 query limit (`maxGasQuery`), so it fails.** `roundsShown = 24` caps the number of rounds, not their paths.
- **Fix:**
  - An integer formatter: `k := int64(v*1000 ± 0.5)`, then `itoa(k/1000) + "." + 3 digits`. Fall back to `strconv` only when `|v*1000 − k|` is within 1e-6 of .5 or `|v|` is huge, and keep the `-0.000` sign rule. That makes it byte-identical to `%.3f`, at ~45K a number, about 15× cheaper.
  - Leave `path` out of the `rounds` array in `State`. A client reads a round with `Round()`.
- **Physics:** unchanged. The JSON bytes are unchanged if the tie fallback is kept. Without it, a 1e-3 tie can differ, which **changes the golden State/Simulate hashes, not physics**.

### 6. `math.Sqrt` is software, ~160K a call, and still runs several times per substep

- **Where:** everywhere that calls `Vec2.Len` (`vec2.gno:32`). The hot callers:
  - `step.gno:170` and `:299`: 2 per substep;
  - `step.gno:335` and `:345`: 2 per move inside any slope zone, including whole-board wind;
  - `course.gno:609` and `:618`: `Sink`, 1–2 per path point;
  - `Circle.Hit` (`shapes.gno:88`, `:93`);
  - `climbing` and `pull` (`step.gno:435`, `:445`);
  - `Render`'s `fill` (`render.gno:456`), once per cell.
- **Fix:** a correctly rounded `physics.sqrt`:
  1. seed from the bits: `Float64frombits(bits>>1 + 0x1FF7A3BEA91D9B1B)`;
  2. 4 Newton steps;
  3. one exact Dekker residual, `x − y²`, which rounds `y` to the neighbour that is correct.

  Measured at ~43K on-chain, 3.7× cheaper. In Go, with FMA fusion disabled through explicit `float64()` casts, it matched `math.Sqrt` bit for bit on **96M inputs**: random, squares, midpoints and their neighbours. The GnoVM runs each float operation on its own, so it never fuses. Keep `math.Sqrt` for x ≤ 0, NaN, Inf and |exponent| > 900.
- **Physics:** unchanged if the proof holds. Correct rounding is unique, so the result is the same bits. Ship it only with a large property test in `physics_test.gno`. It is the one fix here whose identity rests on a numerical argument rather than on the code's structure.

### 7. Sink runs 1–2 sqrt per path point

- **Where:** `course.gno:605-646`.
- **What is wrong:** `d.Len()` runs for every point and `p[i].Sub(p[i-1]).Len()` for every slow point: ~7M a shot, ~35M on a 146-point roll-on path.
- **Fix:**
  - Skip a segment whose AABB is farther than `radius` from the pin: it can never drop, so the first match is unchanged.
  - Compare `d·d` with `CaptureSpeed²`, and fall back to sqrt only within ~1e-12 of the threshold.
- **Physics:** unchanged.

### 8. Storage: ~0.5 GNOT a round, ~36 GNOT to play the course once

- **Where:** `round` at `golf.go:60-69` (`path []float64`, `ball Vec2`, `shots []string`), written by `golf.go:372-377`.
- **Measured, from the filetest storage diff:**
  - a round costs ~3.4KB fixed plus ~55B per path point;
  - a town14 full shot is 4.8KB (0.48 GNOT at 100ugnot/byte);
  - a hole16 roll-on shot is 10.1KB (1.0 GNOT);
  - one full-power first shot on each of the 74 holes is 361KB, **about 36 GNOT locked per player**.
- **Retention:** rounds are kept for good, one per (player, hole). `Reset` replaces a round rather than piling them up.
- **Two waste points:**
  - `r.path = r.path[:0]` keeps the largest backing array a round ever had, so the path storage never shrinks.
  - `ball` is a nested struct, which makes it a separate store object.
- **Fix:**
  - Store the path packed: fixed-point int16 x100, as a string of 4 bytes a point, which takes 146 points from ~8KB to ~0.6KB. Or drop it, since `SimulateRoundAt(shots, period)` replays it.
  - Store `bx, by float64` instead of `ball`.
  - Keep `shots` as one `;`-joined string.
- **Physics:** unchanged. A quantised path only changes what is drawn; replays come from `shots`.

### 9. Geometry is stored as nested structs: 4 store objects per wall

- **Where:** `field.gno:57-67`: `Wall{Seg Segment{A, B Vec2}}`. Nested structs are separate gno objects, as the realm diff in `gnovm/tests/files/storage/struct2b.gno` shows.
- **Cost (estimate):** the first touch of a field in a tx reads ~4 objects per wall, 3 per post and 4+ per zone, at `ReadCostFlat` 59K each. That is ~10–15M per tx or query on a 44-wall hole. The on-chain vs local difference for a tiny town14 shot, about 28M including package loads, is consistent with this.
- **Fix:** the prepared flat `[]float64` from item 2(b) serves Step and loads as one object. The Wall/Post values remain for rendering only.
- **Physics:** unchanged if the arithmetic stays the same.

### 10. Wind and slope zones take 2 sqrt per move

- **Where:** `step.gno:335` and `:345`.
- **What is wrong:** `v0 := vel.Len()` runs for every slope zone the ball is in, even when the clamp is for wind only. Wind covers the whole board, so it runs on every move.
- **Fix:** compare `vel·vel` before and after. Take the two sqrt only when the ball sped up in wind. If `a1 > a0` but the two roots round to the same value, the scale is `v0/l = 1` exactly, so the result is identical.
- **Measured:** −4M per shot on town14 in wind (574M → 542M over 8 shots), 0/216 differences. Also precompute `z.Vec.Len()` once per slope for `climbing` and `pull` (`step.gno:435`, `:445`); that is identical.
- **Physics:** unchanged.

### 11. `retire` scans every ranked player inside the replacing hole's Register

- **Where:** `golf.go:224-243`, which runs `totals[m].Iterate` with `named()` (a `users.ResolveAddress` avl lookup) per player.
- **Cost (estimate):** ~0.3–1M per player once the KV reads are paid, times 2 modes. Past about 1–3K ranked players, a replacement `Register` needs more than one transaction's gas, so **the course can no longer be updated**. The `ponytail:` note says "tens of thousands"; the ceiling is lower.
- **Fix:** keep a rank index per mode, an avl keyed by `(999-holes, strokes, player)` padded, holding only named players, maintained in `improve`. The top ten are its first 10 entries. `retire` then touches only that hole's players, in O(k log n).
- **Physics:** unchanged.

### 12. `HoleLeaderboard` makes a full pass with `named()` per finisher

- **Where:** `state.gno:362-411`.
- **Cost (estimate):** a node read plus a `users` lookup per player, ~0.2–1M each, so the 3e9 query limit is reached at roughly 3K–15K finishers per hole. Insertion into `list` is also O(n·keep).
- **Fix:** keep a sorted per-hole, per-mode index of named bests, keyed by zero-padded strokes and the player, updated at finish. A read then iterates `offset+limit` entries.
- **Physics:** unchanged.

### 13. Per-stroke `ufmt` formatting

- **Where:** `golf.go:372` (the shot record, ~1.1M), `:337` and `:331` (the return strings, ~1M), and `:397` and `:401` (`ufmt.Sprintf("%d")` in events).
- **Fix:** `angle` and `power` are already `q4`, so `k := int64(math.Round(x*1e4))` recovers the exact integer. Print `k/1e4` and 4 digits, handling the sign; that is byte-identical to `%.4f`. Use `strconv.Itoa` for the ints.
- **Gain:** ~1.5M per stroke, ~18M per 12-shot commit.
- **Physics:** unchanged. The `shots` bytes are unchanged too, so replays keep working.

### 14. The Render pages cost 133M and 201M (free queries, but heavy)

- **Where:**
  - `render.gno:456`: `fill` takes a sqrt per cell of every post's box;
  - `:444-450`: `trace` takes a `Len` per wall, twice (board and `blankUnreachable`);
  - `:192-276`: `renderHole` builds with `s +=`;
  - `:212`: the forecast (item 1 in rain);
  - `:587-608`: `listed()` does an insertion sort on every hub view.
- **Fix:**
  - `dx²+dy² <= R²` in `fill` (a render change only in 1-ulp cases);
  - a `strings.Builder`;
  - trace once and reuse the wall grid;
  - keep the course order sorted at Register.
- **Physics:** unchanged.

### 15. Small items on the hot path

All of these are bit-identical.

- **`step.gno:114`:** `Cause` has no preallocated capacity. The slices also grow past `substeps+2` during a roll-on; give them capacity `substeps+MaxRollOn+2`.
- **`step.gno:54`:** `mark` calls `strings.IndexByte` twice per mark. Replace it with a 5-case `switch`.
- **`shapes.gno:31`:** `math.Abs` costs 2 native calls (~5K) per wall test. Use `den < 1e-12 && den > -1e-12`, which is identical for non-NaN values.
- **Vec2 value-method calls:** each costs ~1.5–2K (select + call + block + struct literal). After culling, inline the arithmetic in the near-wall branch only.
- **`course.gno:451-459`:** `WithExtras` copies every wall on pulse holes on every shot. That is minor, and it goes away with item 2(b).
- **avl:** `holes.Get`, `rounds.Get` and `bests.Get` are O(log n) and fine. The only unbounded scans are items 11 and 12.

## Top 5 fixes by gas saved per effort

1. **Remove sqrt from `wet`/`dryLand`** (item 1). About 10 lines in `course.gno`, and bit-identical. It saves **up to ~850M** on every rain/storm tx and read of lane holes.
2. **Reuse `l`/`n` in the Step set-up** (item 2a). About 10 lines, bit-identical. It saves ~0.8M per wall per shot: **~35M a shot** on 44-wall holes, ~420M on a 12-shot commit.
3. **AABB broad phase for walls and posts** (item 3). About 25 lines, bit-identical (0/648 differences). It saves **~58M a shot** on town14; together with #2 a shot costs 57% less.
4. **Integer `jnum` with a tie fallback, and no path in `State`'s round list** (item 5). About 20 lines, byte-identical. `State` drops 182M → ~50M, `Simulate` saves ~35M, and it **clears the `State` query-limit failure**.
5. **Squared compares with an exact fallback in `Sink`, wind and `climbing`/`pull`** (items 7 and 10). About 20 lines, bit-identical. It saves ~10–40M a shot, more on roll-on paths.

Also do the **safety fix in item 4 now**: lower `maxShots` to 6, or cap by work. The current cap lets a legitimate commit run out of gas on about a third of the holes. Item 6 (fast sqrt) is the broadest remaining win once 1–3 are done, but its identity rests on a proof and a big test.

## Worst-case gas per hole

- **Method:** the local runner (on-chain is about 20–40M higher per tx). "Worst full shot" is the most expensive of 8 angles (every 45°) at power 10 from the tee, as a whole `PlayRound`, in the fixed test period's weather with any rain cost taken out.
- **Weather:** "Worst weather" is the forecast gas for that hole's most recent rain or storm period, found by reproducing `ForecastFor`'s hash. Mountains have no rain; their snow costs about 0.
- **Commit bound:** "12-shot commit bound" is weather + 12 × worst shot. That is pessimistic about the shots: real rounds take 2–5 strokes, and later shots start from other places.
- **Storage:** "Round storage" is the golf realm's storage growth for that first round.
- **The goal:** after items 1–3 every row should fall to about 40% or less.

| hole | walls/posts/zones | worst full shot (M) | at angle | round storage (B) | worst weather (M) | kind | 12-shot commit bound (M) | over 1.9e9? |
|---|---|---|---|---|---|---|---|---|
| island18 | 40/1/4 | 185 | 315 | 4963 | 728 | storm | 2953 | **yes** |
| island14 | 42/0/1 | 166 | 315 | 4722 | 892 | storm | 2889 | **yes** |
| island2 | 40/1/0 | 169 | 0 | 4796 | 684 | storm | 2712 | **yes** |
| town14 | 44/3/1 | 178 | 0 | 4787 | 423 | rain | 2553 | **yes** |
| hole1 | 40/1/0 | 156 | 45 | 4707 | 632 | rain | 2508 | **yes** |
| hole18 | 40/1/1 | 147 | 225 | 4799 | 691 | rain | 2453 | **yes** |
| hole16 | 6/1/2 | 195 | 135 | 10141 | 71 | rain | 2409 | **yes** |
| mountain11 | 40/0/5 | 198 | 45 | 5136 | 0 | - | 2372 | **yes** |
| hole14 | 45/1/0 | 179 | 315 | 4719 | 180 | rain | 2332 | **yes** |
| island10 | 36/1/2 | 129 | 45 | 4644 | 768 | storm | 2317 | **yes** |
| mountain14 | 32/0/4 | 192 | 0 | 5535 | 0 | - | 2298 | **yes** |
| island4 | 40/1/1 | 155 | 180 | 4637 | 433 | storm | 2294 | **yes** |
| mountain16 | 33/0/4 | 189 | 90 | 6028 | 0 | - | 2273 | **yes** |
| island13 | 40/1/1 | 161 | 0 | 4556 | 249 | storm | 2185 | **yes** |
| mountain13 | 30/0/1 | 182 | 270 | 5618 | 0 | - | 2179 | **yes** |
| island11 | 40/0/0 | 134 | 90 | 4639 | 559 | rain | 2169 | **yes** |
| town10 | 36/0/0 | 127 | 90 | 4710 | 567 | rain | 2090 | **yes** |
| mountain3 | 44/2/0 | 174 | 0 | 4724 | 0 | - | 2083 | **yes** |
| town12 | 36/2/1 | 138 | 225 | 4630 | 414 | rain | 2075 | **yes** |
| town1 | 28/3/0 | 123 | 0 | 4787 | 585 | rain | 2060 | **yes** |
| hole19 | 35/0/0 | 137 | 225 | 4711 | 416 | rain | 2057 | **yes** |
| mountain7 | 48/0/2 | 168 | 0 | 4640 | 0 | - | 2016 | **yes** |
| mountain18 | 40/2/0 | 168 | 270 | 4729 | 0 | - | 2011 | **yes** |
| island3 | 28/0/8 | 147 | 0 | 4957 | 224 | storm | 1984 | **yes** |
| town8 | 44/1/0 | 148 | 45 | 4705 | 71 | rain | 1846 |  |
| island1 | 28/1/1 | 115 | 45 | 4878 | 462 | storm | 1837 |  |
| town4 | 36/0/0 | 135 | 0 | 4706 | 192 | rain | 1816 |  |
| mountain1 | 28/0/1 | 146 | 0 | 4885 | 0 | - | 1746 |  |
| mountain8 | 40/0/0 | 145 | 0 | 4721 | 0 | - | 1741 |  |
| hole6 | 21/0/1 | 101 | 315 | 4950 | 505 | rain | 1721 |  |
| mountain12 | 10/2/3 | 143 | 225 | 7644 | 0 | - | 1720 |  |
| island12 | 28/5/0 | 118 | 0 | 4635 | 276 | storm | 1697 |  |
| mountain9 | 32/0/0 | 138 | 135 | 4724 | 0 | - | 1660 |  |
| mountain5 | 28/0/2 | 137 | 0 | 7627 | 0 | - | 1645 |  |
| hole3 | 28/0/4 | 117 | 180 | 4957 | 198 | rain | 1600 |  |
| island7 | 22/1/5 | 115 | 315 | 4719 | 180 | rain | 1565 |  |
| island16 | 20/0/4 | 92 | 0 | 4556 | 446 | storm | 1554 |  |
| hole5 | 25/0/1 | 108 | 270 | 4545 | 213 | rain | 1512 |  |
| hole13 | 28/1/1 | 111 | 0 | 4714 | 169 | rain | 1499 |  |
| town5 | 28/1/1 | 111 | 0 | 4626 | 141 | rain | 1475 |  |
| mountain15 | 36/2/4 | 123 | 45 | 4323 | 0 | - | 1475 |  |
| town6 | 24/0/5 | 115 | 180 | 5515 | 82 | rain | 1459 |  |
| hole4 | 30/0/4 | 115 | 0 | 4786 | 66 | rain | 1442 |  |
| town7 | 28/3/3 | 111 | 180 | 4869 | 97 | rain | 1423 |  |
| mountain17 | 28/3/3 | 116 | 225 | 4732 | 0 | - | 1392 |  |
| mountain2 | 28/4/0 | 114 | 45 | 4644 | 0 | - | 1367 |  |
| town18 | 20/7/5 | 82 | 0 | 4385 | 349 | rain | 1327 |  |
| hole10 | 17/5/0 | 91 | 0 | 4796 | 198 | rain | 1288 |  |
| mountain6 | 20/3/1 | 107 | 0 | 5048 | 0 | - | 1284 |  |
| town13 | 20/3/0 | 89 | 315 | 4709 | 187 | rain | 1252 |  |
| mountain10 | 24/1/3 | 103 | 270 | 4655 | 0 | - | 1240 |  |
| hole2 | 22/3/1 | 94 | 45 | 4791 | 105 | rain | 1227 |  |
| town2 | 24/0/0 | 94 | 135 | 4951 | 82 | rain | 1208 |  |
| hole9 | 14/0/3 | 93 | 315 | 5437 | 59 | rain | 1173 |  |
| hole8 | 18/6/0 | 87 | 0 | 4704 | 126 | rain | 1172 |  |
| hole7 | 20/0/1 | 89 | 45 | 4706 | 46 | rain | 1117 |  |
| island17 | 14/5/0 | 70 | 315 | 4558 | 262 | rain | 1096 |  |
| mountain4 | 28/2/2 | 88 | 180 | 4239 | 0 | - | 1056 |  |
| town3 | 17/2/1 | 75 | 45 | 4952 | 145 | rain | 1043 |  |
| hole20 | 12/4/6 | 74 | 270 | 4632 | 68 | rain | 959 |  |
| hole17 | 12/7/0 | 69 | 0 | 4712 | 132 | rain | 957 |  |
| town9 | 16/1/0 | 70 | 0 | 4704 | 59 | rain | 901 |  |
| town16 | 8/4/0 | 59 | 270 | 4631 | 94 | rain | 797 |  |
| hole15 | 17/0/3 | 55 | 315 | 4549 | 134 | rain | 789 |  |
| island5 | 7/0/3 | 56 | 180 | 4390 | 60 | storm | 730 |  |
| island8 | 10/0/4 | 52 | 225 | 4391 | 92 | storm | 720 |  |
| town15 | 4/3/6 | 52 | 0 | 4705 | 90 | rain | 713 |  |
| island15 | 10/1/3 | 53 | 135 | 4721 | 66 | storm | 707 |  |
| town17 | 8/2/0 | 48 | 90 | 4629 | 86 | rain | 656 |  |
| hole11 | 9/1/3 | 48 | 180 | 4722 | 24 | rain | 598 |  |
| town11 | 4/5/0 | 42 | 45 | 4713 | 57 | rain | 562 |  |
| island9 | 9/0/4 | 33 | 0 | 3740 | 145 | rain | 542 |  |
| hole12 | 5/1/7 | 31 | 315 | 3989 | 43 | rain | 410 |  |
| island6 | 4/0/1 | 15 | 45 | 3580 | 77 | storm | 262 |  |
