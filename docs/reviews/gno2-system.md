# Gno system design and scalability review, after the fixes (2026-09-25)

Scope: `p/gnogolf/physics`, `p/gnogolf/course`, `r/gnogolf/golf` and the 74 hole realms, as they stand after `fix-hub.md` and `fix-physics.md`. The questions are how the game scales, how it can be upgraded, what it depends on across realms, and how it gets onto pearl. This is a review only. No code was edited and nothing was committed.

## How it was measured

- **Local chain.** gnomcp profile `gnogolf` (gnodev on :26757, chain `test-gnogolf`), with the 74 holes registered.
  - Writes were measured with `gno_call simulate=true`.
  - Reads were measured with `gno_run simulate=true` scripts that call the read and print its length. The figures are whole-script totals, script cost included: an empty MsgRun is 0.66M, and one that imports golf and calls `Period()` is 19.3M. Subtract about 19M for the read alone.
  - Deploy sizes were measured with `gno_addpkg simulate=true`. gnomcp caps the deposit at 10 GNOT, so an over-cap deploy is refused with its exact byte count: `requires X ugnot for Y bytes`. To read the size of a small package, I added a 100,000-byte string (`var pad = strings.Repeat("x", 100000)`) to push it over the cap, then subtracted the pad. The pad and probe base alone came to 101,554 B.
- **Pearl.** Profile `testnet` (chain `pearl-1`, height 692,938). Reads only: `gno_read`, `gno_eval`, `gno_render`, `gno_packages` and `gno_cla_info`. No key was generated and nothing was sent.
- **The storage price.** The chain did not expose it as a param read. Every deposit error gave exactly 100 ugnot/B, for example `requires 12218900ugnot for 122189 bytes`. `networks.md` gives the same value for pearl.
- **Gas and time.** tm2 prices storage as 1 gas ≈ 1 ns: `ReadCostFlat = 59_000 // ~59µs per random read` (`tm2/pkg/store/types/gas.go:404`). `deep-robustness-scale.md` measured 885M gas at 0.5 to 0.6 s. I use 0.6 to 1 ms per 1M gas.
- **Churn on the local chain.** Another agent restarted gnodev during the review (height 1,918, then 2). The numbers before and after the restart agree.
- **Toolchain caveat (finding 3).** gnodev here runs `~/Server/gnoland/gno` at `9951541d9`. That is 63 commits ahead of pearl's `chain/pearl` tag (`c4c72fd`), and some of those commits change gas metering. Treat every gas figure below as local until it is rerun on a pearl-matched node.

## Findings, ranked by impact

Effort: S is under an hour, M is up to a day, L is several days.

### 1. The `gnogolf` namespace cannot be obtained on pearl (deploy blocker, critical)

**Evidence**
- `gno_eval gno.land/r/sys/names IsEnabled()` on `testnet` gives `true`, so namespaces are enforced.
- `gno_eval gno.land/r/sys/namereg/v1 ValidateNymFormat("gnogolf")` gives `namereg: name must match nym-[a-z]{5,13}\d{3}`.
- `ValidateNymFormat("nym-gnogolf123")` gives `stem starts with a reserved prefix (gl/g1/gno/atom/atone/photon/cosmos)`.
- `ValidateNymFormat("nym-minigolf123")` gives `undefined` (valid).
- `users IsNameTaken("gnogolf")` gives `false`.
- `gno_render namereg/v1` says: "Vanity names outside this format may be allocated by GovDAO governance through `ProposeNewName`".

**Why it matters**
- No self-service name can own `gno.land/{r,p}/gnogolf/*`, and the `nym-` form cannot even contain "gno".
- The path is frozen into the code:
  - `officialPrefix = "gno.land/r/gnogolf/"` and `officialEnd` (`golf.gno:605-608`);
  - every hole's import of `gno.land/r/gnogolf/golf`, `p/gnogolf/course` and `p/gnogolf/physics`;
  - the client.
- If the course is deployed anywhere else as it stands, `official()` is false for every hole: no cups and no ranking (fix-hub C4).

