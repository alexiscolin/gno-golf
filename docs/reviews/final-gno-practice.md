# Final pre-deploy review: Gno practice, API design, upgradability

Scope: `p/gnogolf/physics`, `p/gnogolf/course`, `r/gnogolf/golf` at HEAD `affe241`, as they will deploy under `nym-golfer000` on pearl. Security and physics correctness are covered by earlier reviews (`deep-security.md`, `deep-physics.md`, `deploy-v1-audit.md`). This review doesn't repeat them. Nothing in the code was changed.

Checked against: the gnomcp `gno` skill (patterns, interrealm, stdlib, render, build, networks), `p/nt/ownable/v0` and the event conventions in local `gnolang/gno` examples (`9951541d9`, 2026-09-23), and the pearl chain through gnomcp profile `testnet` (read only).

Every item is labelled either **must fix before freeze** or **nice to have**, and the list is ranked within each label. "Cheap now" means that after deploy the item can only be fixed by a v2.

## Verdict

The three packages are idiomatic and ready, apart from two small decisions that can't be made after freeze (M1, M2). Toolchain checks all pass. The crossing discipline is correct. `/p/` code returns errors and `/r/` code panics. No export returns an interior pointer. The v2 story works, but it's written down in three places with one stale entry (N6).

## Toolchain checks (pearl toolchain `c4c72fd`, which is the pearl tag)

| Check | physics | course | golf |
|---|---|---|---|
| `gno fmt -diff` | clean | clean | clean |
| `gno lint` | clean | clean | clean |
| `gno test` | ok (28.6 s) | ok (4.2 s) | ok (57.2 s) |

The checks ran on a copy in the scratchpad, with `GNOHOME` set to the pearl toolchain's module cache.

## Dependencies on pearl

| Import | Used by | On pearl |
|---|---|---|
| `math`, `strconv`, `strings`, `errors` | physics, course, golf | stdlib at `c4c72fd` (lint and tests pass on it) |
| `chain`, `chain/runtime`, `chain/runtime/unsafe` | golf | stdlib; `unsafe.OriginCaller` and `unsafe.CurrentRealm` are present |
| `crypto/sha256`, `encoding/hex`, `time` | golf | stdlib |
| `gno.land/p/nt/avl/v0` | golf | yes |
| `gno.land/p/nt/bptree/v0` | golf | yes; `NewBPTree32`, `GetByIndex`, `Iterate` and `IterateByOffset` are all in the deployed `ITree` |
| `gno.land/p/nt/ufmt/v0` | golf | yes |
| `gno.land/r/sys/users` | golf | yes; `ResolveAddress(addr) *UserData`, and `(*UserData).IsDeleted()` is nil-safe, which `named()` relies on |

- `physics` and `course` import only the stdlib (and `physics`).
- `@nym-golfer000` is empty on pearl, so nothing is squatting the paths.
- `gno.land/p/onbloc/json` is on pearl if a v2 ever wants to parse v1's JSON on-chain (see U2).

## The exported surface

**physics** (frozen):
- Types: `Vec2`, `Segment`, `Circle`, `Wall`, `Post`, `ZoneKind`, `Zone`, `Field`, `Shot`.
- Kinds: `Surface`, `Slope`, `Tunnel`, `Hazard`, `Loop`.
- Consts: `LoopKeep`, `MaxRollOn`, `JumpSpeed`, `Lift`, `MaxMove`, `Along`, `MaxBounce`, `Drag`, `SpeedCap`, `JumpRun`.
- Builders: `V`, `FromPolar`, `WithTick`, `Timed`, `Bar`, `Soft`, `Skinned`, `Walls`, `Outline`, `Arc`, `Polyline`, `Path`, `Pts`, `Stadium`, `Keyhole`, `Lane`, `Box`.
- Engine: `Prepare`, `PrepareWith`, `Lengths`, `Prepared`, `Unstick`, `(*Field).Step`, `Shot.Rest`, `Zone.Contains`, `ZoneKind.String`, the `Vec2`, `Segment` and `Circle` methods.

