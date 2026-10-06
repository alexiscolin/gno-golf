# ADR-006: The hole builder's checks, in the browser

## Status

Accepted for the feasibility step, 2026-10-06. Implements part of the hole
builder's design (`docs/superpowers/specs/2026-10-06-hole-builder-design.md`):
the chain's checks in the browser, the palette and the editor's own checks.
Nothing on chain changes: `PublishMine`, `SetPublishing`, GG1 and golf/v2 stay
as they are.

## Context

A player who makes a hole without writing Go must be told, before signing
anything, exactly what `PublishMine` would say, and the builder must only let
them place what the client draws and what the physics can play. The chain
checks the format, its limits and the gas; it says nothing about how a hole
looks, and accepts a cup inside a wall.

The browser already runs the realm's own physics (`golf.wasm`, ADR-001's aim
preview, built from the deployed `.gno` files by `scripts/wasm.sh` and held to
the realm byte for byte by `scripts/wasmparity.ts`). Every player loads it.

## Decision

- **A second wasm, `builder.wasm`, from the same sources.** `scripts/wasm.sh`
  extracts the realm twice: `golf.go` with the aim preview's roots, and
  `golf_builder.go` with PublishMine's checks too (`newWork`, `worstGas`,
  `maxShotGas`, `maxData`, `validSlug`, `cleanName`, `cleanText`, `linkish`),
  built with `-tags builder`. `golf.wasm` is unchanged, byte for byte: no
  player downloads the builder (187,825 B, 83,973 B gzipped, as before;
  `builder.wasm` 235,743 B, 103,633 B gzipped). `wasm.sh` fails past 300 KB or
  130 KB gzipped.
- **The checks are the realm's code, driven by a hand-written `Check`**
  (`scripts/wasm/r/gnogolf/golf/local_builder.go`): `decodeData`'s steps in
  its order (`course.DecodeChecked`, `course.Encode`'s very bytes, the two
  work bounds), less its sha256, then `publishMineNow`'s slug, name and note
  checks. Extracting `decodeData` whole would link `crypto/sha256`, which in
  TinyGo brings its FIPS module (aes, sha3, gcm, hmac, drbg), and
  `encoding/hex`, which brings `fmt`: measured, 347 KB instead of 235. The
  driver is a mirror of ten lines, and the parity test holds it to
  `PublishMine` itself: every course hole, mutated byte by byte, cut, in
  capitals, with refused slugs and notes, and holes past each of GG1's bounds
  and at both work limits; the refusals compared word for word (20 distinct
  sentences, every branch of `decodeData`), the answers number for number.
- **`Fit` makes a draft publishable with the chain's own code**: the draft GG1
  (written by the page, its wall lengths not read) through `course.Decode`,
  `author.Fit` and `course.Encode`, so no float the chain stores is computed
  in JavaScript. `course/author` is not deployed: it is left out of
  `sources()`, which the page checks against the deployed files, and held to
  the repo's sources by `wasm.sh --check` like the rest.
- **One host for both builds.** `web/lib/sim/wasi.ts` is what golf.wasm's
  host and builder.wasm's share (the WASI imports, a call's strings, a
  refusal kept and a new instance started); `web/lib/builder/wasm.ts` types
  the builder's answers (`Checked`, `Fitted`, `Cost`), the API the editor
  calls.

- **The palette is generated from the scene's own declarations**
  (`web/lib/builder/palette.ts`): the shared tables' keys (`POSTS`, `BARS`,
  `MOUTHS`), a `DRAWN` list beside the code that draws by skin in
  `course.ts` and `zones.ts`, and a `skins` list each world module exports
  beside its `piece()` (`worlds.ts` `Skins`), each met by a binding
  (`BINDINGS`: kind, shapes, ranges, clocks). A drawing with no binding must
  be in `HAND_ONLY`, with why. A new piece, or a new world, appears in the
  palette by its drawing and a binding, and in no other place.
- **Every entry is proved, not trusted** (`web/test/builder-palette.test.ts`):
  built into a real hole by `buildHole` in Node (a 2D canvas stub is all the
  scene needs without a GPU), in every world it is offered in, it must draw
  something, and something other than what an unknown skin falls back to
  (the plain form) unless it is the plain form on purpose; and its piece,
  at the low end, default and high end of its ranges, must pass `Fit` and
  `Check`. 384 entries across the five worlds. A world-only skin offered
  elsewhere, or a slope skin that only reshapes the ground, fails it
  (measured on purpose).
- **The rules the palette is bound by are the chain's** (`rules.ts`):
  `physics.Kicks`'s skins and `MaxBounce` (a passive piece plays 0.75 at
  most, so no more is offered), the weather's skins, read back from
  `step.gno` and `course.gno` by `scripts/selfcheck.ts`; each world's field
  (substeps, friction, bounce, ball and cup) is the one most of its course
  holes have, which a test reads from `data/holes.txt`; GG1's limits sit in
  `gg1.ts` alone, held to `data.gno` by a test.
