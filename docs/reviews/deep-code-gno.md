# Deep code review: the Gnogolf gno code

Scope: `p/gnogolf/physics`, `p/gnogolf/course`, `r/gnogolf/golf`, the 74 hole realms and `scripts/register-*.gno`. This review covers idioms, DRY, the API surface, comments, tests and deploy readiness. Physics correctness is covered separately in `deep-physics.md` and is not repeated here. Nothing in the code was changed.

Checked against the gnomcp `gno` skill (SKILL.md, `patterns.md`, `build.md`, `memory.md`) and Effective Gno.

## How it was checked

- **Tests** (`nice -n 20`, one process, `/tmp/claude-501/gnobin`):
  - `p/gnogolf/physics` and `p/gnogolf/course` pass.
  - `r/gnogolf/golf`: all 27 of its own tests pass.
  - The only failures are three untracked `zz_scratch{a,b,c}_filetest.gno` files that another agent left in the golf directory (see T4).
  - The 74 hole realms have no test files at all.
- **`gno lint`** on all 76 packages: clean.
- **`gno fmt -diff`**: clean except the import order in the four `scripts/register-*.gno` files, which is cosmetic.
- **Live chain** (gnomcp, profile `gnogolf`, height 2, genesis-loaded):
  - The deployed byte sizes of `golf` (4 files), `physics` (5), `course.gno` and the modified holes (`hole20`, `mountain11`) match the local files.
  - So the chain carries the **working tree, not HEAD**: `step.gno`'s pin check and the hole20/mountain11/14/16 edits are deployed but not committed.
  - The JSON shapes were checked live with `gno_eval` (`Holes`, `Leaderboard`, `HoleLeaderboard`, `Bests`, `Standings`, `Round`, `State`, `Extras`, `Weather`, `SimulateRound`, `Render("")`).
- **Target chain** (profile `testnet`, pearl): `r/sys/users`, `p/nt/avl/v0` and `p/nt/ufmt/v0` exist, and `@gnogolf` is empty (not deployed yet).
- **`init(cur realm)`**: a scratch workspace in the scratchpad (not the repo) confirmed that `func init(cur realm) { reg.Register(cross(cur)) }` runs on this toolchain and that the registry sees the right `cur.Previous().PkgPath()` (see H4).

Effort: **S** is under an hour, **M** is half a day, **L** is more.

---

## High: decide before the deploy (frozen after it)

### H1. The README's physics upgrade path does not fit the frozen interface
`p/gnogolf/course/course.gno:89-111`; `README.md:251-254`

**Issue.** `course.Hole` is written in `physics` v1 types: `Start() physics.Vec2`, `Field() *physics.Field`, `Preview(...) (physics.Shot, bool)`. The README says "a new physics goes to `p/gnogolf/physics/v2`, and only new holes import it". But a hole built on `physics/v2` does not satisfy `course.Hole`, so it cannot register with this `golf`, which is frozen forever. The weather is v1 as well: golf builds it with `course.ForecastFor` and hands the hole v1 `[]physics.Zone`.

**Fix.** Choose one before the deploy:
- (a) State in the README that a v2-physics hole must adapt at the boundary: simulate in v2, then convert the Field, Shot and weather zones to and from v1 types. Say what the adapter costs.
- (b) Accept that `physics/v2` means `golf/v2`, and say so.

**Effort.** S (doc and decision).

### H2. The public reads are not enough for a `golf/v2` to migrate from
`r/gnogolf/golf/state.gno` (State caps rounds at `roundsShown` = 24, `:67`; Leaderboard shows a top ten; HoleLeaderboard shows named players only, top 100, `:362`); `README.md:266-268`

**Issue.** The README says a v2 "can read the v1's public state (`Holes`, `Leaderboard`, `State`, `Round`)". It cannot enumerate:
- every player's best on a hole: unnamed players, and anyone past rank 100;
- every round;
- every course standing.

`Round`, `Bests` and `Standings` need the addresses up front, and there is no read that lists them. The records a v2 would need to carry over cannot be read out. There is also no version marker in any JSON output.

