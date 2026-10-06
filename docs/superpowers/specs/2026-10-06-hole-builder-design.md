# The Hole Builder: design

## Status

Proposed, 2026-10-06; revised the same day after review (see "Review
changes" at the end). Subproject 2 of the second wave. Nothing on chain
changes: the contract side (`PublishMine`, `SetPublishing`, `Hide`, GG1) is
deployed and stays as it is. This spec covers the web client, a second wasm
build, and the tests and scripts around them.

## Context

A community hole can already be published, from a terminal. The realm's side
is complete and closed behind a switch:

- `golf.PublishMine(cur, slug, hexData, note)` in
  `gno.land/r/gnogolf/golf/v2/data.gno` publishes `<caller>/<slug>/v1`, then
  `v2` and on, while `Publishing()` is true. The owner opens it with
  `SetPublishing` (closed at deploy) and takes a hole off the lists with `Hide`.
- Every version goes through `decodeData` (`data.gno`): hex, at most 32 KB of
  data (`maxData`), `course.DecodeChecked` (GG1 within its frozen limits, then
  `course.Exact` on the stored wall lengths), the canonical-form check
  (`course.Encode(h)` must give the same bytes back), the heaviest-shot bound
  (`newWork(h, nil).bound <= maxShotGas`) and the dearest-weather room
  (`worstGas(h, len(data)) <= workBudget`). Then the name and the note are
  refused if `linkish`, and cleaned (`cleanName`, `cleanText`).
- The client draws a hole from its data alone: `buildHole` in
  `web/lib/scene/course.ts`, the shared skin tables (`POSTS`, `BARS`, `MOUTHS`
  in `web/lib/scene/pieces.ts`, `ZONE_DRAW` in `web/lib/scene/zones.ts`), and
  each world module's own `piece()` (`web/lib/scene/worlds.ts`, `fromWorld`).
  An unknown skin falls back to the plain form (CLIENT.md, rule 2).
- `web/lib/sim/golf.wasm` runs the realm's own physics in the page:
  `scripts/wasm.sh` copies `p/gnogolf/physics` and `p/gnogolf/course` as Go,
  extracts what `SimulateFrom` and `simulateRound` reach from the realm
  (`scripts/wasm/extract`), and builds it with TinyGo 0.42.0.
  `scripts/wasmparity.ts` proves it answers byte for byte as the realm.
- `NEXT_PUBLIC_COMMUNITY=1` lists community holes in the game
  (`web/lib/engine.ts`, `g.community`); unset, they are not listed.

What is missing is a way for a player to make a hole without writing Go.

The hard requirement: **everything a player can place is guaranteed to render
and to be physically possible, piece by piece and in the hole it is placed
in.** The chain guarantees neither. It checks the format, the limits and the
gas, and accepts any skin and any geometry that passes them: a hole whose cup
sits inside a wall publishes fine.

## Verified facts

Read on the live chains and in the code on 2026-10-06. Each design number
below rests on one of these.

### On chain

| Fact | Source |
|---|---|
| Publishing is closed on onyx: `Publishing()` answers `false` | `gno.land/r/nym-alexiscolin000/gnogolf/golf/v2.Publishing()`, onyx RPC |
| `vm:p:storage_price` is `"100ugnot"` a byte on onyx and on mainnet | params query, onyx and `rpc.gno.land` |
| So the box hole of `z_storage_publish_filetest.gno` (3,146 B stored) costs about 0.31 GNOT, and a 21 KB hole about 2.4 GNOT | 100 ugnot × bytes |
| `vm:p:default_deposit` is `"100000000ugnot"` (100 GNOT) on both. With `MaxDeposit` empty the keeper uses it, so a gnokey or Adena `PublishMine` needs no `-max-deposit` up to about 1 MB stored | params query; `gno/gno.land/pkg/sdk/vm/keeper.go:2357-2359` (`processStorageDeposit`) |
| `gno.land/r/gnogolf/golf/v2` does not exist on mainnet (`InvalidPkgPath`): publishing is not deployed there | `rpc.gno.land` |
| `MaxTxBytes` 1,000,000; block `MaxGas` 3e9; `TxSizeCostPerByte` 10; a store write 14 gas a byte. A 64 KB hex argument fits a transaction | `gno.land/cmd/gnoland/start.go:429-431`, gno defaults |

### In the repo

| Fact | Source |
|---|---|
| `PublishMine`'s order: `publishing`, `validSlug`, `decodeData`, `nothingNew`, `dataEntry` (`cleanName`, `cleanText`), `linkish`. Every refusal sentence the error table quotes matches the source | `r/gnogolf/golf/v2/data.gno:128-169` |
| GG1's limits as stated in "What GG1 can express" | `p/gnogolf/course/data.gno:17-29` |
| A slope's \|Vec\| is at most G·MaxSin = 0.95 | `physics/step.gno:9`, `:75` |
| The fastest launch is `Kick·10^¾` = 0.79 × 5.62 = 4.44 a substep | `course/course.gno:475` |
| `Kicks` matches `bumper`, `pinball` and `mushroom`; `WetIce` is 1.06 | `physics/step.gno:681`; `course.gno` |
| Mines has no climate entry and takes the garden's | `course.gno`, `climates` |
| An untimed wall costs 6,150 work units in the dearest weather: 60 puddle tries × 100 + 150 | `course.gno:209-228`, `golf.gno:810-813` |
| A loop plays along X or along Y only, the way from its mouth's centre to its landing | `physics/step.gno:627-640` |
| A zone thinner than `MaxMove` (1.5) along the ball's way can be stepped over | `physics/step.gno:185-188` |
| Fit's extent is walls, posts, tee and cup only; it clips rectangle zones to the new board; a Tunnel, Hazard or Loop `Vec` and every polygon point are read by `Decode` with `point()`, so must lie within 1 of the board | `course/author/fit.gno:37-96`; `course/data.gno:596`, `:626` |
| Every course hole is fitted with margin 1.5 (90 of 90) | `data/holes.txt`, hole sources |
| Running `author.Fit` as Go on `data/holes.txt`: idempotent on 89 holes, not on mines/17 (one float moves by one ulp: 1.3919289871074412 → 1.3919289871074414) | measured for this spec |
| `course.Exact` could not be checked natively: Go on arm64 fuses multiply-add, which is why `wasm.sh` uses the GnoVM's `math` | measured for this spec |
| `HoleState`'s JSON is lossy: coordinates to 3 decimals (`jnum`), no Bounce or Mark on walls and posts, skins through `cleanSkin` (24 bytes), no Friction, Bounce, Substeps or Shelter, no stored lengths, no pulse timing | `r/gnogolf/golf/v2/state.gno:21-60`, `:139-170`, `:465-487`; `golf.gno:1305` |
| `ZONE_DRAW` has no entry for kind `loop`, and a plain `Air` slope draws nothing of its own | `web/lib/scene/zones.ts:201-213`; `web/lib/terrain.ts:34` |
| The prototype lookup is real: `MOUTHS[skin](R)`, and `cleanSkin` lets `_` through, so `__proto__` passes | `web/lib/scene/pieces.ts:617-621`; `golf.gno:1305` |
| A commit plays at most 12 shots (`maxShots`); `simulateRound` runs its list as one commit with one work budget | `golf.gno:35`, `:771-787`; `state.gno:425-457` |
| The wasm shim's `Period()` is the largest int64 | `scripts/wasm/r/gnogolf/golf/local.go:34` |
| `Hide` takes a hole off the lists only: "Its data, rounds and page stay". No exported query says whether a hole is hidden | `r/gnogolf/golf/v2/owner.gno:152-196` |
| `golf.wasm` is 183.4 KiB. TinyGo is not installed here, so `builder.wasm`'s size is an estimate; the gate in `wasm.sh` is the real check | `web/lib/sim/golf.wasm` |

## What the code says

These findings fix the design's numbers. Each was read in the code or measured
for this spec.

### What GG1 can express

From `course/data.gno` (`Encode`, `Decode`) and `physics/field.gno`:

| Element | Fields | Clock |
|---|---|---|
| Wall (segment) | A, B, Bounce (0 to 1.5), Mark, Skin | substep timing: Every, On, Phase |
| Post (circle) | C, R (above 0, at most 8), Bounce, Mark, Skin | none of its own |
| Zone `Surface` | box, Round, Poly, Outside, Scale (0 to 8: sand holds, ice frees) | substep timing |
| Zone `Slope` | push Vec (at most G·MaxSin = 0.95), `Air`, `Capped` | substep timing |
| Zone `Tunnel` | mouth box or shape, destination Vec (on the board) | substep timing |
| Zone `Hazard` | shape; the ball goes back where the stroke was played from | substep timing |
| Zone `Loop` | mouth, landing Vec, Scale (the speed to go round) | substep timing |
| Pulse | walls, posts and zones present on strokes where (stroke+Phase) % Every < On | stroke timing |
| Hole | W, H (1 to 96), par (0 to 19), Substeps (1 to 60), World, Order, Title, Tee, Pin, CupRadius (above 0, at most 2), Shelter, Friction, Bounce, ball Radius | |

So the format has moving walls (timed walls within a stroke; a timed bar is
four of them), pieces that come and go from stroke to stroke (pulses, the
only way to time a post), loops, tunnels and moving air. Limits:
`MaxWalls` 160, `MaxPosts` 32, `MaxZones` 32, `MaxPoly` 64, `MaxPolyTotal`
512, `MaxPulses` 16, `MaxSkins` 64, `MaxTiming` 4096, all counted with the
pulses' pieces.

What `Decode` does **not** hold a hole to, and the Builder must:

- **A zone must be at least `MaxMove` (1.5) deep along the way a ball crosses
  it**, or a fast ball steps over it unseen (`physics/step.gno:185-188`; the
  `Loop` comment in `field.gno` says it for loops only). This holds for every
  `Hazard`, `Tunnel` mouth and `Loop`. Nothing checks it.
- **A loop is played along X or Y only.** The axis is X unless the landing is
  further from the mouth's centre in Y than in X; the way in is towards the
  landing (`step.gno:627-640`). A loop drawn at an angle plays along the
  nearest axis.
- **A loop's speed must be reachable.** The fastest launch is
  `course.Kick·10^¾` = 0.79 × 5.62 = 4.44 per substep (`course.Launch`).
- **Some skins are physics, not looks.** `physics.Kicks(skin)` lets a piece
  whose skin contains `bumper`, `pinball` or `mushroom` play a Bounce above 1;
  any other plays `MaxBounce` (0.75). `course.wet` makes a `Surface` skinned
  `ice` quicker again in the rain (`WetIce`), and treats any `Surface` with a
  skin as no place for a puddle. `WithWeather` sorts zones skinned `wind`,
  `rain`, `fog`, `storm`, `snow` under the hole's own.
- **Tee and cup can be anywhere on the board**, inside a wall or a hazard.
- **Zones may be inverted or empty.** `Decode` reads a zone's corners with no
  `Min ≤ Max` check (`data.gno:593`), and Fit can clip a rectangle to nothing.

### Which skins exist, per world

The skins the course's hole sources use (`gno.land/r/gnogolf/<world><n>`,
`Skin:` fields and the wall builders' skin arguments):

| World | Skins |
|---|---|
| garden (`hole<n>`) | bridge, bumper, flowerbed, gate, gate door, hedge, ice, lantern, logs, mill, mole, molehill, moon bridge, rock, sail, sand, scarecrow, seesaw, shelf, slope, soil, stump, sunflower, tunnel, water, wheelbarrow |
| island | bank, beach, blowhole, castle tube, cave, coral, crab, driftwood, gap, lagoon, mound, outcrop, palm, plank, rampart, rowing boat, sandcastle, sea, tidepool, volcano, wetsand |
| town | awning, bandstand, brick, bridge, canal, cat, chimney, clock, clock hand, door, flowerbed, fountain, funbox, gnome statue, herringbone, house, lamp, ledge, logs, marble, obelisk, pigeon, plank bridge, puddle, quarter pipe, rail, roof, roundabout, stall, stump, tram |
| mountain | avalanche, avalanche-warn, bank, boulder, cliff, crevasse, downhill, gust, ice, ice cave, kicker, lift, net, pine, saddle crest, serac, skater, slope, snowdrift, terrace |
| mines | adit, ballast, bat, booster, boulder, buffer, cable car, cage, cage door, cart, cart ride, causeway, conveyor, corkscrew, crumble, crystal bumper, crystal gate, drill, drip pool, dynamite, frozen fall, geyser, gold, hopper, hot spring, ice, incline, jewel bumper, kicker, ladder, lava, lava fall, lava tide, ledge bank, magnet, ore, ore bin, ore chute, paddle, pickaxe, piston, prop, rockfall, rope bridge, rubble, safe door, shaft, stalactite, stalagmite, stamp, sump, swing door, tripwire, turntable, vault door, vent, void |

The shared tables' keys: `POSTS` (scarecrow, sunflower, lantern, sandcastle,
palm, coral, buoy, crab, lamp, clock, roundabout, chimney, outcrop,
driftwood, house, gnome statue), `BARS` (driftwood, plank, tram, clock hand,
stall, awning, wheelbarrow), `MOUTHS` in `pieces.ts` (cave, well, door,
shipwreck), and the tunnel shapes in `course.ts` (blowhole, cage, ladder,
hopper). The rest is drawn by the world modules (`piece()`, `PLAZA_POSTS` in
`town.ts`, the mountain's post makers, `mines-rides.ts`'s `ZONES`).

