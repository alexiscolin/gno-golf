# The Hole Builder: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to carry this plan out task by task. Steps use
> checkboxes (`- [ ]`) for tracking.

**Goal:** a player makes a community hole in the browser, from pieces that are
guaranteed to render and to play, proves it can be holed, and publishes it
with `PublishMine`, with no change on chain.

**Architecture:** a second wasm, `web/lib/sim/builder.wasm`, built by
`scripts/wasm.sh` from the chain's own sources with more roots (`author.Fit`,
`course.Encode`, `DecodeChecked`, `newWork`, `worstGas`, the text filters,
`HoleState`, `Weather`, `Extras`), answers the editor's `fit`, `check`,
`decode`, `bar` and test-mode reads. The client side is a Draft model
(`web/lib/builder/`), a palette generated from what the renderer draws, the
editor's own checks (E1 to E12, a render census from `buildHole`), a local
chain that lets the game itself play a draft, and a `/build` route behind
`NEXT_PUBLIC_BUILDER`. The renderer is hardened first against any GG1 a
terminal can publish.

**Tech stack:** Gno (onyx toolchain, `gno test`), Go and TinyGo 0.42.0
(`scripts/wasm`), TypeScript with `node --test` (`web/test`), Next.js 15
static export, three.js 0.169, headless Chrome through `media/lib/cdp.mjs`
(`scripts/smoke.ts`).

**Spec:** `docs/superpowers/specs/2026-10-06-hole-builder-design.md`. Read it
whole before any task; section names below ("The build", "L1, the editor's
checks", …) are the spec's.

## Global constraints

- Nothing on chain changes: no edit to any file under `gno.land/r/` or
  `gno.land/p/` but new `_test.gno` and `_filetest.gno` files (spec,
  "Out of scope").
- `web/lib/sim/golf.wasm` stays byte for byte what it is, its `sources()` list
  included; `scripts/wasm.sh --check` passes after every task.
- `builder.wasm` at most 300 KB raw and 130 KB gzipped, enforced by
  `wasm.sh`. Past that, the one allowed fallback: the text filters
  (`cleanName`, `cleanText`, `linkish`) as TypeScript held to the Go by the
  parity test.
- No stored float is computed in JavaScript. JavaScript writes grid values
  (multiples of 0.25) and plain parameters only; bar corners come from
  `build.Bar` in Go.
- The Draft is kept in the canonical frame: the extent's low corner at
  (1.5, 1.5); `fit`'s shift must be (0, 0).
- Margin 1.5; grid 0.25 (0.5 by default); zone minimum 1.5 for every
  `Hazard` and `Tunnel` mouth; slope grade at most 0.95; bounce above 1 only
  where `physics.Kicks(skin)`.
- Pinned per world, not editable in v1: Friction, Bounce, Shelter (mines
  0.03), Substeps, ball radius 0.5, cup radius 1.2.
- No `loop` or `air` kind in the palette; `wind`, `rain`, `fog`, `storm`,
  `snow`, `puddle` are never palette skins; `tram` and `cart` are `HAND_ONLY`.
- Every table looked up by skin is read with `Object.hasOwn` or is a
  null-prototype object.
- `/build` and its code load only there (`next/dynamic`); the game's bundle
  does not grow. On touch or under 900 px, `/build` shows the author's holes
  and says the Builder needs a keyboard and a mouse.
- Writing: the repo's style. Plain, precise sentences; the realm's refusal
  sentences quoted exactly.
- The unit tests' coverage floor (80% lines and functions, 70% branches over
  `lib/**`, `lib/scene/**` excluded) holds: every new `web/lib/builder/*.ts`
  is listed in `web/test/all.test.ts` and tested.

## Conventions used in every task

```sh
# the onyx toolchain (README, "Running it locally")
export GNO_TOOLCHAIN=${GNO_TOOLCHAIN:-$HOME/.cache/gno-toolchains/onyx}
export GNO=$GNO_TOOLCHAIN/gno
gnotest() { (cd /Users/twee/Server/gno-golf && GNOHOME=$GNO_TOOLCHAIN/gnohome "$GNO" test "$@"); }
# the web tests (one file):
webtest() { (cd /Users/twee/Server/gno-golf/web && node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./test/setup.mjs --test "$@"); }
```

- **Green** means `scripts/check.sh` passes (it runs the Gno tests,
  `holedata.sh --check`, `stage.sh`, `wasm.sh --check` with its parity test,
  typecheck, lint, selfcheck and `npm test`). Each milestone ends green.
- Commit at the end of each task once its test passes, with a message in the
  repo's style (one plain sentence of what now holds) and the attribution
  line the session gives. Never commit a red tree.
- A web test file is `web/test/builder-<name>.test.ts`, in the house form:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
```

- Where a test loads a wasm:

```ts
import fs from "node:fs";
import { makeHost } from "../lib/sim/host.ts";
const repo = new URL("../../", import.meta.url);
const builder = makeHost(new WebAssembly.Module(fs.readFileSync(new URL("web/lib/sim/builder.wasm", repo))));
const course = fs.readFileSync(new URL("data/holes.txt", repo), "utf8").trim().split("\n").map((l) => l.split(" ")).map(([slot, , , hex]) => ({ slot, hex }));
```

---

## Milestone 1: feasibility. `builder.wasm` from the chain's sources, within its size, answering as the realm

The riskiest part of the design, proven before anything is built on it: that
the second extraction compiles under TinyGo with build tags without moving a
byte of `golf.wasm`; that `fit` and `Encode` in wasm give the chain's exact
bytes (stored wall lengths are floats from `physics.Lengths`); that `check`
refuses with the realm's sentences; and that the result fits 300 KB raw and
130 KB gzipped. If the size gate fails here, the fallback (Task 1.9) is taken
here, not discovered later.

### Task 1.1: the toolchains and a green baseline

**Files:** none.

- [ ] **Step 1:** Install TinyGo 0.42.0 (`brew install tinygo-org/tools/tinygo`,
  or set `TINYGO`) and build the onyx toolchain into `$GNO_TOOLCHAIN` as the
  README says ("Running it locally", step 1).
- [ ] **Step 2:** Run `tinygo version` and `"$GNO" version`.
  Expected: `tinygo version 0.42.0 …`; a gno binary answers.
- [ ] **Step 3:** Run `scripts/check.sh`.
  Expected: `all checks passed`. Any failure here is the tree's, not this
  plan's: stop and report it.

### Task 1.2: build tags on the hand-written files, `golf.wasm` unchanged

**Files:**
- Modify: `scripts/wasm/r/gnogolf/golf/local.go` (first line `//go:build !builder`)
- Modify: `scripts/wasm/main.go` (first line `//go:build !builder`)
- Modify: `scripts/wasm.sh` (prefix the generated `golf.go` and `sources.go` with `//go:build !builder` and a blank line)

**Interfaces:** Produces: the tag `builder` that splits the two builds.

- [ ] **Step 1: the failing check.** Add `//go:build !builder` to `local.go`
  and `main.go` only. Run `scripts/wasm.sh --check`.
  Expected: PASS. Then run `(cd scripts/wasm && GOOS=wasip1 GOARCH=wasm go vet -tags builder ./...)`.
  Expected: FAIL (no `main`, `entry`, `Period` under the tag). This is the
  gap Task 1.3 fills.
- [ ] **Step 2:** In `wasm.sh`, write the tag line first in the generated
  files: after `mv … golf.go`, `{ printf '//go:build !builder\n\n'; cat "$here/r/gnogolf/golf/golf.go"; } > tmp && mv tmp …`; in the
  `sources.go` heredoc, `echo "//go:build !builder"; echo` before the
  `// Code generated` line.
- [ ] **Step 3:** Run `scripts/wasm.sh --check`.
  Expected: `golf.wasm: 187825 B, 83973 B gzipped …`, then the parity test
  passes. A build tag is not in the binary: if the bytes differ, stop and find
  why before going on.
- [ ] **Step 4:** Commit.

### Task 1.3: the second extraction and `builder.wasm` building

**Files:**
- Create: `scripts/wasm/r/gnogolf/golf/local_builder.go` (`//go:build builder`)
- Create: `scripts/wasm/main_builder.go` (`//go:build builder`)
- Modify: `scripts/wasm.sh` (second extraction, copies of `course/author` and `physics/build`, `sources_builder.go`, second TinyGo build)
- Modify: `.gitignore` (`scripts/wasm/r/gnogolf/golf/golf_builder.go`, `scripts/wasm/sources_builder.go`, `scripts/wasm/p/` already covers the copies)
- Test: `web/test/builder-wasm.test.ts`

**Interfaces:**
- Consumes: Task 1.2's tag.
- Produces: `web/lib/sim/builder.wasm` with every `golf.wasm` export
  (`arg`, `load`, `from`, `round`, `sources`, `out`, `outlen`) plus
  `setperiod(period int64)`. In Go, package `golf` under the tag:
  `Load(id, hex string)`, `SetPeriod(p int64)`, `Period() int64`.

- [ ] **Step 1: the failing test.**

```ts
// web/test/builder-wasm.test.ts
void test("builder.wasm loads in the page's host and lists the builder's sources", () => {
  const src = builder.sources();
  for (const f of ["gno.land/p/gnogolf/course/author/fit.gno", "gno.land/p/gnogolf/physics/build/build.gno", "gno.land/r/gnogolf/golf/v2/data.gno", "gno.land/r/gnogolf/golf/v2/state.gno"])
    assert.match(src[f] ?? "", /^[0-9a-f]{64}$/, f);
});
void test("golf.wasm's sources list is unchanged: no author, no build", () => {
  const golf = makeHost(new WebAssembly.Module(fs.readFileSync(new URL("web/lib/sim/golf.wasm", repo))));
  assert.ok(!Object.keys(golf.sources()).some((f) => f.includes("/author/") || f.includes("/build/")));
});
```

- [ ] **Step 2:** Run `webtest test/builder-wasm.test.ts`.
  Expected: FAIL, `ENOENT … builder.wasm`.
- [ ] **Step 3: the extraction.** In `wasm.sh`, after the first build's
  extraction, add:

```sh
copy "$root/gno.land/p/gnogolf/course/author" "$here/p/gnogolf/course/author"
copy "$root/gno.land/p/gnogolf/physics/build" "$here/p/gnogolf/physics/build"
builder=$(cd "$here" && go run ./extract "$root/$realm" r/gnogolf/golf/golf_builder.go \
	entry,readHole,holeData,Period \
	SimulateFrom simulateRound entry.hole HoleState Extras Weather \
	newWork worstGas maxShotGas maxData validSlug cleanName cleanText linkish)
{ printf '//go:build builder\n\n'; gnomath <"$here/r/gnogolf/golf/golf_builder.go"; } >"$here/r/gnogolf/golf/golf_builder.go.tmp"
mv "$here/r/gnogolf/golf/golf_builder.go.tmp" "$here/r/gnogolf/golf/golf_builder.go"
```

  (A trial run of `extract` with these roots, made while writing this plan,
  takes from `data.gno`, `golf.gno`, `state.gno` and `weather.gno`, imports
  `ufmt`, `strconv`, `strings`, `unicode`, `unicode/utf8` and `math`, and no
  `encoding/hex`, `crypto/sha256` or `fmt`.) The `sources_builder.go` block
  is the `sources.go` block with the tag `builder`, the file list
  `physics/*.gno course/*.gno course/author/*.gno physics/build/*.gno` (tests
  out) and `$builder`'s files.
- [ ] **Step 4: the shims.** `local_builder.go` is `local.go` (same `entry`,
  `store`, `readHole`, `Load`, `unhex`, `nib`, `Round`) with:

```go
//go:build builder

type entry struct {
	id, world, name, slot, next string
	par, version                int
	order                       float64
	official                    bool
}

// wearGrid is a fresh hole's: no round has worn it.
func (e *entry) wearGrid() []int { return make([]int, course.WearW*course.WearH) }

var period int64

// Period is the proof's clock, set by SetPeriod (setperiod).
func Period() int64     { return period }
func SetPeriod(p int64) { period = p }
```

  `Load` fills `name` (`cleanName(h.Title)`), `par` (`h.Strokes`, 3 if 0, as
  `dataEntry` does: read `data.gno:312-355` and copy what `HoleState` reads,
  nothing more), `world`, `slot` and `version` from the id
  (`<addr>/<slug>/v<n>`). Then `go vet -tags builder` names any other
  identifier the roots reach: declare each one here, as `local.go` does, or
  add it to the shimmed list. `main_builder.go` is `main.go` with the tag,
  plus `//go:wasmexport setperiod func setperiod(p int64) { golf.SetPeriod(p) }`.
- [ ] **Step 5: the build.** After the `golf.wasm` build:

```sh
(cd "$here" && GOOS=wasip1 GOARCH=wasm go vet -tags builder ./...)
(cd "$here" && "$TINYGO" build -tags builder -o "$out/builder.wasm" -target wasip1 -buildmode c-shared -scheduler none -no-debug -opt 2 -panic print .)
echo "builder.wasm: $(wc -c <"$out/builder.wasm" | tr -d ' ') B, $(gzip -9c "$out/builder.wasm" | wc -c | tr -d ' ') B gzipped"
```

  In `--check`, `cmp` `builder.wasm` as `golf.wasm` is compared.
- [ ] **Step 6:** Run `npm run wasm` (from `web/`), then
  `webtest test/builder-wasm.test.ts`, then `scripts/wasm.sh --check`.
  Expected: both tests PASS; `golf.wasm` unchanged (`git status` shows no
  change to it); the sizes printed. Write the sizes down: they are the
  baseline for Task 1.8.
- [ ] **Step 7:** Commit `builder.wasm` with the scripts.

### Task 1.4: `fit` and `bar`, and the canonical frame asserted

**Files:**
- Create: `scripts/wasm/r/gnogolf/golf/builder.go` (`//go:build builder`): the driver
- Modify: `scripts/wasm/main_builder.go` (exports `fit`, `bar`)
- Modify: `web/lib/sim/host.ts` (optional exports, `fit`, `bar`)
- Test: `web/test/builder-wasm.test.ts`

**Interfaces:**
- Produces, Go: `func Fit(draft, bars string, margin float64) string`,
  `func BarOf(line string) string`.
- Produces, host: `fit(hex: string, bars: string, margin = 1.5): string` (JSON
  `{"hex","dx","dy","w","h","lo":[x,y]}` or `panic: …`), `bar(line: string): string`
  (JSON `[[x,y],[x,y],[x,y],[x,y]]`, exact floats).
- The bar list, one line a bar: `ax ay bx by thickness wallIndex pulse`, where
  `pulse` is `-1` for the field's walls or the pulse's index, and
  `wallIndex..wallIndex+3` are four placeholder walls in that list whose
  first gives the bar's Mark, Skin, Bounce and timing. (The spec's six
  columns plus `pulse`: a bar inside a pulse needs it.)

- [ ] **Step 1: the failing tests.**

```ts
void test("fit gives every course hole back, shift zero (mines/17 aside: one float moves by an ulp)", () => {
  for (const { slot, hex } of course) {
    const r = JSON.parse(builder.fit!(hex, "", 1.5));
    assert.equal(r.dx, 0, slot); assert.equal(r.dy, 0, slot);
    if (slot !== "mines/17") assert.equal(r.hex, hex, slot);
  }
});
void test("bar gives build.Bar's corners: a 4-long bar along X, 0.5 thick", () => {
  assert.deepEqual(JSON.parse(builder.bar!("2 2 6 2 0.5")), [[1.75, 2.25], [6.25, 2.25], [6.25, 1.75], [1.75, 1.75]]);
});
```

  The refusal `panic: builder: the draft is not in its frame` is tested in
  Task 4.3, once `gg1.ts` can write a draft out of its frame; a course hole
  is always in its frame, so none can show it here.
- [ ] **Step 2:** Run `webtest test/builder-wasm.test.ts`.
  Expected: FAIL, `builder.fit is not a function`.
- [ ] **Step 3: the driver.**