**Fix.** Add two paginated reads keyed by address, for example `Records(hole, mode, after string, limit int)` over `e.bests[m]` and `Players(mode, after string, limit int)` over `totals[m]`, both through avl `Iterate(after, "", …)` with limit clamped to 100. Also add a `"v":1` field (or a `Version()` func) to the top-level JSON objects.

**Effort.** S–M.

### H3. A finish on a non-course hole puts the player in the course top ten with 0 holes
`r/gnogolf/golf/golf.gno:125-141` (`improve` calls `rank` on any finish); compare `retire`, `golf.gno:235-240`, which only re-ranks `holes > 0`

**Issue.** Registration is open to anyone.
- A named player whose only finish is on `gno.land/r/alice/x` enters `top[m]` as `{holes:0, strokes:0}`, and fills an empty slot until ten real rows push it out.
- The next retire then rebuilds the top without that player, so the board changes for no visible reason.
- `golf_test.gno:247-253` (`TestLeaderboardRanksFinishedRounds`, on a `gno.land/r/test/` hole) asserts exactly this behaviour.

**Fix.** Change `golf.gno:138` to `if named(player) && r.holes > 0`, and move that test onto a `gno.land/r/gnogolf/` hole.

**Effort.** S.

### H4. "A hole cannot register from init()" is no longer true
Every hole, for example `r/gnogolf/hole1/hole1.gno:37-39`; `scripts/register-*.gno:1-3`

**Issue.**
- The current VM accepts `func init(cur realm)` (Effective Gno, `docs/resources/effective-gno.md:144`; `r/demo/defi/foo20` uses it). The scratch test confirmed the registry reads the hole's pkgpath from inside `init`.
- As things stand, 74 identical exported crossing functions `Register(cur realm)` stay in the chain's API forever. After the first call each one only panics "already registered".
- The four register scripts are an extra post-deploy step that someone can forget.

**Fix.**
- In every hole, replace `Register` with `func init(cur realm) { golf.Register(cross(cur), me) }`, then delete `scripts/register-*.gno` and fix the comments.
- `golf` must then be deployed before the holes. That order already holds, since the holes import it.
- Check on the target chain (pearl) that `init(cur realm)` is supported, using one throwaway package.

**Effort.** S (mechanical, 74 files plus 4 scripts).

### H5. `playURL` and the play-link format are frozen
`r/gnogolf/golf/render.gno:44-48`

**Issue.** `https://gnogolf.netlify.app/` is unconfirmed, and `netlify.toml:3` only gives it as an example. It is baked into the hub and every hole page. The link format `?cup=<world>&hole=<int(order)>` is frozen with it: `Golf.jsx:27,403-408` honours it today, and the client must keep doing so for good. `int(order)` also truncates a 1.5 slot to 1.

**Fix.** Before the deploy, confirm a domain you control, ideally a custom one rather than a netlify subdomain that could be lost. Otherwise drop the absolute link and point at a gnoweb page. Treat `cup` and `hole` as a permanent client contract.

**Effort.** S (decision).

### H6. The two "extras" holes count toward the course ranking
`r/gnogolf/hole10/hole10.gno` and `hole16/hole16.gno` (`World: "extras"`, under `r/gnogolf/`); `golf.gno:209-215`

**Issue.** Both are official by path, so each gets a slot (`extras/10`, `extras/16`). Live, `Leaderboard` reports `"holes":74` and the hub shows an "Extras" cup. Their own comment says they were "moved out of the garden's eighteen", yet a player still has to finish them to top the course board.

**Fix.** Choose: either exclude `world == "extras"` from `slots` in `Register`, or deploy them outside `r/gnogolf/`, or accept 74 as the course size and say so on the hub.

**Effort.** S.

---

## Medium

### M1. Skins carry meaning in the simulation, and the open-loop branch is dead
`physics/field.gno:22` says "Skin carries no meaning for the simulation". But:
- `step.gno:404` `closedLoop`: skin contains `"tube"`;
- `step.gno:416` `isAir`: skin is `"wind"` or `"gust"`;
- `step.gno:345`: the wind speed cap applies to skin `"wind"`.