Two kinds of skin come out of this. Most draw from the piece alone (a palm, a
sand trap, a hedge bar). Some draw from a composition the course placed by
hand: a tram line is detected from a run of timed bars skinned `tram` or
`cart` (`course.ts` `tramLines`, 1039-1052), the castle slide needs a
`sandcastle` post beside a `castle tube` tunnel (`zones.ts`), the mines'
rides (cage, cable car, cart ride, corkscrew, lift, geyser) are set pieces
with choreography. The first kind can be placed one by one; the second cannot
without breaking.

### The renderer depends on context

Even a piece that draws alone can be drawn differently, or not at all, by
what is around it:

- walls inside an `Outside`-polygon sea are not drawn (`course.ts:1600-1603`,
  `terrain.ts:202` `inSea`): the wall still stands on the chain;
- `unreached()` (`course.ts:1566-1587`) hides walls no ball can reach;
- `kerbChains` (`course.ts:802-812`) absorbs runs of 12 or more connected
  unskinned walls into the kerb;
- four walls are drawn as one bar only when consecutive and their short side
  is at most 1.6 (`course.ts:1625-1632`);
- `tramLines` turns any timed `tram` or `cart` bar run into a tram line,
  though `tram` is a `BARS` key.

So "renders" is a property of a piece in its hole, not of its skin. Today
nothing reports which path drew which piece (`scripts/smoke.ts` has no
census). This spec adds one ("The render census").

**Two more gaps:** `ZONE_DRAW` has no entry for kind `loop` (`zones.ts:201-213`):
loops are drawn only by `castle tube`, which needs a `sandcastle` post, and by
the mines' ride `ZONES` (`mines-rides.ts:2029-2034`), which are hand-only. A
plain `Air` slope draws nothing either (`terrain.ts:34`: air is no hill).
Neither can be placed in v1.

**Found while writing this:** the tables are plain object literals looked up
by skin (`POSTS[p.skin]`, `BARS[skin]`, `MOUTHS[z.skin]`), so a skin such as
`constructor`, `toString` or `__proto__`, which `cleanSkin` lets through,
reaches `Object.prototype`. A tunnel zone skinned `constructor` calls
`mouthAt("constructor", …)`, which calls `Object(R)` and then sets
`.position` on a Number: a TypeError in the middle of `buildHole`. Today only
the owner publishes; once publishing opens, anyone can. The fix is part of
this subproject (Rollout, step 1).

### What the wasm costs

TinyGo is not installed where this spec was written, so the measurement used
Go's own wasm port (`GOOS=wasip1`, `-ldflags=-s`) on the same module
`scripts/wasm.sh` generates, in a scratch copy, with the onyx sources from
`../gno`:

| Build | Raw | Gzipped |
|---|---|---|
| today's roots (`SimulateFrom`, `simulateRound`) | 2,276,938 B | 670,079 B |
| + `author.Fit`, `course.Encode`, `course.DecodeChecked`, `newWork`, `worstGas`, `validSlug` | +62,861 B | +14,050 B |
| + `cleanName`, `cleanText`, `linkish` (the `unicode` tables) | +31,629 B | +14,472 B |
| + `decodeData` extracted whole, and `boardJSON` (pulls `encoding/hex`, so `fmt`, and `crypto/sha256`) | +890,011 B | +232,363 B |

The committed `golf.wasm` (TinyGo) is 187,825 B (183.4 KiB), 83,973 B
gzipped. TinyGo's code is several times denser than Go's, and the `unicode`
tables are data, the same size in both. The estimate for a TinyGo build with
the checks, the text filters, `physics/build` and the `decode` writer: about
230 to 260 KB raw, 100 to 120 KB gzipped. It is an estimate; the gate in
`wasm.sh` is the check. Extracting `decodeData` verbatim is out:
`encoding/hex` brings `fmt`, which is why
`scripts/wasm/r/gnogolf/golf/local.go` already has its own `unhex`.