- **The builder's own checks** (`web/lib/builder/checks.ts`): the tee in the
  lane and clear of every wall (the ball's radius and 0.05), post and zone
  that moves or sends a ball back, of any clock (E2); the cup's disc the
  same (E3); a timed piece on for part of its cycle, a pulse's cycle within
  a round (E7); GG1's limits, pulses counted in (E8); and the work gauges
  from `Check` (E11). The lane is where a ball cannot leave the board, a
  flood at a quarter unit over the untimed walls thickened by the ball's
  radius: the chain's even-odd count (`dryLand`, for puddles) flips on a
  rail standing inside the lane, which a builder must allow.

## Consequences

- **The builder says what the chain says**, sentence for sentence, before
  anything is signed, and shows the hole's room in the realm's own units.
- **A change to `decodeData` or `publishMineNow`'s checks must be mirrored in
  `Check`.** The parity test fails until it is (`scripts/check.sh` runs it).
- **`Fit` is not exactly idempotent on every course hole**: mines/17's
  leftmost piece lies a hair inside the margin, so fitting it again moves one
  float by an ulp. A draft on the builder's grid (multiples of 1/4) is
  shifted exactly.
- **The parity test grows by about a tenth** (1,882 PublishMine calls and 180
  fits on top of the 25,200 simulations).
- **A hazard's `Vec` must be on the board.** The physics never reads it, but
  GG1 holds it to the board and `Fit` moves it: left at (0, 0), a hole
  decodes, then fails once fitted. The builder sets it to the tee (a board
  point the extent holds, which Fit moves with the rest).
- **What the palette does not offer yet**: loops (only the mines' rides draw
  one), the compositions (a tram line, a mill and its sails, the castle's
  slide, a seesaw, the rides, a stroke's set pieces), and stroke-clocked
  (pulse) pieces are not yet render-tested through `buildExtras`.
- **The unit tests take about 20 s more** (the render proof builds some 800
  holes).

## Amendments

2026-10-06, the Builder as built on this branch (the design's amended spec
and plan, Tasks 7.7 to 10.6):

- **Prevention, not warning.** Every rule the issues list names is also the
  board's: the armed piece's ghost is red with the rule's sentence where a
  drop would break the hole, and drops nothing there; a drag, a handle, the
  tee or the cup let go where it may not stay stops at the last place on its
  way where it may (`edit.ts` canPlace, clampMove, clampHandle, clampEnd); a
  setting that would break the hole does not take. They all ask the whole
  pipeline (`pipeline.ts` validate). Live, it runs without the render census
  (about 3 ms); a drop or a release with it (about 60 ms in Node). A new hole
  starts from a starter or a blank lane that passes every check, so the
  editor never shows a refused hole.
- **E13 to E15 and the census (E12).** Overlaps only where the palette entry
  says the scene draws them well, passages a ball's width and a margin wide
  where the way to the cup goes, bars clear of the kerb; and `buildHole`
  reports what drew each piece, so a piece the scene would draw as another
  is refused.
- **The builder is stricter than the course, on purpose** (the owner's
  decision: safety first, no rule relaxed). The course holes were validated
  by hand and by play; those the Builder refuses (town/14: a door 1.2 deep)
  are a report in the golden test, and never open in the editor, which opens
  only what its own rules pass.
- **The classic worlds only** (the owner's decision). The Builder offers the
  Garden, the Island, Mushroom Town and the Mountain; the Crystal Mines are
  too complex for it and stay the game's: no picker entry, palette, starter
  or field, and a mines hole or file is refused to open with a plain
  sentence.
- **Work gauges measure what a hole adds.** A shot's bound and a storm's cost
  both start from a floor every hole pays (MaxWork per shot); the gauges and
  E11 measure the rest against what is left, or a plain lane would sit at 95%.
- **Test mode is the game itself** on a local chain answered by
  `builder.wasm` at one clock, a proof per weather that moves the ball,
  replayed as its save would be cut; publishing opens only with every proof
  of the hole as it is, under the id it will have.
- **Publish figures from filetests.** The deposit and the gas come from the
  `z_builder_publish_*` filetests in golf/v2, the rules the Builder publishes
  under (Storage in golf/v2 and store, and Gas, less a warm-up publish's), not
  from a transaction: none was sent while building this. (They were fitted on
  golf v1 at first, whose first publisher also paid the indexes' first
  leaves: the first v2 publish was billed some 2 GNOT too much.)
- **No Builder on a phone.** Under 900 px or on a coarse pointer, `/build`
  loads neither the editor nor `builder.wasm` (an import-graph test holds it).

## Threat model

Every guarantee the editor gives is the browser's. The chain's
`PublishMine` checks GG1's format, its limits and the work a shot may cost;
it does not check how a hole plays or looks, and anyone can call it with
gnokey. The deployed realms are not changed for this (the owner's rule), so
the game closes the gap on its side: **it plays, lists and links a
community hole only once the Builder's own rules pass it.**

**The gate** (`lib/builder/verdict.ts` judge, `lib/community.ts`). A
community hole passes when its data is hex of at most 32 KiB, decodes, is of
a Builder world, holds only the palette's pieces, passes the whole pipeline
(E1 to E15, the render census) and is byte for byte what the Builder writes
for it. Its verdict is kept in the browser under the sha-256 of its data and
the rules' version (`VERDICT_RULES`: raising it judges every hole again), so
a version is judged once a browser, whatever id or alias names it. A hole not
judged yet is not shown; a hole that cannot be read, or whose rules could not
load, is not played (and nothing is kept).

- **The cups screen** judges the community holes of the page it shows, one
  after the other, and lists only those that pass ("Checking the holes
  against the Builder rules…" until the page is judged; author marks are read
  only for holes listed).
- **The engine's `load`**, the one way into any hole (a link, a dare, a duel,
  the cups' list, Next), refuses a community hole that does not pass before
  anything of it is built: a link lands on the cups with *This hole was not
  made with the Builder rules.*; any other way shows it as the error banner.
  Share, dare and duel links are made from a hole being played, so only from
  one that passed. The ghosts and the podium list course holes only, and a
  board's row opens its hole through `load` too.
- **The phone's `/build`** judges nothing (it never loads `builder.wasm`): it
  lists only community holes this browser already passed (`knownOnly`), and
  links to the cups screen for the rest.

**Cost, and why lazy.** Judging needs the Builder's code and `builder.wasm`
(290 KB, 121 KB gzipped). They load as their own chunk, only when a community
hole is about to be shown or played, never on the game's first load nor for a
course hole; the census and checks take tens of milliseconds a hole (about
270 ms for the largest), once a version a browser. Rejected:

- *A verdict list built at deploy time* (like the static og: pages): it needs
  the chain at build time, which the site's build never reads, and is stale
  between deploys (a hole published after a deploy would wait for the next
  one, or be played unjudged).
- *golf.wasm's checks alone*: they are the chain's checks (format, limits,
  work), exactly what a direct `PublishMine` already passes; E2 to E15 and the
  census live in the Builder's TypeScript and its scene.

**The threats, and what holds each** (each has its test):

| Threat | Defense | Test |
|---|---|---|
| A crafted draft file (raw GG1, extra keys, off-grid points, foreign pieces) | `parseDraft` rebuilds a Draft from its own fields; L0 holds ranges, the quarter grid from the tee, kinds and shapes; the editor opens only what the pipeline passes | `builder-draft`, `builder-import`, `builder-golden` |
| A direct `PublishMine` of a hole the editor refuses (a cup in a post, a walled cup, overlaps, a mines or foreign piece, bytes the Builder would not write) | the gate above | `builder-verdict`, `community` ("a hostile hole published directly is not shown") |
| XSS through a name, note, slug or author | chain text rendered only as React text, canvas `fillText` or aria labels; links built from checked ids and encoded; the only raw HTML is the JSON-LD (its `<` escaped) and literals; the og: pages are made from the course's file, never the chain | `xss`, `chain` (URL builders) |
| Huge or griefing data | the gate never decodes more than 32 KiB or non-hex; the renderer stands every GG1 extreme (`lib/hostile.ts`); a version is judged once | `builder-verdict` ("never reaches the decoder"), `hostile` |
| Gas and deposit (a bill that drains a wallet, a command that runs more) | the bill is computed from measured publishes and capped: gnokey's `-max-deposit`, Adena's `max_deposit`, gas at most `MAX_GAS`; a slug, data or realm not of their shape gives no command | `builder-publish`, `adena` |
| A hole that must come down (abuse, a name) | `/takedown.json`, per chain id: every version of a listed alias is unlisted and refused by link ("This hole was taken down."), with nothing of it shown; a list too big, not JSON or another chain's takes nothing down | `takedown`, `builder-route` |

**What it does not cover.** The realm's own pages on gno.land render names
(gnoweb sanitises its Markdown; the realm is not changed here). A verdict is
kept in the player's own browser: changing it there fools only that player.
A hole the gate refuses still exists on the chain, unranked, and can be
played through the realm directly.

## Alternatives considered

- **Port the checks to TypeScript.** Rejected: only the chain's code refuses
  exactly what the chain refuses, without a second implementation to drift.
- **Extract `decodeData` whole.** Rejected on size, measured above.
- **Put the checks in `golf.wasm`.** Rejected: every player would download
  the builder's code and the `unicode` tables for nothing (+46 KB, +19 KB
  gzipped).
- **A separate Go package for the builder's exports.** Tried first: it
  needed its own copy of the argument and answer plumbing, and could not
  carry golf.wasm's exports, which the builder's test mode plays with. Build
  tags give one package, two builds.