**Loop is confirmed used only by island7's closed tube.** A grep of all `.gno` finds `physics.Loop` only in `island7/island7.gno:39` (`Skin: "castle tube"`), plus `fit.gno:88` and the tests. So `LoopOver` (`field.gno:131-136`), the fly-off branch `sp > z.Scale*LoopOver && !closedLoop(z)` (`step.gno:384`) and `closedLoop` are reachable only by a hole that does not exist. The only other trace is the web's `isLoop` for skin `"loop-the-loop"` (`web/lib/scene/course.js:235`), which is dead too.

**Fix.**
- Make every Loop a closed tube: delete `LoopOver`, `closedLoop` and the open-loop half of the branch, keep the slanted fall-off, and rewrite the Loop doc (`field.gno:118-127`).
- island7 plays exactly as before, and no golden covers Loop.
- Update `TestLoopWantsTheRightSpeedAndTheMouth` (`physics_test.gno:254-289`).
- For wind and gust, either add an explicit field or amend the `field.gno:22` contract to name the reserved weather skins.
- Coordinate with the physics review first.

**Effort.** S.

### M2. Stale energy-adding bumper API and comments, and dead Bounce values in holes
- **Dead constant.** `step.gno:91-94` `Push` is exported and its own comment says "kept for the record".
- **Stale comments.**
  - `field.gno:11`: "Bounce above 1 to make it lively".
  - `field.gno:100-104`: "Bounce above 1 adds energy".
  - `step.gno:99-101`: SpeedCap, "bumpers that add energy may push it…".
  - `step.gno:254-256`: "A bumper … kicks the ball out with a fixed push".
  - All of these contradict `MaxBounce` (`step.gno:85-89`) and the clamp at `:259`.
- **Dead values in holes.** Bounce 1.1–1.3 is set in hole2, hole8, hole10, hole14, hole17 and town11, and is played at 0.92. hole8's doc ("lively bumpers") and town11's ("they pass the ball round") promise something the physics no longer does.

**Fix.** Delete `Push`, reword the four comments, and set those Bounce values to 0.92 or leave them with a note. This is safe because play is clamped either way.

**Effort.** S.

### M3. The HoleLeaderboard total and the Leaderboard doc
- `state.gno:405`: `"players"` is `e.bests[m].Size()`, which includes unnamed finishers, while the rows are named-only (`:383`). A client that pages up to `players` gets empty pages.
- `state.gno:336-340`: two doc comments are stacked, starting "Leaderboard is the course-wide ranking…" and then "Leaderboard is a mode's course-wide top ten…".

**Fix.** Rename the field to `"finished"` (or count named players), and merge the two doc comments.

**Effort.** S.

### M4. Unknown modes are accepted silently, and Leaderboard does not echo the mode
`golf.gno:81-87` `modeOf`

**Issue.** Live, `Leaderboard("xyz")` returns the assisted board. `Leaderboard`'s JSON has no `"mode"` key, although `HoleLeaderboard`, `Bests` and `Standings` all have one.

**Fix.** Panic on anything but `"assisted"`, `"pro"` or `""` in the reads, and add `"mode"` to Leaderboard.

**Effort.** S.

### M5. JSON shape consistency (frozen)
- `"by"` is always equal to the id (`state.gno:31`, `:168`; live: `"by":"gno.land/r/gnogolf/hole1"`), so it is a stale field.
- The hole key is `"id"` in `Holes` but `"hole"` in `State`, `HoleLeaderboard` and `Bests`.
- `Holes` uses `"best"` and `"proBest"`, while every other read is keyed by mode.
- Clear weather is `"kind":""`.

**Fix.** Before the deploy: drop `"by"`, add `"v"` (H2), and optionally rename to `"clear"`. The dapp readers need updating to match.

**Effort.** S.

### M6. Asymmetric write names, and two entry points no client uses
`golf.gno:288-303`; `state.gno:183-193`

**Issue.**
- `PlayRound` uses the current period and assisted mode; `PlayRoundAt` takes a period and is assisted; `PlayRoundPro` takes a period and is pro. There is no pro version without a period, and the name `PlayRoundPro` hides that it takes one.
- A grep of `web/` and `scripts/` finds `PlayRound(` and `Simulate(` in no client.
- `Simulate` quantises the angle but not the power (`q4` is applied in `stroke` and `simulateRound`, not in `Simulate`), and always plays stroke 0 at tick 0. It can therefore disagree with a recorded shot.

