# Deploy v1: Gnogolf on pearl (design, not implemented, 2026-09-25)

## 0. Recommendation

- **Holes become data.** Official holes are data records in `golf`, not 74 realm packages.
  - A hole version is one compact binary string `GG1`, sent as hex, validated, and stored as bytes.
  - It is decoded into a transient `*course.Simple` once per call and never persisted.
  - The hole sources stay in the repo as the authoring tool and the proof, but are no longer deployed.
- **Three packages instead of 77:** `p/<ns>/physics`, `p/<ns>/course`, `r/<ns>/golf`, then 74 `Publish` calls.
- **Cost:** the deposit is about 58 GNOT (45 to 80) instead of about 790, plus about 5 GNOT in fees.
- **Updates keep the address.**
  - `garden/7` is a stable alias to its current version; each version is its own entry (`garden/7/v1`, `garden/7/v2`, and so on).
  - Records, boards and wear are kept per version.
  - This reuses today's per-entry machinery: slots, retire and drain.
- **Authority:** the golf deployer is captured at init, and only it can publish official data.
  - A realm hole under golf's own namespace is official only if the deployer signed its registering transaction.
  - The chain-id allowlist and the `names.IsEnabled` check are removed. This fixes security findings N1 and N4.
- **Zero regression, proven by the existing hashes.**
  - `fingerprint.Check` also requires `Of(Decode(Encode(me))) == want`, so the 74 test files don't change.
  - The 6×3 golf goldens keep running on realm-registered fixtures.
- **Namespace:** `nym-golf000` is invalid on pearl (the stem must be 5 to 13 letters). Chosen: `nym-golfer000`, valid and free at pearl height 693,540.
  - The code derives its namespace from its own path at init.
  - `scripts/stage.sh <ns>` rewrites the import paths.

## 1. Chain facts checked with gnomcp

| Fact | Value |
|---|---|
| pearl | pearl-1, height 693,540. The faucet gives 10 GNOT per address per 24 h |
| Name format | `nym-[a-z]{5,13}\d{3}`, price 0. Prefixes `gno` and `gl` are reserved |
| `nym-golfer000` | valid, not taken, no canonical collision |
| `p/nt/bptree/v0` | present on pearl, same `ITree` interface as avl, zero value usable |
| Stdlib at the pearl tag `c4c72fd` | `chain/runtime/unsafe` has `OriginCaller` and `CurrentRealm`. `math.Float64frombits` is native. `encoding/hex`, `encoding/binary` and `crypto/sha256` exist. `math.Sqrt` and `strconv.ParseFloat` are interpreted |
| Limits | `MaxBlockTxBytes` 1,000,000. `maxGasQuery` 3e9 |
| Course | 74 holes, 1,896 walls (at most 48 per hole, 64 timed), 111 posts, 139 zones, 301 polygon points. Pulses on 11 holes, Shelter on 5. Every hole is `course.Fit(&course.Simple{…}, 1.5)` |

## 2. Architecture

```
p/<ns>/physics  unchanged engine + PrepareWith/Lengths (same arithmetic, no sqrt)
p/<ns>/course   unchanged + data.gno: Encode(*Simple) string, Decode(string) (*Simple, error)
r/<ns>/golf     registry; entries are realm holes (course.Hole) OR data versions.
                Publish (owner), PublishMine (anyone), Versions, HoleData, typed getters,
                Drain, Transfer/Accept/Renounce
repo only       hole sources (Fit literals + fingerprint tests), data/holes.txt generated
                from them, scripts/stage.sh, scripts/holedata.sh; the authoring packages
                p/<ns>/physics/build (wall builders) and p/<ns>/course/author (Fit, Diff)
```

A call on a data hole goes through four steps:
1. Load the version entry: one object holding the data string, about 0.15M gas.
2. `course.Decode` rebuilds a `*course.Simple`, and `physics.PrepareWith` fills its `prep` from the stored lengths.
3. The `*course.Simple` is the call's hole; golf marks the wear on the version's entry, never on it.
4. The rest of the code (`previewAt`, `weatherOf`, `State`, `Render`) runs unchanged.