**Fix, one of:**
- (a) **A GovDAO grant.** A `ProposeRegisterUser("gnogolf", <deployer>)` or `namereg ProposeNewName` proposal, before any deploy. Pearl has one T1 member (aeddi, per `misc/deployments/pearl.gno.land/README.md`), so it is one person's vote.
- (b) **Move to a `nym-<stem>000` namespace.** Change `officialPrefix` and `officialEnd` and the 77 import paths, then re-record the goldens (the forecast hashes `id`).

**Effort:** (a) S of work, but its timeline depends on governance. (b) M.

### 2. The deploy locks about 700 GNOT, almost all of it hole geometry (deploy blocker, critical)

**Evidence, from `gno_addpkg simulate` on `gnogolf`:**

| package deployed (copy at a new path) | walls/posts/zones | bytes | deposit |
|---|---|---|---|
| hole1 → `r/gnogolf/hole1b` | 40/1/0 | **122,189** | 12.2 GNOT: refused at gnomcp's 10 GNOT cap |
| town14 → `r/gnogolf/town14b` | 44/3/1 | **138,106** | 13.8 GNOT: refused |
| island6 → `r/gnogolf/island6b` | 4/0/1 (poly) | about 41,700 (with the pad: 141,720) | 4.2 GNOT. Gas 43.1M |
| probe: hole1's lane as `[]physics.Wall`, no Prepare | 36 walls | about 67,000 | **1.86 KB per wall** |
| the same field, after `physics.Prepare` | 36 walls | +34,000 | **0.95 KB per wall** of `prep` |
| the same coordinates as a flat `[]float64` (145 floats) | — | about 6,900 | 47 B per float, **188 B per wall** |
| `vec2.gno` + `shapes.gno` as a package (4,764 B of source) | — | about 5,600 | code is stored at about 1.1× its source |

**Model.** A hole costs about 8 KB plus 2.8 KB per wall plus about 1.5 KB per post or zone. This matches hole1 to 0.6% and town14 to 0.7%. Over the 74 holes (1,896 walls, 111 posts, 138 zones, from `deep-perf-gno.md`) that is **6.3 to 7.0 MB, or 630 to 700 GNOT**. Add:
- code: 144 KB of production source, about 15 GNOT (physics 46 KB, course 27 KB, golf 71 KB), plus 124 KB of hole source;
- `Register`: 8.6 KB per hole in golf (fix-hub), about 63 GNOT;
- the test files, if shipped: about 104 KB, about 10 GNOT (finding 13).

**Why it matters**
- The pearl faucet grants 10 GNOT per address per 24 h (`gno_status testnet`: `grant_ugnot 10000000, per_address max 1, window 86400`). That is about 75 address-days of faucet.
- **24 holes** go over gnomcp's `gno_addpkg` cap of 10 GNOT, so they can only be deployed with the author's own gnokey and `-max-deposit`.
- The cause is gno's per-object overhead:
  - a `Wall` is 4 objects (`Wall` → `Segment` → 2 × `Vec2`) at about 1.9 KB;
  - each float in `prep []float64` is about 41 B.

**Fix, before deploy (`Field` is frozen after it):**
- (a) Store `prep` packed as a string (8 B per float, decoded per shot): 0.95 → about 0.2 KB per wall, **−140 GNOT**.
- (b) Flatten `Wall` to scalar fields (`Ax, Ay, Bx, By` and the rest, one object). My estimate is about 0.5 KB per wall, **−250 GNOT**. It touches `Seg` users in physics, course, golf/render and the helpers, but no hole literal, since holes build walls through `Walls/Bar/Box/Lane`.
- (c) Ask the pearl faucet operators for a grant for the rest.
- Not recommended: building the geometry in code on each call. `course.Fit` of town14 costs **50M gas per build** (`gno_run`, 10 builds = 510M), paid on every shot and read.

**Effort:** (a) M, (b) M, (c) S.

### 3. The local toolchain is 63 commits ahead of pearl, including gas changes (critical for every number here)

**Evidence**
- `git log c4c72fd..HEAD` in `~/Server/gnoland/gno` shows 63 commits. The 14 commits on the pearl side are deployment config only.
- The local-only commits include:
  - `#6171 native gas metering, package-hash binding and authority APIs`;
  - `#6164 gas accounting`;
  - `#5217 meter gas correctly for switch case`;
  - `#6082 bounded-parallel queries`;
  - `#6193 cur fixed binding`.
