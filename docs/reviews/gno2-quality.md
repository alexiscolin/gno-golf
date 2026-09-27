# Gno code quality review, second pass

Scope: `p/gnogolf/physics`, `p/gnogolf/course` and `course/fingerprint`, `r/gnogolf/golf`, the 74 hole realms and `scripts/register-*.gno`, at HEAD `6c5cdb6`. The working tree is clean. No code was changed.

This pass covers cleanliness and best practice: idioms, DRY, comments, tests, formatting and lint, magic numbers and dead code. Physics correctness and security are out of scope. The previous review is `deep-code-gno.md`; § "Since the last review" lists what was fixed.

The code was checked against the gnomcp `gno` skill: SKILL.md, `patterns.md`, `build.md`, `memory.md`, `stdlib.md` and `render.md`.

## How it was checked

- **Tooling.** Everything ran at `nice -n 20` with `/tmp/claude-501/gnobin` (`gno version: develop`, GNOROOT at `9951541d9`).
  - **Formatting.** This build has no `gno fmt -l`, so `gno fmt -diff` was used instead. It is read-only.
  - **Lint.** `gno lint ./...`.
  - **Tests.** `gno test -v` on every package.
- **Live chain.** gnomcp, profile `gnogolf` (`test-gnogolf`, height 2).
  - `gno_read` outlines give the deployed byte sizes. `golf` (4 files), `physics` (5), `course.gno` and a sample of holes match the local files byte for byte. The deployed code is HEAD.
  - `gno_eval` was run on `Leaderboard`, `Weather`, `Records`, `Players` and `Extras`.
  - `gno_render` was run on the hub and on `mountain6`.
  - `p/gnogolf/course/fingerprint` is not deployed, and it could not be (see Q1).
- **Tests.** All of them pass:

  | Package | Time |
  |---|---|
  | physics | 2 s |
  | course | 0.5 s |
  | golf | 10 s |
  | the 74 holes | 62 s wall |

  The hole suites add up to 829 s of CPU and about 2.0e12 gas. Each hole takes 5 to 24 s; the slowest are hole16 (24 s), mountain11, mountain16, hole18 and hole14.

**Tags.** Every finding carries one of these:
- **[refactor]**: the fingerprints and the JSON cannot move.
- **[fp-check]**: a refactor that should be bit-identical, but only the fingerprint suite can prove it.
- **[behaviour]**: it moves fingerprints or changes the JSON or page output.
- **[frozen]**: it touches a `/p/` or golf export, which cannot change after the deploy.

**Effort.** S is under an hour, M is half a day.

---

## Q1. Lint is red: `fingerprint.gno` imports `testing` in a non-test file (new)

`p/gnogolf/course/fingerprint/fingerprint.gno:13`, and through it all 74 holes.

**Issue.**
- `gno lint ./...` exits 1 with `unknown import path testing (code=gnoUnknownError)`. The error is reported 74 times, once per hole that imports the package, plus one `gnoImportError` for the package itself.
- `testing` exists only for `_test.gno` files. So the package cannot be deployed, and the whole workspace can never lint clean, which hides any real lint error that appears later.
- The previous review reported "lint clean on 76 packages". This package came after it, in `247f09d`.

**Fix.** Keep `Of` as it is, and make `Check` take a small interface instead of `*testing.T`:

```go
type T interface {
	Logf(format string, args ...any)
	Errorf(format string, args ...any)
}
func Check(t T, h *course.Simple, want string) { … }
```

Then drop the `testing` import. The 74 `fingerprint_test.gno` files compile unchanged, because `*testing.T` satisfies `T`. Also say in the package doc that it is never deployed.

**Effort.** S. **Tag.** [refactor]: no hash moves.

## Q2. `gno fmt` diffs (partly new)

- `r/gnogolf/hole10/hole10.gno:13`, `hole16/hole16.gno:13` and `town10/town10.gno:35`: the field alignment in the `course.Simple` literal. These are new.
- `scripts/register-*.gno` (all four): the import order, as in the previous review.

**Fix.** Run `gno fmt -w` on the three holes. For the scripts, run the same, or delete them (D1).

**Effort.** S. **Tag.** [refactor].

---

## High: the frozen surface, before the deploy

### F1. Dead exports in `/p/physics`

These exports are never used outside the package, or anywhere:
- `vec2.gno:63` `Reflect`: used only by its own test.
- `shapes.gno:21` `Segment.Hit`: Step uses `hitN`.
- `shapes.gno:57` `Segment.Toward`: `walls.gno:22-44` `lines()` re-implements it inline.
- `field.gno:72` `Wall.There` and `field.gno:168` `Zone.There`: Step calls `there()` directly.