**course** (frozen):
- Interfaces: `Hole`, `Sized`, `Parred`, `Ordered`, `Worlded`, `Timed`, `Zoned`, `Weatherable`.
- Types: `Simple`, `Marks`, `Pulse`, `Forecast`.
- Consts: `BoardW/H`, `WearW/H`, `MaxBoard`, `Kick`, `CaptureSpeed`, `Magic`, the 11 `Max*` limits, the weather kinds (`Clear`…`Snow`) and strengths (`WindMin`, `WindMax`, `RainScale`, `WetIce`, `SnowScale`).
- Funcs: `OrderOf`, `WorldOf`, `ParOf`, `BoardOf`, `WearIndex`, `WearIndexOn`, `ForecastFor`, `WeatherFor`, `WithWeather`, `WithZones`, `WithExtras`, `Launch`, `Sink`, `Encode`, `Decode`, `Exact`, `Diff`, `Fit`.

**golf**:
- Crossing: `Register`, `Publish`, `PublishMine`, `Launch`, `PlayRound`, `PlayRoundAt`, `PlayRoundPro`, `Reset`, `Drain`, `Transfer`, `Accept`, `Expect`, `Renounce`.
- Reads: `Render`, `State`, `HoleState`, `Round`, `Holes`, `Community`, `Simulate`, `SimulateFrom`, `SimulateRound`, `SimulateRoundAt`, `SimulateCommit`, `Extras`, `Weather`, `Leaderboard`, `Rank`, `HoleLeaderboard`, `Bests`, `Standings`, `Records`, `Players`, `Rounds`, `Versions`, `HoleData`, `Current`, `BestOf`, `StandingOf`, `Owner`, `Pending`, `Period`, `PeriodSeconds`.

Surface findings:

- **Nothing exported that shouldn't be.**
  - golf exports no variables.
  - No read returns a pointer into golf's state, and `HoleOf` was rightly deleted (audit Y4).
  - `dataHole`'s exported methods can only be reached through a value golf never hands out.
  - `course.Marks.Mark/MarkOn` are mutators that any holder of a `*Simple` can call. Only a hole realm's own wear is exposed that way, and it's cosmetic. It's acceptable as frozen API.
- **Exported only because a sibling package needs it** (acceptable, see N7): `physics.Prepare`, `PrepareWith`, `Lengths`, `Prepared` and `Unstick`. `Prepared` exposes the raw 23-float prep layout.
- **Missing** (all nice to have, see U2 and N3): a typed record-holder read, and typed paging over players and records for a v2 that migrates on-chain.

---

## Must fix before freeze

### M1. `playURL` is a hard-coded third-party subdomain, frozen into every page
`r/gnogolf/golf/render.gno:80` has `const playURL = "https://gnogolf.netlify.app/"`.

- Every hole page ("Play in 3D") and the hub link to it forever. Nothing on-chain can change it.
- If the Netlify site is ever renamed or deleted, the subdomain can be claimed by anyone. The chain's official game page would then link players to a stranger's site, which is a permanent phishing link from a page the owner can't edit.
- **Fix** (about 10 lines):
  - Make it an owner-settable `var client string`, with `SetClient(cur, url)` gated like `Expect`, requiring an `https://` prefix, emitting an event, and honouring `Renounce`. `Render` then reads the var.
  - Alternative, if a new owner power is unwanted: point the constant at a domain the project controls for good.
- It doesn't break the "no pause, no upgrade" promise. It only changes where one link points.

### M2. No way for v1 to point at its successor (decide now, or accept on the record)
README §"Updating after the deploy" says: "The hub itself has no successor mechanism".

- golf's code can never change, so once a `golf/v2` exists, v1's hub stays a live, rankable, canonical-looking game forever.
  - Players who land on v1 through old links, gnoweb or search keep playing into a ranking nobody maintains.
  - There is no way to even tell them that v2 exists.