### What a publish costs

- **Storage deposit.** `z_storage_publish_filetest.gno` publishes a 4-wall
  box hole (about 370 bytes of data, title `Stored`, empty note, a first
  version) and stores 3,146 bytes in `store`: the data, its entry, and its
  rows in the community and author indexes. The entry also stores the
  cleaned name (up to 40 runes, at most 160 bytes) and the note (up to 140
  runes, at most 560 bytes), and a second version re-saves the old entry with
  its `next` (`data.gno:154-157`). The chain charges
  `params/vm:p:storage_price` a byte, 100 ugnot on onyx and mainnet (read by
  `chain.storagePrice()` in `web/lib/chain.ts`). The course's holes are 576
  to 7,924 bytes of data (`data/holes.txt`); a hole at every limit is about
  21 KB.
- **Gas.** On the two heaviest course holes (7.9 KB), decoding the hex
  argument measured 32 to 45M and `course.Exact` 21 to 36M (docs/golf.md,
  "Gas and storage"), once per version. Nothing has been measured at 21 KB,
  and `Encode`'s cost is unmeasured.
- **Fees.** `feeFor` in `web/lib/adena.ts`: gas × price × 1.5.

## Decisions

1. **Three locks, each enforced by code, not by review.**
   - *Render*: only palette pieces can be placed, the palette exists only
     where the client draws the skin, and the render census proves, on every
     rebuild, that each placed piece was drawn by its entry's path in the
     hole it sits in. A CI test fails if an entry has no drawing or no valid
     physics binding.
   - *Physics*: the browser runs the chain's own checks, compiled from the
     chain's own sources, plus editor checks for what the chain does not
     check (listed below).
   - *Playability*: Publish unlocks only once the author has holed the exact
     geometry in test mode, with the real simulation, in one period of each
     weather kind of the world's climate that changes how the ball moves.
2. **A second wasm, `web/lib/sim/builder.wasm`, for the Builder only.** It is
   built by the same `scripts/wasm.sh` from the same sources, with more
   roots. `golf.wasm` stays byte for byte what it is (its own embedded
   sources list included, see "The build"), so no player downloads the
   editor's code, and `wasm.sh --check` keeps passing.
3. **The checks run as the chain's code, with a hand-written driver.**
   `decodeData`'s steps are called in its order from a small Go file of
   `scripts/wasm` (hex and sha256 stay in the page). The parity test proves
   the driver refuses what the realm refuses, with the same sentence.
4. **Edit in 2D, preview in 3D.** The board is edited top-down on a snapping
   grid; a 3D pane beside it rebuilds with `buildHole` from the canonical
   data, debounced. Precision belongs to the 2D view; what players will see
   belongs to the 3D one, drawn by the game's own code.
5. **What you see is what is published.** Every edit runs Fit and Encode in
   the wasm, and both views draw the result, not the draft. Fit may cut a
   rectangle zone at the board's edge: the author sees it happen, and a zone
   cut to nothing is an error (E1).
6. **No stored float is computed in JavaScript.** Positions snap to 0.25
   (0.5 by default); there is no angle snap: a bar is placed by its two ends,
   each on the grid, so its direction is a lattice one (0°, 45°, 90°, and the
   slopes the grid gives). JavaScript writes only grid values (multiples of
   2⁻²) and plain parameters. A bar's corners, which involve a square root,
   are computed in Go by `build.Bar` inside `fit`. The Draft is kept in the
   canonical frame: `gg1.ts` shifts it so the extent's low corner sits at the
   margin (1.5), which is exact because that corner is a grid point (E1b),
   so `Fit`'s shift is zero, the driver asserts it, and `Fit(Fit(h)) ==
   Fit(h)`. An unchanged Draft gives the same bytes every time.
7. **The world is the theme.** A hole's world picks its palette, its scenery,
   its climate (so its test weathers) and its field constants. The field's
   Friction, Bounce, Shelter and Substeps, the ball's radius (0.5) and the
   cup's (1.2) are not editable in v1: they are pinned per world in
   `palette.ts` from the world's course holes, so a community hole plays like
   the cup it borrows. Shelter matters most: mines holes use 0.03 to 0.06
   (17 of 18), so mines is pinned at 0.03; without it a mines hole would take
   the garden climate's full wind. Substeps (20 to 34 in the course, chosen
   per hole) are pinned at the world's most common value; that a stroke
   reaches the cup is guaranteed by the proof, not by the constant.
8. **No Builder on a phone** (amended 2026-10-06, the owner's decision). On a
   phone, or a touch device under 900 px wide, `/build` loads neither the
   editor nor `builder.wasm`: one screen says the Builder is for a computer,
   lists the community's holes and the player's own published ones to play
   (playing stays on a phone), and gives a link to copy to open it on a
   computer. No touch editing. A test holds that this path never fetches
   `builder.wasm`.
8b. **The classic worlds only** (amended 2026-10-06, the owner's decision):
   the Builder offers the Garden, the Island, Mushroom Town and the
   Mountain. The Crystal Mines (their rides, their dark galleries, their
   void) are too much for it: no picker, palette, starter or field for them,
   and a mines hole, a file or a published one, is refused to open with a
   plain sentence; the game plays the mines course as before. (Their field
   in Decision 7 is kept only as history.)
8c. **Stricter than the course** (amended 2026-10-06, the owner's
   decision): the course holes were validated by hand and by play; the
   Builder's rules are never relaxed to let one in. Those it refuses
   (town/14, a door 1.2 deep) are a report in the golden test, not a
   requirement, and never open in the editor: it opens only what it can
   vouch for.
9. **No server.** Drafts live in the browser (and in a file the author can
   export); proofs are re-checked in the browser at publish; sharing is a
   link and an image made in the page (ADR-003). The one file the site
   serves for this, the takedown list, is static (see "Security and abuse").

## The palette model

### An entry

`web/lib/builder/palette.ts`:

```ts
type PieceKind =
  | "rail"     // a long wall: the world's kerb draws it
  | "bar"      // a bar of four walls: BARS, or the world's piece()
  | "post"     // a circle: POSTS, or the world's piece()
  | "surface" | "slope" | "tunnel" | "hazard"; // zones
// "loop" and "air" are not kinds in v1: nothing draws them alone (Out of scope)

type Shape = "rect" | "round" | "poly" | "outside";
type Clock = "fixed" | "substep" | "stroke"; // untimed, timed wall/zone, pulse
interface Range { min: number; max: number; step: number; def: number }