After the deploy, each of these is permanent ABI and has to stay bit-compatible for as long as the package lives.

**Fix.** Unexport them or delete them. Keep `Segment.Crosses` and `Closest`, which `course` uses. Also reword `lines()`'s doc, which says "exactly the arithmetic of Normal and Toward", so that it does not name a symbol that is gone.

**Effort.** S. **Tag.** [refactor] [frozen].

### F2. `/p/course` exposes a type and a helper nobody outside needs

- `course.gno:210-215`: `Chance` is exported, but it is only the element type of the unexported `climates`. No caller can build or read one. Its doc also starts "The climate:" rather than with its name.
- `course.gno:250`: `Hash` is used only inside the package.
- `course.gno:114`, `144`: `WearIndex` and `Marks.Mark` are the default-board variants. No hole uses them: every `Simple` goes through `MarkOn` and `WearIndexOn`. They are defensible as part of the toolkit for hand-written holes, but decide that now, while they can still go.

**Fix.** Unexport `Chance` (as `chance`) and `Hash`. Keep or drop `Mark` and `WearIndex` on purpose.

**Effort.** S. **Tag.** [refactor] [frozen].

### F3. The timing rule is one idea with two names and two implementations

- `physics.there(i, every, on, phase)` (`field.gno:77-79`) is sign-safe and uses the field `Phase`.
- `course.Pulse.at` (`course.gno:442-447`) is `(stroke+Offset)%Every < On`. It uses the field `Offset` and is not sign-safe: a negative `Offset` misbehaves.
- An author has to learn that `Phase` on walls and zones means what `Offset` means on pulses.

**Fix.** Rename `Pulse.Offset` to `Phase` and implement `at` by calling a shared rule. The rule must be exported from physics (for example `physics.On(i, every, on, phase)`), or `course` has to duplicate it with the sign-safe mod. This is an API rename: the 20 timed holes change their source, but their pulses keep the same values.

**Effort.** S. **Tag.** [refactor] [frozen].

### F4. 74 public `Register` entry points, and a comment that contradicts golf

`hole*/…:37-39` (72 files), `hole4/hole4.gno:70`, `hole19/hole19.gno:54` (no doc at all); `scripts/register-*.gno:1-3`.

**Issue.**
- Every hole says "A hole cannot do it from init(): there is no `cur` there". golf's own `Register` doc (`golf.gno:219-222`) says a hole registers "from its own code (its init(cur realm), …)". The previous review confirmed that `init(cur realm)` works on this toolchain.
- The result is 74 identical, permanent crossing functions that panic "already registered" after their first call, and four scripts that have to be kept in step with the directory listing by hand.

**Should init registration be used? Yes.** The holes already import golf, so golf is always deployed first. A hole then cannot exist unregistered. A registration failure, such as a nil hole, fails the deploy instead of failing silently afterwards. Registration adds nothing to `fingerprint.Of`, so no hash moves. The one precondition: check once, on pearl, with a throwaway package, that `init(cur realm)` plus a cross-call is accepted there.

**Fix.** In every hole, replace `Register` with this, then delete the four scripts:

```go
func init(cur realm) { golf.Register(cross(cur), me) }
```

**Effort.** S (a mechanical `sed`). **Tag.** [refactor] as far as the physics goes. It is a deploy-flow change, so do it as its own commit.

### F5. The skin catalogue in `/p/physics` is stale, and frozen

`field.gno:33-54`.

**Issue.** The list "The ones in use so far, which a theme pack should cover first" no longer matches the holes:
- **Used but not listed (39):** avalanche-warn, bandstand, blowhole, brick, canal, castle tube, cat, chimney, downhill, driftwood, fountain, funbox, gnome statue, gust, herringbone, ice cave, kicker, lantern, ledge, marble, moon bridge, net, obelisk, pigeon, plank bridge, quarter pipe, rail, rampart, roof, roundabout, saddle crest, scarecrow, sea, seesaw, serac, skater, soil, sunflower, wheelbarrow.
- **Listed but no longer used:** boardwalk, buoy, chalet, dune, hay, lighthouse, loop, shipwreck, snowman, warp, wave.

A comment in a `/p/` package cannot be corrected after the deploy.

**Fix.** Replace the list with one sentence: skins are lookup ids, and the client's table is the catalogue. Keep only the reserved weather skins (`wind rain fog storm snow`), which `course.WithWeather` does give meaning to.

**Effort.** S. **Tag.** [refactor] [frozen].

### F6. Const groups repeat one comment on every member in `$help` (C2, unfixed)