- **Fix** (about 15 lines, display only, keeps every promise in `noAdmin()`):
  - Add an owner-only, set-once `SetSuccessor(cur, pkgpath)` that stores `successor`.
  - `Render` shows a `> [!NOTE] This course has moved to …` banner on the hub and on every hole page.
  - `State`, `HoleState` and `Holes` carry `"successor"`, and the function emits an event.
  - It blocks no write and moves no score, so "can't pause or upgrade" stays true. Say that in `noAdmin()`.
- If the answer is no, record it in ADR-002 as a deliberate choice. Right now it reads as an omission.

---

## Nice to have (ranked)

### N1. Event contract: naming, keys and payload (cheap now, and indexers live with it forever)
Events are `hole_registered(id)`, `hole_published(id, slot, sha)`, `hole_retired(id, next)`, `hole_expected(id)`, `shot(hole, player, strokes)`, `holed(hole, player, strokes, mode)`, `reset(hole, player)`, and the `owner_*` family.

- **Name style.**
  - The gno examples use PascalCase names declared as exported constants: `ownable.OwnershipTransferEvent = "OwnershipTransfer"`, `"ProposalCreated"`, `"Registration"`, `RegisterUserEvent`.
  - golf uses snake_case.
  - Either style works, but the examples use PascalCase, and exported constants let a Gno indexer or v2 refer to the names without copying strings.
- **Same concept, two keys.** A hole is `"id"` in the `hole_*` events and `"hole"` in `shot`, `holed` and `reset`. Pick one.
- **Payload gaps that matter for indexers.**
  - `shot` has no `mode` and no decision string (the recorded `"a,p,t"`).
  - `hole_published` has no `by` and no `official`, so course and community publishes look the same unless you parse the slot.
  - `Drain` and a round's first stroke (which fixes its period and mode) emit nothing.
  - `Reset` frees the round's storage, so after a reset the events are the only lasting record of the shots.
- **Ownership events** could reuse ownable's shape (`OwnershipTransfer`, `from`, `to`) so that generic tooling recognises them.

### N2. JSON versioning: consistent except for `Holes()` (cheap now)
- Every object read opens with `"version":1` (the `versionJSON` constant), except:
  - `Holes()`, which returns a bare array: no version and no room for a field;
  - `Round()`, which returns `null` when there is no round;
  - the scalar reads (`Current`, `HoleData`, `BestOf`…), which is fine.
- Wrap `Holes()` as `{"version":1,"rows":[…]}`, the shape `Community` already has. The web client isn't frozen, so it's a one-line client change today.
- **Is the versioning sufficient?** Yes, as long as its meaning is stated. v1's code can't change, so `"version":1` never moves within v1. The real contract is the realm path, and the field only helps a client that talks to v1 and v2 with one parser. Document "`version` is the golf generation; v2 answers 2 even where a shape is unchanged" in `docs/golf.md`.

### N3. Typed reads a v2 migration will want
- Present: `BestOf(hole, mode, player)`, `StandingOf(mode, player)`, `Current(alias)`, `HoleData(id)`, `Owner`, `Pending`, `Period`.
- Missing:
  - `RecordOf(hole, mode) (strokes int, by address)`: the hole record and its holder only appear in JSON, and the holder not at all (`holeRow` has `best` but no `bestBy`).
  - Typed paging for on-chain enumeration, such as `PlayerAt(mode, i) (address, holes, strokes)` or an `after`-keyed variant. Today a Gno v2 would have to parse `Players`, `Records` or `Holes` JSON (with `p/onbloc/json`, which is heavy on gas).
- Neither is needed for the lazy migration in U2. Both make an eager one possible.