**Fix.** Either drop `PlayRound` and `Simulate`, or keep them and fix `Simulate` to `q4` the power too. Consider one `PlayRoundAt(hole, shots, period, mode)`. After the deploy, each of these is permanent ABI.

**Effort.** S.

### M7. `notAhead` overclaims
`weather.gno:39-45`

**Issue.** The comment says the weather is "not scouted ahead". But `course.ForecastFor` is an exported pure function, and anyone can evaluate it for any future period. In addition, `playablePeriod` plus `Reset` lets a player choose between two weathers.

**Fix.** Reword the comment to say what the check actually does (it stops the hub serving the future), or drop the check.

**Effort.** S.

### M8. `Fit` mutates shared polygon slices in place
`course/fit.gno:85-87`

**Issue.** Two zones sharing one `Poly` slice get shifted twice. town15 works around this with a `roofs()` function that returns a fresh copy per zone (`town15.gno` comment: "A fresh copy for each zone: Fit moves every zone's polygon in place").

**Fix.** Copy `z.Poly` before shifting it. The result is identical for every current hole, and the trap is gone for future authors.

**Effort.** S.

### M9. Warning zones are Slopes with no push
`mountain9/mountain9.gno:22-23`, `mountain16/mountain16.gno:27` (`Skin: "avalanche-warn"`)

**Issue.** These zones are pure decor, but as Slopes they enter `groundSlopes` and mark the cause `'s'` in `Shot.Cause`. The client then colours the shot as if a hill had acted on it.

**Fix.** Use `Surface` with `Scale: 1`, as `molehill` and `mill` already do. There is no physical effect, but the Cause output and any golden will change, so coordinate with the physics review.

**Effort.** S.

### M10. `named` is a persisted func value
`golf.gno:113-115`, overridden in `golf_test.gno:431`

**Issue.** It is a package-level closure var, kept only as a test seam. It is unexported, so it is not exploitable, but it is function-valued realm state (`patterns.md` § Operational anti-patterns).

**Fix.** Make it a plain func. For the test, register the players in `r/sys/users`, or accept the seam and add a comment saying why.

**Effort.** S.

---

## DRY

### D1. 74 copies of `Register` and its three-line doc
**Fix.** See H4: `init(cur realm)` removes all of them, plus the four scripts.

**Effort.** S.

### D2. Repeated zone and shape patterns that belong in helpers
- **Four-arm mound** (four Slope zones round a core): island3 (twice), island7 and island16, 16 zones in all. Add `course.Mound(c physics.Vec2, half, core, push float64, skin string) []physics.Zone`.
- **Closed ring** `physics.Arc(c, r, 0, 2π, n)[:n]`: island7:25, island14:33, island17:25, town13:25. Add `physics.Ring(c, r, n)`.
- **Polygon bounding box**: `island8.gno` `pool()` computes it by hand. A `physics.PolyZone(kind, pts…)` that fills `Min` and `Max` would serve any polygon zone.
- **Redundant wrapper**: nested `physics.Walls(physics.Walls(…))` at hole13:23 and town16:24.
- **Generated floats**: literals like `13.769820000000001` and `6.6000000000000005` at town8:25-27.

**Fix.** Add the helpers to `/p/` now, because `/p/` is frozen too.

**Effort.** M. It is optional, and each change is local.

### D3. Field boilerplate in every hole
`Radius: 0.5, Bounce: 0.85, CupRadius: 1.2`, `Friction` 0.86/0.87, `course.Fit(…, 1.5)` and `Strokes: n, // par`.

**Recommendation.** Leave it. Explicit numbers read better on-chain than hidden defaults, and making 0 mean a default would change `Radius: 0 = point` semantics. The one-word `// par` comment explains a confusing field name (`Strokes`, which cannot be named `Par` because the method is), so keep that too.

### D4. Duplication inside golf
- **World list, three times**: `cupName` (`render.gno:51-66`), `worldRank` (`:559-571`) and `course.climates` (`course.gno:219-224`). Use one `[]struct{id, name string}` table in golf.
- **"Six writes (…)" sentence, twice**: `golf.gno:6-7` and `render.gno:174`. It is correct today (six crossing functions), but it will go stale the moment one changes. Keep it in one place.
- **Row builders**: `HoleLeaderboard`, `Bests`, `Standings` and `Leaderboard` each hand-build `sep(i)+"{"+"player":…` rows. A `playerRow(p string, kv string)` helper would do.
- **The clean\* functions are not duplicates.** `cleanName` (a markdown table cell), `cleanSkin` (a lookup id) and `mark` (a code-block rune) guard three different contexts. Keep all three.