interface PaletteEntry {
  id: string;                  // "island/post/palm", "*/zone/sand"
  world: World | "*";          // "*": every world
  label: string;               // what the palette shows
  skin: string;                // the exact GG1 skin
  kind: PieceKind;             // the physics it is bound to
  shapes?: readonly Shape[];   // zones only
  size: Range;                 // a post's radius, a bar's length, a zone's side; min 1.5 for hazards and tunnel mouths
  thick?: Range;               // bars
  bounce?: Range;              // max above 1 only where physics.Kicks(skin)
  scale?: Range;               // surface: rolling resistance
  grade?: Range;               // slope: |Vec|, at most 0.95
  clocks: readonly Clock[];    // which timings it may take; "substep" first for pieces that move by nature
  draw: "POSTS" | "BARS" | "MOUTHS" | "TUNNELS" | "ZONE_DRAW" | "world" | "kerb";
}
```

Assemblies are entries that place several GG1 pieces as one, edited as one:

- **Tunnel**: a `Tunnel` zone (the mouth) and its destination, the mouth
  drawn by `MOUTHS` or the tunnel shapes. The destination is a handle on the
  board.
- **Bar**: the four walls `build.Bar(a, b, thickness)` makes, held in the
  Draft as `(a, b, thickness)` and turned into walls by the driver, never in
  JavaScript. A timed bar is the same four walls sharing one timing
  (`build.Timed`).

A radius, a size and a thickness step by 0.25, so a post's edge is a grid
value; a palette range whose course uses are not multiples of 0.25 keeps its
course values as allowed steps (`palettestats.ts` lists them).

### How it is generated

The palette is not a list typed by hand. `palette.ts` builds it from:

- the keys of the tables that draw by skin (`POSTS`, `BARS`, `MOUTHS`, the
  tunnel shapes, `ZONE_DRAW`'s skin tests);
- a `SKINS` declaration each world module exports beside its `piece()`,
  naming the skins it draws from the piece alone;
- `BINDINGS`, one table keyed by skin: its kind, shapes, ranges and clocks.

An entry exists only where a drawing key and a binding meet. A skin with a
drawing and no binding is listed in `HAND_ONLY` with the reason (a
composition the course placed by hand: the trams' line, the castle slide,
the mines' rides, the rooftops), and the coverage test fails on any skin in
neither list. `tram` and `cart` are in `HAND_ONLY` explicitly, though `tram`
is a `BARS` key: any timed run of them becomes a tram line. Adding a drawing
therefore forces a decision: bind it, or say why it cannot be placed alone.

The ranges are seeded from the course: `scripts/palettestats.ts` decodes
every hole of `data/holes.txt` through `builder.wasm` (`decode`, which is
exact) and prints the smallest and largest radius, scale, grade, bounce and
timing each skin is played with. A test asserts that every palette range
covers the course's own uses: the palette never forbids what the course does,
except below the 1.5 zone minimum, where the course's thinner uses are listed
and left out.

### Physics-meaningful skins

- `bounce.max > 1` is allowed exactly where `Kicks(skin)` holds. The client's
  copy of the rule (`KICKS` in `palette.ts`) joins the rules
  `scripts/selfcheck.ts` reads back from the realm's sources.
- `ice` is bound to `surface` only. No other skin may contain `bumper`,
  `pinball` or `mushroom` unless it kicks.
- `wind`, `rain`, `fog`, `storm`, `snow` and `puddle` are weather. They are
  never palette skins.
- The plain skin `""` exists as one entry per kind in v1 (a plain rail, a
  plain post, a plain bar, a plain surface, slope, tunnel and hazard), so the
  author always has a form that renders by rule 2. Each is in the render
  census like any other entry.

### Changing world

The world can change while every placed piece has an entry in the target
world (or is a `"*"` entry). Otherwise the pieces without one are listed and
the change is refused.

## The validation pipeline

Four layers, cheapest first. A layer runs only when the one before it passes.

| Layer | Where | When | What it guarantees |
|---|---|---|---|
| L0 Construction | palette, inspector | while placing | skins, kinds, ranges and clocks are the palette's; positions on the grid |
| L1 Editor checks | `web/lib/builder/checks.ts`, and the render census | every edit, debounced 150 ms | what the chain does not check (below) |
| L2 Chain checks | `builder.wasm` `fit` and `check` | every edit, after L1's geometry checks | exactly what `PublishMine` checks, same sentence |
| L3 Proof | test mode | on demand; required to publish | the exact geometry holed in one period of each moving weather kind |

Each issue has a severity: an **error** blocks test mode and publishing, a
**warning** blocks nothing. Each names the piece it is about; clicking it
selects the piece.

### L1, the editor's checks

| # | Check | Severity |
|---|---|---|
| E1 | The hole fits the board and every point `Decode` reads with `point()` stays on it. Fit's extent (wall ends, post edges, tee, cup) plus 1.5 each side is at most 96 a side, so at most 93 across. Every other point must lie inside that extent plus the margin: polygon points, a tunnel's destination, a hazard's `Vec` (`gg1.ts` sets it to the tee). No rectangle zone is clipped to empty by Fit (Min < Max on both axes after `fit`) | error |
| E1b | Fit's low corner is set by a grid point: a rail end, the tee, the cup, or a post whose edge is on the grid. A bar corner never is (a bar may not reach past the outermost of those). This keeps Fit's shift exact (Decision 6) | error |
| E2 | The tee is inside the lane (the even-odd outline of the untimed walls, the rule `course.dryLand` uses), at least the ball's radius plus 0.05 from every wall, outside every post, and outside every `Hazard` and `Tunnel` zone, timed, untimed or in a pulse | error |
| E3 | The cup's disc (cup radius plus ball radius) is inside the lane and touches no wall, post or non-ground zone of any clock: no timed or pulsed piece ever closes it | error |
| E4 | The cup can be reached from the tee on a 0.25 grid at the ball's clearance, untimed walls and posts as obstacles, tunnels as jumps, every timed and pulsed piece left out (the most open the hole ever is). Unreachable even then is unreachable for good | error |
| E5 | Every `Hazard` and `Tunnel` mouth is at least 1.5 across: a rectangle on both axes (after Fit's clipping), a round zone in diameter, a polygon in inscribed width (the largest distance from a point inside to its edges, doubled, measured on a 0.05 grid). Thinner, a fast ball steps over it | error |
| E6 | A tunnel's destination is in the lane, clear of walls by the ball's radius, and not inside a hazard or a tunnel (no chain of jumps) | error |
| E7 | A timed piece is on for 1 to Every−1 of its cycle (always on is a fixed piece, never on is nothing); a pulse's Every is 2 to 60 strokes (a round has at most 60) | error |
| E8 | The counts against GG1's limits: walls /160, posts /32, zones /32, polygon points /64 each and /512 in all, pulses /16, skins /64, shown as gauges | error at the limit |
| E9 | The data's size against 32 KB | error |
| E10 | A piece outside the lane (no ball can reach it) | error (amended: the Builder limits, it does not warn) |
| E11 | A fixed wall count high enough to eat the rain's room: each untimed wall costs 6,150 units of a commit's room in its dearest weather (ADR-005); shown as the room gauge from `check` | gauge from 80%; error when L2 refuses |
| E12 | The render census: every placed piece was drawn by its entry's path (below) | error |
| E13 | No two solid pieces overlap or interpenetrate where the renderer draws them badly: a post inside or across a wall or a bar, two posts overlapping, a bar crossing a bar or a rail, a zone over a zone of another kind (z-fighting), a zone's mouth under a post. A pairing the palette entry allows (`overlaps` in its binding: a bridge over water, sand round a post) is fine | error |
| E14 | Every passage the ball must use is wide enough: between two solid pieces (walls, bars, posts, fixed), every gap a ball could pass but only just (below the ball's diameter and 0.25, 1.25) is either shut (below the ball's diameter: no passage) or widened; the reachability of E4 runs at that clearance, so a gap that only a perfect ball threads does not count as a way | error |
| E15 | Every piece stays clear of what the world draws round it: at least 0.5 from a kerb chain's drawn body, which would swallow it (E12 sees the merge; E15 keeps the gap), and out of the world's own scenery (the island's sea round the lane, the town's rooftops, the mines' void) | error |

E2 to E6 run on the canonical hole (after Fit), from `decode`'s JSON, with
the lane and zone tests of `web/lib/terrain.ts` (`inZone`, `inPoly`,
`segDist`), which already mirror the physics' shapes. The lane of E2, E3,
E4, E10 and E14 is where a ball cannot leave the board: a flood on a 0.25 grid
over the untimed walls thickened by the ball's radius (`checks.ts`
`inLane`). The chain's even-odd count (`course.dryLand`, for puddles) flips on
a rail standing inside the lane, which a builder must allow.

### Prevention, not warning (amended 2026-10-06)

The Builder never lets an author make an impossible course or an impossible
render. Where it can prevent, it prevents; the issues list is for what only
the whole hole shows.

- **At placement**: a ghost of the armed entry follows the cursor, snapped,
  green where it can go and red with the rule's sentence where not. A drop
  where it is red does not happen.
- **Moving and sizing**: a drag or a handle clamps to the nearest valid
  position and size (the entry's ranges, the board, E2, E3, E13, E14, E15),
  never past it. A key move that would break a rule does not move.
- **One-click fixes** where the fix is obvious: move the piece off the wall,
  widen the gap, take the cup out of the water. Each issue selects its piece.
- **Gauges before limits** (E8, E9, E11): green, the sun at 80%, the hat at
  the limit; at a limit, the palette's entries that would pass it are off,
  with why.
- **The 3D preview** is the game's `buildHole` on the canonical bytes (`fit`,
  then `state`), rebuilt 150 ms after the last edit, never on the draft.
- **Publish (L3)** stays locked until the author has holed the exact
  geometry in one period of each moving weather.

`web/lib/builder/checks.ts` answers both: `checkHole` for the issues list,
and `canPlace` (the same rules, one piece against the rest) for the ghost
and the clamps. The golden set of broken holes (`web/test/builder-golden.test.ts`)
holds them: each deliberately broken hole is refused by the right rule with
its sentence; the course holes of the Builder's worlds it passes keep
passing, and those it is stricter on are a report (Decision 8c).

### The render census

New code, not an existing step. `buildHole` takes an optional `census`
callback and reports, for each GG1 piece (walls by index, posts by index,
zones by index, pulse pieces by pulse and index), the path that drew it:

```ts
type Drawn =
  | { by: "table"; table: "POSTS" | "BARS" | "MOUTHS" | "TUNNELS" | "ZONE_DRAW"; key: string }
  | { by: "world"; world: World; key: string }
  | { by: "kerb" }                       // a rail, or merged into a kerb chain
  | { by: "bar" }                        // four walls read as one bar
  | { by: "tram" }                       // read as part of a tram line
  | { by: "fallback" }                   // the plain form of rule 2
  | { by: "hidden"; why: "sea" | "unreached" | "empty" };