The decoded value is never linked into realm state, so it costs no deposit.

## 3. Holes as data

### 3.1 Encoding options

| Option | Size per float | Total for 74 holes | Per-call cost | Verdict |
|---|---|---|---|---|
| A. Gno slices | ~47 B | ~70 GNOT | no parsing | too heavy |
| B. Hex stored as a string | 16 B | ~29 GNOT | decode 16 nibbles | fallback |
| **C. Binary string (hex on the wire, bytes stored)** | **8 B** | **~15 GNOT** | native `Float64frombits` | **recommended** |
| D. Decimal text | 10–18 B | ~10 GNOT | `ParseFloat` is interpreted, 10–50× slower, on every call | rejected |
| E. Gno source | same as today | — | import gas | rejected |

C is exact by construction, since it stores the float bits. If Phase 0 finds any problem storing non-UTF-8 bytes in a string, fall back to B (+14 GNOT).

### 3.2 Format `GG1` (little-endian, frozen in course v1)

```
"GG1"
header : W,H u16 · Strokes u8 · Substeps u16 · World str · Order f64 · Title str
         Tee f64×2 · Pin f64×2 · CupRadius f64 · Shelter f64
field  : Friction, Bounce, Radius f64            (Tick must be 0)
skins  : n u16, n × str                          (str = u8 len + bytes)
walls  : n u16 · style runs [count u16, Bounce f64, Mark i32, Skin u16, Every/On/Phase i32]
         then per wall: Ax Ay Bx By, l, lp, lm   (7 × f64 = 56 B)
posts  : n u16 · per post: Cx Cy R Bounce f64, Mark i32, Skin u16
zones  : n u16 · per zone: Kind u8, flags u8 (Round|Outside|Air|Capped), Min Max Vec f64×6,
         Scale f64, Mark i32, Skin u16, Every/On/Phase i32, npoly u16, poly f64×2n
pulses : n u8 · per pulse: Every/On/Offset i32, then walls (no lengths), posts, zones
```

`Decode` rejects anything outside frozen, generous limits:
- a wrong magic, trailing bytes, or any non-finite float;
- a board outside 1..96;
- more than 512 walls, 128 posts, 128 zones, 256 points per polygon or 1,024 points in total, or 16 pulses;
- substeps outside 1..200;
- a zone kind outside 0..4;
- any timing value beyond ±4096.

Every current hole is far inside these limits (at most 48 walls and 30 substeps).

### 3.3 How each feature maps

Every feature is a field of `Wall`, `Post`, `Zone`, `Pulse` or `Simple`, so the encoding is one to one:

| Feature | Encoded as |
|---|---|
| Timed walls | the wall style's `Every`/`On`/`Phase` |
| Timed zones | the zone's `Every`/`On`/`Phase` |
| Pulses | the pulse list, pieces recursive |
| Polygons and rail-less lanes | `Poly` + the `Outside` flag |
| Tunnel, hazard | `Kind` + `Vec` |
| Closed tube | a Loop zone plus its ordinary walls |
| Surfaces, slopes, air | `Kind` + `Scale`/`Vec`, with the `Air` and `Capped` flags |
| Shelter | `Simple.Shelter` |
| Everything else (world, order, par, title, board, tee, pin, cup, substeps) | the header |

Weather is not hole data: golf computes it at play time.

### 3.4 Why the decoded hole plays bit-identically

- **Stored after `Fit`.** The encoder stores the values after `Fit` has run. `Decode` never calls `Fit` or any other builder, so every float comes back with the same bits (−0 included), in the same order.
- **`prep` without square roots.**
  - `lines()` takes 3 square roots per wall, about 23M gas on a 48-wall hole.
  - Refactor it into shared arithmetic that takes the 3 lengths as input. `Prepare` computes them; `PrepareWith(f, lens)` takes them from the data.
  - Each given length is checked cheaply (`l > 0 && |l*l − d·d| ≤ 1e-12·d·d`), falling back to the real `sqrt` if the check fails.
  - The same inputs give the same `prep` bits, and `offsets()` already rechecks each entry against its wall.