**Effort.** S.

---

## Comments

### C1. Hole doc comments: spot-check against the current geometry
Geometry was checked where a doc makes a checkable claim.
- **Correct as written:** pulse and stroke parity in hole2, hole5, mountain13 and town15; tram phase gaps in town4 and town18; timing in mountain10 and mountain15; island7's tube.
- **island10:33.** The inline comment says "the low half of the first stretch, the high half of the last". With +Y down, the first gap (y 1.5–5.2 on a lane spanning y 2–8) is the top half on screen and the second is the bottom. Either the words are inverted or they use another reference; align them with the package doc ("near half / far half").
- **hole3:1.** It speaks of "a mountain between them" that is not in the geometry, and says nothing of the water and the uphill before the cup.
- **Grammar.** town14:1 "is the street ends at a house", mountain8:1 "is the ski lift runs", mountain17:1 "is a crevasse splits". The line wrap in mountain16:1-3 is broken.

**Fix.** Reword. A pass over the 12 redesigned holes (commit 998f6e1) against screenshots is worth doing.

**Effort.** S.

### C2. A grouped const comment becomes the doc of every const in the group
`course.gno:200-238`, and `physics` `LoopKeep`/`LoopOver` and `JumpSpeed`/`Lift`

**Issue.** Live, the `gno_read` outline shows the block's comment repeated on every const. `WetIce` reads "Wind blows between WindMin and WindMax…", and `RainScale`'s doc is an inner lowercase fragment ("how much quicker…"). Also, `Chance`'s doc starts "The climate:" (`course.gno:210`), not with its own name.

**Fix.** Give each exported const its own one-line doc.

**Effort.** S.

### C3. Two stale sentences in golf
- `golf.gno:17-19` says to record with "Reset + PlayRound"; the dapp sends Reset + `PlayRoundAt`/`PlayRoundPro` (`web/lib/adena.js:154-173`).
- The hub prints "most played: The Shelf" for a cup with 0 plays (live).

**Fix.** Reword the first; skip the "most played" line when there are no plays.

**Effort.** S.

---

## Tests

### T1. Covered
- slots and retire: `TestNewerHoleTakesTheSlot`;
- modes: `TestProRoundsRankApart`;
- named-only ranking and friends reads: `TestOnlyNamedPlayersRank`;
- paginated leaderboard: `TestHoleLeaderboardSortsBests`;
- timing tick: `TestTimingIsPartOfTheShot`;
- weather period rules;
- the stroke and path caps;
- the list cap;
- the top-ten size;
- the closed tube: `physics_test.gno:278-282`;
- the pin check: `TestAPinnedBallStops`, which is uncommitted;
- rain and puddles, through the golden `slope` fixture in rain.

### T2. Golden coverage
There are 6 synthetic fixtures (`zz_golden_test.gno:31-49`: timed, slope/rain, sea, tunnel, pulse, storm). None covers **Loop, Surface/ice, Slope take-off or the pin check**, and **none uses a real hole**. The 74 holes have no tests. Everything the hardening pass changed is unpinned, and a future helper refactor such as D2 has no safety net.

**Fix.** Add one test file per world, in a test-only package or a filetest per hole dir. It should register each hole, replay its `plan` from `scripts/hole-bests.json` through `SimulateRoundAt(…, period)`, and assert the strokes equal `best`. Add a sha of `State` as a golden.

**Effort.** M.

### T3. Untested
- **The gnoweb hole page.** `Render("<hole>")` and `Render("<hole>/<addr>")` are never called (only `Render("")` is).
- **Plain `Simulate`.**
- **Register guards.** The `/e/` MsgRun rejection (`golf.gno:181`) and the nil hole.
- **Inputs.** `HoleLeaderboard` limit clamping; `playablePeriod` accepting `now-1`.
- **Behaviour.** `Standings` after a retire; the `Launch` return strings.
- **Real name lookup.** `named`'s real `r/sys/users` path; the tests stub it out.