### N4. `PlayRound` (implicit period) is a footgun in a frozen API
- `PlayRound` records `Period()` at execution. A client that previewed in period P but was included after the boundary records P+1 weather, which isn't what the player saw. `PlayRoundAt` exists for exactly this.
- It's fine to keep `PlayRound` for gnoweb forms, but its doc should say "prefer PlayRoundAt". Consider also marking it as the gnoweb-only entry in `docs/golf.md`.
- The `PlayRound`, `PlayRoundAt`, `PlayRoundPro` and `Launch` set is asymmetric, because mode is chosen by function name and not by a parameter. It's acceptable, but it's frozen.

### N5. Package paths carry no version suffix
- Current paths are `p/nym-golfer000/physics`, `…/course`, `r/nym-golfer000/golf`, while pearl's own library paths are versioned (`p/nt/avl/v0`).
- This doesn't block anything, because nested paths are allowed (`avl/v0/pager` exists), so `physics/v2` and `golf/v2` can deploy later.
- Two couplings to know about before choosing v2 paths:
  - `officialPrefix` is `self` up to its last `/`. A golf at `r/<ns>/golf/v2` would therefore treat `r/<ns>/golf/` as its own namespace, not `r/<ns>/`.
  - `renderData` builds the `/p/<ns>/course` and `/p/<ns>/physics` links from `officialPrefix`, so a v2 on `course/v2` must build them differently.
- Either deploy v2 as a sibling (`golf2`, `physics2`), or change the derivation in v2. Write down whichever you choose.