```

The 3D pane passes it on every rebuild. E12 compares each piece's report with
its entry's `draw`: a piece hidden in a sea, merged into a kerb when it is a
bar or a post entry, read as a tram line, split from its bar (not
consecutive, or a short side over 1.6), or drawn by a fallback, is an error
naming the piece and what happened ("The plank at (12, 4) is drawn as part of
the kerb: move it off the rail"). The census is the same code the game runs,
so it also serves the smoke test.

### L2, the chain's checks in the browser

`fit` turns the draft into the bytes that will be published; `check` runs
`PublishMine`'s checks on them, in `publishMineNow`'s order:
`validSlug`, the data's size, `course.DecodeChecked`, the canonical form,
`newWork(h, nil).bound > maxShotGas`, `worstGas(h, len(data)) > workBudget`,
then `linkish` on the cleaned name and note. A refusal comes back as the
realm's own sentence (`golf: …` or `golf: course: …`), shown with the plain
explanation from the table in "Error messages".

Three checks depend on the chain's state and are done by the publish step
with reads: `Publishing()`, the alias's current sha (`Versions`), for
"nothing to publish", and the deployed sources (`builder.wasm`'s `sources()`
against the realm's files, as the game does for `golf.wasm`; see "The
build").

### L3, the proof

See "Test mode and par".

## The wasm API additions

### The build

`scripts/wasm.sh` builds twice:

1. `golf.wasm` exactly as today.
2. `builder.wasm`, with `-tags builder`, after extracting the realm a second
   time with more roots:

   ```
   SimulateFrom simulateRound entry.hole
   HoleState Extras Weather
   newWork worstGas maxShotGas maxData
   validSlug cleanName cleanText linkish
   ```

   and `p/gnogolf/course/author` and `p/gnogolf/physics/build` copied like
   `physics` and `course` (`fit.gno` and `build.gno`; the rest comes along
   and is dropped by the linker).

`scripts/wasm/r/gnogolf/golf/local.go` gets `//go:build !builder`; a new
`local_builder.go` (`//go:build builder`) declares the same shims with the
fields `HoleState` reads (`name`, `par`, `order`, `official`, `slot`,
`version`, `next`, an all-zero `wearGrid`), and the builder's functions
below. Its `Period()` reads a settable clock (`SetPeriod`, exported as
`setperiod`) instead of the largest int64, so `HoleState` and `Weather`
answer for the proof's period. `scripts/wasm/main.go` gets the same tag
split: `main_builder.go` adds the exports.

The embedded sources list is generated twice: `sources.go`
(`//go:build !builder`) lists exactly what it lists today, so `golf.wasm`
does not change, and `sources_builder.go` (`//go:build builder`) lists the
builder's files, `author/*.gno` and `build/*.gno` included. The Builder
compares its list, at load, with the deployed files of the realm it publishes
to (and checks that realm has no successor set), and refuses to publish on a
mismatch: "The Builder's checks are not the chain's current rules. Reload the
page, or wait for the site to catch up."

`wasm.sh` fails if `builder.wasm` passes 300 KB raw or 130 KB gzipped. Past
that, the text filters move to a TypeScript port held to the Go by the parity
test, the one fallback this design allows.

### The exports

Same calling convention as `golf.wasm` (`arg`, `out`, `outlen`; a refusal is
`panic: ` and the sentence, the host starts a new instance). All of
`golf.wasm`'s exports, plus:

| Export | Argument buffer | Answer |
|---|---|---|
| `fit(n, margin)` | draft GG1 in hex (n bytes), then the bar list (one line each: `ax ay bx by thickness wallIndex`, the walls' slot in the draft's wall list, timing and style taken from the placeholder walls there) | `{"hex":…,"dx":…,"dy":…,"w":…,"h":…,"lo":[x,y]}`: `course.Decode`, each placeholder replaced by `build.Bar`'s four walls, `author.Fit(h, margin)`, `course.Encode`. dx and dy are the shift Fit applied; the driver refuses (`builder: the draft is not in its frame`) unless both are 0, which E1b guarantees |
| `check(ns, nh)` | slug (ns), canonical hex (nh), note (the rest) | `{"bytes":…,"name":…,"note":…,"bound":…,"worst":…,"room":…}`: the cleaned name and note as the chain will store them; `bound` against `maxShotGas`, `worst` against `workBudget`, `room` the work units a first shot has in the dearest weather against `minShotWork` |
| `decode(n)` | canonical hex | the whole of `course.Decode`'s `course.Simple` as JSON, lossless: every float printed with `strconv.FormatFloat(v, 'g', -1, 64)` (as `jexact` does), raw skins (not cleaned), marks, bounces, stored lengths, timings, field constants (Friction, Bounce, Substeps, Shelter, radii) and each pulse with its Every, On and Phase. Used by import, by E1 to E11, by `palettestats.ts` and by the golden round trip |
| `bar(n)` | `ax ay bx by thickness` | the four corners `build.Bar` gives, exact, so an import can tell four walls from a bar |
| `state(n)` | id (n), canonical hex | `HoleState(id)` after `Load`: the JSON a player's client reads, with no round and no wear. For the 3D pane and test mode only: it is lossy (3 decimals, no bounce, mark, field constants or pulse timing) |
| `extras(n, stroke)` | id | `Extras(id, stroke)`: a stroke's pulse pieces |
| `forecast(n, period)` | id | `Weather(id, period)`; the clock set by `setperiod` must be at or after `period` (`notAhead`) |
| `setperiod(period)` | | sets the shim's `Period()` |
| `find(n, kind, from)` | id, then the kind | the latest period at or before `from` whose `course.ForecastFor` kind is `kind`, searching at most 10,000 periods; `-1` if none |
| `commit(n, x, y, stroke, period)` | id, then the shots | `simulateRound(id, &{x, y}, stroke, shots, period)`, as `SimulateCommit` calls it: a commit after the first, from where the one before left the ball |

The draft GG1 is written in TypeScript (`web/lib/builder/gg1.ts`), on a
96 × 96 board, with every stored wall length 0 and each bar as four
placeholder walls. `Decode` accepts it (`PrepareWith` takes the zeros; `Fit`
calls `physics.Prepare` again), and `Encode` rewrites everything canonical,
the lengths with the chain's own `physics.Lengths`. The TypeScript writer
writes only grid values and parameters, and only has to be decodable, never
canonical. A zone that covers the whole board is a Draft flag (`whole`),
written as 0 to 96 so Fit maps it to the new board.

`web/lib/sim/host.ts` gains `fit`, `check`, `decode`, `bar`, `state`,
`extras`, `forecast`, `setperiod`, `find` and `commit`, present when the
module exports them.

`web/lib/builder/localchain.ts` implements the slice of `makeChain`'s
interface the engine uses to play a hole, on `builder.wasm`, so test mode is
the game itself, pointed at a hole the chain does not have yet. Every answer
agrees on one clock, the proof's period `p`:

- `holes()` answers one row, the draft's, as the chain would list it (the
  engine looks the hole up there, `engine.ts:1392-1394`);
- `state` calls `setperiod(p)` then `state`;
- `period()` answers `p`;
- `now()` answers a fixed time inside `p` (`p × RULES.periodMs` plus half a
  period), so `stale()` never fires and `refresh()` never moves the round to
  another weather (`engine.ts:807-822`);
- `weather(id, q)` answers `forecast` for `q ≤ p`;
- `simulateFrom`, `simulateRound`, `simulateCommit` (on `commit`) and
  `extras` answer from the wasm.

## Editor architecture

### Files

