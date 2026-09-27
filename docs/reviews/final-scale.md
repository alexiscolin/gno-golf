# Final pre-deploy review: gas, storage and scalability (2026-09-25)

Scope: `p/gnogolf/physics`, `p/gnogolf/course` and `r/gnogolf/golf` at HEAD `affe241`, as they go to pearl under `nym-golfer000`. This is a review only. No code in the repo was changed. The scratch copies and tests stayed in the session scratchpad.

## How it was measured

- **Pearl limits.** Read from the pearl RPC (`pearl-1`, height 700,951), read-only:
  - `consensus_params`: `Block.MaxGas` **3,000,000,000**, `MaxTxBytes` 1,000,000, `MaxDataBytes` 2,000,000. Pearl has no per-tx cap of its own, so one tx can use the whole block.
  - `maxGasQuery` is 3e9 (`gno.land/pkg/sdk/vm/keeper.go:52` at `c4c72fd`).
  - `params/vm:p:storage_price` is **100ugnot** per byte. This was read live; it was not measured before (phase0 "Not measured").
  - `bank:p:restricted_denoms` is `[]`, so a storage refund goes to **the caller of the tx that frees it** (`keeper.go:2326`, `receiver := caller`).
- **Chain gas.** gnomcp profile `gnogolf` (gnodev on :26757, running the HEAD golf with the 74 data holes), with `gno_call`/`gno_run` and `simulate=true` only.
  - An empty MsgRun that imports golf costs **14.6M**.
  - Read figures below include that, unless marked "net".
  - Caveat, as in `gno2-system.md` finding 3: gnodev runs the local toolchain, not the pearl tag.
- **Compute gas and storage.** Scratch copies run with the pearl toolchain (`~/.cache/gno-toolchains/pearl/gno`, with `GNOROOT` and `GNOHOME` pinned to the pearl module and cache; without `GNOHOME` it picks up a stale avl and fails to build), under `nice -n 20`.
  - The copies differ from HEAD in two scratch-only ways. The owner is forced at init. An `Act(a)` hook sets the caller, so that one filetest can play as many addresses; filetests cannot switch `cur.Previous()` with `testing.SetRealm`.
  - Storage figures are filetest `storage:` deltas for `gno.land/r/gnogolf/golf`.
  - `gno test` gas is VM compute only. It leaves out store I/O: read 59K flat + 17/B, write 24K + 14/B (`tm2/pkg/store/types/gas.go`).
- **A second copy** had the per-version trees (`rounds`, `bests`, `board`, `fresh`, `expected`) swapped from avl to `bptree.NewBPTree32()`, to measure the D5 choice.

## Measured numbers

### Storage per action (small 32×16 hole, filetest deltas, bytes)

| action | avl (HEAD) | bptree per-version trees | notes |
|---|---|---|---|
| Publish, first official hole (with the first leaves of the global indexes) | 21,195 | 21,272 | owner pays |
| each further version (entry + data + index keys) | **~7,600** + data | same | real data is 1.0–3.0 KB, so ~9–10 KB per version |
| first stroke by a player on a hole (round, shots) | **3,147** | 1,819 | the first one on a version also creates the 512 B wear blob |
| first finish, **new player** (round + best + board + standing), at 50–100 players | **9,691–9,768** | **5,667–5,726** | 0.97 GNOT vs 0.57 GNOT |
| first finish on a **further** hole (standing exists) | **7,446** | **3,420** | −54% |
| the course standing alone (`totals` row + `ranks` key, per mode) | ~2,250 | ~2,250 | already bptree |
| first finisher on a new version: first nodes / leaves of its trees | ~6.9 KB more than a later player | **~11.7 KB more than avl** | the first finisher pays it |
| **replay** (Reset + the same finish again) | **+6 B** per player (50 players: +318 B) | +6 B | Reset frees the round, the new round takes its place |
| Publish v2 over 50 finishers (drain 400) | **−109,180** net | −108,744 | ~2.3 KB freed per drained player, refunded to the **owner** |
| PublishMine at the format limits | ~21 KB data + ~8 KB | same | publisher pays, ~2.9 GNOT |

### Gas per call