```go
// Fit is the draft made the hole that will be published: decoded, each bar's
// placeholders replaced by build.Bar's four walls (timing, bounce and style
// from the first placeholder), author.Fit, course.Encode. The draft is in its
// frame (its extent's low corner at the margin): Fit's shift is zero.
func Fit(draft, bars string, margin float64) string {
	h, err := course.Decode(unhex(draft))
	if err != nil {
		panic("golf: " + err.Error())
	}
	placeBars(h, bars) // parses the lines with strconv.ParseFloat/Atoi; replaces walls[i:i+4] of h.Course.Walls or h.Pulses[p].Walls
	tee := h.Tee
	f := author.Fit(h, margin)
	dx, dy := f.Tee.X-tee.X, f.Tee.Y-tee.Y
	if dx != 0 || dy != 0 {
		panic("builder: the draft is not in its frame")
	}
	data := course.Encode(f)
	lo := extentLo(f) // the walls', posts', tee's and pin's low corner, as Fit computes it
	return `{"hex":` + jstr(hexOf(data)) + `,"dx":0,"dy":0,"w":` + strconv.Itoa(f.W) + `,"h":` + strconv.Itoa(f.H) +
		`,"lo":[` + fexact(lo.X) + "," + fexact(lo.Y) + "]}"
}
```

  `hexOf` is a hand-written lower-case hex writer (no `encoding/hex`), and
  `fexact(v)` is `strconv.FormatFloat(v, 'g', -1, 64)`. In `placeBars`, use
  `build.Bar(a, b, t, w.Mark, w.Skin)`, then `build.Soft(…, w.Bounce)` if
  `w.Bounce != 0` and `build.Timed(…, w.Every, w.On, w.Phase)` if
  `w.Every > 0`. `BarOf` parses five numbers and prints `build.Bar`'s four
  `Seg.A` with `fexact`. Exports in `main_builder.go`:
  `fit(n int32, margin float64)` (arg: draft hex, n bytes, then the bar list),
  `bar(n int32)`.
- [ ] **Step 4: the host.** In `host.ts`, `Exports` gains optional members
  (`fit?(n: number, margin: number): void`, `bar?(n: number): void`); the
  returned object gains `fit` and `bar` only when the module exports them:

```ts
const has = (k: string) => WebAssembly.Module.exports(mod).some((e) => e.name === k);
...(has("fit") ? { fit: (hex: string, bars: string, margin = 1.5) => call(null, (e) => e.fit!(put(e, hex, bars)[0], margin)) } : {}),
```

- [ ] **Step 5:** Run `npm run wasm`, then `webtest test/builder-wasm.test.ts test/sim.test.ts`.
  Expected: PASS. If a course hole other than mines/17 does not come back
  byte for byte, the float path differs from the GnoVM's: stop, compare
  `fit`'s bytes with `gnotest` running `author.Fit` on the same hole, and do
  not build on this until they agree.
- [ ] **Step 6:** Commit.

### Task 1.5: `check`, in `publishMineNow`'s order

**Files:**
- Modify: `scripts/wasm/r/gnogolf/golf/builder.go`, `scripts/wasm/main_builder.go`, `web/lib/sim/host.ts`
- Test: `web/test/builder-wasm.test.ts`

**Interfaces:** Produces, host: `check(slug: string, hex: string, note: string): string`,
JSON `{"bytes","name","note","bound","worst","room"}` or `panic: <the realm's sentence>`.

- [ ] **Step 1: the failing tests.**

```ts
void test("check accepts every course hole, and says what the chain will store", () => {
  for (const { slot, hex } of course) {
    const r = JSON.parse(builder.check!("my-hole", hex, ""));
    assert.equal(r.bytes, hex.length / 2, slot);
    assert.ok(r.bound <= 1_300_000_000 && r.worst <= 1_400_000_000, slot);
  }
});
void test("check refuses in the realm's words, first refusal first", () => {
  const hex = course[0].hex;
  assert.equal(builder.check!("My Hole", hex, ""), "panic: golf: a slug is 1 to 32 of a-z, 0-9 and -");
  assert.equal(builder.check!("ok", "zz", ""), "panic: golf: the data is not hex");
  assert.equal(builder.check!("ok", "00".repeat(32 << 10) + "00", ""), "panic: golf: the data is too long");
  assert.equal(builder.check!("ok", hex, "see gnogolf.xyz"), "panic: golf: a community hole's name and note carry no web address");
});
```

- [ ] **Step 2:** Run it. Expected: FAIL, `builder.check is not a function`.
- [ ] **Step 3: the driver.** `Check(slug, hexData, note string) string`:

```go
func Check(slug, hexData, note string) string {
	if !validSlug(slug) {
		panic("golf: a slug is 1 to 32 of a-z, 0-9 and -")
	}
	if len(hexData) > 2*maxData {
		panic("golf: the data is too long")
	}
	data := unhex(hexData) // panics "golf: the data is not hex", as decodeData
	h, err := course.DecodeChecked(data)
	if err != nil {
		panic("golf: " + err.Error())
	}
	if course.Encode(h) != data {
		panic("golf: the data is not as course.Encode writes it")
	}
	bound := newWork(h, nil).bound
	if bound > maxShotGas {
		panic(errShotTooHeavy)
	}
	worst := worstGas(h, len(data))
	if worst > workBudget {
		panic(errTooStormy)
	}
	name, clean := cleanName(h.Title), cleanText(note, maxNote) // the constants dataEntry uses: read data.gno:312-355
	if linkish(name) || linkish(clean) {
		panic("golf: a community hole's name and note carry no web address")
	}
	return `{"bytes":` + strconv.Itoa(len(data)) + `,"name":` + jstr(name) + `,"note":` + jstr(clean) +
		`,"bound":` + strconv.FormatInt(bound, 10) + `,"worst":` + strconv.FormatInt(worst, 10) +
		`,"room":` + strconv.FormatInt(roomOf(h, len(data)), 10) + "}"
}
```

  Two things to read in the realm before writing this, and to copy exactly:
  how `dataEntry` cleans the name and the note (its length constant), and
  how `worstGas` turns into "the work units a first shot has in the dearest
  weather" (`roomOf`: `workBudget - worst` in work units, as `golf.gno:850-876`
  computes the cap). If `workBudget` or `cleanName`'s callers are not
  reached by the roots, add them to the extraction's roots in `wasm.sh`
  rather than copying them.
- [ ] **Step 4:** Export `check(ns, nh int32)`: arg is slug (ns), hex (nh),
  then the note. Host: `check(slug, hex, note)`.
- [ ] **Step 5:** Run `npm run wasm` and the test. Expected: PASS.
- [ ] **Step 6:** Commit.

### Task 1.6: the builder parity test, against the realm

**Files:**
- Modify: `scripts/wasm/parity_test.gno` (add `TestBuilderParity`)
- Modify: `scripts/wasmparity.ts` (run it, compare with `builder.wasm`)
- Test: the parity run itself.

**Interfaces:** Consumes `check`, `fit`, `bar`. Produces the line format
`BP\t<case>\t<hex>\t<note>\t<answer's sha256>` on the realm's side.

- [ ] **Step 1: the realm's side (the failing test).** In `parity_test.gno`:

```go
// TestBuilderParity: PublishMine on a corpus (every wasmHoles hole, each
// mutated past each limit by one, and the cases below), each answer printed
// as builder.wasm's check gives it: the realm's sentence, or the cleaned name
// and note it stored.
func TestBuilderParity(cur realm, t *testing.T) {
	setOwner(deployer)
	testing.SetRealm(testing.NewUserRealm(deployer))
	SetPublishing(cross(cur), true)
	for i, c := range builderCorpus() { // [slug, hex, note]
		testing.SetRealm(testing.NewUserRealm(testutils.TestAddress("bp" + strconv.Itoa(i)))) // a new author: never "nothing to publish"
		out := wpCall(func() string {
			PublishMine(cross(cur), c[0], c[1], c[2])
			e := mustHole(current(/* alias */))
			return e.name + "\n" + e.note
		})
		println("BP\t" + strconv.Itoa(i) + "\t" + c[0] + "\t" + c[1] + "\t" + c[2] + "\t" + wpSum(out))
	}
}
```

  `builderCorpus()` builds from `wasmHoles`: each hole as it is; then, by
  decoding one hole and re-encoding with `course.Encode`: 161 walls, 33 posts,
  33 zones, a polygon of 2 points and one of 65, 513 polygon points in all,
  17 pulses, 65 skins, a slope of `Vec` 0.951, a timing of 4097, a post of
  radius 8.01, a zone scale of 8.01, a zero-length wall, 160 walls skinned
  `bumper`, many fixed walls on a 96 × 96 board (too stormy), a point off the
  board, a split style run and a skin never used (both written with a
  hand-made byte change after `Encode`), a wrong stored length; slugs `""`,
  33 letters, `A`; notes `x.com`, `St.Andrews`, `St. Andrews`, 141 runes of
  four bytes. (Read `TestWasmParity` above it for the helpers.) Run
  `gnotest -run TestBuilderParity ./gno.land/r/gnogolf/golf/v2` in a scratch
  copy as `wasmparity.ts` does. Expected: it prints one `BP` line a case.
- [ ] **Step 2: the wasm's side.** In `wasmparity.ts`, run the shards with
  `-run 'TestWasmParity|TestBuilderParity'`, collect `BP` lines, and for each
  call `builderHost.check(slug, hex, note)`; turn an accept into
  `name + "\n" + note` from its JSON before the sum. A difference prints the
  case and both answers and fails.
- [ ] **Step 3:** Run `scripts/wasm.sh --check`.
  Expected: PASS. The first run is expected to show differences where the
  driver's order or sentences are wrong: fix the driver, never the corpus.
- [ ] **Step 4: fit parity in the same run.** Add to the corpus run, in
  TypeScript: for each corpus hex that `check` accepts, `fit(hex)` gives the
  same hex and `fit(fit(hex).hex)` the same again (`mines/17` listed as the
  one known exception). Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 1.7: `decode`, lossless

**Files:**
- Modify: `scripts/wasm/r/gnogolf/golf/builder.go`, `scripts/wasm/main_builder.go`, `web/lib/sim/host.ts`
- Create: `web/lib/builder/types.ts` (the JSON's types)
- Test: `web/test/builder-wasm.test.ts`

**Interfaces:** Produces `decode(hex): string` and, in `types.ts`:

```ts
export type V = [number, number];
export interface Timing { every: number; on: number; phase: number }
export interface GWall extends Timing { a: V; b: V; bounce: number; mark: number; skin: string; len: [number, number, number] }
export interface GPost { c: V; r: number; bounce: number; mark: number; skin: string }
export interface GZone extends Timing { kind: "surface" | "slope" | "tunnel" | "hazard" | "loop"; min: V; max: V; vec: V; scale: number; mark: number; skin: string; round: boolean; poly: V[]; outside: boolean; air: boolean; capped: boolean }
export interface GPulse extends Timing { walls: GWall[]; posts: GPost[]; zones: GZone[] }
export interface GHole { w: number; h: number; title: string; par: number; tee: V; pin: V; substeps: number; cupR: number; world: string; order: number; shelter: number;
  friction: number; bounce: number; ballR: number; walls: GWall[]; posts: GPost[]; zones: GZone[]; pulses: GPulse[] }
```

- [ ] **Step 1: the failing test.**

```ts
void test("decode is lossless: every float as Go prints it shortest, raw skins, every pulse", () => {
  for (const { slot, hex } of course) {
    const h: GHole = JSON.parse(builder.decode!(hex));
    assert.ok(h.w >= 1 && h.w <= 96 && h.walls.length + h.pulses.reduce((n, p) => n + p.walls.length, 0) <= 160, slot);
  }
});
```

  (Task 3.1 adds the check that `decode`'s wall, post and zone counts equal
  `HoleState`'s on every course hole.)
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Write `Decode(hexData string) string` in Go: `course.Decode`,
  then every field of `course.Simple` and its `Field` as JSON in the
  `GHole` shape, floats with `fexact`, strings with `jstr` (not
  `cleanSkin`), stored lengths from the decoded walls' prepared values (read
  `physics/walls.gno` `Lengths` and `field.gno` `prep` for where they are
  kept; if `prep` is unexported and not reachable, print what
  `physics.Lengths(w.Seg, r)` gives, which `DecodeChecked` proves equal).
- [ ] **Step 4:** Export, host, run `npm run wasm` and the test.
  Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 1.8: the size gate

**Files:** Modify `scripts/wasm.sh`.

- [ ] **Step 1: the failing check.** Add after the builder's build:

```sh
raw=$(wc -c <"$out/builder.wasm" | tr -d ' '); gz=$(gzip -9c "$out/builder.wasm" | wc -c | tr -d ' ')
if [ "$raw" -gt 307200 ] || [ "$gz" -gt 133120 ]; then
	echo "wasm.sh: builder.wasm is $raw B, $gz B gzipped: over 300 KB or 130 KB (the spec's budget; the text filters' TypeScript port is the fallback)" >&2
	exit 1
fi
```

  Temporarily set the limit to 1 B and run `npm run wasm`. Expected: FAIL
  with that sentence. Restore the limits.
- [ ] **Step 2:** Run `scripts/wasm.sh --check`. Expected: PASS, and the
  sizes printed below the limits. If over: Task 1.9.
- [ ] **Step 3:** Commit.

### Task 1.9 (only if Task 1.8 fails): the text filters in TypeScript

**Files:** Create `web/lib/builder/text.ts` (`cleanName`, `cleanText`,
`linkish`, ported line for line from `golf.gno` and `data.gno`); drop the
three roots from the builder's extraction; `check` returns the raw name and
note and the page cleans them; `TestBuilderParity` compares `text.ts`'s
answers too (the realm prints the cleaned strings, `wasmparity.ts` runs the
port). Test: `web/test/builder-text.test.ts` with the corpus's names and
notes. Expected: sizes under the gate; parity PASS.

### Milestone 1 exit

- [ ] `scripts/check.sh` passes; `golf.wasm` and its `sources()` unchanged;
  `builder.wasm` committed; its sizes noted in the commit message.

---

## Milestone 2: the renderer holds against any GG1 (Rollout, step 1)

Shipped to the game before the Builder: once publishing opens, anyone can
publish with gnokey.

### Task 2.1: one guarded lookup

**Files:**
- Create: `web/lib/own.ts`
- Modify: `web/test/all.test.ts` (list it)
- Test: `web/test/own.test.ts`

**Interfaces:** Produces `export const own = <T>(t: Readonly<Record<string, T>>, k: string): T | undefined => (Object.hasOwn(t, k) ? t[k] : undefined);`

- [ ] **Step 1: the failing test.**

```ts
import { own } from "../lib/own.ts";
void test("own: a table's own keys only, never Object.prototype's", () => {
  const t = { palm: 1 };
  for (const k of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) assert.equal(own(t, k), undefined, k);
  assert.equal(own(t, "palm"), 1);
});
```

- [ ] **Step 2:** Run `webtest test/own.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3:** Write `own.ts` (the line above, with a two-line comment
  saying why). Run. Expected: PASS.
- [ ] **Step 4:** Commit.

### Task 2.2: every skin lookup through `own`, and a lint rule that keeps it so

**Files:**
- Modify: `eslint.config.js` (a `no-restricted-syntax` rule for `web/lib/scene/**`)
- Modify: every hit of the rule: at least `web/lib/scene/pieces.ts:621`,
  `course.ts:452,466,468,1630,1733,1849`, `zones.ts:1130`, `town.ts:1659`,
  `mines-zones.ts:243,520,547`, `mines-rides.ts:2034`, `mines-signs.ts:525,640`

- [ ] **Step 1: the failing check.** Add to the scene's config block:

```js
"no-restricted-syntax": ["error", {
  selector: "MemberExpression[computed=true][property.type='MemberExpression'][property.property.name='skin']",
  message: "A skin comes from the chain: look it up with own(table, skin) (web/lib/own.ts).",
}, {
  selector: "MemberExpression[computed=true][property.type='Identifier'][property.name=/^(skin|name|key)$/]",
  message: "A skin comes from the chain: look it up with own(table, skin) (web/lib/own.ts).",
}],
```

  Run `cd web && npm run -s lint`. Expected: FAIL, listing each lookup.
- [ ] **Step 2:** Replace each: `POSTS[p.skin]` → `own(POSTS, p.skin)`,
  `MOUTHS[skin](R)` → `own(MOUTHS, skin)?.(R) ?? <the plain mouth>`, and so on.
  A hit on a key that does not come from a skin (a constant like
  `LEVEL["ore bin"]`) is written with a dot or kept with an
  `// eslint-disable-next-line no-restricted-syntax -- a literal key` comment.
- [ ] **Step 3:** Run lint, `npx tsc --noEmit`, `npm test`. Expected: PASS.
- [ ] **Step 4:** Commit.

### Task 2.3: a zone with `Min ≥ Max` is skipped

**Files:**
- Modify: `web/lib/terrain.ts` (export `emptyZone`)
- Modify: `web/lib/scene/course.ts` (`buildHole`: filter `s.zones` and the extras' zones through `!emptyZone(z)` before any drawing)
- Test: `web/test/terrain.test.ts`

- [ ] **Step 1: the failing test.**

```ts
void test("emptyZone: inverted or zero-size on either axis", () => {
  assert.equal(emptyZone({ min: [2, 2], max: [2, 5] }), true);
  assert.equal(emptyZone({ min: [3, 2], max: [1, 5] }), true);
  assert.equal(emptyZone({ min: [1, 2], max: [3, 5] }), false);
});
```

- [ ] **Step 2:** Run `webtest test/terrain.test.ts`. Expected: FAIL.
- [ ] **Step 3:** `export const emptyZone = (z: Pick<Zone, "min" | "max">) => !(z.max[0] > z.min[0] && z.max[1] > z.min[1]);` (a NaN is empty too). Use it in `buildHole` where `zones.ts:219-223` takes `max − min`.
- [ ] **Step 4:** Run the test and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 2.4: the hostile holes, built in headless Chrome

**Files:**
- Create: `web/lib/hostile.ts` (the adversarial `Hole` objects, no three.js)
- Modify: `web/components/Golf.tsx` (under `camlog()`, `window.__buildHole = (s) => { const g = buildHole(s); finishHole(g); return true; }`, beside `window.__g`)
- Modify: `scripts/smoke.ts` (a step)
- Test: `web/test/hostile.test.ts` (the shapes), the smoke step (the build)

**Interfaces:** Produces `export function hostileHoles(world: string): Hole[]`.

- [ ] **Step 1: the failing test.**

```ts
void test("the hostile set: every world, every case", () => {
  for (const w of ["garden", "island", "town", "mountain", "mines"]) {
    const hs = hostileHoles(w);
    assert.ok(hs.some((h) => h.zones.some((z) => z.max[0] < z.min[0])), "an inverted zone");
    assert.ok(hs.some((h) => h.walls.length === 160 && h.walls.every((x) => x.a[0] === x.b[0] && x.a[1] === x.b[1])), "160 zero-length walls");
    assert.ok(hs.some((h) => h.posts.length === 32 && h.posts.every((p) => p.r === 8)), "32 posts of radius 8");
    for (const k of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) assert.ok(hs.some((h) => h.zones.some((z) => z.skin === k) && h.posts.some((p) => p.skin === k) && h.walls.some((x) => x.skin === k)), k);
  }
});
```

- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Write `hostile.ts`: a base `Hole` in `HoleState`'s shape (read
  `web/lib/types.ts`), then the variants: inverted and zero-size zones of
  every kind (`surface`, `slope`, `tunnel`, `hazard`, `loop`, round and
  polygon among them), 512 polygon points over 8 zones of 64, 160 zero-length
  walls, 32 posts of radius 8, and each case's every piece skinned with each
  of the five names. Add to `all.test.ts`.
- [ ] **Step 4:** In `smoke.ts`, a step after "a hole played and holed":

```ts
await step("hostile holes build in every world, no error", async () => {
  await b.send("Page.navigate", { url: `${APP}/?camlog` });
  assert.ok(await until<boolean>(`!!window.__buildHole`, 100));
  const errs = await b.ev<string[]>(`(async () => { const { hostileHoles } = await import("/_next/…"); … })()`);
});
```

  The page has no module path to import from, so `Golf.tsx` exposes
  `window.__hostile = hostileHoles` beside `__buildHole` under `camlog()`;
  the step runs `["garden",…].flatMap(w => __hostile(w)).map(h => { try { __buildHole(h); return null } catch (e) { return String(e) } }).filter(Boolean)`
  and asserts it is empty, and that `b.errors` gained nothing.
- [ ] **Step 5:** Run `webtest test/hostile.test.ts` (PASS), then the smoke
  against gnodev and `npm run dev` (README; `npm run smoke`). Expected: the
  new step `ok`. Before Task 2.2 and 2.3 it would fail on `constructor`; to
  see the test bite, revert one `own` call locally and watch it fail.
- [ ] **Step 6:** Commit.

### Task 2.5: the takedown list

**Files:**
- Create: `web/public/takedown.json` (`{"chain":"","holes":[]}`)
- Create: `web/lib/takedown.ts`
- Modify: `web/lib/engine.ts` (the hole list taken in, `engine.ts:1377-1390`, drops a taken-down alias; opening one by `?hole=` shows "This hole was taken down")
- Modify: `web/components/Golf.tsx` (that screen: no name, no note, no author card, no play)
- Test: `web/test/takedown.test.ts`

**Interfaces:** Produces `readTakedown(text: string, chainId: string): ReadonlySet<string>` (aliases `<addr>/<slug>`), `takenDown(set, id: string): boolean` (matches any version of the alias).

- [ ] **Step 1: the failing test.**

```ts
void test("takedown: aliases of this chain only, size-capped, every version", () => {
  const a = "g1hvuayx9ll7dal54kr0f6t89j8867z8lf5vtxgv";
  const s = readTakedown(JSON.stringify({ chain: "onyx-1", holes: [`${a}/rude`, "not an alias", 3] }), "onyx-1");
  assert.equal(takenDown(s, `${a}/rude/v2`), true);
  assert.equal(takenDown(s, `${a}/other/v1`), false);
  assert.equal(readTakedown(JSON.stringify({ chain: "dev", holes: [`${a}/rude`] }), "onyx-1").size, 0);
  assert.equal(readTakedown("x".repeat((1 << 20) + 1), "onyx-1").size, 0);
});
```

- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Write `takedown.ts` in `flags.ts`'s form (same cap, `isAddress`
  on the alias's first part, slug checked against `^[a-z0-9-]{1,32}$`). Fetch
  it where `flags.json` is fetched; wire the engine and the screen.
- [ ] **Step 4:** Run the test, typecheck, `npm test`. Expected: PASS.
- [ ] **Step 5:** Add a paragraph on `takedown.json` to `docs/leaderboards.md`
  beside `flags.json` (who edits it, when it takes effect). Commit.

### Milestone 2 exit

- [ ] `scripts/check.sh --smoke` passes (gnodev and the dev server up, as
  the README says). The game can ship this milestone alone.

---

## Milestone 3: the test-mode reads in `builder.wasm`

### Task 3.1: `state`, `extras`, `forecast`

**Files:** Modify `scripts/wasm/main_builder.go`, `web/lib/sim/host.ts`; Test `web/test/builder-wasm.test.ts`.

**Interfaces:** Produces host methods `setperiod(p: number)`,
`state(id, hex): string` (loads, then `HoleState(id)`), `extras(id, stroke): string`,
`forecast(id, period): string`.

- [ ] **Step 1: the failing test.**

```ts
void test("state answers HoleState for the clock set; forecast refuses a period ahead of it", () => {
  const id = "g1hvuayx9ll7dal54kr0f6t89j8867z8lf5vtxgv/t/v1";
  builder.load(id, course[0].hex);
  builder.setperiod!(5967997);
  const s = JSON.parse(builder.state!(id));
  assert.equal(s.period, 5967997); assert.equal(s.hole, id);
  assert.equal(JSON.parse(builder.forecast!(id, 5967997)).period, 5967997);
  assert.equal(builder.forecast!(id, 5967998), "panic: golf: that weather has not come yet");
});
```

- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Exports: `state(n)` (arg: id; the hole must be loaded:
  `call(id, …)` loads it), `extras(n, stroke)`, `forecast(n, period)`,
  each `out = golf.HoleState(…)` and so on. Note: `setperiod` must survive a
  trap's new instance: the host keeps the period and calls `setperiod`
  again in `start()`.
- [ ] **Step 4:** `npm run wasm`, run the test. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 3.2: `find` and `commit`

**Files:** Modify `scripts/wasm/r/gnogolf/golf/builder.go`, `main_builder.go`, `host.ts`; Test `web/test/builder-wasm.test.ts`.

**Interfaces:** Produces `find(id, kind, from): number` (latest period ≤ from
whose `course.ForecastFor` kind is `kind`, at most 10,000 back, −1 if none);
`commit(id, x, y, stroke, shots, period): string` (`simulateRound(id, &{x,y}, stroke, shots, period)`).

- [ ] **Step 1: the failing test.**

```ts
void test("find gives a period of the kind asked; commit plays from a ball, as SimulateCommit", () => {
  const p = builder.find!(id, "rain", 5967997);
  assert.ok(p > 5967997 - 10000 && p <= 5967997);
  assert.equal(JSON.parse(builder.forecast!(id, p)).kind, "rain");
  assert.equal(builder.find!(id, "snow", 5967997), -1); // garden has no snow
  const first = JSON.parse(builder.round(id, "21.00,8.00", p));
  const next = JSON.parse(builder.commit!(id, first.rest[0], first.rest[1], 1, "290.50,7.75", p));
  assert.ok(next.path.length > 0);
});
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Go: `Find(id, kind string, from int64) int64` loops
  `p := from; p > from-10000; p--` on `weatherOf(readHole(id), h, p).Kind`;
  `Commit(id string, x, y float64, stroke int, shots string, period int64) string { v := physics.Vec2{X: x, Y: y}; return simulateRound(id, &v, stroke, shots, period) }`.
  Read `SimulateCommit` (`state.gno:412`) and do exactly what it does before
  `simulateRound` (its own checks), so the answers agree.
- [ ] **Step 4:** `npm run wasm`, run. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 3.3: state parity and commit parity

**Files:** Modify `scripts/wasm/parity_test.gno` (in `TestBuilderParity`: for
each accepted corpus hole, print `BS` lines: `HoleState(id)` with the wear
block cut, `Weather(id, p)` for 3 periods, and `SimulateCommit` of a random
shot from a random ball), `scripts/wasmparity.ts` (the same through
`builder.wasm`, with `setperiod(Period())` first).

- [ ] **Step 1:** Write both sides. Run `scripts/wasm.sh --check`.
  Expected: PASS. A difference in `HoleState` is in the shim's `entry`
  (Task 1.3): fix the shim.
- [ ] **Step 2:** Commit.

### Milestone 3 exit

- [ ] `scripts/check.sh` passes; `builder.wasm` committed.

---

## Milestone 4: the Draft and `gg1.ts`

### Task 4.1: the Draft model and its schema check

**Files:** Create `web/lib/builder/draft.ts`; modify `web/test/all.test.ts`; Test `web/test/builder-draft.test.ts`.

**Interfaces:** Produces:

```ts
export type World = "garden" | "island" | "town" | "mountain" | "mines";
export interface Piece { id: string; entry: string; geometry: Geometry; params: Params; clock: ClockSpec }
export type Geometry =
  | { t: "rail"; a: V; b: V } | { t: "bar"; a: V; b: V; thick: number } | { t: "post"; c: V; r: number }
  | { t: "rect"; min: V; max: V; whole?: boolean } | { t: "round"; min: V; max: V } | { t: "poly"; pts: V[]; outside?: boolean };
export interface Params { bounce?: number; scale?: number; grade?: number; dir?: V; to?: V }   // dir: a slope's unit lattice direction; to: a tunnel's destination
export type ClockSpec = { k: "fixed" } | { k: "substep"; every: number; on: number; phase: number } | { k: "stroke"; pulse: number };
export interface Draft { v: 1; world: World; slug: string; title: string; par: number; tee: V; pin: V; pieces: Piece[];
  pulses: { every: number; on: number; phase: number; pieces: string[] }[]; note: string; proofs: Proof[] }
export function parseDraft(text: string): Draft | string;   // a string: why the file is refused
export const onGrid = (x: number) => Number.isFinite(x) && x * 4 === Math.round(x * 4);
```

- [ ] **Step 1: the failing test:** `parseDraft` accepts a minimal valid Draft;
  refuses non-JSON, `v: 2`, an unknown world, a coordinate of 0.3, a piece
  with an unknown `entry` (the palette check arrives in Task 5.3: until
  then, any `entry` that is not a string), more than 200 pieces, a slug
  `"A"`. Each refusal a sentence.
- [ ] **Step 2:** Run `webtest test/builder-draft.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Write the types and `parseDraft` (no dependency but
  `types.ts`; `Proof` is declared here and filled in Milestone 8).
- [ ] **Step 4:** Run. Expected: PASS. Commit.

### Task 4.2: history and persistence

**Files:** Modify `draft.ts`; Test `builder-draft.test.ts`.

**Interfaces:** `history(d: Draft)` → `{ now(): Draft; push(d: Draft): void; undo(): Draft; redo(): Draft }`, 200 deep;
`saveDrafts(list: Draft[]): void`, `loadDrafts(): Draft[]` on `localStorage["gnogolf.builder.drafts"]` as `{v:1, drafts:[…]}`, in try/catch;
`exportDraft(d): string`.

- [ ] **Step 1: failing tests:** 201 pushes keep 200; undo after push, redo
  after undo, a push after undo drops the redo; `loadDrafts` with
  `localStorage.getItem` throwing gives `[]`; save then load gives the same
  list; a stored list of `v: 9` gives `[]`.
- [ ] **Step 2:** Run. FAIL. **Step 3:** Implement. **Step 4:** Run, PASS. Commit.

### Task 4.3: `gg1.ts`, the draft writer

**Files:** Create `web/lib/builder/gg1.ts`; Test `web/test/builder-gg1.test.ts`.

**Interfaces:** Produces `writeDraft(d: Draft, pinned: WorldConstants): { hex: string; bars: string }` and
`frame(d: Draft): Draft` (shifts by whole grid steps so the extent's low corner is (1.5, 1.5)).
`WorldConstants` is `{ friction; bounce; shelter; substeps; ballR: 0.5; cupR: 1.2 }`, passed in
(Milestone 5 pins them in `palette.ts`).

- [ ] **Step 1: read the format.** `course/data.gno:40-210` (`Encode`) and
  `:212-330` (`Decode`) are the byte layout; `gg1.ts` writes it on a 96 × 96
  board, every stored wall length 0, each bar as four placeholder walls
  `a→b` with the piece's skin, bounce and timing, and a `whole` rectangle as
  0 to 96. It need only be decodable.
- [ ] **Step 2: the failing tests.**

```ts
void test("a draft written by gg1.ts is fitted to its canonical hex, shift zero, and fitting again changes nothing", () => {
  const d = frame(box(world, 20, 10)); // rails round a 20 × 10 lane, tee and pin inside: a fixture of this file
  const { hex, bars } = writeDraft(d, GARDEN);
  const r = JSON.parse(builder.fit!(hex, bars, 1.5));
  assert.equal(r.dx, 0); assert.equal(r.dy, 0);
  assert.equal(JSON.parse(builder.fit!(r.hex, "", 1.5)).hex, r.hex);
  assert.ok(!builder.check!("box", r.hex, "").startsWith("panic"));
});
void test("bars at every lattice angle on the 0.25 grid: Fit(Fit(h)) == Fit(h)", () => { /* 0°, 45°, 90°, and (1,2), (2,1), (1,3), (3,1) directions, lengths 1 to 8 */ });
void test("out of frame, fit refuses in the driver's words", () => {
  const { hex, bars } = writeDraft({ ...frame(box(world, 20, 10)), tee: [0.5, 0.5] }, GARDEN); // tee past the low corner: the extent moves
  assert.equal(builder.fit!(hex, bars, 1.5), "panic: builder: the draft is not in its frame");
});
```

  The third test is the one Task 1.4 left for here.
- [ ] **Step 3:** Run `webtest test/builder-gg1.test.ts`. Expected: FAIL.
- [ ] **Step 4:** Implement a byte writer (`u8`, `u16`, `i32`, `f64` with
  `DataView.setFloat64(…, true)`, `str`) mirroring `encoder`, the skins
  table, and `frame` (extent from rail ends, post edges `c ± r`, tee, pin;
  shift by `1.5 − lo`, which is a grid value because every one of those is
  on the grid: E1b).
- [ ] **Step 5:** Run. Expected: PASS. Commit.

### Task 4.4: `decode`'s JSON back to a Draft, and the golden round trip

**Files:** Modify `gg1.ts` (`readHole(g: GHole, match: Matcher): Draft | { refused: string[] }`, `rawDraft(g: GHole): Draft` for the round trip, raw pieces allowed); Test `builder-gg1.test.ts`.

**Interfaces:** `Matcher` is `(p: RawPiece) => string | null` (an entry id, or
null); Milestone 5 supplies the palette's. Four walls are a bar when
`builder.bar("ax ay bx by t")` gives their corners exactly (recover a, b, t
from the corners: the midpoints of the short sides, less the caps; try the
candidates on the grid only).

- [ ] **Step 1: failing tests:** for every course hole but mines/17:
  `hex → decode → rawDraft → writeDraft → fit` gives `hex` (decode parity and
  golden round trip, spec "Testing"); a hole with a piece the matcher refuses
  gives `refused` naming it; a Builder output imports and gives back the same
  Draft (use Task 4.3's fixtures).
- [ ] **Step 2:** Run. FAIL. **Step 3:** Implement. `rawDraft` carries the
  hole's own field constants, which `writeDraft` writes when present
  (a test-only path: a published Draft always takes the world's).
- [ ] **Step 4:** Run, PASS. If a course hole does not come back, find the
  field `decode` or the writer drops; never loosen the assertion. Commit.

### Milestone 4 exit

- [ ] `scripts/check.sh` passes.

---

## Milestone 5: the palette

### Task 5.1: each world module declares the skins it draws alone

**Files:** Modify `web/lib/scene/garden.ts`, `island.ts`, `town.ts`, `mountain.ts`, `mines.ts` (export `SKINS`), `web/lib/scene/worlds.ts` (the `World` type gains `SKINS`).

**Interfaces:** `export const SKINS: Readonly<Record<string, readonly ("wall" | "post" | "zone")[]>>`.

- [ ] **Step 1:** For each world, read its `piece()` and list the skins it
  draws from the piece alone (spec, "Which skins exist, per world": the first
  kind). A skin drawn only as part of a composition is not listed.
- [ ] **Step 2:** `npx tsc --noEmit`. Expected: PASS (the coverage test in
  5.3 is what checks the lists). Commit.

### Task 5.2: `palette.ts`: `BINDINGS`, `HAND_ONLY`, `KICKS`, the world constants

**Files:** Create `web/lib/builder/palette.ts`; modify `web/test/all.test.ts`.

**Interfaces:** Produces `PaletteEntry` and the types of the spec ("An
entry"), and:

```ts
export const KICKS: readonly string[];                       // "bumper", "pinball", "mushroom"
export const kicks = (skin: string) => KICKS.some((k) => skin.includes(k));
export const WEATHER_SKINS: readonly string[];               // wind rain fog storm snow puddle
export const BINDINGS: Readonly<Record<string, Binding>>;    // keyed by skin; Binding = Omit<PaletteEntry, "id"|"world"|"skin"|"draw"|"label">
export const HAND_ONLY: Readonly<Record<string, string>>;    // skin: why ("a tram line: a run of timed bars", …)
export const WORLD_CONSTANTS: Readonly<Record<World, WorldConstants>>;
export function palette(world: World): readonly PaletteEntry[];  // the entries where a drawing and a binding meet, "*" entries included
export function entry(id: string): PaletteEntry | undefined;
```

  `palette()` builds from `POSTS`, `BARS`, `MOUTHS`, the tunnel shapes of
  `course.ts` (export them as `TUNNELS`), the skins `ZONE_DRAW` tests,
  each world's `SKINS`, and `BINDINGS`; plus the plain entries (`""`) for
  rail, post, bar, surface, slope, tunnel and hazard. Importing the scene's
  tables pulls three.js into `palette.ts`: if that breaks `npm test`
  (a DOM need at import), move the tables' key lists into a small
  dependency-free `web/lib/scene/keys.ts` that the scene modules and
  `palette.ts` both import, and assert in 5.3 that the keys equal the tables'.
- [ ] **Step 1:** `WORLD_CONSTANTS`: read each world's course holes through
  `builder.decode` (a one-off script in the scratch folder) for Friction,
  Bounce, Substeps (the most common), Shelter (mines 0.03); write them in.
- [ ] **Step 2:** `KICKS` joins `scripts/selfcheck.ts`: add a check that reads
  `physics/step.gno`'s `Kicks` and asserts its words equal `KICKS`. Run
  `npm run -s selfcheck`. Expected: FAIL until `KICKS` exists, then PASS.
- [ ] **Step 3:** Write `BINDINGS` (ranges from Task 5.4's numbers: start
  with the spec's bounds and tighten after 5.4) and `HAND_ONLY` (`tram`,
  `cart`, `castle tube`, `sandcastle` beside it, the mines' rides `cage`,
  `cable car`, `cart ride`, `corkscrew`, `lift`, `geyser`, `roof`, and every
  other skin with a drawing but no binding). Commit with 5.3.

### Task 5.3: the palette coverage test

**Files:** Test `web/test/builder-palette.test.ts`.

- [ ] **Step 1: the tests** (spec, "Palette coverage"):

```ts
void test("every entry is drawn by the table it names, not by a fallback", () => { /* own(table, skin) !== undefined for its draw */ });
void test("every binding is a valid kind, inside the chain's bounds", () => {
  for (const e of all) {
    assert.ok(!["loop", "air"].includes(e.kind as string));
    if (e.kind === "post") assert.ok(e.size.min > 0 && e.size.max <= 8);
    if (e.bounce) assert.ok(e.bounce.min >= 0 && e.bounce.max <= 1.5 && (e.bounce.max > 1) === kicks(e.skin), e.id);
    if (e.scale) assert.ok(e.scale.min >= 0 && e.scale.max <= 8);
    if (e.grade) assert.ok(e.grade.max <= 0.95);
    if (e.kind === "hazard" || e.kind === "tunnel") assert.ok(e.size.min >= 1.5, e.id);
    assert.ok(!WEATHER_SKINS.includes(e.skin), e.id);
    if (e.skin === "ice") assert.equal(e.kind, "surface");
  }
});
void test("every drawing key is in the palette or in HAND_ONLY; tram and cart are hand-only", () => { … });
void test("a plain entry per kind in every world", () => { … });
```

- [ ] **Step 2:** Run `webtest test/builder-palette.test.ts`. Expected: FAIL
  where the lists are incomplete: complete `BINDINGS` and `HAND_ONLY`
  until it passes, each `HAND_ONLY` reason a plain sentence.
- [ ] **Step 3:** Hook `parseDraft` (Task 4.1) and `readHole`'s matcher
  (Task 4.4) to `entry()`: an unknown entry refuses the file. Run
  `builder-draft` and `builder-gg1` tests. PASS. Commit.

### Task 5.4: `palettestats.ts`, the course's own uses

**Files:** Create `scripts/palettestats.ts`; modify `scripts/check.sh` (`node … ../scripts/palettestats.ts --check` after selfcheck).

- [ ] **Step 1:** The script decodes every hole of `data/holes.txt` through
  `builder.wasm` (`decode`) and prints, per skin, min and max radius, scale,
  grade, bounce and timing. With `--check`, it asserts every course use of a
  palette skin lies within its entry's ranges, except zones thinner than 1.5,
  which it lists by slot. Run `--check`. Expected: FAIL where 5.2's ranges are
  narrower than the course; widen them (or add the course's off-grid values as
  allowed steps) until PASS.
- [ ] **Step 2:** Run `scripts/check.sh`. PASS. Commit.

### Task 5.5: changing world

**Files:** Modify `draft.ts` (`changeWorld(d, w): Draft | { refused: string[] }`); Test `builder-draft.test.ts`.

- [ ] **Step 1:** Failing test: a draft of plain pieces changes world; one with
  an `island/post/palm` refuses going to `town`, naming the palm. **Step 2:**
  run, FAIL. **Step 3:** implement (`*` entries pass; others need the same
  skin's entry in the target world). **Step 4:** PASS. Commit.

### Milestone 5 exit

- [ ] `scripts/check.sh` passes.

---

## Milestone 6: the render census

### Task 6.1: `buildHole` reports what drew each piece

**Files:** Modify `web/lib/scene/course.ts` (`buildHole(s, { defer, census })`), `web/lib/scene/zones.ts`, `pieces.ts`, `worlds.ts` (`fromWorld` reports); Create `web/lib/scene/census.ts` (types only, no three.js).

**Interfaces:**

```ts
export type PieceRef = { set: "wall" | "post" | "zone"; i: number; pulse?: number };
export type Drawn = /* the spec's union, "The render census" */;
export type Census = (p: PieceRef, d: Drawn) => void;
```

  Every path that consumes a piece reports it once: the kerb chains
  (`course.ts:802-812`) `{by:"kerb"}`, the bar reader (`:1625-1632`)
  `{by:"bar"}`, `tramLines` `{by:"tram"}`, the sea filter (`:1600-1603`) and
  `unreached()` (`:1566-1587`) `{by:"hidden", why}`, `emptyZone`
  `{by:"hidden", why:"empty"}`, a table hit `{by:"table", table, key}`, a
  world's `piece()` `{by:"world", world, key}`, the plain form
  `{by:"fallback"}`. Pulse pieces through `buildExtras`.
- [ ] **Step 1:** Add the callback with no reports; `npx tsc --noEmit`, PASS.
- [ ] **Step 2:** Add the reports path by path. The test is Task 6.2's
  (headless: `buildHole` needs WebGL-free three.js only, but the scene is
  tested in the smoke run, as the repo does).
- [ ] **Step 3:** Commit with 6.2.

### Task 6.2: the palette sheets, in the smoke run

**Files:** Create `web/lib/builder/sheets.ts` (per world: a "palette sheet" Draft with every entry once, well apart in an open lane; the same next to a rail run, inside an outside-polygon sea, and in a timed run); Modify `web/components/Golf.tsx` (`window.__census = (s) => { const out = []; buildHole(s, { census: (p, d) => out.push([p, d]) }); return out; }` under `camlog()`); Modify `scripts/smoke.ts`; Test `web/test/builder-sheets.test.ts` (the sheets pass E1 to E11 once Milestone 7 lands; until then, that they `fit` and `check` clean).

- [ ] **Step 1:** Write the sheets (through `writeDraft`, `fit`, then
  `state` for the `HoleState` JSON the renderer takes).
- [ ] **Step 2:** The smoke step: for each sheet, `__census(state)`; assert
  each palette piece of the open sheet was drawn by its entry's `draw` path;
  for the context sheets, record which were hidden or merged (Task 7.6
  asserts E12 flags exactly those). Run the smoke. Expected: the step `ok`.
  A piece drawn by `fallback` is a palette bug: fix the binding or move it to
  `HAND_ONLY`.
- [ ] **Step 3:** Commit.

### Milestone 6 exit

- [ ] `scripts/check.sh --smoke` passes.

---

## Milestone 7: the editor's checks (E1 to E15), prevention and the error mapping

All of `web/lib/builder/checks.ts`, tested in `web/test/builder-checks.test.ts`,
each check with a hole that passes and one that fails (spec, "Editor
checks"). E2 to E6 run on the canonical hole from `decode`'s JSON, with
`inZone`, `inPoly`, `segDist` from `web/lib/terrain.ts`.

**Interfaces (whole milestone):**

```ts
export interface Issue { code: `E${number}` | "E1b" | "L2"; severity: "error" | "warning"; piece?: string; text: string; chain?: string }
export function checkDraft(d: Draft, fitted: { hex: string; g: GHole; w: number; h: number }, census?: Map<string, Drawn>): Issue[];
export function explain(sentence: string): string;     // the "Error messages" table; unmapped: as it is
export function laneOf(g: GHole): (x: number, y: number) => boolean;  // the even-odd outline of the untimed walls, as course.dryLand
```

### Task 7.1: E1, E1b, E8, E9 (the board, the frame, the counts, the size)

- [ ] **Step 1:** Failing tests: extent of 93.25 across fails E1; a polygon
  point and a tunnel destination past extent plus margin fail E1; a
  rectangle clipped to empty by `fit` fails E1; a bar reaching past every
  rail end fails E1b; 161 walls, 33 posts, a polygon of 65 points fail E8;
  33 KB fails E9. **Step 2:** `webtest test/builder-checks.test.ts`, FAIL.
  **Step 3:** implement. **Step 4:** PASS. Commit.

### Task 7.2: E2 and E3 (tee and cup)

- [ ] **Step 1:** Failing tests: tee outside the lane; 0.54 from a wall
  (needs 0.55); inside a post; inside a hazard in a pulse; cup disc touching
  a timed wall at any tick; cup inside a substep-timed slope. **Step 2–4:**
  FAIL, implement (`laneOf` reads `course.dryLand` in `course.gno` for the
  rule), PASS. Commit.

### Task 7.3: E4 (reachable)

- [ ] **Step 1:** Failing tests: a lane cut in two by a rail (E4); the same
  with a tunnel across (passes); a lane closed only by a timed wall
  (passes: timed pieces are left out). **Step 2–4:** a flood fill on a 0.25
  grid at the ball's clearance (`wallDist ≥ 0.5`, outside posts by 0.5),
  tunnels as jumps. PASS. Commit.

### Task 7.4: E5, E6, E7 (zone depth, destinations, timings)

- [ ] **Step 1:** Failing tests: a 1.4 strip of water; a thin polygon
  (inscribed width on a 0.05 grid below 1.5); a round mouth of diameter 1.4;
  a tunnel to inside a hazard; to within 0.4 of a wall; a timing on 0 or
  `every` of its cycle; a pulse of `every` 61. **Step 2–4:** FAIL,
  implement, PASS. Commit.

### Task 7.5: E10, E11 and the L2 mapping (E10 an error, E11 a gauge then an error: amended 2026-10-06)

- [ ] **Step 1:** Failing tests: a piece outside the lane warns E10; a hole
  near `workBudget` (from `check`'s `worst`) warns E11; `explain` gives each
  row of the spec's table for its sentence, with the counts filled
  ("Too many walls: 161 of 160. A bar is four walls."), and an unknown
  sentence as it is. **Step 2–4:** FAIL, implement, PASS. Commit.

### Task 7.6: E12 (the census)

- [ ] **Step 1:** Failing tests on recorded census maps (the context sheets'
  output of Task 6.2, saved as a fixture `web/test/fixtures/census-*.json`):
  a plank merged into the kerb, a palm hidden in the sea, a bar split, a
  piece by `fallback`: each an E12 error naming the piece ("The plank at
  (12, 4) is drawn as part of the kerb: move it off the rail"); a rail in the
  kerb is fine. **Step 2–4:** FAIL, implement, PASS. Commit.

### Task 7.7: E13, E14, E15 (amended 2026-10-06, the user's rules)

**Interfaces:** `Binding` gains `overlaps?: readonly string[]` (the entry
ids or kinds it may overlap); `checkDraft` reports E13 to E15.

- [ ] **Step 1:** Failing tests: a post across a rail, two posts
  overlapping, a bar crossing a bar, a surface over a hazard (each E13); a
  bridge over water and sand round a post (allowed by their bindings: pass);
  a 1.1 gap between two bars on the only way to the cup (E14), the same at
  0.9 (shut: E4 if it was the only way, else fine) and at 1.25 (pass); a
  plank 0.3 from a rail run (E15), the same 0.5 off (pass); a palm in the
  island's outside sea (E15). **Step 2–4:** FAIL, implement, PASS. Commit.

### Task 7.8: `canPlace`, the clamp, and the golden set

**Interfaces:** `canPlace(h: GHole, piece: Placed): Issue[]` (the rules that
can be judged one piece against the rest: E1, E2, E3, E10, E13, E14, E15),
`clampMove(h, piece, to): V` (the nearest valid position on the grid along
the drag, or the start), `fixOf(issue): Edit | null` (the one-click fix where
obvious: off the wall by the ball's clearance, the gap widened, the cup out
of the zone).

- [ ] **Step 1:** Failing test `web/test/builder-golden.test.ts`: a golden
  set of deliberately broken holes (one or more per rule E1 to E15, and the
  L2 refusals), each refused by exactly its rule with its sentence; every
  course hole of `data/holes.txt` passes E1 to E11 and E13 to E15 (decoded
  through `builder.wasm`; mines/17 included, its ulp aside); `canPlace`
  refuses each broken piece the set places; a drag across a wall clamps
  before it; `fixOf` repairs what it offers to, and the repaired hole passes.
- [ ] **Step 2–4:** FAIL, implement, PASS. Commit.

### Milestone 7 exit

- [ ] `scripts/check.sh --smoke` passes; Task 6.2's sheet test now also
  asserts the open sheets pass E1 to E12.

---

## Milestone 8: test mode on a local chain, proofs and par

### Task 8.1: `localchain.ts`

**Files:** Create `web/lib/builder/localchain.ts`; Test `web/test/builder-proof.test.ts`.

**Interfaces:** `makeLocalChain(host: Host, row: HoleRow, hex: string, p: number): Pick<Chain, "holes" | "state" | "period" | "now" | "weather" | "simulateFrom" | "simulateRound" | "simulateCommit" | "extras">`,
with `now() = p * RULES.periodMs + RULES.periodMs / 2`. Read `engine.ts:807-822`
and `:1377-1394` for what the engine calls, and `chain.ts` for each method's
shape: answers are parsed by the same `checks` as the chain's.

- [ ] **Step 1: failing tests** ("Local clock"): `period()`, `now()`'s
  period, `state`'s `period` and `weather(id, p)`'s agree; `weather(id, p+1)`
  rejects; `holes()` has the one row the engine looks the hole up by.
- [ ] **Step 2–4:** FAIL, implement on Milestone 3's host methods, PASS. Commit.

### Task 8.2: the required weathers and the proof's key

**Files:** Create `web/lib/builder/proof.ts`; Test `builder-proof.test.ts`.

**Interfaces:** `required(world): string[]` (from `CLIMATES` in
`web/lib/sky.ts`, fog out; mines takes garden's); `proofKey(hexWithoutTitleAndPar: string): Promise<string>`
(sha-256 of the canonical data written with title `""` and par 0, through
`writeDraft` and `fit`); `periodFor(host, id, kind, now): number` (for wind,
the strongest wind among the wind periods `find` returns walking back).

- [ ] **Step 1: failing tests:** garden → clear, wind, rain; island adds
  storm; mines equals garden; renaming keeps the key, moving a piece changes
  it; `periodFor` wind returns the period with the largest `|wind|` found.
- [ ] **Step 2–4:** FAIL, implement, PASS. Commit.

### Task 8.3: a proof replays by commits

**Files:** Modify `proof.ts` (`replay(chain: LocalChain, id, shots, period): Promise<Proof | string>` through `chainSplit`), `web/lib/adena.ts` (export `calls`, `gnokeyCall`; nothing else changes); Test `builder-proof.test.ts`.

- [ ] **Step 1: failing tests** ("Proofs"): a holed round of a course hole
  (shots from the test fixtures of `replay.test.ts`, or found with `round`
  in a loop as `smoke.ts` does) replays and gives a `Proof`; a mines round
  of more than 12 strokes replays in several commits and holds; a moved piece
  drops it (key differs); a proof with `maxWork` over `minShotWork` (800,000)
  does not count.
- [ ] **Step 2–4:** FAIL, implement, PASS. Commit.

### Task 8.4: par

**Files:** Modify `proof.ts` (`suggestPar(proofs): number`, `parAllowed(proofs, par): boolean`); Test `builder-proof.test.ts`.

- [ ] **Step 1:** Failing tests: most strokes 4 → suggested 5; par 4 refused,
  5 to 19 allowed; most strokes 19 → 19. **Step 2–4:** FAIL, implement, PASS. Commit.

### Milestone 8 exit

- [ ] `scripts/check.sh` passes.

---

## Milestone 9: the editor (`/build`)

UI tasks are tested where the logic sits (`web/lib/builder`), and seen in the
browser with the `run` skill or `npm run dev` at `/build`. Each component
stays thin: state in `draft.ts`, rules in `checks.ts`.

### Task 9.1: the route, behind its flag, out of the game's bundle

**Files:** Create `web/app/build/page.tsx`, `web/components/builder/Builder.tsx` (a shell); Modify `web/next.config.mjs` only if the flag needs declaring; Test `web/test/site.test.ts` (or a new `builder-route.test.ts`).

- [ ] **Step 1:** Failing test: with `NEXT_PUBLIC_BUILDER` unset, the page
  module exports a component that renders the "not here" notice (read
  `web/test/site.test.ts` for how the repo tests a page's logic; if pages are
  not tested there, put the decision in `web/lib/builder/route.ts`:
  `builderOn(env)`, `desktop(width, touch)` and test that).
- [ ] **Step 2–4:** FAIL; `page.tsx` loads `Builder` with `next/dynamic`
  (`ssr: false`); under 900 px or on touch, the author's holes and the
  sentence "The Builder needs a keyboard and a mouse." PASS.
- [ ] **Step 5:** `cd web && npm run build`; compare the game's first-load
  JS in the build's table with the line before the change. Expected:
  unchanged. Commit.

### Task 9.2: the 2D board

(Amended 2026-10-06, prevention: the armed entry's ghost follows the cursor,
snapped, green where `canPlace` passes and red with its first sentence
where not; a drop on red does not happen; drags, handles and key moves go
through `clampMove`; at a limit (E8, E9) the palette's entries that would
pass it are off, with why. Tested in `builder-edit.test.ts` through
`edit.ts`, which calls `canPlace` and `clampMove`.)

**Files:** Create `web/components/builder/Board.tsx`; Create `web/lib/builder/edit.ts` (pure: `snap(v, step)`, `place(d, entryId, at)`, `move(d, pieceId, handle, to)`, `remove`, `select`); Test `web/test/builder-edit.test.ts`.

- [ ] **Step 1:** Failing tests for `edit.ts`: snapping to 0.5 and 0.25; a bar
  placed by two ends; moving a handle keeps the draft framed (calls `frame`);
  a size outside its entry's range is clamped to it; a piece is one history
  step per drag.
- [ ] **Step 2–4:** FAIL, implement, PASS. Then `Board.tsx`: an SVG of the
  canonical hole (from `decode`), grid, handles, selection; Ctrl+Z,
  Ctrl+Shift+Z. Check it at `/build` in the browser. Commit.

### Task 9.3: palette, inspector, issues

**Files:** Create `web/components/builder/Palette.tsx`, `Inspector.tsx`, `Issues.tsx`.

- [ ] **Step 1:** `Palette` lists `palette(world)` by kind; `Inspector`
  shows the selected piece's params within its entry's ranges and clocks;
  `Issues` lists `checkDraft`'s issues and `explain(check)`'s, the gauges
  (E8), the room (E11); clicking an issue selects its piece. The pipeline runs
  debounced 150 ms: `writeDraft` → `fit` → L1 geometry checks → `check`.
  Put the pipeline in `web/lib/builder/pipeline.ts` with a test
  (`builder-pipeline.test.ts`: an edit that breaks E2 gives that issue and no
  L2 call; a clean draft calls `check`).
- [ ] **Step 2:** Run the test (FAIL first, then PASS); see it in the
  browser. Commit.

### Task 9.4: the 3D preview with the census

**Files:** Create `web/components/builder/Preview.tsx`.

- [ ] **Step 1:** `buildHole` on `state`'s JSON (Milestone 3) for the fitted
  hex, debounced, with `census` collected into the map `checkDraft` takes.
  Check in the browser that a plank pushed onto a rail run shows the E12
  sentence. Commit.

### Task 9.5: test mode

**Files:** Create `web/components/builder/TestMode.tsx`.

- [ ] **Step 1:** Opens only with no error and a slug and an address set;
  for each `required(world)` kind, `periodFor`, then the game itself
  (the engine as `Golf.tsx` builds it) on `makeLocalChain`; on the holing
  shot, `replay` and the proof kept in the Draft; a checklist of the kinds,
  and par (`suggestPar`). Check in the browser: a template proves in each
  kind and the checklist fills. Commit.

### Task 9.6: import a published hole, export and import a file

**Files:** Modify `Builder.tsx`; uses `HoleData(alias)` through `chain.ts`, `decode`, `readHole`, `parseDraft`.

- [ ] **Step 1:** Test in `builder-gg1.test.ts` (already: import refuses with
  the pieces listed); here the wiring only. Check in the browser with a
  course hole made only of palette pieces (from 4.4's pinned list) and with
  one that is not. Commit.

### Task 9.7: starter templates

**Files:** Create `web/lib/builder/templates/<world>-{straight,dogleg,signature}.json` (15 files); Test `web/test/builder-templates.test.ts`.

- [ ] **Step 1:** Failing test: each template parses, passes E1 to E11 and
  `check`; a proof made under the test id
  (`g1hvuayx9ll7dal54kr0f6t89j8867z8lf5vtxgv/<slug>/v1`) in each required
  weather replays holed (shots stored in the test fixture, not in the
  template). **Step 2:** FAIL. **Step 3:** make the templates in the editor,
  export them, find holing shots with `round` in a loop. **Step 4:** PASS. Commit.

### Milestone 9 exit

- [ ] `scripts/check.sh` passes; `npm run build` with and without
  `NEXT_PUBLIC_BUILDER=1`; the game's first-load JS unchanged.

---

## Milestone 10: publishing, sharing, listing

### Task 10.1: the storage numbers, measured

**Files:** Create `gno.land/r/gnogolf/golf/v2/z_storage_publish_limits_filetest.gno` (and, if one filetest cannot hold three cases, `z_storage_publish_name_filetest.gno`, `z_storage_publish_v2_filetest.gno`).

- [ ] **Step 1:** Write the filetest in `z_storage_publish_filetest.gno`'s
  form: a hole at every limit (about 21 KB of data), one with a 40-rune name
  and a 140-rune note of four-byte runes, a second version of one; leave the
  `// Storage:` block empty. Run
  `gnotest -run '' ./gno.land/r/gnogolf/golf/v2` with `-update-golden-tests`
  (read `gno test -h` for the onyx flag's name). Expected: the golden block
  filled; read the `store` bytes.
- [ ] **Step 2:** Run it again without the flag. Expected: PASS. Commit.

### Task 10.2: `publish.ts`: deposit, gas, fee, the gnokey command

**Files:** Create `web/lib/builder/publish.ts`; Test `web/test/builder-publish.test.ts`.

**Interfaces:** `deposit({ bytes, name, note, v, price }): number` (ugnot,
`price × (bytes + OVERHEAD + utf8Len(name) + utf8Len(note) + (v > 1 ? OLD_ENTRY_DELTA : 0)) × 1.1`),
`gasFor(bytes): number`, `cost(...)`, `gnokeyPublish({ realm, slug, hex, note, gas, price, chainId, rpc }): string`,
`shq(s): string` (POSIX single quotes, each `'` as `'\''`).

- [ ] **Step 1: failing tests:** `deposit` at 100 ugnot a byte gives about
  0.31 GNOT for the box hole (3,146 stored) and about 2.4 GNOT at 21 KB, with
  `OVERHEAD` and `OLD_ENTRY_DELTA` from Task 10.1; "gnokey quoting":

```ts
void test("the note comes out of the gnokey command unchanged", () => {
  const note = "Let's go; $(x)";
  const out = execFileSync("sh", ["-c", `printf %s ${shq(note)}`], { encoding: "utf8" });
  assert.equal(out, note);
  assert.match(gnokeyPublish({ realm: "gno.land/r/x/golf/v2", slug: "a-b", hex: "00ff", note, gas: 1e8, price: 0.001, chainId: "dev", rpc: "http://127.0.0.1:26657" }), /-func PublishMine -args a-b -args 00ff -args 'Let'\\''s go; \$\(x\)'/);
});
```

- [ ] **Step 2–4:** FAIL, implement (on `gnokeyCall` exported in Task 8.3;
  the slug and hex need no quoting and are checked by regex first), PASS.
- [ ] **Step 5:** Measure the gas on gnodev (`scripts/stage.sh`, the deploy key
  opens publishing with `SetPublishing`) for the three holes of 10.1, write
  the numbers and the fitted `gasFor` with a margin into `publish.ts`, and
  add a test pinning them. Commit.

### Task 10.3: the wizard

**Files:** Create `web/components/builder/Publish.tsx`.

- [ ] **Step 1:** Four steps as the spec says ("The publish flow"): name and
  note shown as `check` cleans them, the permanence sentence word for word,
  the report contact; the checks (proofs replayed against the final bytes,
  `builder.sources()` against the deployed files as `web/lib/sim.ts` does for
  `golf.wasm`, with no successor set, `Publishing()`, `Versions(alias)`); the
  cost; sign through `calls` (Adena) or the gnokey command, then
  `Current(alias)` until it names the new id. The mismatch sentence:
  "The Builder's checks are not the chain's current rules. Reload the page,
  or wait for the site to catch up."
- [ ] **Step 2:** Put the sequencing in `publish.ts` (`publishSteps(state)`:
  which step is open and why one is closed), tested in
  `builder-publish.test.ts`: closed publishing stops at step 2; a newer
  version elsewhere drops the proofs; the same sha says
  "This is exactly the version already published."
- [ ] **Step 3:** On gnodev, publish a template end to end, with Adena and
  with gnokey. Commit.

### Task 10.4: sharing

**Files:** Create `web/lib/builder/share.ts`; Modify `web/components/Share.tsx` only to reuse its `snapshot` path; Test `web/test/builder-share.test.ts`.

- [ ] **Step 1:** Failing tests: `holeLinkOf(site, id)` gives `?hole=<id>`;
  with an author's best, `&by=<address>`; the same encoding as
  `holeLink` in `web/components/common.ts` (compare on a shared case).
- [ ] **Step 2–4:** FAIL, implement, PASS. The image (title, par, author,
  "Built on gno.land") from the preview's canvas; on a computer a download
  through a user-clicked link; on a phone the share sheet. Commit.

### Task 10.5: the community list's marks

**Files:** Modify `web/lib/engine.ts` (`g.community` ordered: holes whose
author has a best first, via `Bests(hole, mode, author)`), the list's component; Test `web/test/common.test.ts` or a new one for the ordering function (put it in `web/components/common.ts` if that is where list logic lives).

- [ ] **Step 1:** Failing test: the ordering and the two labels
  ("Holed by its author", "Not yet holed by its author"). **Step 2–4:** FAIL,
  implement, PASS. Commit.

### Task 10.6: the docs

**Files:** Modify `README.md` ("Writing a hole": the Builder; "Repo layout": `web/lib/builder`, `builder.wasm`), `CLIENT.md` (the `own` rule beside rule 2; the takedown list), `docs/golf.md` ("Gas and storage": the publish numbers of 10.1 and 10.2), `scripts/wasm.sh`'s header comment (two builds), `netlify.toml`'s comment (`NEXT_PUBLIC_BUILDER`).

- [ ] **Step 1:** Write them in the repo's style. Run `scripts/check.sh`. PASS. Commit.

### Milestone 10 exit

- [ ] `scripts/check.sh --smoke` passes; a hole published from the Builder
  on gnodev plays in the game with `NEXT_PUBLIC_COMMUNITY=1`.

---

## Verification checklist

Run before calling the work done (superpowers:verification-before-completion):

- [ ] `scripts/check.sh --smoke` passes on a clean checkout, gnodev and the
  dev server up.
- [ ] `scripts/wasm.sh --check` passes: `golf.wasm` byte for byte the
  committed one, its `sources()` list unchanged (no `author/`, no `build/`);
  `builder.wasm` the build of these sources; both parity tests
  (`TestWasmParity`, `TestBuilderParity`: check, fit, bar, state, weather,
  commit) answer as the realm, byte for byte.
- [ ] `builder.wasm` under 300 KB raw and 130 KB gzipped (the sizes printed).
- [ ] `fit` gives every course hole back with shift zero (mines/17 the one
  listed exception), and `Fit(Fit(h)) == Fit(h)` on every Builder output.
- [ ] The golden round trip holds on every course hole but mines/17.
- [ ] `git diff --stat` on `gno.land/` shows only new `_test.gno` and
  `_filetest.gno` files.
- [ ] The palette coverage test, `palettestats.ts --check`, the census and
  hostile-hole smoke steps pass; no `loop`, `air` or weather skin in any
  palette; `tram` and `cart` hand-only.
- [ ] Lint passes with the skin-lookup rule on: no skin reaches
  `Object.prototype`.
- [ ] E1 to E12 each have a passing and a failing case; every L2 sentence of
  the spec's table has its plain words.
- [ ] Proofs: every required weather of each world, replayed by commits, a
  mines round over 12 strokes included; the local clock agrees.
- [ ] The gnokey note round-trips through `sh -c`.
- [ ] `npm run build` without `NEXT_PUBLIC_BUILDER`: no `/build` code in the
  game's chunks; first-load JS unchanged.
- [ ] On gnodev: a template drafted, proven, published with Adena and with
  gnokey, played and saved in the game; the community list marks it
  "Holed by its author".
- [ ] A hole on `takedown.json` shows "This hole was taken down" and nothing
  of its name or note.
- [ ] Onyx and mainnet steps (spec, "Rollout", 4 and 5) are the owner's,
  after this plan: `SetPublishing(true)` on onyx, then the production flags.