```
web/app/build/page.tsx                 the /build route (static export), behind NEXT_PUBLIC_BUILDER
web/components/builder/Builder.tsx     the shell: toolbar, palette, board, 3D pane, inspector, issues
web/components/builder/Palette.tsx     entries of the current world, by kind; templates
web/components/builder/Board.tsx       the 2D top-down editor (SVG): grid, snapping, handles, selection
web/components/builder/Preview.tsx     the 3D pane: buildHole on state's JSON, rebuilt debounced, with the census
web/components/builder/Inspector.tsx   the selected piece's parameters, within its entry's ranges
web/components/builder/Issues.tsx      L1 and L2 issues, gauges, the room
web/components/builder/TestMode.tsx    the game on localchain, the proof checklist
web/components/builder/Publish.tsx     the publish wizard
web/lib/builder/draft.ts               the Draft model, history, persistence, import and export
web/lib/builder/palette.ts             entries, BINDINGS, HAND_ONLY, KICKS, the worlds' field constants (Shelter included)
web/lib/builder/gg1.ts                 Draft to draft GG1 and bar list; decode's JSON back to a Draft
web/lib/builder/checks.ts              E1 to E12, the error mapping
web/lib/builder/proof.ts               proofs: required weathers, keys, replay by commits
web/lib/builder/localchain.ts          the engine's chain, answered by builder.wasm on one clock
web/lib/builder/publish.ts             cost estimate, the Adena call, the gnokey command (POSIX quoting), confirmation
web/lib/builder/share.ts               new: the hole link (id, and by= once the author has a best) without a game Snapshot; the image download on a computer
web/lib/builder/templates/*.json       starter drafts (proofs are made on first test, not committed)
web/lib/scene/course.ts                changed: the census callback; zones with Min ≥ Max skipped
web/lib/sim/builder.wasm               scripts/wasm.sh, committed like golf.wasm
web/public/takedown.json               the owner's list of hidden holes the site will not show (see Security)
scripts/wasm/r/gnogolf/golf/local_builder.go, scripts/wasm/main_builder.go, scripts/wasm/sources_builder.go
scripts/palettestats.ts
web/test/builder-*.test.ts
```

`adena.ts`'s `calls` and `gnokeyCall`, module-private today, are exported for
`publish.ts`.

`/build` and everything under it load only there (`next/dynamic`), so the
game's bundle does not grow.

### The Draft

```ts
interface Draft {
  v: 1;
  world: World;
  slug: string;              // fixed before test mode: the hole's id depends on it
  title: string;             // at most 40 characters, written into the data cleaned
  par: number;               // 1..19; suggested by the proof
  tee: Vec2; pin: Vec2;      // grid values, in the canonical frame
  pieces: Piece[];           // each { id, entry, geometry, params, clock }; a bar's geometry is (a, b, thickness)
  pulses: { every: number; on: number; phase: number; pieces: string[] }[];
  note: string;
  proofs: Proof[];
}
```

The editor works on the Draft; `gg1.ts` writes it, `fit` canonicalizes it,
and the views draw the result. After each edit `gg1.ts` shifts the Draft by
whole grid steps so the extent's low corner is (1.5, 1.5): the Draft's
coordinates are the published ones.

- **History.** Undo and redo over immutable Draft snapshots, 200 deep; a drag
  is one step. Ctrl+Z, Ctrl+Shift+Z.
- **Persistence.** Every change is saved to `localStorage`
  (`gnogolf.builder.drafts`, versioned, wrapped in try/catch: a private
  window keeps the draft in memory). Export and import as a `.json` file.
- **Opening a published hole** for its next version: `HoleData(alias)` from
  the chain, `decode` in the wasm (never `state`, which is lossy), then
  `gg1.ts` matches every piece to a palette entry: a skin, kind, ranges and
  clock it allows, grid coordinates, and the hole's field constants equal to
  the world's pinned ones. Four walls are a bar when `bar` on the recovered
  ends and thickness gives their corners exactly. A hole with a piece no
  entry matches (written in Go, with a hand-only skin, or off the grid) is
  refused, with the pieces listed: the Builder never republishes what it
  cannot vouch for. A hole the Builder published imports whole.

### Starter templates

