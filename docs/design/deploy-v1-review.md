# Deploy v1: counter-review (2026-09-25)

Independent check of `deploy-v1.md` against the code, before implementation. No repo code was edited. Evidence comes from reading the code, from scratch experiments (a copy of `gno.land/` in the scratchpad, since deleted), and from `gno_run`/`gno_call` simulations on the local gnogolf chain.

**Verdict.**
- The core idea holds. A prototype GG1 codec round-trips all 74 holes bit for bit (every field, `prep` included), and three decoded holes give the same fingerprint as the originals.
- Two numbers the design leans on are wrong:
  - the per-call gas of a data hole is about 10× the estimate;
  - bptree has a large fixed cost per tree.
- There are also real zero-regression gaps: hole10/16 have no Order, the tests' owner is the empty address, and the client decor is keyed by the hole id.

## Scratch experiments run

| # | Experiment | Result |
|---|---|---|
| E1 | Prototype `Encode`/`Decode` (GG1 minus the style runs) + `physics.PrepareWith`/`Lengths` + a bit-exact structural `Diff`, run as a test in each of the 74 hole packages | 74/74: no diff, `Encode(Decode(s)) == s`, `prep` bits equal to `Prepare`'s |
| E2 | `fingerprint.Of(me)` vs `fingerprint.Of(Decode(Encode(me)))` on hole4 (timed walls), town18 (2 pulses, timing up to 24), island6 (poly Outside, Shelter) | identical: `e9f1e965…`, `f9d3bc11…`, `0ac84242…` |
| E3 | Gas per test (`gno test -v`) | see claim 6 |
| E4 | `unsafe.OriginCaller()`/`CurrentRealm()` at init, in tests, and from an `init(cur realm)` that crosses into another realm | see claim 5 |
| E5 | Filetest `// Storage:` deltas: a string, avl vs bptree entries, an entry holding 3 KB | see claim 6 |
| E6 | `gno_run` simulate on gnogolf: `Round` vs `State` vs `State`×2 on hole4 | about 15M to load a realm hole |

## 1. Every hole is pure data after Fit: CONFIRMED