- **Wear** is a lazily created `[]byte` of 128 × uint32 per version, marked with `course.WearIndexOn`.
- **Proof:** see §14.

### 3.5 Storage per hole

| Hole | Walls/posts/zones | Data | Entry + index | Total | Today |
|---|---|---|---|---|---|
| hole1 | 40/1/0 | 2.5 KB | ~3.3 KB | **~5.8 KB, 0.58 GNOT** | 13.1 GNOT |
| town14 | 44/3/1 | 2.9 KB | ~3.3 KB | **~0.62 GNOT** | 14.7 GNOT |
| island6 | 4/0/1 | ~1.2 KB | ~3.3 KB | **~0.45 GNOT** | 5.0 GNOT |
| **All 74** | | ~145 KB | ~245 KB | **~39 GNOT** | ~700 GNOT |

### 3.6 Gas per call (estimated; Phase 0 measures it)

| Step | Data hole | Realm hole |
|---|---|---|
| Load | ~0.15M | ~10–14M on 48 walls |
| Decode | ~1–1.5M | — |
| PrepareWith | ~0.15M | stored |
| **Total** | **~1.5–2M** | **~7–14M** |

There is no cross-call cache: it would be persisted, and qeval can't persist anyway. The hole is decoded once per public call: `h := e.hole()` is passed down to weather, work, State and Render.

## 4. Slots and versions

- **Versions are entries.**
  - `Publish(cur, slot, hexData, note)` creates `slot/v<n+1>`.
  - The slot must equal the data's `World + "/" + Order`, so a mis-edited file can't replace the wrong hole.
  - The existing slot code then runs: `retire(old, id)`, then `slots.Set(slot, id)`.
- **Aliases.** `mustHole(id)` tries the exact id first, then `slots.Get(id)` (official) or `aliases.Get(id)` (community). Every read and write accepts `garden/7`, and gnoweb `golf:garden/7` shows the current version. Clients write with the version id `State` returned, so a version published mid-round can't replay shots against new geometry.
- **Per version:**
  - rounds, bests, boards, record and holder, plays and wear;
  - provenance: publisher, height, sha256 of the data, and a cleaned note of at most 140 characters.
- **Archived versions stay playable.** Their page shows "Archived: v3 took its place".
- **Cups and URLs don't change.** `?cup=garden&hole=7` still matches by order.
- **New read:** `Versions(slot)` returns `[{id, height, by, sha, note, next}]`.
- **Retire and drain** are reused, with the N2 fix in `counts()` and an open `Drain(cur, n ≤ 400)` crank. The batching can't be simplified: taking an archived hole out of the standings is O(players on that hole).
- **Weather seed** stays `Hash(e.id + "#" + period)`. A new version gets new weather, which is fine: it is a new hole.

## 5. Authority

- **Captured at golf's init:**
  - `owner = unsafe.OriginCaller()`;
  - `self = unsafe.CurrentRealm().PkgPath()`;
  - `nsPrefix` is derived from `self`, and so are all the `/r/…/golf` links.