Three per world, each a Draft made only of palette entries: a straight par 2,
a dogleg par 3, and one that shows the world's signature piece (garden: a
seesaw slope; island: a tunnel under the sea; town: a timed stall bar;
mountain: a slope to a crevasse; mines: a lava hazard to carry). No proofs
are committed with them: a proof depends on the hole's id, which holds the
author's address and the version, so a template's proof never matches an
author's. The author proves a template on first test like any draft. CI
checks that each template passes E1 to E12 and L2, and that proofs made for
it under a fixed test id (a test address, the template's slug, v1) replay holed.

## Test mode and par

### What must be proven

A single "worst weather" does not exist for every hole: wind breaks a narrow
lane, snow slows a ball short of a slope's crest, rain lays puddles before a
jump. So the proof covers one period of each kind in the world's climate that
changes how the ball moves: every kind but fog, which only hides the far end
(a `Surface` of scale 1). From `course.climates` (mirrored by `CLIMATES` in
`web/lib/sky.ts`):

| World | Rounds to hole |
|---|---|
| garden | clear, wind, rain |
| island | clear, wind, rain, storm |
| town | clear, rain, wind |
| mountain | clear, snow, wind |

One period is one sample: wind direction and strength (`WindMin` to
`WindMax`) and the puddles change every period (`course.ForecastFor`,
`wet`). A proof says the hole was holed in that weather once, not in every
wind it can have. For wind, `find` looks back over the last 10,000 periods
and the Builder takes the period with the strongest wind among the wind
periods it found, so the sample is a hard one.

### How a proof is made

1. The author picks the slug, and gives their address: Adena connected, or
   typed for gnokey (kept in the browser, as the save flow does). The id is
   then known: `<address>/<slug>/v<n>`, n from `Versions(alias)`, 1 for a new
   hole. The weather depends on the id (`course.ForecastFor` hashes it with
   the period), so the proof is played in weather the published hole will
   really have.
2. For each kind, `find(id, kind, now)` gives the period to play (for wind,
   the strongest found). The engine plays the hole on `localchain` in that
   period's weather, the aim preview included, exactly as a player would play
   it.
3. When the ball drops, the shot list is replayed the way a save is split:
   `chainSplit` (`adena.ts`) on `localchain`, so `commitsOf` cuts it, the
   first commit goes through `round` (`simulateRound`) and each next one
   through `commit` from where the one before left the ball, with the
   realm's "commit the first N" honoured. The proof holds when every commit
   plays all its shots and only the last one holes. That replay, not the live
   play, is the proof. A commit plays at most 12 shots (`maxShots`), and a
   mines round can take more; one commit would refuse such a round where the
   chain accepts it in several.

```ts
interface Proof { key: string; id: string; kind: string; period: number; shots: string[]; commits: [number, number][]; strokes: number; maxWork: number }
```

`key` is the sha-256 of the canonical data written with an empty title and
par 0: renaming the hole or changing its par keeps the proofs; moving a piece,
changing a parameter or the world drops them all. A proof whose `maxWork` is
above `minShotWork` (800,000 units, four fifths of `physics.MaxWork`) does
not count: that shot could be cut short in its dearest weather on chain.

### Par

The suggested par is the most strokes any proof took, plus one, at most 19.
The author can set any par from that most to 19. A par below it is refused:
the author has not shown the hole can be done in it in the sampled weathers.
Par is a whole number in the data (`Strokes`), so it is part of what is
published.

## The publish flow

The wizard has four steps. It opens only with no L1 or L2 error and every
required proof in hand for the current key.

1. **Name and note.** The title (40 characters) and the note (140) are shown
   as the chain will store them (`check`'s `name` and `note`: `cleanName`,
   `cleanText`), with `linkish` run live. The title written into the data is
   the cleaned one, so the data and the stored name agree. The step says, in
   plain words, before anything else: "Your hole, its name and its note are
   public and stay on the chain for good: nothing published can be deleted,
   by you or by anyone. The site's owner can hide a hole from the lists and
   from this site." It gives the report contact the site uses for takedowns.
2. **Checks.** The proofs again (replayed by commits against the final
   bytes), the sources check (`builder.wasm` against the deployed realm), the
   reads `Publishing()` (closed: the wizard says so and stops) and
   `Versions(alias)` (a newer version published from elsewhere changes the
   id: the proofs are played again; the same sha: nothing to publish).
3. **Cost.** Before any signature:
   - deposit: `storagePrice × (bytes + overhead + utf8Len(name) +
     utf8Len(note) + (v > 1 ? oldEntryDelta : 0)) × 1.1`. `overhead` is what
     `z_storage_publish_filetest.gno` stores past its data with a 6-byte name
     and no note (3,146 bytes for about 370 of data, so about 2,770);
     `oldEntryDelta` is what a second version adds by re-saving the first's
     entry with its `next`. A tenth more, as the save flow asks. At 100 ugnot
     a byte: about 0.31 GNOT for the box hole, 2.4 GNOT at 21 KB. No
     `-max-deposit` is needed: the chain's default deposit (100 GNOT) covers
     about 1 MB;
   - gas: Adena simulates the call and asks what it used. For gnokey, a
     formula fitted to measured publishes (below), with a margin;
   - fee: `feeFor(gas, price)`;
   - the total in GNOT, and `shortOf` against the balance when the address
     is known.
   A new filetest, `z_storage_publish_limits_filetest.gno`, publishes a hole
   at every limit (21 KB), one with a 40-rune name and a 140-rune note of
   four-byte runes, and a second version of one, and pins `overhead` and
   `oldEntryDelta`. Gas is measured on gnodev (a txtar, or `stage.sh`) for
   the same three, and the gnokey formula is set from those numbers, not
   guessed; `publish.ts`'s constants follow them.
4. **Sign.** Adena: one `PublishMine(slug, hex, note)` call through
   `adena.ts`'s `calls`. gnokey: the command from `gnokeyCall`
   (`-func PublishMine -args <slug> -args <hex> -args <note>`). The save flow
   joins arguments verbatim and its shots are digits only, but `cleanText`
   keeps `'`, `;` and `$`, so `publish.ts` quotes the note with POSIX single
   quotes, each `'` written `'\''`. The page then confirms by reading
   `Current(alias)` until it names the new id, as a gnokey save is confirmed
   by the key's address.

After it: the hole's link, `?hole=<id>`, and an invitation to play it for
real and save the round, which records the author's best (the proofs cannot
be sent: their periods are long past `playablePeriod`'s two). That saved best
is what turns on the dare link and the "holed by its author" mark below.

### Sharing

- **The link** is `?hole=<id>`, and once the author has a best,
  `?hole=<id>&by=<address>`: the ghost dare of ADR-004. `holeLink` in
  `web/components/common.ts` needs a game `Snapshot`, which the Builder does
  not have, so `web/lib/builder/share.ts` adds a helper that makes the same
  link from an id and an address (new work).
- **The image** is made in the page from the Builder's 3D pane, with the
  title, the par, the author's name and "Built on gno.land". On a phone it
  goes to the system share sheet through `Share.tsx`'s `snapshot` path. On a
  computer nothing downloads an image today (`Share.tsx:60-73` copies the
  clip only), so `share.ts` adds the download (new work). No static
  page per community hole (ADR-003's `/h/<slot>/` are built from the
  course's slots): the link card stays the site's generic one. Zero server
  cost.

### Listing

With `NEXT_PUBLIC_COMMUNITY=1`, the game's community list puts first the
holes whose author has a best on them (`Bests(hole, mode, author)`), marked
"Holed by its author", then the others, marked "Not yet holed by its
author". Unlike the Builder's proof, this mark is the chain's: it holds for a
hole published from a terminal too.

## Error messages

Each L2 refusal is shown in plain words with the realm's sentence under it,
so an author can search for it. The mapping lives in `checks.ts`; an unmapped
sentence is shown as it is.

| The chain says | The Builder says |
|---|---|
| `golf: a slug is 1 to 32 of a-z, 0-9 and -` | The hole's short name is 1 to 32 lower-case letters, digits and dashes. |
| `golf: the data is too long` | This hole is over 32 KB of data. Remove pieces, or polygon points. |
| `golf: course: too many walls` (posts, zones, polygon points, pulses, skins) | Too many walls: 161 of 160. A bar is four walls. |
| `golf: course: the board is 1 to 96 a side` | The hole is wider or longer than 93 between its outermost pieces. Bring them in. |
| `golf: course: a point lies off the board` | A piece lies outside the board after fitting (a polygon point, or a tunnel's destination). Move it inside the hole's outer pieces. |
| `golf: course: a zone's box lies far off the board` | A zone lies outside the board after fitting. Move it inside the hole's outer pieces. |
| `golf: course: a polygon has 3 to 64 points` | A shape has fewer than 3 or more than 64 points. |
| `golf: course: a post's radius is above 0 and at most 8` | A round piece's radius is outside 0 to 8. |
| `golf: course: a zone's scale is 0 to 8` | A surface's grip is outside 0 to 8. |
| `golf: course: a slope pushes at most G·MaxSin (0.95)` | This slope is steeper than the physics allows (72°). |
| `golf: course: …timing is out of bounds` | A timed piece's cycle is outside 1 to 4096. |
| `golf: course: the stored wall lengths are not the walls' own` | The walls' stored lengths do not match. (Cannot happen after `fit`, which writes them with the chain's code: report it.) |
| `golf: the data is not as course.Encode writes it` | The data is not in its one canonical form. (Cannot happen after `fit`: report it.) |
| `golf: one shot on this hole could cost more than a transaction can replay` | One shot here could cost more than a transaction can replay. Fewer walls, or fewer pieces in pulses. |
| `golf: in its dearest weather, a commit on this hole would leave too little room for a shot` | In its heaviest weather (rain or a storm), this hole leaves a shot too little room. Each fixed wall costs the rain's puddle tries: edge the lane with a hazard or with timed pieces instead of rails. |
| `golf: a community hole's name and note carry no web address` | The name or the note looks like a web address. Write "St. Andrews", not "St.Andrews". |
| `golf: publishing community holes is not open yet` | Publishing is not open yet. Your draft is kept. |
| `golf: this data is already <id>: nothing to publish` | This is exactly the version already published. |

L1 messages name the piece and the number: "The cup touches the hedge at
(14, 6)", "The water at (20, 8) is 1.0 across: at least 1.5, or a fast ball
skips it", "The tee is inside the water", "The plank at (12, 4) is drawn as
part of the kerb".

## Security and abuse

- **The client's locks are not the chain's.** Anyone can call `PublishMine`
  with gnokey and skip the Builder. The chain still holds every hole to its
  format, limits and gas; it cannot know whether a hole renders or can be
  holed. So: the renderer stays robust to any GG1 (rule 2, the lookup fix
  and the geometry fix below), and the community list's "holed by its
  author" mark comes from the chain, not from the Builder.
- **Skin lookups.** Every table looked up by skin (`POSTS`, `BARS`, `MOUTHS`,
  `ZONE_DRAW`'s tests, the worlds' maps such as `PLAZA_POSTS`, `ZONES`,
  `SIGNS`, `LEVEL`) is read through `Object.hasOwn` or made a
  null-prototype object.
- **Hostile geometry.** `buildHole` skips a zone with `Min ≥ Max` on either
  axis (`zones.ts:219-223` feeds `max − min` to the geometry today). A smoke
  step builds `Decode`-valid adversarial holes in headless Chrome: inverted
  and zero-size zones, every limit at once (`MaxPolyTotal` 512, 160
  zero-length walls, 32 posts of radius 8), and every piece skinned
  `constructor`, `toString`, `__proto__`, `hasOwnProperty` and `valueOf`, in
  every world. Each must build without an error.
- **Takedowns.** `Hide` takes a hole off the chain's lists only: its data,
  rounds and page stay, and no exported query says it is hidden, so anyone
  with its `?hole=` link or a dare would still see its name and note, and the
  share image would carry them. The site therefore serves a static
  `takedown.json` (aliases, read like `flags.json`: size-capped, the chain's
  id checked), which the owner updates when hiding a hole. For a hole on that
  list the client shows nothing of it: "This hole was taken down", no name,
  no note, no author card, no play. A takedown needs no chain change and
  takes effect at the next site deploy.
- **Spam.** Every version costs its author a deposit and gas; `listed()`
  shows at most `perAuthor` (3) of one address's holes; the owner hides abuse
  (`Hide`, and the takedown list). The Builder adds no rate limit of its own:
  it cannot enforce one.
- **Text.** The name and note are filtered by the chain's own `cleanName`,
  `cleanText` and `linkish`, run in the wasm. Words that are offensive but
  not links are the owner's to hide. Authors are told in step 1 that what
  they publish is permanent and public.
- **Imported drafts are untrusted.** A `.json` draft is checked against the
  Draft schema and the palette before it is opened; a piece with an unknown
  entry refuses the file.
- **The gnokey command** carries only the slug (a-z, 0-9, dash), the hex
  (0-9, a-f) and the note, POSIX-quoted.

## Testing

| Test | What it proves | Where |
|---|---|---|
| Builder parity | `check` refuses exactly what `PublishMine` refuses, with the same sentence, and accepts the rest with the same cleaned name and note. The corpus: every hole of `data/holes.txt`, each mutated past each limit by one, a slope above 0.95, bad timings, a skin never used, a split style run, a zero-length wall, 160 bumper walls, many fixed walls on a big board (too stormy), a point off the board, a polygon of 2 points, linkish names | `scripts/wasm/parity_test.gno` (a `TestBuilderParity` beside `TestWasmParity`), compared by `scripts/wasmparity.ts` |
| Fit parity | `fit` on each course hole's draft gives its `data/holes.txt` hex. `Fit(Fit(h)) == Fit(h)` on every Builder output (templates and a generated corpus with bars at every lattice angle), the driver's d == 0 assertion included. On course holes the same holds on 89 of 90; mines/17 is a known exception (one float moves by an ulp), listed in the test | same |
| Bar parity | `bar` gives `build.Bar`'s corners exactly, for the corpus above | same |
| Decode parity | `decode`'s JSON, read back and written by `gg1.ts`, then `fit`, gives the same hex, on every course hole but mines/17 (raw pieces allowed) | `web/test/builder-gg1.test.ts` |
| State parity | `state(id, hex)` equals the realm's `HoleState(id)` on a fresh publish, wear and round aside, with the clock set to the same period | `scripts/wasm/parity_test.gno` |
| Golden round trip | for every course hole: hex, `decode`, `gg1.ts` back to a Draft (raw pieces allowed), draft GG1, `fit`: the same hex (mines/17 aside). For the holes made only of palette pieces (a pinned list): the import succeeds. For every Builder output in the corpus: the import succeeds and gives back the same Draft | `web/test/builder-gg1.test.ts` |
| Palette coverage | every entry: its skin is drawn by the table it names (`hasOwn`), not by a fallback; its binding is a valid kind with ranges inside the chain's bounds (radius 0 to 8, bounce 0 to 1.5, scale 0 to 8, grade at most 0.95) and the 1.5 zone minimum; `bounce.max > 1` exactly where `KICKS` holds; no weather skin; no `loop` or `air` kind; `tram` and `cart` in `HAND_ONLY`. Every drawing key is in the palette or in `HAND_ONLY` | `web/test/builder-palette.test.ts` |
| Palette covers the course | every course use of a palette skin lies in its entry's ranges, the listed thin zones aside | `scripts/palettestats.ts --check` in `check.sh` |
| Render census | a "palette sheet" hole per world, every entry once, and the same sheet with every entry next to a rail run, inside an outside-polygon sea, and in a timed run: the census reports each palette piece drawn by its entry's path where the hole allows it, and E12 flags exactly the pieces the context hides or merges | `scripts/smoke.ts`, a new step |
| Hostile holes | the adversarial holes of "Security and abuse" build in every world, no error | `scripts/smoke.ts`, a new step |
| Editor checks | E1 to E15, each with a hole that passes and one that fails; E1 with a polygon point and a tunnel destination past the extent, and a rectangle clipped to empty; E5 with a 1.4 strip of water and a thin polygon | `web/test/builder-checks.test.ts` |
| Golden broken holes | a set of deliberately broken holes, one or more per rule (E1 to E15, L2 refusals), each refused by exactly the rule expected with its sentence; the course holes of the Builder's worlds it passes keep passing, those it refuses a report (Decision 8c); `canPlace` refuses every broken piece the set places and clamps a drag to the nearest valid place | `web/test/builder-golden.test.ts` |
| Proofs | proofs replay holed by commits; a round of more than 12 strokes on a mines hole replays in several commits and holds; a moved piece drops them; a proof over `minShotWork` does not count; template proofs under the fixed test id replay | `web/test/builder-proof.test.ts` |
| Local clock | on `localchain`, `period()`, `now()`, `state`'s period and `weather` agree; the engine does not refresh the weather during a test round | `web/test/builder-proof.test.ts` |
| gnokey quoting | the note `Let's go; $(x)` comes out of the command, run through `sh -c 'printf %s …'`, unchanged | `web/test/builder-publish.test.ts` |
| Size | `builder.wasm` under 300 KB raw, 130 KB gzipped; `golf.wasm` unchanged, its `sources.go` unchanged | `scripts/wasm.sh --check` |

`check.sh` runs all of these; `wasm.sh --check` fails until a changed
`builder.wasm` is committed, as it does for `golf.wasm`.

## Rollout

1. **The renderer's lookups and geometry guard**, the hostile-holes smoke
   step and the takedown list, shipped to the game first: they protect
   players from holes published by gnokey the day publishing opens.
2. **`builder.wasm` and its parity tests**, committed; nothing uses it yet.
3. **The Builder behind `NEXT_PUBLIC_BUILDER=1`**, on the staging site only,
   against a local gnodev (`scripts/stage.sh`), where the deploy key opens
   publishing. The publish gas is measured there.
4. **Onyx first.** The owner calls `SetPublishing(true)` on onyx's
   `golf/v2` (closed today). The production site turns on
   `NEXT_PUBLIC_BUILDER=1` and `NEXT_PUBLIC_COMMUNITY=1` for onyx. The storage
   overhead is checked against what real publishes store (the
   `HolePublished` events and the accounts' deposits) and `publish.ts`'s
   constants corrected if needed.
5. **Mainnet** once the rules realm is deployed there (`golf/v2` does not
   exist on mainnet today), GNOT can be sent there (a publish needs a
   deposit), and onyx has run without a hidden hole for abuse that the
   Builder's filters should have caught. Until then the site shows the
   Builder only on onyx.

`SetPublishing(false)` closes it again at any time; published holes stay
playable and listed.

## Out of scope

- Holes as NFTs, and any creator revenue. The NFT subproject may build on the
  ids this one publishes (`<address>/<slug>/v<n>` is already owned by its
  author on chain).
- Editing on a phone. Phones play community holes; the Builder is desktop.
- Hand-only set pieces (tram lines, the castle slide, the mines' rides,
  rooftops) in the palette. They come back as assemblies one at a time, each
  with its binding and its render test.
- **Loops and plain air.** Neither draws alone today. A loop entry needs,
  first, a generic loop drawing keyed by kind in `ZONE_DRAW` (a tube mouth
  drawn along the loop's real axis, with its landing) and a render test. When
  it comes, the loop is bound to four headings (±X, ±Y), its heading derived
  from the landing handle, which stays on that axis's side; its mouth is at
  least 1.5 deep along that axis (`Max − Min` on it); its landing is in the
  lane, clear of walls, outside hazards; its speed at most 3.5. Plain air
  needs its own drawing (wind streaks) the same way.
- Editing the field constants (friction, bounce, substeps, shelter, ball and
  cup radius).
- A static page and link card per community hole. They would need a build
  per publish, or a server.
- Any change to the realms or to GG1, an exported `Hidden()` query included.
  A mechanic GG1 cannot express waits for a GG2 (ADR-002).

## Alternatives considered

- **Port the checks to TypeScript.** Rejected: the requirement is that the
  browser refuses what the chain refuses, and only the chain's code does that
  without a second implementation to drift. The text filters are the one
  allowed fallback, if the size budget forces it, held to the Go by parity.
- **Extract `decodeData` whole.** Rejected on size: `encoding/hex` brings
  `fmt` (measured: about 230 KB gzipped more in Go's port). The driver calls
  the same functions in the same order, and the parity test holds it there.
- **Put the checks in `golf.wasm`.** Rejected: every player would download
  the editor's code and the `unicode` tables for nothing.
- **Free-text skins with a warning.** Rejected: a skin the client does not
  draw renders as a plain form, and a skin can change the physics (`Kicks`,
  `ice`). The requirement is a guarantee, not a warning.
- **One worst weather per world.** Rejected for the proof: which weather is
  worst depends on the hole. Every moving kind of the climate costs the
  author two to three more test rounds, which are free.
- **Require the proof on chain** (a saved round before the hole is listed).
  Kept as the list's mark, not as a gate: it costs a save's deposit, and the
  realm cannot require it without a change.
- **Edit in 3D.** Rejected for v1: snapping, handles and precise selection
  are simpler and more exact top-down; the 3D pane shows the result as
  players will see it.
- **Import through `state`.** Rejected: `HoleState`'s JSON is for drawing,
  rounded to 3 decimals and missing bounces, marks, field constants and
  pulse timing. `decode` is the lossless reading.
- **Gate a community hole's name on `Holes()`.** Rejected: `listed()` shows
  at most 3 holes an author, so an honest author's fourth hole would lose its
  name. The takedown list names only what the owner took down.

## Review changes

Every blocker and major point of the review was applied; the minor points
too. In short: import and the golden round trip go through a lossless
`decode` export; loops and plain air leave the v1 palette until they draw
alone, with the loop's axis rules written down for when they come; bars are
computed in Go and the Draft is kept in the canonical frame, so Fit's shift
is zero and no stored float comes from JavaScript; E1 covers every point
`Decode` reads on the board and clipped-empty rectangles; proofs replay by
commits; `localchain` keeps one settable clock; a render census checks each
piece in its hole; hidden holes are suppressed by a site takedown list and
authors are told publishing is permanent; every hazard and tunnel mouth is at
least 1.5 across. Minor points: a hostile-geometry smoke step, two sources
lists and a sources check before publish, POSIX quoting of the note, a fuller
deposit formula and measured gas, the missing error rows and the heaviest
weather wording, Shelter pinned per world, the proof's wording and
template proofs, and the sharing work listed as new.

### Rejected review points

None was rejected. One was narrowed: of the two ways the review gave to stop
showing a hidden hole's name and note, the gate on `Holes()` rows was not
taken (see "Alternatives considered"); the takedown list was.