**Effort.** S each.

### T4. Stray scratch files in the golf directory
`r/gnogolf/golf/zz_scale_scratch_test.gno` and `zz_scratch{a,b,c}_filetest.gno` are untracked and belong to another agent. The three filetests fail `gno test`. Test files are not deployed (the deployed `physics` has no `_test` file), but delete these four before the deploy commit.

**Effort.** S.

---

## Idioms: what is already right
- The realm's globals are unexported (`holes`, `slots`, `totals`, `top`). Every exported name is a function or a constant.
- Panics are used for every rejected input. `/p/` never panics except on programmer error.
- All growing state is avl: `holes`, `slots`, `rounds`, `bests`, `totals`. The only map, `climates`, lives in `/p/`, is only looked up and never iterated, and is frozen.
- Identity is only ever `cur.Previous()`. There are no payments, so no `IsUserCall` question arises.
- Hole names are read once at `Register`, so list pages never call hole code.
- `jstr` escapes every control byte, and `mark`, `cleanName` and `cleanSkin` guard the markdown.
- `course.Simple` is allocated in each hole realm, so wear writes land in the hole's own storage, as documented.

**Only gap versus `patterns.md`.** State is spread across globals rather than one `State` struct. With no upgrade path (the hub is frozen and a v2 is a new realm) this costs nothing, provided H2 gives a v2 enough to read. No change is recommended.

---

## Pre-deploy checklist

- [ ] **H1.** Decide how a physics v2 hole registers (adapter or golf/v2), and fix the README.
- [ ] **H2.** Add paginated `Records`/`Players` reads and a JSON `"v"`, and fix the README's migration line.
- [ ] **H3.** Rank only rows with `holes > 0`, and move `TestLeaderboardRanksFinishedRounds` onto an official hole.
- [ ] **H4.** Decide on `init(cur realm)` registration. If yes: verify it on pearl, convert the 74 holes, delete the four scripts and the "cannot register from init()" comments.
- [ ] **H5.** Confirm the 3D client's domain for `playURL`, and freeze the `?cup=&hole=` contract.
- [ ] **H6.** Decide whether hole10/hole16 ("extras") count toward the course ranking.
- [ ] **M4 to M6.** Freeze the API: mode validation, `"mode"` in Leaderboard, drop `"by"`, keep or drop `PlayRound` and `Simulate`, the `PlayRoundPro` name.
- [ ] **M1, M2, M9.** Clean up the Skin-as-semantics and bumper leftovers in `/p/physics` (frozen with the first deploy), in step with `deep-physics.md`.
- [ ] **C1, C2.** Fix the hole doc comments and give each const its own doc; the gnoweb `$help` shows them.
- [ ] **T2.** Add a real-hole golden (solver plans from `hole-bests.json`) so the deployed geometry is pinned.
- [ ] **Stray files.** Delete `zz_scale_scratch_test.gno` and `zz_scratch{a,b,c}_filetest.gno`.
- [ ] **Commit what is deployed.** Commit the working tree: `step.gno` pin check, `physics_test.gno`, hole20, mountain11, mountain14, mountain16. The local chain already runs it, and HEAD does not match.
- [ ] **Clean run.** `gno fmt -w scripts/` (import order); run `gno lint` and `gno test` once more on a clean tree.
- [ ] **Namespace.** Register the `gnogolf` namespace on the target chain for the deploying key.
- [ ] **Deploy order.** `p/gnogolf/physics`, then `p/gnogolf/course`, then `r/gnogolf/golf`, then the holes (the dependencies `r/sys/users`, `p/nt/avl/v0` and `p/nt/ufmt/v0` are present on pearl). Then check that `Holes()` lists 72 or 74 and that `Leaderboard` shows `"holes"` at the expected count.
- [ ] **Frozen with the hub.** Nothing about these can be changed later, so review them once: `maxShots` 12, `maxRoundStrokes` 60, `maxPath` 512, `maxTick` 1023, `topSize` 10, `holeTop` 100, `maxListed` 120, `maxFriends` 50, `PeriodSeconds` 300, the climates table, `Kick`, `CaptureSpeed`.