### N6. The migration story is spread out, and one entry is stale
- The v2 story lives in three places: `deploy-v1.md` §9, the README section "Updating after the deploy", and `docs/golf.md` (the successor-realm mentions).
- §9 still lists `HoleOf(id) course.Hole` as a typed read, although audit Y4 deleted it (and rightly: it would hand any realm a value that writes golf's wear).
- Fold U1–U3 below into one "Upgrading" section of `docs/golf.md`, and delete the §9 `HoleOf` line.

### N7. Small API notes on the frozen `/p/` packages
- **`physics.Prepared`**: its doc says "for a test to compare", but `course.Exact` uses it at every publish. Fix the doc, and say that the layout is unspecified.
- **`Timed`, `Soft`, `Skinned`** modify the slice they're given and return it. That's fine for the builders' intended use in literals, but the doc should say so.
- **`course.Encode`** can't report an error. It silently truncates strings over 255 bytes and wraps counts over 65,535, so it can write data that decodes to a slightly different hole. golf's round-trip check (`Encode(Decode(d)) == d`) makes this harmless on-chain, but a sentence in the doc would help community tools.
- **`course.Decode`** trusts the stored lengths, and `Exact` has to be called separately. The doc says so. A community tool that decodes untrusted GG1 and skips `Exact` plays a hole whose walls behave slightly differently from what they look like. Consider calling this out in `docs/course.md` as a rule.
- **The weather policy is in `/p/course`** (`climates`, `ForecastFor`), so it's frozen with the package and not owned by golf. That's documented ("the owner can't touch the weather"). Just be aware that changing the climate means a new course and a new golf.

### N8. Naming nits (frozen, no action needed unless something else is touched)
- `golf.Launch` shares its name with `course.Launch`, which does something else.
- `Simple` has field/method pairs (`Title`/`Name`, `Strokes`/`Par`, `Course`/`Field`, `Order`/`Position`). The doc comment already explains why.
- `Current` is a very generic name for "the current version of an alias".

---

## Idioms: what is right (no action)

- **Crossing discipline.**
  - Every state-changing export is crossing, and every other export is read-only. No non-crossing export writes: `roundOf`, the only lazy writer, is reached only from `playable`, which only the crossing writes call. So a realm calling golf's reads under borrow #1 can't persist anything.
  - There are no secondary `rlm realm` helpers, so no `IsCurrent` checks are needed.
- **Caller identity.**
  - Owner checks and players are both taken from `cur.Previous().Address()`.
  - `Register` identifies the hole by `cur.Previous().PkgPath()` and refuses `/e/` callers.
  - `OriginCaller` is used only in `init`.
  - There is no `OriginSend` or banker, so no `IsUserCall` guard is needed.
- **Panics and errors.**
  - golf panics with a consistent `golf: ` prefix.
  - `course.Decode` returns errors.
  - physics never panics on valid input. Degenerate builder input, such as `Lane()` with no points, panics or gives NaNs, which is acceptable at authoring time.
- **`init`.**
  - It captures the owner and panics on an empty signer outside chain `dev`.
  - `self` and `officialPrefix` come from `unsafe.CurrentRealm()`, so the code serves under any namespace.
- **Global state.**
  - The big indexes are bptree, and the per-hole trees are avl.
  - Lazy trees (`board`, `fresh`, `wear`) and no maps in realm state.
  - The `/p/` globals are one read-only map (`climates`) that is only indexed, never iterated.
  - A single top-level `State` struct buys nothing here, because a realm can't be upgraded in place.
- **Interfaces.**
  - `course.Hole` takes no `cur realm`, as the skill recommends.
  - Optional interfaces (`Sized`, `Timed`, `Weatherable`…) are the right way to extend a frozen contract.
- **Render.**
  - The hub never calls hole code; names, par, world and order are frozen at registration.
  - An unknown path gets a `[!WARNING]` page, not a panic.
  - User text goes through `cleanName`/`cleanText`, and JSON through `jstr`.
  - `<gno-form exec>` targets `Launch` and `Reset`, which are both exported crossing functions.
  - Routing is ad hoc (`LastIndex("/")`) but consistent.
- **Doc comments.** Every exported identifier has one, except `dataHole.Play` and `PlayAt`, which are exported methods of an unexported type (lint doesn't flag them).

---

## Upgrade paths

### U1. physics v2 or GG2
- `course.Hole` and `course.Simple` are built from physics v1 types, and `Decode` accepts only `"GG1"`, with no extension bytes and no trailing bytes.
- So a new physics or a GG2 format means `physics/v2` + `course/v2` + `golf/v2`. That's documented, and it's correct: freezing the physics under a hole is what keeps scores comparable.
- Nothing in v1 blocks it.

### U2. golf v2 that keeps the rankings
- **Nothing in golf's state blocks it.**
  - A v2 can't read v1's storage anyway. It goes through v1's exported reads, which return strings and scalars, never `/p/` values taken from v1 state.
  - v1 stores `course.Hole` values (realm holes) and `physics` types only inside its own state, and never exports them.
- **Recommended path: lazy and permissionless.**
  - v2 imports v1.
  - v2 re-publishes each official version's `HoleData` (the sha must match `Versions`).
  - For any player, anyone may call `v2.Import(cur, player)`. It reads `v1.BestOf(hole, mode, player)` for each mapped official hole, and `v1.StandingOf` as a cross-check.
  - This is safe because v1's reads are public truth: no signature is needed, and the cost is O(holes) per player.
  - Only carry a best over when the physics and course versions are the same. Otherwise show it as history.
- **Weather trap: the weather is seeded from the version id** (`ForecastFor(e.id, …)`).
  - A re-published hole under a new id gets different weather.
  - If v2 wants imported bests to count as "the same hole", it must seed from the v1 id (keep a `legacyID`). Otherwise the rounds aren't comparable.
- **Realm holes can't follow.** `Register` is called by the hole realm itself, usually from `init`, so a frozen hole realm can never register into v2. v2 can only list realm holes that expose their hole themselves (for example `func Hole() course.Hole`). Tell community hole authors to export one.
- M2 (the successor pointer) and N3 (typed enumeration) are the two v1 changes that make this path smooth.

### U3. New course holes and fixes, no v2 needed
- Handled in v1: the owner `Publish`es a new version, and the old one is archived with its records.
- It holds up while the owner key exists. After `Renounce`, the course is frozen for good, which is the stated intent.