- **Official data hole:** published by `owner` through `Publish`.
- **Official realm hole:** its id is under `nsPrefix`, and `OriginCaller == owner` at Register (the hole's `init(cur realm)` at deploy). It takes a slot only if it declares `World != ""` and `Order > 0`.
- **Removed:** the chain-id allowlist and the `names` import. This fixes N1 on every chain and N4.
- **Ownership transfer:**
  - `Transfer(cur, to)`, then `Accept(cur)` by the recipient: two steps.
  - `Renounce(cur)` freezes the course for good, which lets "no admin" become literally true.
  - Recommended: yes.
- **The owner can:** add official holes, publish a new version into a slot (which archives the old one and removes its bests from the course ranking), and hand over or renounce the role.
- **The owner cannot:**
  - edit or delete any version, round, best, board, record or standing;
  - take a hole down without replacing it;
  - touch community holes, the weather, the physics or golf's code.
- **Honest caveat:** by choosing the holes, the owner shapes the course ranking.
- This goes into `noAdmin()` and the README.

## 6. Community and builder

- **`PublishMine(cur, slug, hexData, note)`, open to anyone.**
  - The id is `<caller>/<slug>/vN`, with slug `[a-z0-9-]{1,32}`, and the alias is `<addr>/<slug>`.
  - Only that address can add versions.
  - It is never official: no cup, no ranking.
  - It lives in its own `aliases` tree, so `slots.Size()` still counts the course's holes.
- **Realm holes through `Register` stay** as they are.
- **Anti-spam:**
  - The publisher locks the deposit for the bytes it adds: about 0.5 GNOT per version, at most about 2.5 GNOT at the limits. Nothing can be deleted, so this is the throttle.
  - Gas is bounded by the format limits, the work budget and the path cap.
  - `Holes()` lists the course first, then community holes up to a cap. A `Community(after, limit)` read pages them.
  - No name requirement: names are free on pearl, so it would add nothing.

## 7. Physics storage

- **Walls cost bytes.** Data holes never store a `Field`, so a wall costs 56 B instead of about 2.8 KB.
- **Flattening `Wall`/`Segment`/`Vec2`** is not recommended: it would rewrite the API realm-hole authors use.
- **`prep`** is never stored for data holes: it is rebuilt from the 3 stored lengths per wall (+9 GNOT in total, and ~23M gas saved per call on 48 walls).
- **Phase 0 gate:** if `Prepare` costs less than 5% of a light preview, drop the stored lengths and call `Prepare` at decode.

## 8. Indexes

- **Every golf tree moves to `bptree`:** holes, slots, aliases, rounds, bests, board, totals, ranks.
  - About 660 B per entry, against 2,117 B for avl (measured).
  - The same `ITree` interface and the same sorted iteration, so outputs are byte-identical and the goldens don't move.
  - `page()` takes a `bptree.ITree`. Trees are zero-value fields, created lazily.
- **Caveat:** bptree forbids changing the tree it is iterating. `drain` iterates `bests` while it changes `totals` and `ranks`, which is fine; audit every other `Iterate`.
- **Per player:** the first finish goes from about 12.5 KB to about 5 KB, each further hole from about 6.6 KB to about 3.5 KB.

## 9. Upgradability

- **Typed reads for a future golf/v2:**
  - `HoleData(id)` returns the hex, and `Versions(alias)` each version's sha;
  - `Current(slot)`;
  - `BestOf(hole, mode, player)`, and `Ghost(hole, mode, player)` for the round that set it (its shots and period: a v2 can carry a best over with its proof);
  - `StandingOf(mode, player)`;
  - the paged JSON reads (`Records`, `Players`, `Community`) to enumerate.
  - There is no `HoleOf`: it would hand any realm a value that writes golf's wear (audit Y4).
- **golf/v2** re-publishes v1's data and shows v1's records as history, or carries bests over lazily (`v2.Import(player)` reading `v1.BestOf`), only where the physics and course are the same.
- **Deploy v2 as a sibling** (`r/<ns>/golf2`): golf derives `officialPrefix` and the `/p/<ns>/` links from its own path up to the last `/`, so `r/<ns>/golf/v2` would take `r/<ns>/golf/` for its namespace.
- **Trap: the weather is seeded by the version id** (`ForecastFor(e.id, …)`). A version re-published in v2 gets a new id, so new weather: a v1 best was played in other weather than the v2 round it would be compared with. A v2 that counts imported bests as the same hole must seed its weather from the v1 id (keep a `legacyID` per version).
- **Trap: no hole comes over by itself.** Holes don't register from realms any more (every hole is data, and the 74 hole realms don't call golf), so nothing re-registers into a v2: it re-publishes every official version from `HoleData`, checked against `Versions`' sha, and community authors re-publish theirs with v2's `PublishMine`.
- **Pointing players at v2:** v1's owner calls `SetSuccessor(v2)` once. Every v1 page then shows a "moved to" banner and `Holes` gives `"successor"`; v1 goes on playing and blocks nothing.
- **physics/v2** needs course/v2 and golf/v2, because `course.Hole` uses physics v1 types. The `GG1` magic leaves room for a `GG2`.
- **Frozen at deploy:** physics, course and the `GG1` format with its limits, the golf code and constants, the namespace.
- **Updatable:** official hole versions, community holes, the owner, the play link (`SetPlayURL`), the successor (once), the client.