Live, the `gno_read` outline shows:
- "The zone kinds." five times (`field.gno:114-130`);
- the JumpSpeed doc on `Lift` (`step.gno:62-68`);
- the board comment on `BoardW`, `WearW` and `MaxBoard` (`course.gno:12-20`);
- "The weather kinds…" on `Clear` through `Snow` (`course.gno:200-208`);
- "Wind blows between…" on `WetIce` and `SnowScale`, while `RainScale`'s doc is a lowercase inner fragment (`course.gno:226-238`).

**Fix.** Give each exported constant its own one-line doc: a trailing `// …` comment is enough for the kinds and the weather names.

**Effort.** S. **Tag.** [refactor] [frozen].

---

## Medium: DRY

### D1. The 74 holes
- **`Register` and its two-line comment, 74 times.** See F4: `init(cur realm)` removes 222 lines and 4 scripts.
- **`fingerprint_test.gno`, 74 identical 10-line files.** Only the package name and the hash differ. That is the price of `me` being unexported, and it is acceptable: a shared test in golf would need golf to import the holes, which is an import cycle. Keep the files, but see T1 for making them cheaper.
- **Field boilerplate.** `Radius: 0.5, Bounce: 0.85, CupRadius: 1.2, Friction 0.86/0.87, Fit(…, 1.5)`. As before, leave it: explicit reads better on chain.

### D2. Repeated geometry that belongs in `/p/` helpers (unfixed from the last review)

| Pattern | Where | Helper | Tag |
|---|---|---|---|
| Closed ring `Arc(c, r, 0, 2π, n)[:n]` | island7:25, island14:33, island17:25, town13:25 | `physics.Ring(c, r, n)` (the same arithmetic) | [refactor] |
| Four-arm mound: 4 Slope zones round a core | island3:31-38 (twice), island7:42-45, island16:26-29 | `course.Mound(c, arm, core, push, skin)` | [fp-check]: `16-2.4` is not guaranteed to equal the literal `13.6`. Let the fingerprints decide; if one moves, keep the literals. |
| Polygon bounding box | island8:16-35 `pool()`, and by hand in hole12, hole16, hole20, island5, island15, town18 | `physics.PolyZone(kind, pts…) Zone` that fills Min and Max | [fp-check] (the hand-written Min/Max are sometimes looser than the true box) |
| Nested `Walls(Walls(…))` | hole13:23, town16:24 | drop the inner call | [refactor] |
| Generated floats `13.769820000000001`, `6.6000000000000005` | town8:25-27 | compute them from the clock centre, or round the literals | [behaviour]: rounding changes the bits, so town8's hash moves |

**Effort.** M overall. Each change is local.

### D3. Inside golf
- **World list, three times.** `cupName` (`render.gno:51-66`), `worldRank` (`render.gno:607-619`) and the keys of `course.climates`. The live hub also shows the fourth world "extras" only through the capitalised fallback. Use one table in golf, `[]struct{ id, name string }`, and derive the rank from the index. [refactor]
- **Row builders.**
  - `"player":…,"strokes":N}` is built 3 times: `state.gno:485`, `520`, `558`.
  - `"player":…,"holes":H,"strokes":S}` is built 3 times: `state.gno:444`, `538`, `572`.
  - Use `strokesRow(p, n)` and `standingRow(p, r)`. [refactor], and the bytes stay identical.
- **Limit clamp, twice.** `HoleLeaderboard` (`state.gno:463-471`) and `page()` (`state.gno:593-598`). Use `clampLimit(n)`. [refactor]
- **Walking the top ten, twice.** `Leaderboard` (`state.gno:438-447`) and `renderHub` (`render.gno:160-169`) run the same `ranks[m].Iterate` loop with the same `named` skip. Write `eachRanked(m, limit, fn)`, alongside `eachRound`. [refactor]
- **Timing JSON, twice.** `wallsJSON` (`state.gno:345-347`) and `zoneTiming` (`:381-387`) print the same `every,on,phase` triple. Use `timingJSON(every, on, phase)`. [refactor]
- **`Weather` splices a JSON string.** `weather.gno:36` does `"{"+versionJSON+","+forecastJSON(…)[1:]`, which slices off the `{` of another function's output. Give `forecastJSON` a prefix argument instead. [refactor]
- **The "Every write (Register, Launch, …)" sentence, twice.** `golf.gno:6-7` and `render.gno:218`. It goes stale the moment a write changes (F4, M6). Keep it in one place, the page, and let the package doc say "see the hub". [refactor]
- **`holeNo` is in the wrong file.** It lives in `render.gno:663-675` but is only used by `Register` (`golf.gno:246-259`). Its `1<<20` sentinel is compared as `order != float64(holeNo(""))`. Move it to `golf.gno`, and name the sentinel `const unnumbered = 1 << 20`. [refactor]
- **The par bounds are checked twice, differently.** `course.ParOf` accepts 1 to 19 (`course.gno:67`); `Register` accepts 1 to 20 (`golf.gno:251`). Since `ParOf` never returns 20, golf's check is dead. Keep one of them. [refactor]