| call | measured | where |
|---|---|---|
| `PlayRound` first finish, garden/3 (1 stroke) | **55.1M** | gnodev MsgCall |
| the same finish + `Reset` + finish again, one tx | 96.2M script, so +32.5M for Reset + replay (objects already cached) | gnodev MsgRun |
| `Launch`, garden/16, power 10 | 50.2M | gnodev MsgCall |
| `PublishMine` of mountain7's 3 KB data | ~180M script, so **~0.13–0.18B** net | gnodev MsgRun |
| `Publish` of a new mountain/7 version, nobody to drain | 324M script (decode, re-encode and hex are ~0.13B of that), so **~0.15–0.19B** net | gnodev MsgRun |
| `PublishMine` at the limits (21 KB, 160 walls, 512 polygon points) | **~0.85B** compute (40 publishes: 49.9B, less the test's own Encode) | pearl gno test |
| drain, per drained player | **0.43M compute** (300 players: 130.2M); **est. 2–4M on chain**, from ~40 object loads through bptree `totals`/`ranks` and `r/sys/users` | pearl gno test + store model |
| `Holes()` (74 rows) | 100.2M (85.6M net), about 1.15M per row | gnodev |
| `Render("")` | 64.3M | gnodev |
| `Render(<hole>)`: garden/16, island/10, mountain/7, town/14 | 200M, 174M, 229M, 245M | gnodev |
| `Render(<hole>/data)` | 29.6M | gnodev |
| `State(garden/16)` | 57.9M | gnodev |
| `HoleData` | 28.3M | gnodev |
| **Hostile community hole** (valid GG1, 160 long walls, 32 posts of R=8, 32 full-board zones of which 8 are 64-point polygons) | `Render` **29.7B**; `board()` alone 29.3B; `State` 237M; `Simulate` 246M; `Weather` 73M; decode 72M; `Holes` 2M | pearl gno test (compute only) |

## Function table: worst case now and after a year of success

"A year" means 10k players, 1k community holes, and 50 versions of a slot. Let P be the players on one version, N the players in the course standing, V the versions of an alias, and C the community entries. Tree ops are O(log) and cost about 1M each on chain (avl depth 14 at 10k, or bptree depth 3 at about 13 object loads).

| function | grows with | worst case today | worst case after a year | storage | verdict |
|---|---|---|---|---|---|
| `Launch` | log P | 50–110M (rain) | +~5M | +3.1 KB on a player's first stroke (0.31 GNOT); shots +~20 B per stroke | ok |
| `PlayRound`/`At`/`Pro`, first finish | log P + log N + **drain(16)** | 55M on a light hole; ≤ ~1.7B at the work budget (1.4e9 + forecast + decode + drain) | +~10M bookkeeping, **+32–64M drain surcharge** while any hole is archived | **+9.7 KB** new player (0.97 GNOT), **+7.4 KB** per further hole | risk 2, 3 |
| the same, replay (after Reset) | same | ≈ first finish less ~1–3M of new-object writes | same | **~0** | ok |
| `Reset` | log P | ~8M | +~1M | −3.1 KB, refunded to the caller | ok |
| `Drain(n≤400)` | the players on the archived holes | 400 × 0.43M compute | **0.8–1.6B** at 400 rows | −2.3 KB per player whose last course hole it was, **refunded to the drainer** | risk 3, 4 |
| `Publish` (owner) | data + drain(400) | ~0.15–0.19B | **up to ~1.8B** (0.2B + 400 × 2–4M), under 3e9 but near Adena's 2e9 simulate cap | +~7.6 KB + data per version (50 versions: ~0.5 MB, ~50 GNOT) | risk 3 |
| `PublishMine` | data | 0.13B (3 KB); ~0.85B at the limits | flat | +~8 KB + data (≤21 KB), publisher pays | ok |
| `Register` | flat | +14M | flat | ~8.6 KB | ok |
| `Transfer`/`Accept`/`Renounce`/`Expect` | flat | trivial | flat | tiny | ok |
| `Holes()` | capped at 120 rows | 100M | **~140M** at the cap | 0 | ok (see risk 5 for what it lists) |
| `Render("")` | capped at 120 rows + 2 × top 10 | 64M | ~100M | 0 | ok |
| `Render(<hole>)`, `/<addr>` | geometry (walls × length, zone cells × **polygon edges**) | 174–245M real; **29.7B hostile** | same | 0 | **risk 1** |
| `Render(<hole>/data)` | V ≤ 100 | 30M | +~1.5M per version (V=50: ~105M) | 0 | ok |
| `State`, `HoleState` | geometry; rounds capped at 24 | 58M; 237M hostile | +log P | 0 | ok |
| `Simulate`, `SimulateFrom` | geometry + forecast | 53–183M; 246M hostile | flat | 0 | ok |
| `SimulateRound(At)`, `SimulateCommit` | shots, capped by the work budget | ≤ ~1.5B | flat | 0 | ok (below 3e9, but ~1 s of node time for free) |
| `Weather`, `Extras` | geometry | ≤ 140M (rain), 73M hostile | flat | 0 | ok |
| `HoleData`, `Current`, `BestOf`, `StandingOf`, `Owner`, `Pending` | log | < 30M | +~1M | 0 | ok |
| `Versions` | V ≤ pageMax (100) finds | ~20M | V=50: ~90M; capped at 100: ~165M | 0 | ok |
| `Community(after, limit≤100)` | limit | small | ~100–150M per page | 0 | ok |
| `Leaderboard` | 2 × top 10 + skipped deleted names | 22M | ~50M | 0 | ok (low: see the note below) |
| `Rank` | log N binary search by `GetByIndex` (O(log) via `sizes`) | small | ~15–20M at 10k | 0 | ok |
| `HoleLeaderboard`, `Records`, `Players`, `Rounds`, page 100 | limit | small | ~0.15–0.35B | 0 | ok |
| `Bests`, `Standings` (50 addresses) | 50 | 66M | ~120M | 0 | ok |

**Totals after a year.** Assume 10k players, each finishing 20 official holes in one mode:
- **avl (HEAD):** 10k × (2.25 KB + 20 × 7.4 KB) ≈ **1.5 GB of realm state, ~150k GNOT of player deposits, ~15 GNOT per player**, which is 1.5 days of faucet;
- **bptree per-version trees:** ≈ 0.70 GB, ~7 GNOT per player;
- 1k community holes: 10–29 MB (1–2.9k GNOT, paid by their publishers);
- 50 versions of all 74 slots: ~37 MB (~3.7k GNOT, owner).

No transaction reaches the 3e9 block limit. One read does: the hostile hole's page.

## Checks asked for

- **Per-object loading: no neighbouring hole data is loaded.**
  - The pearl `bptree` leaf is `keys []string` plus `values []*any`, "each value a separate object for lazy loading" (`p/nt/bptree/v0/node.gno:13-16`). A `holeData.Get` therefore loads the root, an inner node and one leaf's key array, plus one value: one hole's GG1 string, never its 31 neighbours'.
  - `courseHoles` and `community` hold `*entry` pointers, which are separate objects as well.
  - An entry's arrays (`bests`, `board`, `best`, `bestBy`) and its `wear` slice are separate objects, loaded only when touched. `Holes` and the hub read names and bests, and never touch the wear or the data (Y6 holds).
  - The per-version avl nodes carry their values inline, but those values are ints, addresses, or a `*round` reference.
  - The cost to watch is object count, not neighbours. A bptree level is 3–4 objects (the node struct, keys, children and sizes, or values). A Get at 10k entries is ~13 loads, about the same as an avl path of 14 nodes.
- **avl vs bptree.**
  - The global indexes (`courseHoles`, `community`, `holeData`, `slots`, `aliases`, `totals`, `ranks`) are rightly bptree.
  - The per-version trees are **not** right for official holes: a popular hole reaches thousands of players, and avl costs 7.4 KB per (player, hole) against 3.4 KB on bptree.
  - An empty bptree costs the same as an empty avl (+77 B per publish), because leaves are created lazily. So D5's "a B+ tree costs ~4.9 KB even when nearly empty" applies only once the tree holds something: the first finisher pays ~11.7 KB more. The two break even at about 3 players on a version. See risk 2.
- **The 512-byte wear blob is a good choice.**
  - It is one `[]byte` object per version, made at the first stroke (paid by that player).
  - Each stroke rewrites it: ~24K + 14 × ~560 B ≈ 32K gas.
  - It is read only by `State`, `HoleState` and `Render`. The u32 counters cannot overflow in practice.
  - Nothing to change.
- **First finish vs replay.**
  - A first finish locks 9.7 KB (new player) or 7.4 KB (further hole): about 17× its gas fee (55M gas ≈ 0.06–0.11 GNOT).
  - A replay after Reset locks ~0 (+6 B measured) and costs the same gas less a few new-object writes.
  - The first stroke of a round alone locks 3.1 KB, even for a single gnoweb test shot.

## Risks, ranked

### 1. A community hole can make its own page unreadable: `Render` costs 29.7B against a 3e9 query cap (high)

**Evidence**
- The hostile hole passes `Decode` and `Exact`. Its zones' boxes are bounded to ±96 beyond the board, so a zone can cover every cell.
- `board()` (`render.gno:422-432`) calls `z.Contains` on every cell of every zone's box. That is a value-receiver copy of the whole `Zone` each time, then `inPoly` over up to 64 edges.
- 8 full-board polygons × 4,608 cells × 64 edges is about 2.4M edge tests, and that is **29.3B** of the 29.7B.
- Clamping the loop starts to the board saves only 1.9B (27.4B).
- Real holes render at 174–245M, so the ceiling sits 12× beyond them, and a single hostile hole is 120× over them.

**Impact**
- `Render(<id>)` and `Render(<id>/<addr>)` of that hole run out of query gas: gnoweb shows an error.
- It is listed on the hub (up to 3 per author).
- Each request burns ~0.5–1 s of a node that serves queries one at a time (`gno2-system.md` finding 7).
- Other holes and every JSON read are unaffected: `State` of the same hole is 237M.

**Fix, before deploy (render.gno is frozen with golf):**
- Rasterise a polygon zone by scanline: for each row, intersect the row's centre line with the edges, sort the crossings, and fill between pairs. That is O(rows × edges): 8 × 48 × 64 ≈ 25k edge ops instead of 2.4M.
- Clamp the x and y loops to `[0, bw) × [0, bh)`.
- Test a cell through a pointer (`z := &f.Zones[i]`), not by copying the `Zone`.
- As a backstop, count `cells × edges + Σ wall length` before drawing, and above a bound (for example 2M) print "this hole is too detailed to draw here; play it in 3D", instead of running out of gas.
- Add the hostile hole to the golf tests with an upper bound on `Render` gas.

**Effort:** S.

### 2. Per-version trees on avl make every official finish cost 7.4–9.7 KB (0.74–0.97 GNOT) (high, scale and cost)

**Evidence:** the storage table above.
- 10k players × 20 holes is **1.5 GB and ~150k GNOT** of deposits.
- A player who finishes the course in one mode locks ~55 GNOT: 5.5 days of faucet.
- On bptree the same is 3.4 KB per (player, hole): 0.70 GB, ~25 GNOT for a full course.

**Fix, before deploy (the entry layout is frozen):**
- Use `bptree.NewBPTree32()` for `rounds`, `bests` and `board` of **official** versions.
- Community versions can keep avl: most have a handful of players, and bptree only pays off from ~3.
- Both trees have the same `Iterate`, `IterateByOffset` and `Get`/`Set`/`Remove`, and a scratch swap passed with no other change. `page()` then only needs `bpWalk`.
- bptree forbids writes to the tree it is iterating. `drain` iterates `bests` and writes only `totals` and `ranks`, so it is safe; keep it that way.
- The first finisher on a new version then pays ~11.7 KB extra for the first leaves (1.2 GNOT). Say so in the README, or accept it as the price of a new version.
- **Also:** document the per-finish deposit for players, and in the client: "a first finish locks about 0.6 GNOT; Reset gives back your round's share".

**Effort:** S (the swap, and re-recording the storage filetests `z_storage_*`).

### 3. The drain pushes its gas onto every finisher, and Publish can reach ~1.8B at 10k players (medium)

**Evidence**
- Every holed stroke on **any** hole runs `drain(finishBatch=16)` (`golf.gno:772`).
- Measured compute is 0.43M per drained player; with store I/O that is an estimated 2–4M on chain. That comes to **+32–64M on a 55M finish**, +60 to +115%, paid by players who never played the archived hole.
- `Publish` runs `drain(retireBatch=400)`: 0.8–1.6B on top of its ~0.2B once the old version has ≥400 players. That is under the 3e9 block, but at the edge of Adena's 2e9 simulate cap, and grows with depth.
- A season reset (74 new versions) with 10k players archives ~1.3M rows: ~2.6–5.2e12 gas, which is **900–1,700 full pearl blocks**. That means ~80k finishes to converge, or ~3,300 `Drain(400)` txs (~5–10k GNOT in fees at the suggested 2 ugnot per 1k gas).

**Fix, before deploy (constants are the ABI):**
- Drain only on finishes of official holes, not community ones: `if e.official { drain(finishBatch) }`.
- Lower `finishBatch` to 4.
- Lower `retireBatch` to 150, so that a Publish stays under ~0.8B at depth.
- Make the owner's playbook crank `Drain(400)` right after each Publish until it returns 0. A season reset is then an owner-paid, measurable operation.
- Re-measure the per-row gas on a pearl-matched node (rehearsal), and refit the batches.

**Effort:** S.

### 4. The deposit freed by a drain is refunded to whoever drains, not to the players who paid it (medium)

**Evidence**
- On pearl the refund receiver is the tx caller, because ugnot is unrestricted.
- `setRow` removes a player's `totals` row and `ranks` key when their holes reach 0 (`golf.gno:272-274`). That is ~2.3 KB per player per mode, measured −109 KB for 50 players.
- So the owner's Publish, the next finishers and anyone calling `Drain` collect other players' deposits.
- A season reset at 10k players (2 modes) would hand ~4,400 GNOT of players' deposits to the drainers.
- `final-golf-security.md` calls these amounts "tiny". They are tiny per call, not in total.

**Fix:**
- Keep the row at 0 holes: drop the `totals[m].Remove` in `setRow`, and only drop the `ranks` key. The deposit then stays locked for its owner, and the only refunds left are Reset's (to the player themselves).
- Or accept it and state it in `noAdmin()` and the README ("storage freed by the drain is refunded to whoever runs it").

**Effort:** S.

### 5. Holes() and the hub fill with archived versions before any community hole (low to medium, visibility)

**Evidence**
- `listed()` (`state.gno:305-356`) lists the 74 current holes, then **every** archived official version in key order (oldest first), then community.
- With 50 versions of one slot, 49 archived entries plus 74 current go over `maxListed = 120`. From then on no community hole is listed in `Holes()` or on the hub, however many there are (1k), and only `Community()` reaches them.
- The gas stays bounded (~140M).

**Fix:**
- Cap the archived rows (for example the newest 20, from a `ReverseIterate`), and reserve at least 20 rows for community holes.
- Or list archived versions only on each slot's `/data` page.

**Effort:** S.

### 6. Unbounded but self-paid growth (low; document)

Everything below grows without a bound, and each is paid by whoever adds it. No non-owner user can grow another user's deposit.
- one round per (player, version), kept until Reset;
- bests and boards per (player, version, mode);
- `totals` and `ranks` per player;
- community entries and data (anyone);
- versions (owner);
- the `fresh` tree of an archived hole;
- one wear blob per version played.

The small cross-subsidies found are:
- the first stroke on a version pays its wear blob (~0.6 KB);
- the first finisher pays its trees' first nodes (~7 KB on avl, ~19 KB on bptree);
- whoever triggers a bptree leaf split pays the new leaf, which is random and fair on average.

`archiving` only grows if the owner publishes faster than the drain.

### 7. The large but legitimate transactions (low; for the rehearsal)

- `PlayRoundAt` at the work budget: ≤ ~1.7B, over half a pearl block. The heaviest real commit is 437M (`gno2-system.md`).
- `PublishMine` at the format limits: ~0.85B (compute).
- `Publish` + drain: see risk 3.
- All are under 3e9. Re-measure them on a pearl-matched node before relying on `workBudget` (the toolchain caveat).

### Note: Leaderboard's skip over deleted names is unbounded (low)

`eachRanked` (`state.gno:600-612`) skips a deleted name without counting it. If GovDAO deletes many ranked names, the top ten walks them all. Only governance can trigger it. A cap such as `skipped < 100` bounds it.

## What holds

- The global indexes are bptree, and a bptree Get loads one value, never its neighbours.
- `Rank` is O(log²N) through `sizes`.
- Every list is capped: 120 rows, 24 rounds, 100 per page, 50 friends, 100 versions.
- `Holes` and the hub decode nothing.
- The decode per call (72M at the limits) and the estimator keep every write under the block.
- A replay is storage-free.
- The wear blob is the right size and shape.
- No path lets a user raise another user's deposit.