- All 74 files are `var me = course.Fit(&course.Simple{…}, 1.5)`. A grep for `func (`, `type`, `func init` and methods finds none in any hole.
- The package-level vars and consts (`hole4` `doors`/`Turn`/`sail`, `hole12 back`, `hole18 line`, `hole19 c`, `hole20 bank`, the islands' `lane`, `town10 canal`, `town18 plaza`, `mountain10 gustEvery`) are builder inputs, consumed before or by `Fit`.
- `hole4.Turn` is exported but used nowhere else. The only other reference to hole4 is `scripts/register-garden.gno`.
- No Timed or Weatherable implementation exists beyond `course.Simple`. There are no closures in state, no Shelter or Extras logic of their own, and no field computed at play time.
- Counts match §1: 1,896 walls (max 48, mountain7), 111 posts, 139 zones, 301 polygon points, pulses on 11 holes, Shelter on 5, Tick 0 everywhere. After Fit the largest board is 90×47, inside 1..96.
- **Nothing is lost in the encoding, with one exception that is not code: hole10 and hole16.**
  - Both are `World: "extras"` with **no `Order`**.
  - Today `Register` gives them order `holeNo(id)` (10 and 16), from the package path.
  - A data version has no path number, and `holeNo("extras/10/v1")` returns **1**, the version's digit.
  - So under the design's rules ("the slot must equal World/Order", "a slot only if Order > 0"), these two holes get no slot, or the wrong one. See change D1.

## 2. Bit-identical decode: CONFIRMED (E1, E2), with two caveats

- **Fields.**
  - `Simple`: W, H, Title, Strokes, Tee, Pin, Course, Pulses, Substeps, CupRadius, World, Order, Shelter, plus the `Marks` wear, which is fresh.
  - `Field`: Walls, Posts, Zones, Friction, Bounce, Radius, Tick, and `prep`, rebuilt.
  - `Wall`: Seg, Bounce, Mark, Skin, Every/On/Phase. `Post`: C, R, Bounce, Mark, Skin.
  - `Zone`: Kind, Min/Max/Vec, Scale, Mark, Skin, Round/Outside/Air/Capped, Poly, Every/On/Phase. `Pulse`: Every/On/Offset plus its pieces.
  - The GG1 layout in §3.2 names every one of these. Slice order is kept.
- **nil vs empty slices: harmless.**
  - Physics, course and golf only use `len` and `range` on hole data. The only nil checks are on `Shot.Cause`, which is not hole data, and `e.board`.
  - The decoder yields empty non-nil slices where the source has nil (for example hole4's Posts). The fingerprints and `Diff` are unchanged.
- **Types.** Mark is a rune (int32), so i32 is exact. Substeps u16, W/H u16 and Strokes u8 are enough (`ParOf` accepts 1..19 anyway). Every current value is inside the frozen limits: max timing 24, max 3 pulses, max 84 polygon points.
- **Caveat A: the proof in §14.1 does not prove the encoding complete.**
  - The fingerprint hashes paths and weather zones only. It never sees wall and post Mark/Skin, Title, World, Order or Strokes, and it sees Shelter only if seed 11's wind exceeds it.
  - `Encode(Decode(Encode(me))) == Encode(me)` is idempotence. An `Encode` that drops a field passes it.
  - Skin also changes physics: `wet()` looks for `Skin == "ice"`, and `dryLand` rejects `Skin != ""`. So a dropped zone skin would move rain play, but only on the holes whose rain seed puts a puddle there.
  - Fix: E1's structural `Diff(me, Decode(Encode(me)))`, which compares floats by bits, strings, runes, ints, bools, poly points, pulse pieces and `prep` bits. Change T1.
- **Caveat B: the slot key.** `strconv.FormatFloat(order,'g',-1,64)` is exact for today's integers, but gives `"1e+06"` at the ±1e6 bound `Register` allows. A `+` in an id breaks `?hole=`. `playLink`'s `int(e.order)` and the client's `Math.round(h.order)` already assume integers. See D6.

## 3. PrepareWith equality: CONFIRMED, but the per-call check does not guarantee it

- A `linesWith(s, r, o, l, lp, lm)` that keeps `lines()`'s exact expressions (`d.Scale(r/l)`, `{-d.Y/l, d.X/l}`, `Normal`'s `l==0` branch) produced `prep` bits equal to `Prepare`'s on all 74 holes.
- Gno runs each float op as written: nothing is fused or reordered. The rule is to keep the expression tree, not only the inputs.
- `lines()` itself can be left byte-identical and `linesWith` added beside it. That is the safest refactor: realm-hole `prep` can't move.
- **Refuted detail:** the check `l > 0 && |l*l − d·d| ≤ 1e-12·d·d` accepts lengths a few ulps off.
  - `offsets()` rechecks only a wall's end points, never the lengths.
  - So a community hole can play with a `prep` that `Prepare` would never produce. It is deterministic, so it is not a consensus risk, but "a data hole plays like the realm hole" is no longer true for it.
  - Fix: verify once, at `Publish`, by running `Prepare` and comparing bits (reject on mismatch), then trust the lengths at play. It is exact and cheaper per call (D4).

## 4. bptree vs avl: API and order CONFIRMED; storage REFUTED for small trees

- **API.** `p/nt/bptree/v0` `BPTree` has the same `ITree` as avl: single-value `Get`, `Has`, `Set`, `Remove` returning (value, removed), `Size`, `Iterate`, `ReverseIterate`, `IterateByOffset`, and `GetByIndex`.
- **Bounds.** Iterate is [start, end) and ReverseIterate is [start, end], the same as avl's `TraverseInRange`. `""` means unbounded. `IterateByOffset` clamps a negative offset and returns false when `offset ≥ size`, the same as avl.
- **Pearl.** `tree.gno`/`node.gno` are identical at `c4c72fd` and HEAD. Only the subpackages moved (`v0/list` → `list/v0`, and likewise pager and rotree), so don't import them.
- **Every Iterate in golf, and whether it mutates:**

  | Call site | Tree iterated | Mutates the tree it iterates? |
  |---|---|---|
  | `drain` | `e.bests[m]` | no: `setRow` changes `totals`/`ranks` |
  | `Leaderboard`, `renderHub` | `ranks[m]` | read only |
  | `HoleLeaderboard` | `board.IterateByOffset` | read only |
  | `page()` | bests, totals, rounds | read only |
  | `eachRound` | rounds | read only |
  | `listed()` | `holes`, three ranges | read only |

  No callback changes the tree it walks.
- bptree does not detect mutation during iteration (it is undefined behaviour, not a panic), so keep it that way and say so in a comment.
- **Storage (E5)** refutes "660 B per entry". The zero-value tree allocates a fanout-32 leaf (`make(…, 0, 32)` twice).

  | Tree | First entry | Each further entry |
  |---|---|---|
  | avl | 1,047 B | +2,035 B |
  | bptree (fanout 32) | **4,927 B** | +433 B |

  - bptree only wins from about 4 entries.
  - Each hole version has 5 lazy trees (rounds, bests×2, board×2). On a hole's first named finish they cost about 20 KB with bptree against about 5 KB with avl.
  - The design's "first finish 12.5 KB → 5 KB" is wrong for the players who reach a hole first. See D5.

## 5. OriginCaller at init and in tests: CONFIRMED on chain, REFUTED for tests

- `chain/runtime/unsafe` `OriginCaller`/`CurrentRealm`/`PreviousRealm` are byte-identical between `c4c72fd` and local HEAD (`unsafe.gno`; `X_originCaller` reads `execctx.OriginCaller`). At addpkg, init sees the signer.
- **E4 (local toolchain, whose `gnovm/pkg/test` is identical to `c4c72fd`):**
  - in `gno test`, `OriginCaller()` at init is **`""`**, whether the package is the one under test or an import (`test.go`: `Context("", …)`, "The caller should be empty for package initialization");
  - during the test it stays `""` until `testing.SetOriginCaller`, and `testing.SetRealm(NewCodeRealm(…))` does not change it.
- **Consequences:**
  - the golf tests' `owner` is the empty address;
  - every fixture registered without `SetOriginCaller` counts as registered "by the owner" (`"" == ""`), so the goldens' `"official":true` stays as it is, by accident;
  - any test that sets an origin makes its fixtures non-official.
- Rule to add: authority requires `owner != ""`, and golf's own tests set the unexported `owner` explicitly (D2).
- **`init(cur realm)` works (E4).** A realm whose `init(cur realm)` calls `own.Register(cross(cur), …)` reaches Register with `cur.Previous().PkgPath()` = that realm and origin = the signer. So "holes register from init" (§11 N4) is feasible. The comments in hole1.gno and `scripts/register-*.gno` saying "a hole cannot register from init()" are stale.
- **Publish must not authenticate with OriginCaller.** Use `cur.Previous().IsUserCall()` (or `IsUser`, to allow MsgRun) and `cur.Previous().Address() == owner`. With OriginCaller, any realm the owner calls could publish in their name, the tx.origin class that `unsafe.gno` warns about. OriginCaller stays fine for realm-hole Register, where the hole is the previous realm and the namespace check already applies.
- **Sessions: unclear.** `GetSessionInfo` implies the caller is the master address and `pubKeyAddr` is the session key. Phase 0 must check what `cur.Previous().Address()` is for a session MsgCall on pearl.

## 6. Cost model: storage roughly CONFIRMED, gas REFUTED

| Item | Design | Measured |
|---|---|---|
| String storage | ~1 B/B | 3,000 B string → 3,038 B (a 10 B one → 44 B). Confirmed |
| Entry holding 3 KB of data | ~3.3 KB entry + index | ~3.8 KB struct + string, plus the tree entry (433 B, or 4.9 KB for a tree's first). Confirmed within ±30% |
| All-74 data size | ~145 KB with style runs | 188 KB without style runs (≈100 B/wall). ~145 KB with runs is plausible |
| `Prepare`, hole4 (30 walls) | "23M on 48 walls" | **19.2M on 30 walls** (≈640K/wall, so ~30M on 48) |
| `PrepareWith` | ~0.15M | **5.4M on 30 walls** (≈180K/wall) |
| Decode | ~1–1.5M | naive prototype 4.5–27.7M (mean 16.5M, max mountain7), `PrepareWith` included. One unrolled `Float64frombits` read costs **12.4K gas**, so hole4's ~360 floats need ≥4.5M before any allocation |
| Realm-hole load | 10–14M on 48 walls | **~15M on hole4 (30 walls)** (E6: `State`−`Round` = 47.0M, `State`×2−`State` = 31.6M) |
| Data hole, total per call | **1.5–2M** | **realistic 10–20M** with a tuned decoder. That is about parity with a realm hole, not 5× cheaper |

- The deposit saving (~58 vs ~790 GNOT) still stands. The per-call gas "saving" does not.
- The §14.4 gate ("gas ≤ 110% of the realm hole's") is at risk on the heaviest holes. Budget the decode explicitly in `workBudget`'s slack: about 20–30M of the 0.6e9 reserve. It fits.
- Keep the stored lengths: `Prepare` minus `PrepareWith` saves about 14M per call on 30 walls. The §7 "drop them if <5%" gate would not trigger.
- The pearl storage price (the ugnot per byte behind "0.58 GNOT for 5.8 KB") was not verified here. Read the vm params in Phase 0.

## 7. Client impact: the design's list is INCOMPLETE; the ids break saved cards and the decor

Beyond §12:
- **Saved scorecards.**
  - `web/lib/card.js:8,31,54`: `gnogolf.card = {[hole.id]: strokes}`, keyed by pkgpath. New ids leave every card empty.
  - Unlocks and cup progress come from `cupTotals(card)` (`card.js:87–96`), so they reset too.
  - `gnogolf.earned` (gnomes already earned) is id-free and survives.
- **Links dropped.**
  - `Golf.jsx:34,667` accepts `?hole=` only when it matches `/^gno\.land\//`, so `?hole=garden/7/v1`, community ids and archived ids are dropped. Engine `linked()` never sees them.
  - `chain.js:172,175`: `roundURL`/`sourceURL` require the `PKG` regex (`:286`) and return `#`.
- **Silent visual regression.** The scene decor is keyed by `s.hole`:
  - `camera.js:38` `timeOf` reads the trailing digits, so `…/v1` → 1 and every hole turns "day";
  - `garden.js:53` `THEME` is keyed by the last segment (`hole5`…);
  - `garden.js:851` builds the signpost from all digits;
  - `island.js:2178` and `town.js:922,1716` match on names;
  - every `seeded("…"+s.hole)` re-randomizes the decor, and would again on each version bump.
- **Hardcoded paths.** `chain.js:7` `REALM`, `Golf.jsx:1084` the text-play link, and in golf itself 9 `/r/gnogolf/golf` strings (Launch, Render, noAdmin) plus `playURL`.
- **Cache.** `chain.js:180` keys the sessionStorage holes cache by RPC only. Add the realm to the key.
- **Scripts.**
  - `botcheck.mjs:38,136` filters with `startsWith("gno.land/r/gnogolf/")`, so it would silently flag nobody. Use `official && !next`. Its selftest (`:184`) and `hole-bests.json` are keyed by pkgpath.
  - `media/camera/camsuite.mjs:10,90,100,128`, `pulltest.mjs:7,15`, `farshot`, `flighttest`, `glidestrip`, `soundtest`, `pressshot`, `perf/pass2/{bench,trace}` and `lib/cdp.mjs:77` all build `?hole=gno.land/r/gnogolf/<name>`.
- **Safe:**
  - `flags.json` is keyed by address;
  - `?cup=&hole=N` works, including `extras`, which the world screen never shows (`Worlds.jsx:11`);
  - `engine.js:1011` `byNumber` still reads 10 and 16 from `extras/10/v1`, but only by luck.
- **Proposed migration.**
  1. Generate one table from `data/holes.txt`: `legacyId → slot` (e.g. `gno.land/r/gnogolf/hole19 → garden/17`, `…/hole10 → extras/10`). Ship it in the client and use it for:
     - the media scripts, `hole-bests.json` and botcheck;
     - the decor key: the scene gets `legacyId` whenever a slot maps to one, so the lighting, themes and seeds stay byte for byte as they are, and only new holes use their slot.
  2. Key `gnogolf.card` by **slot**, with a one-time pass guarded by `gnogolf.card.v = 2`:
     - rewrite each legacy key through the table;
     - keep the lower score on a collision;
     - keep unmapped keys (community) under their old id.
  3. Accept `?hole=` for `slot`, `slot/vN` and `<addr>/<slug>[/vN]`, with the new id regex from §12. Keep `?cup=&hole=` as the canonical share link.

  A version bump then keeps the player's card best, on purpose: it is a personal record, not the chain's. If a reset is wanted, store `{s, v}` and ignore it when `v` differs.

## 8. Missing from the phase plan or the proof

1. **hole10 and hole16 (D1).** See claim 1. The rest of §4 assumes every official hole has an Order.
2. **The empty owner in tests (D2).** See claim 5.
3. **Publish authentication (D3).** Use `cur.Previous()`, never OriginCaller.
4. **Gas.** Replace §3.6 with the measured numbers. The §14.4 gas gate needs a tuned decoder:
   - unrolled reads;
   - one allocation per slice;
   - no per-byte method calls;
   - the lengths stay exact f64 (no compression).
5. **bptree fixed cost (D5).** Use `NewBPTreeN(8)`, or keep avl for the per-version trees (rounds, bests, board) and bptree for the global ones (holes, slots, aliases, totals, ranks). Measure both in Phase 0.
6. **Replacing `e.h` is the biggest diff and the main persistence risk.**
   - Every site has to move to an explicit `h`: `State`, `Render`/`board`/`legend`, `weatherOf`, `newWork`, `roundOf` (Start), `Launch` (Cup), `lastShot`, `Extras`.
   - `dataHole` must override `PlayWith` to mark the entry's wear. `Simple.Play`/`PlayAt` dispatch to `Simple.PlayWith`, not to the wrapper, so only the `PlayWith` path marks the right wear.
   - Test both (T4, T5).
7. **Weather follows the id.** The goldens' forecast and State columns and `periodOf` depend on `gno.land/r/gnogolf/gold_*`. The parity test in §14.3 must inject the same weather zones, and compare State with `hole`, `official`, `order` and `weather` removed. The fixtures also have no Order today: their order is `holeNo` = 2^20.
8. **Order domain (D6).** Integers 1..999 for official data holes. Format the slot with `strconv.Itoa`.
9. **Stale comments** in hole sources and `register-*.gno` about init. Fix them when the sources lose `Register`.
10. **Hex argument.** Measure the gas of `encoding/hex` decoding for a ~8.5 KB arg, plus the verify-at-publish of D4 (≈ Decode + `Prepare` ≈ 40–60M per Publish). It is still far under the limits.

## Required design changes

- **D1.** Add `Order: 10` to hole10 and `Order: 16` to hole16. Order is not hashed, so no fingerprint moves (`Of` never reads it). `Publish` rejects `Order <= 0`, and never falls back to `holeNo` of a data id.
- **D2.** `owner` is valid only if non-empty; every owner check is `owner != "" && …`. Golf tests assign `owner` directly. Document that `gno test` runs init with origin `""`.
- **D3.** `Publish`, `Transfer`, `Accept` and `Renounce` authenticate with `cur.Previous()` (user call, address == owner). OriginCaller only in the realm-hole Register rule.
- **D4.** Drop the per-call tolerance check. `Publish` runs `Prepare` on the decoded field and requires bit equality with the `PrepareWith` result; play uses `PrepareWith` unchecked. Keep `lines()` untouched and add `linesWith` beside it.
- **D5.** Revise §8 with E5's numbers and pick a fanout or tree type per tree.
- **D6.** Official Order is an integer in 1..999, and the slot key uses `strconv.Itoa`.
- **D7.** Rewrite §3.6 and the §10.4 fee estimate with the measured gas. The per-call benefit is storage, not gas.
- **D8.** Add to §12:
  - `card.js` migration;
  - the `Golf.jsx:34/667` regex;
  - the scene decor key (`legacyId`);
  - the sessionStorage key;
  - botcheck's `OFFICIAL`;
  - the media scripts;
  - golf's 9 hardcoded paths.

## Extra tests to add

- **T1.** `fingerprint.Check` also requires `course.Diff(me, Decode(Encode(me))) == ""`: a bit-exact structural compare including `prep`, as E1 prototyped. It passed on all 74 holes.
- **T2.** `TestPrepareWithIsPrepare`: every hole, plus 10K random segments at radius 0, 0.5 and 1e-3, zero-length and axis-aligned walls, and −0 coordinates.
- **T3.** Hostile Decode:
  - truncation at every byte offset;
  - a length off by 1 ulp (Publish must reject it, D4);
  - NaN/Inf in each float slot;
  - an out-of-range skin index;
  - kind 5, and a board of 0 or 97;
  - 513 walls, and a poly of 257 points.
- **T4.** Wear: play a data hole twice and check that the entry's wear counts 2 and that no `*course.Simple` is reachable from realm state (a filetest with `// Storage:` bounding the delta).
- **T5.** `e.h` grep gate: no `entry.h` field on data entries, with a test that calls `State`, `Render`, `Launch`, `Extras`, `Round` and `SimulateFrom` on a data hole.
- **T6.** Authority:
  - `Publish` from a non-owner, from a realm the owner calls, and with owner `""`;
  - a realm hole under `nsPrefix` registered with a foreign origin is not official;
  - hole10 and hole16 land in `extras/10` and `extras/16`.
- **T7.** bptree parity: for each golf tree, the same random Set/Remove script on avl and on bptree yields identical `Iterate`, `IterateByOffset` and `page()` output.
- **T8.** Client:
  - the card migration unit test (legacy keys → slots, collisions);
  - the decor-key test: `timeOf`/`THEME`/`seeded` get the same input for every legacy hole;
  - `?hole=` parsing of the new ids;
  - `botcheck --selftest` against a data-hole chain.
- **T9.** Phase 0 on pearl:
  - storage price;
  - `cur.Previous().Address()` under a session;
  - gnoweb `golf:garden/7/v2`;
  - the gas of a hex Publish.