### D4. Between course and physics
- **Field-derivation helpers are split across the two packages.** `physics.WithTick` is in physics; `course.WithZones`, `WithExtras` and `WithWeather` are in course. They are all the same pattern, "copy the Field and add something". This is acceptable, because the timing belongs to physics and the stroke to course. Leave it, but note it in both docs.
- **The board size is decided twice.** `course.BoardOf` (`course.gno:74-82`) enforces `MaxBoard`; `Simple.Board` (`:570-575`) does not. So a `Simple` with W > 96 marks its wear on one board while golf draws another. `Fit` never produces one today. Make `Simple.Board` call the bounded rule. [refactor] for every current hole.
- **Timing rule:** see F3.

---

## Medium: comments

### C1. Hole doc comments vs the current geometry

Every one of the 74 doc comments was checked against its geometry. Stale ones:

| Hole | Line | Issue | Fix |
|---|---|---|---|
| mountain6 | 1 | "two boulders out on the ice", but there are **three** (27,8.2), (30.5,11) and (31,14.4), confirmed on the live page | "three boulders" |
| hole3 | 1 | "a mountain between them": there is no mountain. The water and the uphill before the cup go unmentioned | "two lanes and a tunnel between them: over the sand, down the tunnel, past the pond and up to the cup" |
| island10 | 2, 33 | The package doc says "the far half of the next stretch"; the gap is on the **last** of the three stretches. The inline comment says "low half"/"high half", but the first gap is at y 1.5-5.2, which is the top half on screen | Use "near/far" or "top/bottom" (screen) in both, and "last stretch" |
| hole4 | 25-29 | The comment says "a third of the way … (the low door) and two thirds (the high one)". In the code, `sail(0,1,2)` is `doors[0]` = y 2.4 (the top of the screen) at a third, and `sail(2,1,4)` = y 9.6 at two thirds. So "low" and "high" are inverted in screen terms | "(the top door) … (the bottom one)" |
| town12 | 1 | "mind the puddle at the top": the puddle (y 13.4-18.4) sits at the bottom of the U on screen | "at the bottom of the curve" |
| hole8, town11, hole2, hole10, hole14, hole17 | hole8:1, town11:1 | "lively bumpers" and "they pass the ball round" promise energy; `Bounce` 1.1-1.3 is played at `MaxBounce` 0.92 | Set the values to 0.92 and soften the words (see M1) |
| town14, mountain17 | 1 | Grammar: "is the street ends at a house", "is a crevasse splits the glacier" (unfixed) | "is a street that ends…", "is a glacier split by a crevasse…" |
| mountain16, hole20, island5 | mountain16:1, hole20:6, island5:5 | Broken wrapping: one line of 170 characters, then short ones | Rewrap |