## 10. Deploy pipeline

### 10.1 `scripts/stage.sh <ns> <out>`

The deployed source is the repo's, byte for byte: stage.sh transforms nothing but the namespace, and checks it.

1. Copy every file of the physics, course and golf directories but their tests (`*_test.gno`, `*_filetest.gno`) into `<out>/gno.land/{p,r}/<ns>/…`, as it is. The subpackages (`physics/build`, `course/author`, `course/fingerprint`) and the hole realms are other directories, and never deployed: nothing deployed imports them.
2. Rewrite the import paths (`gno.land/[pr]/gnogolf/` → `<ns>`) with `sed`: the one transformation. The production deploy targets the `gnogolf` namespace itself (to be registered on pearl), where it is the identity, so the on-chain source is then exactly the repo's; it only matters for a rehearsal nym such as `nym-golfer000`.
3. Assert that each staged package holds the repo package's non-test files, no more and no fewer, and that each is the repo's file byte for byte once the namespace is read back; that no `gno.land/[pr]/gnogolf` string is left (under a nym); that every gnomod has `gno = "0.9"`; and that there is no `[[replace]]`.
4. Run `gno lint` with the pearl toolchain and print the package sizes.

`scripts/check.sh` stages into a temporary directory under `gnogolf` on every run, so a stage-time transformation or a skipped file fails the check before it can reach a deploy.

The goldens stay tied to the canonical `gnogolf` tree, so staged tests would move only the id-dependent columns.

### 10.2 `scripts/holedata.sh`

It runs the fingerprint tests with `-v`. `fingerprint.Check` logs `data <slot> <sha8> <hex>`, which is written to the committed `data/holes.txt`. A change to a hole then shows up as a reviewable diff.

### 10.3 Order

| # | Step | Signer | Size and cost |
|---|---|---|---|
| 1 | `namereg/v1 Register("nym-golfer000")` | user, gnokey | ~5M gas |
| 2 | addpkg physics | user, gnokey | ~52 KB, 5.2 GNOT |
| 3 | addpkg course | user, gnokey | ~3.7 GNOT |
| 4 | addpkg golf (its init sets the owner) | user, gnokey | ~9.1 GNOT |
| 5 | 74 × `Publish`, 7 a script (`scripts/publishdata.sh`) | the user's key, gnokey | measured in the rehearsal: ~98M gas and ~0.5 GNOT a hole (deploy-v1-rehearsal.md) |
| 6 | Verify | gnomcp reads | 0 |

- Every package is far below the 1 MB transaction limit.
- **gnomcp can:**
  - simulate each addpkg under the agent's own address namespace;
  - bench on a gnodev matched to pearl;
  - publish through a user-approved session;
  - run the verification reads.
- **gnomcp cannot:** addpkg under the user's name, and sessions can't addpkg either. Phase 0 checks that sessions work on pearl.

### 10.4 Budget

| Item | GNOT |
|---|---|
| Code (physics, course, golf) | ~18 |
| 74 official holes (data ~15, entries and indexes ~24) | ~39 |
| Golf globals at init | ~1 |
| **Deposit** | **~58 (45–80)** |
| Fees | ~3–6 |
| **Total** | **~65 (50–90)** |