- The stdlib APIs golf uses are unchanged between the two: `git diff c4c72fd HEAD -- gnovm/stdlibs/chain/...` shows only an internal `IsErrorType` signature.

**Why it matters**
- `workBudget` and its constants (`golf.gno:461-467`) were fitted on this toolchain's gas schedule.
- The query concurrency assumed in `deep-robustness-scale.md` finding 1 comes from #6082, which pearl does not have (finding 7).

**Fix:**
- Build `gno` and gnodev at `c4c72fd`, rerun `gno test ./gno.land/...` and the fix-hub work-fit measurement, and repeat the scaling table below.
- If pearl meters more, refit `workPer*` (the code's `ponytail:` note says so).

**Effort:** S to M.

### 4. A golf/v2 cannot adopt the 74 holes, and copying the records is out of reach (upgradability, high)

**Evidence**
- `Register` takes the hole from its caller (`golf.gno:223-224`: `id := cur.Previous().PkgPath()`).
- Every hole's only entry point is `func Register(cur realm) { golf.Register(cross(cur), me) }`, hard-wired to golf v1 (for example hole1.gno). `me` is unexported.
- `gno_read gno.land/r/gnogolf/hole1` shows the only export is `Register`.
- `golf` exposes the `course.Hole` of no entry.

**Why it matters**
- A golf/v2 cannot obtain any hole value, so moving the hub means redeploying all 74 holes (finding 2's 650 GNOT again). The v2 holes then start on fresh boards.
- The paged reads (`Records`, `Players`, `Rounds`, fix-hub C6) are enough for an indexer, not for an on-chain copy:
  - 100K players × 10 holes × 2 modes is about 1 to 2M bests;
  - at about 10M gas and 2 to 4 KB each, that is about 1e13 gas (over 3,000 full blocks) and about 400K GNOT of deposit;
  - v2 would also have to parse v1's JSON strings in gno.
- `bestBy` and first-to-reach order are not exposed at all. The wear lives in the holes.

**Fix, before deploy:**
- Each hole adds `func Course() course.Hole { return me }`. It is a generated one-liner. The only exposure is cosmetic wear, since anyone could then call `Play`.
- Or golf adds `func HoleOf(id string) course.Hole`, authenticated by v1's registry.
- Add typed getters beside the JSON, for example `BestOf(hole, mode string, p address) int`, so a v2 can **read through** v1 lazily (`best = min(v1, v2)`) instead of copying.
- README "Updating after the deploy" should say that v2 is a read-through, not a migration.

**Effort:** S.

### 5. Every tree entry costs about 2 KB, so a (player, hole) costs 6.6 KB, or 0.66 GNOT (scale and deposit, high)

**Evidence (`gno_addpkg simulate` probes of 100 entries):**

| tree | bytes per entry |
|---|---|
| `avl.Tree` with `"003/<addr>" → addr` (a board) | **2,117 B** |
| `avl.Tree` with `addr → 3` (bests) | **2,045 B** |
| `bptree.NewBPTree32()` with `addr → 3` | **~660 B** |

- fix-hub measured 12,489 B for a first named finish and about 6.6 KB per further (player, hole): round + best + board entry. That is consistent with three avl entries.
- `p/nt/bptree/v0` is deployed on pearl with the same `ITree` interface, `IterateByOffset` included (`gno_read testnet p/nt/bptree/v0`).

**Why it matters**
- A player who finishes the whole course in one mode locks about 12.5 + 73 × 6.6 ≈ **49 GNOT** (about 33 GNOT after resetting every round). That is 5 days of pearl faucet.
- Realm state is **N × H × 6.6 KB**:

  | players × holes | state |
  |---|---|
  | 10K × 10 | 0.66 GB |
  | 100K × 10 | 6.6 GB |
  | 1M × 10 | 66 GB |

  `deep-robustness-scale.md` §6 put 10K × 10 at 60 to 70 MB: that is 10× too low.

**Fix:** use `bptree` for `rounds`, `bests`, `board`, `totals` and `ranks`. The API is the same (`NewTree` → `NewBPTree32`), and it cuts the per-entry cost about 3×: about 2.2 KB per (player, hole), 0.22 GNOT.

**Effort:** S to M (the swap, plus re-running the storage tests).

### 6. The forecast is recomputed on every read, and dominates rainy previews (scale, high)

**Evidence (on-chain, `gno_run simulate`, period 5967680):**

| read | gas |
|---|---|
| `Weather(island10)` in rain | 157.3M (138M of it the forecast) |
| `Weather(town14)` in wind | 28.5M |
| `SimulateFrom(island10, 4,4, "45,10,0", 2, P)` in rain | **183.3M**: 84% forecast |
| `SimulateFrom(hole16, …, "135,10,0")` | 53.1M |
| `SimulateFrom(mountain11, …, "45,10,0")`: no rain on mountains | 89.3M |
| `State(island10)` in rain | 181.7M |
| `State(town14)` | 67.2M |
| `Render(island10)` in rain | 295.3M |

**Why it matters**
- `wet()` (`course.gno:334-368`) makes up to 60 puddle tries, each testing every wall with `Closest` + `Crosses`. On lane holes every try fails.
- It runs again in State, Round, Simulate*, Render, Weather and every commit.
- In rain it triples a preview's cost, which is the binding limit on concurrent players (finding 7).

**Fix, before deploy (it changes forecasts, and so goldens, which is free now and impossible later):**
- Have `Fit` precompute the hole's dry puddle sites once, as a short list stored in the `Simple`. `wet` then draws from that list in O(1).
- Or cap the tries at about 8.

**Effort:** M.

### 7. Pearl answers queries one at a time per node (scale, high)

**Evidence**
- `git show c4c72fd:tm2/pkg/bft/proxy/client.go`: `queryMtx sync.Mutex // independent mutex for the query connection`. Queries do not block consensus, but they are **serialised with each other**.
- The bounded-parallel query path (#6082) exists only in the local tree.
- Client pacing (`web/lib/engine/aim.js:132`): `PREVIEW_MS = 120, PREVIEW_MAX = 360`, one request in flight, answers cached by shot. On a timed hole the tick is part of the key, so a still hand re-asks as the pieces move.

**Capacity of one pearl RPC node, previews only:**

| hole state | SimulateFrom gas | time per query | previews per second |
|---|---|---|---|
| calm, light | ~53M | 32–53 ms | 19–31 |
| mixed (≈15% of periods rain on garden, island, town) | ~74M avg | 45–74 ms | 13–22 |
| rain on a lane hole | ~183M | 110–183 ms | 5–9 |

An aiming player sends about 2.3 q/s while dragging. At about 40% of their time aiming, that averages about 1 q/s. So **one pearl node serves about 13 to 22 actively playing people on the average mix, and 5 to 9 on a rainy lane hole**. This is shared with gnoweb (a hole page in rain is 295M, about 0.2 to 0.3 s) and every other app on the RPC. A node with #6082 scales that by its cores (about 100 to 175 on 8 cores).

**Fix:**
- Finding 6 alone gives 2.5 to 3.5× in rain.
- Run a dedicated query-node pool for the dapp (`?rpc=`).
- Longer term, port the physics to JS, pinned by the fingerprints, for previews only (`deep-robustness-scale.md` 1d).

**Effort:** M (ops), L (JS port).

### 8. A player who takes a name later never enters a board until they improve (correctness, medium)

**Evidence**
- A board key is set only inside `if v == nil || r.strokes < v.(int)` (`golf.gno:573-591`).
- The ranks key is set only through `improve` → `setRow` (`golf.gno:187-216`).
- `Leaderboard` and `HoleLeaderboard` iterate only `ranks` and `board` (`state.gno:438`, `:480`).
- This contradicts README "Leaderboards" ("Unnamed finishes are still kept, and count as soon as the player takes a name") and the `named` doc ("ranks on their next finish").

**Fix:**
- Add a crossing function `Claim(cur)` that inserts the caller's existing bests into the boards and ranks when named. It is bounded at 74 × 2 keys; on large courses, make it per hole.
- Or insert a missing board key on any finish, improving or not.

**Effort:** S.

### 9. `Holes()` and the hub drop current holes once about 47 holes are archived (medium)

**Evidence**
- `listed()` (`render.gno:639-660`) walks `holes` from `officialPrefix` to `officialEnd` **in key order**, archived official holes included, and stops at `maxListed = 120`.
- 74 current holes plus 47 archived versions is 121. The current holes that sort last (`town…`) fall off `Holes()`, which is the dapp's menu.

**Fix:** walk `slots` (the current official holes) first, then archived, then community.

**Effort:** S.

### 10. Retire has no crank, and converges only as fast as people finish holes (scale, medium)

**Evidence**
- `retire` → `drain(400)`, and each holed stroke → `drain(16)` (`golf.gno:275-318`). Nothing else advances `archiving`.
- A Register with 0 players costs +14.2M. I measured this by deploying island6b with `func init(cur realm) { golf.Register(cross(cur), me) }`: 57.3M, against 43.1M without the init.

**Estimated gas per drained player**, on-chain, avl reads at 59K + 17 B × 2 KB each, path writes of about 52K per node, 0.6M of CPU (fix-hub): about **1.4M at 1K players, 2M at 10K, 3.2M at 100K, 3.8M at 1M**.

| players with a best on the archived hole (both modes) | replacing Register (400 players) | finishes to converge | finish surcharge while draining |
|---|---|---|---|
| 1K (about 1.3K entries) | ~0.6B | 1 + 57 | ~25M |
| 10K (about 13K) | ~0.8B | 1 + 788 | ~32M |
| 100K (about 130K) | ~1.3B | 1 + 8,100 | ~50M |
| 1M (about 1.3M) | ~1.6B (inside Adena's 2B, thin margin) | 1 + 81,000 | ~60M |

**What the reads show in between:**
- players not yet drained still count the archived best;
- `Leaderboard`/`Standings` can show `holes: 75` against `"holes": 74` (`slots.Size()`);
- a player's standing jumps when the drain reaches them;
- with no finishes, the course stays mixed indefinitely.

**Fix:**
- Add an open `Drain(cur realm, n int)`, with n capped at 400, so anyone can crank it.
- Lower `retireBatch` to about 250 if the pearl remeasure (finding 3) comes in higher.

**Effort:** S.

### 11. Any realm under `r/gnogolf/` with a number in its path takes a cup slot, irreversibly (medium)

**Evidence**
- The order falls back to `holeNo(id)` (`golf.gno:246`, `render.gno:665`).
- Any official Register with a world and order equal to a slot's archives that slot's hole (`golf.gno:259-265`).
- My `island6b` simulate, with an explicit World and Order, took island6's place. A stray `r/gnogolf/test3` or `r/gnogolf/probe2` with no `Order` would silently archive garden/3 or garden/2, and nothing can un-archive a hole.
- With registration in `init` (finding 16), the deploy itself is the irreversible act.

**Fix:**
- Give a slot only to a hole that declares `World` and `Order > 0`.
- Replace only when the new hole names the old one: an optional `Replaces() string` in course.

**Effort:** S.

### 12. The name requirement is weak against sybils on pearl (medium, docs)

**Evidence:** the namereg render shows `Registration price: 0.000000 GNOT (0ugnot)`, with one name per address. A named bot costs one Register tx of gas.

**Fix:**
- Say so in README "Leaderboards": the Friends tab and botcheck remain the defence.
- The rule tightens by itself if GovDAO prices names.

**Effort:** S.

### 13. Deploying with the test files ships ~10 GNOT of tests with dangling imports (medium)

**Evidence**
- Pearl's README: "packages ship on-chain with their `_test.gno` files … (`MsgAddPackage` itself type-checks production files only)".
- A local `gno_addpkg simulate` of a package whose test imports `gno.land/p/gnogolf/nosuchpkg` passes (3.8M gas).
- The tests total about 104 KB:
  - physics 25 KB, course 6 KB, golf 45 KB;
  - holes 28 KB, which import `p/gnogolf/course/fingerprint` (its non-test file imports `testing`, so it cannot be deployed) and `p/gnogolf/zzinv`, an untracked scratch package from another agent (`git status`: `?? gno.land/p/gnogolf/zzinv/`, `?? …/zz_inv_test.gno` × 74).

**Fix:**
- Deploy from a staging copy with the `*_test.gno` files stripped.
- Never deploy `fingerprint` or `zzinv`.

**Effort:** S.

### 14. The physics/v2 story needs an adapter, not only a new path (low to medium, docs)

**Evidence**
- `course.Hole` is written in physics v1 types: `Start() physics.Vec2`, `Field() *physics.Field`, `Preview(...) (physics.Shot, bool)`, and `Weatherable.PlayWith(... weather []physics.Zone)` (`course.gno:89-111`, `:192-198`).
- golf uses `Field()` for work estimates, State/Render and weather placement (`course.ForecastFor` → `wet` → `dryLand`).

**Why it matters**
- README "Updating after the deploy" says a new physics "goes to a new path … and only new holes import it". But a physics/v2 hole can only register with golf v1 by implementing v1 `course.Hole`:
  - it must convert `Vec2`, `Shot` and weather `Zone`s on every call (O(path) gas);
  - it must return a v1 `Field` mirroring its geometry, for display and puddles.
- The unexported `prep` is no obstacle, since the adapter's v1 Field can call the exported `physics.Prepare`, and `offsets()` revalidates each entry.
- But any new piece (a zone kind or a wall property) cannot be shown by v1's `zonesJSON` or `board`, nor avoided by v1's puddle placement. A physics with new features means course/v2 and golf/v2 as well (finding 4).

**Fix:**
- Correct the README.
- Decoupling course from physics types is L, and not worth it now.

**Effort:** S (docs).

### 15. What is frozen at deploy (low, decide now)

- **`playURL = "https://gnogolf.netlify.app/"`** (`render.gno:48`) and its `?cup=…&hole=…` scheme. Every hole page links there forever. Pick the domain you will keep.
- **`workBudget` 1.4e9**, sized for Adena's 2e9 simulate cap and today's gas schedule (finding 3). The worst commit measured is well inside it: `PlayRoundAt(hole16, 12 × "135,10")` = **437.1M**, mountain11 = 410.8M, island18 = 357.8M, town14 in rain = 289.3M (holed at 8), island14 in rain = 288.5M (holed at 4). With a rain forecast (up to about 140M) and a drain (up to about 60M), the worst case is about 0.65B, so the budget never binds on these 74 holes.
- **The chain-id allowlist `"dev", "test-gnogolf"`** (`golf.gno:160-163`). Harmless on pearl, where `names.IsEnabled()` is true.
- **`officialPrefix`**: see finding 1.
- **The other constants** (`PeriodSeconds`, `maxShots`, `retireBatch`/`finishBatch`, `maxListed`, `pageMax`, `maxFriends`, the climate table, `RainScale` and so on) are the ABI from then on.

### 16. Registration: `init(cur realm)` works, and removes the MsgRun step (low, good news)

**Evidence**
- The `island6b` addpkg simulate with `func init(cur realm) { golf.Register(cross(cur), me) }` passed (57.3M).
- `git grep "func init(cur realm)" c4c72fd` finds 388 uses on the pearl tag.
- The `scripts/register-*.gno` route needs MsgRun. A `gno_run simulate` of `hole1.Register` answers `golf: already registered: gno.land/r/gnogolf/hole1` (the guard works). Pearl gates MsgRun on the `RunSubmitters` param, which I could not read without a key.

**Fix:**
- Register from `init`: one tx per hole, no script, no window where a hole is unregistered.
- Fix the 74 stale "a hole cannot register from init()" comments.
- Mind finding 11: the deploy becomes the archive.

**Effort:** S.

### 17. Cross-realm dependencies on pearl: all present, same API (good news)

| import | pearl | checked with |
|---|---|---|
| `gno.land/r/sys/users` `ResolveAddress(address) *UserData`, `(*UserData).IsDeleted()` (nil-safe) | identical source | `gno_read testnet symbols=[ResolveAddress, UserData.IsDeleted]` vs `gnogolf` |
| `gno.land/r/sys/names` `IsEnabled() bool` | present, `true` | `gno_read` / `gno_eval testnet` |
| `gno.land/p/nt/avl/v0` (`NewTree`, `Get/Set/Remove/Has/Size/Iterate/IterateByOffset`) | present, same `ITree` | `gno_read testnet tree.gno` |
| `gno.land/p/nt/ufmt/v0` (`%d %s %t %.Nf`) | present | `gno_read testnet` |
| `gno.land/p/nt/bptree/v0` (for finding 5) | present, same `ITree` | `gno_read testnet` |
| `chain`, `chain/runtime` (`ChainID`), `time`, `math`, `strconv`, `strings` (`Builder`) | stdlib; no API diff for these between `c4c72fd` and local | `git diff c4c72fd HEAD -- gnovm/stdlibs/...` |
| `gno.land/r/sys/users/init` | test only (chain `dev`) | `golf_test.gno` |
| `gno.land/p/gnogolf/course/fingerprint`, `gno.land/p/gnogolf/zzinv` | **absent, never to deploy** | test imports only (finding 13) |
| `gnomod.toml` `gno = "0.9"` | the same as pearl's own packages (`r/sys/names/gnomod.toml`: `gno = "0.9"`) | `gno_read testnet file=gnomod.toml full=true` |
| CLA gate | **off** | `gno_cla_info testnet` → `{"enabled":false}` |
| `gno.land/r/gnogolf/` on pearl | empty | `gno_packages testnet` |

The only availability risk is governance, not code: GovDAO can delete names (`ProposeDeleteUser`), which removes the players from the boards, and it holds the key to finding 1.

## Scaling table

These are on-chain gas figures on the local toolchain. The read rows are whole-script totals, including the ~19M a script pays to import golf. "Measured" rows come from the MCP calls above. The N columns use the avl costs from the pearl-tag gas table (read 59K + 17 B, write 24K + 14 B, 2 KB per node) at an average depth of log₂N: 10, 13, 17 and 20.

| operation | measured today (N≈0) | N = 1K | 10K | 100K | 1M | storage |
|---|---|---|---|---|---|---|
| commit at the cap (12 heavy shots) | **437M** (hole16), 411M (mountain11) | +~12M bookkeeping | +~14M | +~16M | +~19M | round ≈ 2.2 KB (freed by Reset) |
| first finish, named, on a hole | 289M (town14, rain, 8 strokes) | +~12M | +~14M | +~16M | +~19M | **+6.6 KB (0.66 GNOT)**; the player's first: 12.5 KB |
| …while a retire drains | — | +25M | +32M | +50M | +60M | frees ~2.5 KB per drained 0-hole row |
| `Launch` (1 shot) | 109M (island10, rain); 37.8M (hole16) | same | same | same | same | round 2.2 KB |
| `Reset` | 8.4M | +~1M | +~1.3M | +~1.7M | +~2M | −2.2 KB |
| `Register` (0 players on the old hole) | +14.2M | retire: ~0.6B | ~0.8B | ~1.3B | ~1.6B | +8.6 KB in golf |
| hole deploy (addpkg) | 43.1M (island6); ~60–100M for 40 walls (est.) | — | — | — | — | **41–145 KB (4–14.5 GNOT)** |
| `SimulateFrom` | 53–183M | flat | flat | flat | flat | 0 |
| `SimulateRoundAt` 12 shots | 212M (hole16) | flat | flat | flat | flat | 0 |
| `Round` | ~20M + forecast | +1M | +1.3M | +1.7M | +2M | 0 |
| `State` | 67M, 182M in rain | flat (24 rounds) | flat | flat | flat | 0 |
| `Render("")` / hole page | 147M / 295M in rain | flat | flat | flat | flat | 0 |
| `Holes()` | 182M (74 holes) | flat, ~290M at the 120 cap | | | | 0 |
| `Weather` | 9M calm, 138M rain | flat | flat | flat | flat | 0 |
| `Leaderboard` | 22M (empty) | ~40M | ~45M | ~50M | ~55M | 0 |
| `HoleLeaderboard` page 10 / 100 | 25M (empty, limit 100) | ~40M / ~250M | ~45M / ~280M | ~50M / ~320M | ~55M / ~350M | 0 |
| `Bests` + `Standings`, 50 each | 66M (misses) | ~110M | ~120M | ~150M | ~170M | 0 |
| `Records` / `Players` / `Rounds` page 100 | not measured (empty board) | ~150–350M | same | same | same | 0 |
| **hub state** (H = 10 holes per player) | — | 70 MB | 0.66 GB | 6.6 GB | 66 GB | 3× less with bptree (finding 5) |
| `ranks` + `totals` | — | 4.5 MB | 45 MB | 450 MB | 4.5 GB | ~4.5 KB per player per mode |

**Query cap versus page sizes.** `maxGasQuery = 3_000_000_000` (`gno.land/pkg/sdk/vm/keeper.go:52` at `c4c72fd`). The heaviest page (`HoleLeaderboard` at 100 rows, 1M players) is about 0.35B, 12% of the cap. The heaviest read measured (`Render` of a hole in rain) is 0.30B. No read comes near the cap. The limit that binds is node time (finding 7), not query gas.

**Tx size.** The largest package is golf: 71 KB of production source, 116 KB with tests. Pearl's `MaxTxBytes` is 1,000,000 (`tm2/pkg/bft/types/params.go:21`). Everything fits in one addpkg per package.

## Deploy checklist for pearl

1. **Toolchain.**
   - Build `gno` and gnodev at `chain/pearl` (`c4c72fd`, by SHA).
   - Rerun `gno test ./gno.land/...`, the fingerprints and the work-fit measurement.
   - Refit `workPer*` if the gas moved (finding 3).
2. **Decide what is frozen** (finding 15): the namespace, `playURL`, and the geometry and prep format (finding 2). Also decide before deploy:
   - the `bptree` swap (finding 5);
   - the forecast precompute (finding 6);
   - the hole getter (finding 4);
   - the `Claim` function (finding 8);
   - the `listed()` order (finding 9);
   - the `Drain` crank (finding 10);
   - the explicit slot (finding 11).

   Then re-record the goldens.
3. **The namespace** (finding 1).
   - Get `gnogolf` granted to the deployer address by GovDAO (`r/sys/users ProposeRegisterUser` or `namereg/v1 ProposeNewName`). Wait for it to execute.
   - Check with `gno_eval testnet gno.land/r/sys/names 'IsAuthorizedAddressForNamespace("<deployer>", "gnogolf")'`, which must be `true`.
   - Otherwise switch every path to a `nym-…000` name.
4. **The gates.**
   - CLA: `gno_cla_info testnet` gives `enabled:false` today. Recheck on the day.
   - Namespaces: `names.IsEnabled()` is `true`, so step 3 is required.
5. **Funds.**
   - About 700 GNOT of deposit at today's geometry, or about 250 GNOT after finding 2 (a) and (b).
   - Plus about 5 GNOT of fees: about 6B gas at `1ugnot/1000gas`, with gnokey's margin.
   - Get it from the faucet operators. The public faucet is 10 GNOT per day.
6. **Staging.** Copy each package without `*_test.gno` (finding 13). Never include `p/gnogolf/course/fingerprint` or `p/gnogolf/zzinv`. Check that each `gnomod.toml` has `gno = "0.9"` and no `[[replace]]`.
7. **addpkg in order,** from the deployer's own key: sessions cannot add packages, and holes over 100 KB exceed gnomcp's 10 GNOT cap.
   1. `gno.land/p/gnogolf/physics`: about 46 KB, about 5 GNOT.
   2. `gno.land/p/gnogolf/course`: about 27 KB, about 3 GNOT.
   3. `gno.land/r/gnogolf/golf`: about 71 KB, about 8 GNOT. It needs `r/sys/users` and `r/sys/names`, present on pearl.
   4. The 74 holes, in any order: `-max-deposit 16000000ugnot` (16 GNOT) each at today's sizes, `-gas-wanted` about 150M.
8. **Registration.**
   - With `init(cur realm)` (finding 16), each hole registers in its own addpkg, about +14M gas and +8.6 KB each.
   - Otherwise run the four `scripts/register-*.gno` as MsgRun. Check first that `RunSubmitters` allows your key.
9. **Verify** with `gno_eval testnet`:
   - `len(Holes())` is non-zero and every item has `"official":true,"next":""`;
   - `Leaderboard("")` has `"holes":74`;
   - `Render("")` shows four cups;
   - a `gno_call simulate` of `PlayRoundAt` on the heaviest hole stays under 1B.
10. **Client.** Point `?rpc=` at pearl (`rpc.pearl.testnets.gno.land:443`, chain `pearl-1`), or at a dedicated query node (finding 7). Update README and CLIENT.md, and run `scripts/botcheck.mjs --rpc` once as a smoke test.