These were checked and are correct as written: the pulse and stroke parity (hole2, hole5, island3, island14, town10, town15, town17, town18 pigeons, mountain9, mountain13, mountain16); the timed walls (town4 "a quarter turn apart", town18 "half a turn apart, 5 in 24", mountain8's lift phases 0/8/4, which are up the lane a third each, island11, island15); the take-off holes (mountain5, mountain12, hole12); and island7's tube.

**Style.** 43 holes have package-doc lines over 80 columns, some in one unwrapped sentence of 150 to 190 characters (hole13, hole14, island3, island7, town2, town5, mountain1-7…). `$help` and `gno doc` show them as they are. Wrap them at about 76 columns, as the rest do.

**Effort.** S. **Tag.** [refactor].

### C2. Stale comments after the fixes
- **`course.gno:94-95` and `field.gno:191`:** "the text board today, a client later" and "text today, a 3D client later". The 3D client exists.
- **`course.gno:469`:** "Pulses cover … hole4's sails". hole4's sails are timed walls (`physics.Timed`), not pulses; its own doc says so. Use town10's bridge or island14's log as the example instead.
- **`field.gno:199-201` and `field.gno:214-218`:** "0 is a point, the original model" and "The ball is a point…". Every hole plays at `Radius: 0.5`, so the `Bar` rationale reads as if it applied to the current model. Reword: "with Radius 0, the ball is a point…".
- **`step.gno:312`:** an orphan line ("friction never pushes: ice lets the ball run on…") stands above the "Rolling resistance" paragraph it belongs with, and above the `0.98` cap it actually explains. Move it to the cap.
- **`step.gno:337-339`:** two comments about two different statements are stacked out of order. Move "a ball at rest is on the ground" to line 340.
- **`golf_test.gno:58`:** "// course registers a flat hole…" is the doc of `courseHole`. Name it correctly.

**Effort.** S. **Tag.** [refactor]. The `/p/` ones are [frozen].

### C3. Change history and references to internal files in on-chain source
- **`golf.gno:437`:** `docs/reviews/fix-hub.md` is a repository path, and nobody reading `$source` on chain can open it. Say what was measured, not where it is written up.
- **`golf.gno:448` and `render.gno:654`:** `// ponytail: …` is a tooling tag. Keep the ceiling and the upgrade path as plain prose: "an estimate, not a gas meter…", "insertion sort, fine for 120 entries".
- **Past values kept in comments.** These read as a changelog, and belong in commit messages:
  - `course.gno:231-234`: "(At 1.12 it hit the 98% cap…)"
  - `course.gno:588-589`: "at 1, as it was, it rolled one and a half"
  - `mountain11:35`: "(at 0.12 it held it)"
  - `mountain12:35`: "(at 0.14 it only crept)"
  - `hole16:28-29`: "(at 0.15 it only crept…)"
  - `island7:39-40`: "at 1 a strong ball stepped over it"

  The ones in `/p/` are frozen. Keep the constraint ("steep enough to roll a stopped ball", "the mouth is deeper than MaxMove") and drop the history.
- **`fixes_test.gno:19`** "The tests of the 2026-09-25 hub fixes (docs/reviews/fix-hub.md)". Tests are also named by review ticket: "B3:", "C4:", "C5:", "C6:", "C7:". See T3.
- **Floating doc block.** `state.gno:546-550` "The paged reads walk everything by address…" is attached to no symbol. `$help` for `Records`, `Players` and `Rounds` therefore says nothing about `after`, `limit` and `next`. Move it into `Records`' doc, and let the other two say "paged like Records".
- **Public docs point at an unexported function.** `golf.gno:16` and `state.gno:227` say "see official()", which `$help` readers cannot see. Say the rule instead: "under r/gnogolf/, on a chain that enforces namespaces".
- There are no `Note:` comments left.

**Effort.** S. **Tag.** [refactor].

---

## Medium: magic numbers and dead code

### M1. Dead values, dead code, and an unused export in a realm
- **`town10/town10.gno:14`:** `var canal = physics.V(20, 0)` is never read. It is a persisted global paying storage for nothing. Delete it. [refactor]
- **`hole4/hole4.gno:30`:** `const Turn = 24` is exported from a realm for no caller. Name it `turn`. [refactor]
- **`step.gno:458-460`:** `isAir(z)` is `return z.Air`, a wrapper left over from the skin-based rule. Inline it. [refactor]
- **Bounce 1.1-1.3 in six holes** (hole2, hole8, hole10, hole14, hole17, town11: 28 values). They are clamped to 0.92 at every hit (`step.gno:282`), and `Bounce` is not in the JSON. Setting them to 0.92 is therefore bit-identical. [refactor], and the fingerprints will confirm it.
- **`state.gno:473-475`:** `HoleLeaderboard` allocates an `avl.NewTree()` inside a read just to iterate an empty board. Branch on `board == nil` instead. [refactor]
- **`golf.gno:315`:** `archiving = archiving[1:]` keeps the whole persisted backing array. It is tiny today, since it only grows on archive events. Rebuild the slice when it empties. [refactor]

### M2. Magic numbers that should be named
- **physics, `step.gno`:**
  - `0.05` (a hidden friction offset: `Field.Friction`'s doc "0.8 rolls to a stop in about a dozen" ignores it) and `0.98` (the keep cap), at `:316-318`;
  - `0.02` (the stop speed), at `:325`;
  - `0.7071` and `0.9063` (cos 45° and cos 25°, the Loop's "heading in" and "slanted"), at `:421` and `:426`;
  - `0.01`, `1.5` and `-0.5` (the Loop's front offset, its drop distance and its bounce-back), at `:427-443`.
- **physics, `walls.gno`:** `0.02` (the unstick clearance), at `:166` and `:176`.
- **course:**
  - `wet()` (`course.gno:343-359`): 2 to 4 puddles, 60 tries, a radius of 1.1 plus up to 0.7, the 0.8 aspect, the 0.6 scale and the 0.5 spacing;
  - `dryLand()` (`:372-393`): the 2 and 0.3 clearances, and the far point `(1e4, 37)`;
  - the storm (`:319-321`): 0.7 rad and 6/3;
  - `Sink` (`:617`): `CaptureSpeed*1.5`.
- **golf:**
  - `cleanName` 40 (`golf.gno:686`) and `cleanSkin` 24 (`:708`);
  - `polyJSON` 256 (`state.gno:396`);
  - order bounds ±1e6 (`golf.gno:247`);
  - wear thresholds 2/6/14 (`render.gno:481-487`);
  - tunnel digits `< 9` (`render.gno:351`);
  - the prose "a power of 10 rolls about 40, a 5 about 15" (`render.gno:279`), which depends on `Kick` and friction and goes stale silently if either changes.

**Fix.** Use unexported named constants with the same values. Go constants are exact, so [refactor]. The physics ones are the most worth doing: they are the game's tuning knobs.

**Effort.** S to M.

### M3. Still-open behaviour items from the last review (not refactors)
- **M9, the warning zones.** `avalanche-warn` in mountain9:22-23 and mountain16:27 is a zero-Vec `Slope`. It still marks `'s'` in `Shot.Cause`, because `zonesAt` marks any slope. Make it a `Surface` with Scale 1, as `molehill` and `mill` are. **[behaviour]**: Cause is hashed, so mountain9's and mountain16's fingerprints can move.
- **M8, `Fit` shifts polygons in place.** `fit.gno:93-95`. town15:16-17 still works around it with `roofs()` copies. Copying `z.Poly` in `Fit` is bit-identical for all current holes, because no two zones share a slice today. [refactor]
- **M6, entry points no client uses.** `PlayRound` and `Simulate` are still exported (`golf.gno:376`, `state.gno:251`) and no client calls them. **[frozen]** decision. `Simulate`'s power quantisation is fixed: `validShot` now applies `q4` to both.
- **M5 leftovers, JSON key consistency.** The hole key is `"id"` in `Holes` and `"hole"` everywhere else. `Holes` uses `"best"`/`"proBest"` while every other read is keyed by mode. Clear weather is `"kind":""`. **[behaviour] [frozen]**: the client parses these.
- **H6.** Live, `Leaderboard` still reports `"holes":74`, which includes the two "extras" holes. A decision, not a cleanup.

---

## Tests

### T1. Speed: the fingerprint suite can be cut by about a third without moving one hash
`course/fingerprint/fingerprint.gno:46-66`.

**Issue.**
- Each hole plays 432 previews: 3 weathers × 24 angles × 3 powers × 2 (stroke 0 at tick 0, and stroke 1 at tick 5).
- Measured here: 62 s wall with the packages in parallel, 829 s of CPU, about 2.0e12 gas. On a busier machine or a serial run, that is the ~3 min you see.
- **54 of the 74 holes have no pulse, no timed wall and no timed zone.** The weathers `Of` uses are calm, rain and wind, and none is timed; only the storm's gusts are. So for those 54 holes, the stroke-1/tick-5 shot is bit-for-bit the stroke-0/tick-0 shot.

**Fix.** In `Of`, when `!h.Varies()` and no wall or zone of the field or of the weather has `Every > 0`, compute the shot once and append its bytes twice. The hash input is identical, so every hash stays; the tests will prove it. That cuts 54 × 50% ≈ 36% of the suite. Beyond that, fewer angles or powers would require regenerating every hash in one commit that is labelled as such.

**Effort.** S. **Tag.** [refactor] (no fingerprint moves).

### T2. Order-dependent state in the golf tests
- **`fixes_test.gno:268-287` `TestOfficialNeedsNamespaces`.**
  - It calls `names.Enable(cross(cur))` and never undoes it, so every test that runs after it sees a chain that enforces namespaces.
  - It also restores the chain ID with a trailing `setContext(...)` instead of a `defer`. If an assertion aborts in between, every later test runs on "pearl-1", and every official hole silently stops being official.
- **`fixes_test.gno:334-347`.** The same trailing restore of `Time`.
- **`zz_golden_test.gno`.** The `zz_` prefix exists to order the file last, which admits an order dependency. `State` is hashed at `Period()` of the shared test clock.
- **`TestOfficialHolesAreListedFirst` (`zz_golden_test.gno:171-190`).** It leaves 122 registered holes behind for every later `Render("")` and `Holes()`.

**Fix.** Use `defer setContext(restore)`. Do not enable names in a shared package state, or restore it. Rename `zz_golden_test.gno` to `golden_test.gno`, and make the goldens take an explicit period from a fixed context time.

**Effort.** S. **Tag.** [refactor].

### T3. Organisation, duplicated helpers, and history tests
- **Files named after a review, not a feature.** `fixes_test.gno`, with "B3/C4/C5/C6/C7" ticket prefixes in the test comments. Fold the tests into `golf_test.gno`, or split by feature: rounds, rankings, reads, weather.
- **Tests that pin something gone.** `TestNoByField` (`:299-304`) asserts that a removed field stays removed, and `TestTheHubSaysWhoHoldsPower` asserts that an old sentence ("not for us either") is gone. These pin history, not behaviour. Drop them, or fold them into one JSON-shape test.
- **Duplicated helpers.** The golden's `v()` (`zz_golden_test.gno:20`) duplicates `physics.V`. `course_test.gno:85` `all(...)` re-implements `WeatherFor`'s inner closure. Use `physics.V`, and build the zones through `WeatherFor`.

**Effort.** S. **Tag.** [refactor].

### T4. Coverage per feature

| Feature | Covered by |
|---|---|
| Physics primitives, take-off, pin, timed pieces, LenCmp and Prepare equivalence | `physics_test.gno`, 40 tests |
| Sink, pulses, weather layering, Fit | `course_test.gno`, `fit_test.gno` |
| Every real hole's geometry: Loop (island7), ice, take-offs (mountain5, mountain12, hole12), seesaw, trams | the 74 fingerprints (the previous T2 is fixed) |
| golf: rounds, modes, ranking, archive and drain, work budget, paged reads, stale rounds, goldens | `golf_test`, `fixes_test`, `zz_golden_test` |

**Still untested:**
- the gnoweb **hole page**, `Render("<hole>")` and `Render("<hole>/<addr>")`, and with it `board`, `blankUnreachable`, `key`, `legend` and `weatherNote`. Only `Render("")` is called.
- `Fit` with two zones sharing a polygon (M3/M8).
- `Pulse` with a negative `Offset` (F3).

The golf package has no filetest, so a golden `Render` of one fixture hole page (the "pulse" fixture) is the cheapest net for the page.

**Effort.** S.

### T5. Do the goldens say why they change?
- **`zz_golden_test.gno:72-75`: yes, once.** A dated paragraph says what changed ("version", "rest", "official", no "by") and that the replays did not.
- **The 74 fingerprints: no.** They moved in `247f09d` and `c88c01e`, and the only record is the commit body ("hole bests regenerated for all 74 holes"). Nothing ties a moved hash to its hole's change.

**Fix.** Adopt a convention: a commit that changes a fingerprint lists each moved hole with its reason, in the form `hole20: seesaw pivot, par 3`. `Check`'s failure message can say so ("…paste it in, and say why in the commit"). A comment per file would add noise across 74 files.

**Effort.** S.

---

## Idioms: what is right, and what is still open

**Right.**
- **Crossing discipline.** Identity is only ever `cur.Previous()`. `Register` is the only function that accepts a caller-supplied interface, and it reads the hole's name, world, order and par once.
- **Globals.** They are unexported. The only exported realm symbols are functions and `PeriodSeconds` (hole4's `Turn` excepted, see M1).
- **Panics vs errors.** Panics are used for every rejected input, and `/p/` never panics.
- **Storage.** All growing state is in avl trees. `climates` is a small map that is only looked up, never iterated.
- **Pointers.** `course.Simple` hands golf a `*physics.Field` that belongs to the hole realm. It is readonly-tainted on golf's side, and golf only reads it.

**Open.**
- **State shape.** State is still spread across seven globals (`holes`, `slots`, `totals`, `ranks`, `archiving`, and the per-entry trees) rather than one `State` struct (`patterns.md` § Single top-level struct). With no upgrade path, and with `Records`, `Players` and `Rounds` now giving a v2 everything it needs to read, that is fine. No change is recommended.
- **Naming.**
  - `course.Launch` (a velocity) and `golf.Launch` (a transaction) are two exported functions of the same name with different meanings.
  - `Simple`'s field and method pairs (`Strokes`/`Par()`, `Title`/`Name()`, `Order`/`Position()`, `World`/`WorldName()`, `Course`/`Field()`) exist only to avoid a name clash. Say so once in `Simple`'s doc rather than in a `// par` comment on every hole.
- **Rendering.** `renderHole` and `board` build large pages with `s +=`, while the JSON uses `strings.Builder`. It is a consistency issue; the gas side belongs to the performance review.

---

## Since the last review (`deep-code-gno.md`)

| Item | Status |
|---|---|
| H2 paged reads, `"version"` | Fixed: `Records`, `Players`, `Rounds`, and `"version":1` on every read |
| H3 zero-hole rows | Fixed: `setRow` drops rows with `holes <= 0`; `TestNoZeroHoleRows` |
| H4 / D1 init registration | **Open** (F4); the stale comment is still in 72 holes |
| H6 extras count | **Open**: live, `"holes":74` |
| M1 dead open-loop branch, skin semantics | Fixed: `LoopOver` and `closedLoop` are gone; `Air`/`Capped` are fields |
| M2 `Push` and the energy comments | Fixed; **Bounce > 0.92 values remain** (M1 here) |
| M3 players vs finished, Leaderboard doc | Fixed |
| M4 unknown modes, `"mode"` in Leaderboard | Fixed (live: `Leaderboard("xyz")` panics) |
| M5 JSON shape | `"by"` dropped and `"version"` added; `id`/`hole`, `best`/`proBest` and `kind:""` **open** |
| M6 `PlayRound`, `Simulate` | `Simulate` quantises the power now; still exported, still unused (**open**) |
| M7 `notAhead` wording | Fixed |
| M8 `Fit` in-place polygons | **Open** |
| M9 warning zones as Slopes | **Open** |
| M10 `named` as a func var | Fixed: a plain function |
| D2 geometry helpers, D4 golf duplication | **Open** (D2, D3 here) |
| C1 hole docs | mountain8 fixed; hole3, island10, town14, mountain17 and mountain16 **open**, plus mountain6, hole4 and town12 (new) |
| C2 const-group docs | **Open** (F6) |
| C3 golf doc, "most played" at 0 | Fixed |
| T2 real-hole goldens | Fixed: 74 fingerprints |
| T3 hole page untested | **Open** (T4) |
| T4 scratch files | Fixed |
| Lint | **Regressed** (Q1) |
| fmt | scripts **open**; 3 holes new (Q2) |

---

## Cleanup plan

The steps are ordered so that no fingerprint moves until the last phase. Run `gno test` over the 74 holes after each phase: a pure phase must leave every hash exactly as it is.

### Phase A: pure refactors, no fingerprint or output can move
1. **Q1:** remove the `testing` import from `fingerprint` (the `T` interface). `gno lint ./...` should then pass.
2. **T1:** skip the duplicate stroke-1 shot for untimed holes in `fingerprint.Of`. The hashes stay the same and the suite gets about 36% faster, which makes every later phase cheaper to check.
3. **Q2:** run `gno fmt -w` on hole10, hole16 and town10.
4. **Comments** (C1, C2, C3, F5, F6): hole docs, stale `/p/` comments, the skin catalogue, per-constant docs, the internal-file and `ponytail:` references, the floating doc block for the paged reads, and the change-history sentences.
5. **Dead code** (M1, F1, F2):
   - delete `town10`'s `canal` and `isAir`;
   - unexport hole4's `Turn`, physics' `Reflect`/`Hit`/`Toward`/`There`, and course's `Chance`/`Hash`;
   - drop the `HoleLeaderboard` empty-tree allocation.
6. **Named constants** (M2): same values, unexported.
7. **golf DRY** (D3): the world table, the row builders, `clampLimit`, `eachRanked`, `timingJSON`, the `forecastJSON` prefix, `holeNo` and its sentinel, one par check, and the one "every write" sentence. The JSON bytes stay identical, and the goldens check them.
8. **Holes:**
   - drop the nested `Walls(Walls())` in hole13 and town16;
   - add `physics.Ring` and use it in island7, island14, island17 and town13;
   - set Bounce > 0.92 to 0.92 in six holes, which is bit-identical because of the clamp.
9. **`Fit`** copies polygons (M8); remove the `roofs()` workaround comment in town15. Keep the function, or share one slice if you like.
10. **F3:** rename `Pulse.Offset` to `Phase` over the shared timing rule, which is sign-safe. The values are the same, so the behaviour is the same.
11. **Tests** (T2, T3): `defer` the context restores, stop leaking `names.Enable`, rename `zz_golden`/`fixes_test`, remove the history tests, and add a golden for the hole page (T4).

### Phase B: the deploy flow, which moves no fingerprint but changes how holes register
12. **F4:** check `init(cur realm)` once on pearl with a throwaway package. Then convert the 74 holes to `func init(cur realm) { golf.Register(cross(cur), me) }` and delete `scripts/register-*.gno`. That also removes the scripts' fmt diffs.

### Phase C: may move fingerprints, which the suite then verifies (one commit each, naming each hole that moves)
13. **D2 `course.Mound`** (island3, island7, island16) and **`physics.PolyZone`** (island8 and the hand-boxed polygons). If a hash moves, keep that hole's literals; the helper is not worth a behaviour change.

### Phase D: behaviour changes, flagged and decided before the deploy
14. **M9:** make the `avalanche-warn` zones `Surface` zones. mountain9 and mountain16 may move through `Cause`.
15. **D2:** round town8's generated floats. town8 moves.
16. **M3 / M5 / M6 / H6, the frozen API and JSON:** the `id`/`hole` key, `best`/`proBest`, `kind:""`, whether to keep `PlayRound` and `Simulate`, and whether the extras count. Update the client together with them.