That is about 7 faucet-days for one address, or a request to the faucet operators or GovDAO for about 100 GNOT.

## 11. Security fixes folded in

| Finding | Fix | Change in output |
|---|---|---|
| N1 | owner origin + own namespace, no allowlist | the rule's tests are rewritten (intended); goldens unchanged |
| N4 | registration requires the owner's origin; holes register from init; hole sources lose `Register` | none |
| N2 | `counts()` is false when `next != "" && was == 0` | that case only |
| N3, bug 1, bug 2 | physics, optional (IC-B) | may move timed-bar and wall-end holes |
| bug 3 | an empty `SimulateRound` panics "no shots" | error path only |
| bug 4 | only non-empty entries count toward the cap | accepts lists it used to refuse |
| bug 5 | refuse a ball outside `[0,W]×[0,H]` | error path only |
| bug 6 | dedupe friends and skip invalid entries | duplicate or junk input only |
| bug 7 | a tick that overflows is clamped | error path only |
| findings 8–11, 13 | board key on any named finish; `listed()` walks slots first; `Drain`; explicit slots; staging | as listed |
| Lint | `fingerprint.Check(t T, …)` with a small interface | none |

## 12. Client impact

- **`chain.js`:**
  - `REALM` comes from `?realm=` or the build environment (pearl: `gno.land/r/nym-golfer000/golf`).
  - Add a `DATA` id regex for version and community ids.
  - `sourceURL` links data holes to `<realm>:<id>/data`.
- **`Holes()`:** same shape, with version ids and `next`.
- **engine `linked()`:** accepts a slot id (`?hole=garden/7`).
- **Golf.jsx:** the text-play link is built from `REALM`.
- **gnoweb `<id>/data`:** provenance, history, a decimal listing of the pieces, the raw hex, and `$source` links to golf, course and physics.
- **botcheck:** filters on `official && !next`.
- **hole-bests.json:** keyed by slot.
- **camsuite and pulltest:** use slots from a name→slot table generated from `data/holes.txt`. hole19 is garden order 17, so a hole's name isn't its order.
- **vsolve:** a `-data` mode.

## 13. Behaviour changes

- **IC-A, intended, no fingerprint or golden moves:**
  - version ids and aliases;
  - the official rule;
  - explicit slots;
  - the `Holes()` order;
  - N2, finding 8, bugs 3–7;
  - the new API;
  - forecast sequences follow the new ids (new on pearl anyway; not pinned by the fingerprints).
- **IC-B, optional physics fixes, each moving some fingerprints:** bug 1, bug 2, N3. Each would be its own commit listing the holes it moves, with a par re-check.
- **Not done:**
  - Puddle precompute: it would move every rain hash. An exact-only broad phase in `dryLand`, proven by the fingerprints, is possible instead.
  - The `t` cause letter.
  - The M9 warning zones.

## 14. Zero-regression proof

1. **Fingerprints:** `fingerprint.Check(t, me, want)` requires `Of(me) == want`, `Of(Decode(Encode(me))) == want` (432 shots, calm, rain and wind, plus the zones), and `Encode(Decode(Encode(me))) == Encode(me)` (for the fields the hash skips). It logs the data. No hole test file changes.
2. **Physics:** `TestPrepareWithIsPrepare`: bitwise equality on every fixture, plus 10K random segments at Radius 0.5 and 0.
3. **Goldens:** the 6×3 goldens stay pinned on realm fixtures. A parity test registers the same 6 fixtures as data versions and compares, per fixture:
   - `previewAt` over a grid of shots in 3 weathers;
   - the `State` JSON, minus the id and weather fields;
   - the weather zones for the same id.
4. **Local dress rehearsal:** two gnodevs at the pearl tag, one with the old HEAD and realm holes, one with the new tree and the data. For each hole, compare:
   - the `HoleData` sha;
   - the `State` pieces JSON;
   - `SimulateRoundAt` of the solver plan in a calm period;
   - the gas, which must not exceed the realm hole's by more than 10%.
5. **vsolve** on the decoded holes matches `hole-bests.json`.
6. **Client and storage:**
   - camsuite (14 holes) and pulltest pass tables are unchanged;
   - `botcheck --selftest` passes;
   - a storage-delta filetest makes sure a decoded hole is never persisted.

## 15. Phases

| Phase | Content | Gate |
|---|---|---|
| 0 Measure | pearl toolchain; baseline; probes: `Prepare` vs `PrepareWith`, decode cost, bytes per version, bptree entry, binary string round trip, gnoweb `golf:garden/7/v2`, sessions on pearl | the cost model holds within ±50% |
| 1 Pure refactors | pass `h` explicitly; bptree + lazy trees; namespace and owner at init; the `T` interface; faster fingerprint tests | every hash byte-identical |
| 2 Data format | `course/data.gno`; the `lines()` refactor + `PrepareWith`; data checks in `fingerprint.Check`; `holedata.sh` | 74 data checks; round-trip and hostile-input tests |
| 3 Versions and authority | dataHole, Publish, PublishMine, Versions, HoleData, getters, Drain, Transfer/Accept/Renounce, aliases, the §11 fixes, the `/data` page, `noAdmin` | goldens unchanged; parity; new tests |
| 4 Rehearsal and client | hole sources lose `Register` and the golf import; publish locally; the §12 client changes; the §14.4–6 checks | everything green |
| 5 (optional) IC-B | bugs 1, 2, N3, one commit each | moved holes listed; pars re-verified; data regenerated |
| 6 pearl | `stage.sh` simulate → name → 3 addpkg → Publish cup by cup | the checklist |
| 7 Docs | README, CLIENT.md, golf.md, course.md | review |

## 16. Risks

- **Decode costs more gas than the model predicts.** Phase 0 checks this. Fallback: store `prep` as bytes (+~30 GNOT).
- **Non-UTF-8 strings misbehave.** Fallback: store hex (+14 GNOT).
- **`OriginCaller` behaves differently** at init, in tests, or on pearl. The Phase 0 probe runs on pearl.
- **A decoded hole gets persisted by accident.** The storage-delta filetest catches it.
- **bptree is young.** `r/sys/users` uses it, and tests cross-check it against avl.
- **The frozen `GG1` limits turn out too small.** That would need a v2; the limits are generous.
- **The owner key is lost,** which freezes the course. `Transfer` mitigates it.
- **The name is permanent,** and GovDAO can delete names.
- **The `/vN` suffix collides with a slug.** It can't: slugs contain no `/`.
- **Budget:** the faucet pace, or a grant.

## 17. Open decisions

1. The name: `nym-golfer000` (decided).
2. The IC-B physics fixes: **yes, all of them** (decided). Fix the physics as far as possible before it is frozen.
3. `Transfer` and `Renounce`: **included** (decided).
4. `playURL`: owner-settable (`SetPlayURL`), starting at `https://gnogolf.xyz/` (decided). Realm holes (`Register`, `Expect`) removed: every hole is data (decided, final fixes).
5. Funding: the official pearl faucet gives up to 300 GNOT, enough for the whole deploy (decided).

## Critical files

- `gno.land/r/gnogolf/golf/golf.gno`
- `gno.land/p/gnogolf/course/course.gno` (+ new `data.gno`)
- `gno.land/p/gnogolf/physics/walls.gno`
- `gno.land/p/gnogolf/course/fingerprint/fingerprint.gno`
- `web/lib/chain.js` (+ `web/lib/engine.js`)

## 18. Audit amendments (binding, from `deploy-v1-audit.md`)

Where these differ from the sections above, these win.

- **Y1:**
  - Every owner function checks `cur.Previous().Address() == owner`.
  - `OriginCaller` is used only in golf's `init`, to capture the owner.
- **Y2:**
  - Every official hole is a data version.
  - There are no official realm holes: a `Register` under the namespace panics unless the owner allowed it first with `Expect(cur, pkgpath)`.
  - A hole is official exactly when it has a slot.
- **Y3:**
  - `Renounce` clears both `owner` and `pending`.
  - `Accept` requires `owner != ""` and the caller to equal `pending`.
  - `Transfer` validates the address, and `Transfer(owner)` cancels a pending transfer.
  - Add `Owner()` and `Pending()` getters, and emit an event on each change.
- **Y4:** delete `HoleOf`.
- **Y5:**
  - `Decode` enforces value bounds (the list is in the audit) on top of the count limits.
  - The frozen limits are 160 walls, 32 posts, 32 zones, 64 points per polygon, 512 points in total, and at most 60 substeps.
  - The work estimator counts polygon edges and pulse extras.
  - Phase 0 adds a gas gate on a synthetic hole built at the limits.
- **Y6:**
  - Official and community entries live in separate trees.
  - The hole data lives in its own tree.
  - Name, par, world and order are frozen at publish.
  - Listing a hole never decodes its data.
- **Y7:**
  - Check each decoded hole field by field with `equalSimple`, plus a field-count tripwire.
  - Extend `Of()` to hash Kind, Air, Capped, Round, Outside, Every, On, Phase, Mark and Skin.
  - Run pulse holes through strokes up to `max(Every)`.
- **Y8:** writes take exact version ids only, and `Launch` returns the version id.
- **GREEN notes:**
  - Check the stored lengths bit-exactly once, at publish.
  - `dataHole` overrides Play, PlayAt, PlayWith and Wear. (Since gone: `Simple` no longer has Play, PlayAt, PlayWith or Wear, and golf marks the wear on the entry itself.)
  - Test the bptree indexes against avl.
  - Refuse a publish whose sha matches the current version.
  - Strip bidi and zero-width characters from text.
  - The README must state what the owner can do (the audit lists it).

## 19. Feasibility amendments (binding, from `deploy-v1-review.md`)

- **D1:**
  - Give hole10 `Order: 10` and hole16 `Order: 16`. Fingerprints don't change, because Order isn't hashed.
  - Official orders must be integers from 1 to 999.
- **D2:**
  - `init` rejects an empty owner.
  - Tests set the owner explicitly, because OriginCaller is `""` under `gno test`.
  - `init(cur realm)` crossing into golf works, so drop the stale "can't register from init" comments.
- **D3:** `Publish` authenticates through `cur.Previous()` (the same rule as audit Y1).
- **D4:**
  - `lines()` stays untouched.
  - `PrepareWith` goes beside it, and the stored lengths are verified bit-exactly once, at Publish.
- **D5:**
  - Choose the tree type per index:
    - small per-version trees stay on avl (a bptree costs about 4.9 KB even when nearly empty);
    - large global indexes use bptree only if Phase 0 measures a win.
- **D6: gas.**
  - A data hole costs about the same gas per call as a realm hole. Measured: decode is 4.5 to 28M, and PrepareWith on 30 walls is 5.4M.
  - The saving is the storage deposit only.
  - Phase 0 must optimise decode, for example by caching the decoded prep per version in realm state, or by storing the prepared form.
  - The §14.4 target of "≤ 110% of realm-hole gas" stays in place.
- **D7: client migration.**
  - Generate a map from old pkgpath to slot out of `data/holes.txt`.
  - Scorecards and cup unlocks get a one-time rewrite, keyed by slot. When two entries collide, keep the lower score.
  - The scene's decor, theme and time of day keep reading the old id through that map.
  - In `Golf.jsx`, accept `?hole=` slot ids.
  - Fix `botcheck`, the media scripts, and the 9 hardcoded `/r/gnogolf/golf` strings.
- **D8: parity.**
  - The parity tests inject the same weather, since weather is seeded from the id.
  - Add the structural `Diff` inside `fingerprint.Check`.
  - Add tests T1–T9 from the review.
