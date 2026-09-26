# Writing a client

> A working one lives in `web/` — **Next.js, static export**. `npm install && npm run build` writes
>   `out/`, which is plain files: drop them on Netlify, Vercel, GitHub Pages or
>   IPFS. There is no server side — the game talks to a gno node over HTTP — so
>   nothing needs hosting but the files. `npm run dev` to work on it.
>
> The engine (`lib/scene.ts`, `lib/engine.ts`, `lib/chain.ts`) is plain TypeScript
> modules and knows nothing about React; the realm's JSON is typed in `lib/types.ts`
> and parsed in `lib/chain.ts` alone; the interface is a thin component on
> top. Swapping the framework means rewriting the HUD, never the game.
> Config travels in the query string, so one build serves any chain:
> `?rpc=` the node, `?web=` gnoweb for the source links,
> `?hole=` which hole to open (any id form below), or `?cup=island&hole=3` a
> course hole by its place in its cup, and `?shot=angle,power` to fire one on
> load (that last one is how the screenshots and the smoke test are taken).
> The golf realm's path is set at build time (`NEXT_PUBLIC_REALM`).
>
> Style: cel shading — `MeshToonMaterial` over a three-band ramp — plus
> `EdgesGeometry` contours. Flat volumes, dark outlines, no gradients, which is
> the language of the visual reference. The sky is CSS, not geometry: with a
> camera high enough to read the green, nothing above the horizon is ever in
> frame.


The realm is the game. A client draws it and submits shots; it never decides
what a shot does. The full API is in [docs/golf.md](docs/golf.md); this page is
what a client needs of it.

## Four rules

1. **Never simulate.** The chain returns the ball's whole path; the client
   replays it. Reimplementing the physics in JS means matching float64 GnoVM
   semantics exactly, and the ball will eventually land somewhere on screen that
   the chain disagrees with. This is the one rule that, if broken, breaks
   everything else quietly.
2. **Skin is a hint, geometry is the contract.** Draw any hole from its shapes
   alone and treat an unknown skin as the plain form — an unrecognised wall is a
   wall, a post is a post, a zone is a tinted area. An author ships
   `"giant skull"` today, an artist adds the mesh next month, nothing breaks in
   between. What a zone *does* is in its fields (`kind`, `air`, `capped`),
   never in its skin.
3. **Two points far apart in a path mean a tunnel.** The ball is somewhere else.
   Do not interpolate across the gap; cut, or play a pipe animation.
   **`"air"` says where the ball is off the ground**: a string with one `0`/`1`
   per path point. A fast ball that goes over the top of a slope takes off —
   further the faster it is and the steeper the hill — and in the air it flies
   over water, sand and tunnel mouths, and cannot drop into the cup; walls still
   stop it. Draw a jump only where `air` says so.
4. **Preview is free, committing is not.** Every `Simulate*` read costs
   nothing and needs no wallet. Only the writes (`PlayRound*`, `Launch`,
   `Reset`) are transactions.

## Hole ids

The course is data the golf realm's owner publishes into **slots**, one per
hole of a cup. Each publish is a new **version** of that slot, and every
version keeps its own rounds, records and board.

| Form | Example | Use it for |
|---|---|---|
| version | `garden/7/v2` | everything, and the only form a write takes |
| slot | `garden/7` | reads and links: it means the slot's current version |
| community | `g1…/my-hole/v1`, alias `g1…/my-hole` | someone's own data hole, the same two ways |

Reads take any of these. **Writes take the exact version id**, the `"hole"`
that `HoleState` or `State` returned (or the `"id"` in `Holes()`): a write
given `garden/7` panics, so shots aimed at one version can never be replayed
on another. A version with a non-empty `"next"` is archived: still playable,
its records kept, but out of the course ranking.

The course used to be 74 realms, `gno.land/r/gnogolf/hole1` and so on. Links
and saved scores may still carry those paths. `data/holes.txt` maps each slot
to the realm its data was built from (`garden/17` was `hole19`: a hole's old
number isn't its order), and the web client rewrites old paths to slots
(`lib/card.ts`).

## The reads

All are `vm/qeval` ABCI queries — plain HTTP GET, no wallet, no gas, ~44 ms
against a local node.

```
GET <rpc>/abci_query?path="vm/qeval"&data=0x<hex of "<pkgpath>.<expression>">
```

The expression syntax is `<pkgpath>.<call>` — a dot, not a newline. The reply
carries a base64 Gno-typed result that has to be unwrapped twice:

```js
const call = `gno.land/r/gnogolf/golf.Simulate("garden/2", 3, 8, 0, 6)`
const hex  = [...new TextEncoder().encode(call)]
               .map(b => b.toString(16).padStart(2, "0")).join("")
const res  = await fetch(`${rpc}/abci_query?path=%22vm/qeval%22&data=0x${hex}`)
const raw  = atob((await res.json()).result.response.ResponseBase.Data)
//  raw === '("{\\"version\\":1,\\"holed\\":false,…}" string)'
const json = JSON.parse(JSON.parse(raw.slice(raw.indexOf("(") + 1, raw.lastIndexOf(" string)"))))
```

`@gnolang/tm2-js-client` and `gno-js-client` wrap this; Adena is built on them.
The raw form above is here so the contract does not depend on a library version.

Every object a read returns starts with `"version":1` (the rows inside a
list don't). `Holes()` is `{"version":1,"play":…,"successor":…,"holes":[…]}`:
the rows, the 3D game's link, and the realm the course moved to (`""` if none;
a client that finds one can offer to go there).

### Which reads to use

| To | Read |
|---|---|
| build a menu | `Holes()` (the course first, at most 120), then `Community(after, limit)` for the rest |
| draw a hole and aim | `HoleState(hole)`: the geometry, weather and wear, without the rounds |
| preview the first stroke | `SimulateRoundAt(hole, shots, period)`, from the tee exactly |
| preview any later stroke | `SimulateFrom(hole, x, y, shot, stroke, period)` from the last `"rest"` |
| check a commit before signing | `SimulateCommit(hole, x, y, stroke, shots, period)` |
| read back a recorded round | `Round(hole, player)` |
| a player's place | `Rank(mode, player)`, not the whole `Players` list |
| the boards | `Leaderboard(mode)`, `HoleLeaderboard(hole, mode, offset, limit)`, `Bests`, `Standings` |

`State(hole)` is `HoleState` plus the play count and up to 24 rounds; a client
that only draws the hole doesn't need them.

### `HoleState(hole string) string` — everything to draw

```json
{"version":1,"hole":"garden/3/v1","name":"Down the Tunnel","official":true,"slot":"garden/3","v":1,
 "board":{"w":32,"h":16},"par":3,"world":"garden","order":3.000,"timed":false,
 "period":N,"weather":{"period":N,"kind":"","wind":[0,0],"zones":[]},
 "start":[3,13],"cup":[28,8],
 "walls":[{"a":[0,0],"b":[32,0],"skin":""}, …],
 "posts":[{"c":[9,4],"r":1.4,"skin":"bumper"}],
 "zones":[{"kind":"tunnel","min":[2,2],"max":[5,5],"vec":[26,3],"scale":0,"round":false,"skin":"tunnel"},
          {"kind":"surface","min":[8,12],"max":[14,16],"vec":[0,0],"scale":0.55,"round":false,"skin":"sand"},
          {"kind":"slope","min":[20,6],"max":[32,11],"vec":[-0.35,0],"scale":0,"round":false,"skin":"slope"},
          {"kind":"slope","min":[4,0],"max":[8,6],"vec":[0,0.2],"scale":0,"round":false,"air":true,"skin":"cannon"},
          {"kind":"hazard","min":[18,13],"max":[24,16],"vec":[3,13],"scale":0,"round":false,"skin":"water"}],
 "wear":{"w":16,"h":8,"cells":[0,0,1, …]}}
```

(Illustrative values.) `official` says the hole is one of the course's (cups,
numbers, rankings); anyone else's hole is a community hole. `slot` and `v` are
a data version's alias and number, and `next` appears once it's archived.

`zones[].vec` means a different thing per kind: an acceleration for `slope`, a
destination for `tunnel` and `hazard`, nothing for `surface` (which uses
`scale`, a friction multiplier). A `loop` is a loop-the-loop: `vec` is where
its track comes back down, `scale` the speed per substep needed to go round. A
ball heading in fast enough is put at `vec` with 0.8 of its speed; a slower one
is put back just outside the edge it came in by, rolling back at half speed;
one that comes in more than 25° off straight falls off the side and is put
down at rest in front of the mouth. In the path that reads as a jump to `vec`
(round), or a step ending inside the mouth followed by one back out (fell
back).

**`air` and `capped`** appear on a zone only when true. `air` is a slope that
is moving air, not ground (a cannon's gust): draw it as air whatever its skin,
and never as a hill. `capped` air never speeds the ball up, it only bends and
brakes it. The weather's zones never carry the two flags: the wind is always
both.

Polygon zones add `"poly":[…]` and `"outside"` (the zone is everything in its
box *but* the polygon: the sea around a lane with no rails). Timed walls and
zones add `"every"`, `"on"` and `"phase"` (see Timing below).

`wear` is one counter per cell, 16×8 over the board — how many balls came to
rest there. It is the only thing that changes on its own, and it is the theme's
to interpret: a worn track in grass, a glowing trace, cracks, polish. Map the
number to intensity and stay out of the way.

### `Simulate(hole, ballX, ballY, angle, power) string` — what a shot would do

Angle in degrees, 0 = +X, 90 = +Y. Power above 0, up to 10. It plays a first
stroke (stroke 0, tick 0) in the current weather.

```json
{"version":1,"holed":false,"bounces":1,
 "path":[[3,8],[9,8],[13.92,8],[17.954,8],[21.2,8],[17.673,8], … ,[4.301,8]],
 "air":"000…0","cause":"--b…-","rest":[4.3012…,8]}
```

`cause` is one letter per path point, what most acted on the ball in that
substep: `b` a bounce, `s` a hill, `w` wind or a gust, `i` a slippery surface,
`-` nothing but friction. `rest` is the exact resting point.

### `SimulateRoundAt(hole, shots, period) string` — the first stroke, the way a record will

`shots` is `"angle,power;angle,power;…"`. The chain replays them from the tee,
read-only, and returns the last shot's path plus `strokes`, `holed` and
`period`. `SimulateRound(hole, shots)` is the same in the current weather.
Replaying the decisions is what keeps the free game and a recorded one
identical — `PlayRoundAt` with the same string records exactly what was shown.
Format each number the same way on both calls (the web client uses
`toFixed(4)`).

### `SimulateFrom(hole, ballX, ballY, shot, stroke, period) string` — one stroke, from an exact ball

The same stroke `PlayRoundAt` would play, for one shot's gas instead of the
whole round's. `ballX, ballY` is the `"rest"` of the previous answer (`Round`,
`SimulateRound*`, `SimulateFrom`, `SimulateCommit`), passed exactly as it came
(it is the shortest decimal that reads back as the same float64); `shot` is
`"angle,power,tick"`; `stroke` is the stroke number (0 = the first). The
rounded `ball` and path points are for drawing only: after a bounce or two a
rounding error is a different ball. The web client asks the first stroke with
`SimulateRound*` (the tee exactly) and every later one, aim previews
included, with `SimulateFrom`.

### `SimulateCommit(hole, ballX, ballY, stroke, shots, period) string` — check a commit

What the next `PlayRoundAt` or `PlayRoundPro` of `shots` would do, from the
exact ball at stroke number `stroke`. It refuses what that commit would
refuse, so a client can check every commit of a long round before it signs
any. A heavy hole can't replay 12 full shots in one transaction: a list over
its work budget is refused with `commit the first N, then the rest`. Record
such a round in several transactions (the first with `Reset`), each
continuing the round.

### `Rank(mode, player) string` — a player's place

```json
{"version":1,"mode":"assisted","player":"g1…","rank":7,"of":213,"holes":18,"strokes":64}
```

`rank` is 0 for a player the ranking doesn't hold: unnamed (only players with
a gno.land name are ranked), or with no current course hole finished. `mode`
is `"assisted"` or `"pro"`, and each has its own records and ranking.

### What the physics knows

- **The ball has a radius** (`Field.Radius`, 0.5 on every course hole). Its
  centre stays that far from walls and posts, so draw a ball of that radius and
  it touches walls instead of sinking into them.
- **A ball drops in when it rolls over the cup slowly** — no faster than
  `course.Capture` allows (Holmes's criterion: 1.9 units per substep over the
  middle of the cup, less nearer its rim) — not only when it stops on it.
  The path is cut there and ends on the pin. Never while the ball is in the air.
- **A board has the hole's own size.** `board` is 32×16 by default, and a hole
  can be up to 96 on a side. Wear stays a 16×8 grid stretched over the board.
- **A stroke's power p is a speed of `course.Kick`·p^(3/4) (0.79, 4.44 at full power)**, and a substep is
  walked in moves of at most `physics.MaxMove` (1.5), so a fast ball meets
  every zone it crosses. A tunnel or hazard jump is recognised by where the
  step *lands* (the zone's `vec`), not by where it starts — a fast ball enters
  the zone after the last point it recorded outside it.
- **Some holes change with the stroke** (`timed`): a gate shuts every other
  stroke, a mole pops up one stroke in three. The clock is the stroke number in
  the player's own round, so a preview and a record always meet the same
  course. `Extras(hole, stroke)` returns the extra walls, posts and zones for
  stroke N (0 = the first shot); draw them over the hole's field and refresh
  after every shot.
- **Holes need not be rectangles.** `physics.Outline` walls a polygon, and
  whatever the walls fence off is ground the ball never reaches. The web
  client flood-fills from the tee to find the green and draws the rest as
  garden.

## Animating a path

One point per substep, and **a substep is a constant slice of time**. Play each
segment over the same duration — around 70 ms works — and the deceleration
appears on its own, because the distance per segment shrinks with friction.

Within a substep the velocity is constant, so linear interpolation between two
points is **exact**, not an approximation. ~15 points at 60 fps is ~90 frames
with nothing invented.

The one artifact: speed drops about 20% at each substep boundary, since friction
is applied discretely. Smooth the *timing* if it reads as a stutter. Never move
a point.

### The weather of the moment

Every hole has a weather, the same for every player, that changes every 5
minutes of chain time: `period = blockTime / 300` (`Period()` gives the current
one). It is `course.ForecastFor(id, world, h, period)`: a hash of the version's
id and the period, looked up in the world's table, in percent. A new version
of a slot has weather of its own.

| world | clear | wind | rain | fog | storm | snow |
|---|---|---|---|---|---|---|
| garden | 55 | 20 | 15 | 10 | | |
| island | 50 | 25 | 15 | | 10 | |
| town | 50 | 15 | 20 | 15 | | |
| mountain | 40 | 20 | | 15 | | 25 |

- **wind**: one Slope zone over the board, `vec` = the push, 0.08–0.15 per
  substep (never over the hole's `Shelter`), its direction from the hash.
- **rain**: a Surface ×1.025 over the board (a touch quicker green), the hole's
  ice again at ×1.06 over its own, and 2–4 `puddle` zones (Surface ×0.6,
  round, half-width 1.1–1.8) on the lane, never within 2 of the tee or the
  cup.
- **storm**: `storm` (×1, to look at), the rain as above, and the wind in two
  gusting Slope zones with `every: 6, on: 3, phase: 0 | 3`, 40° either side of
  the forecast's `wind`.
- **fog** (×1) and **snow** (×0.9) over the board.

The sky's zones lie under the hole's own (its sand stays sand in the rain);
puddles and wet ice lie over them. A round is played in one weather, from its
first stroke to the cup.

- `HoleState(hole)` has `"period":N` and `"weather":{"period":N,"kind":"wind",
  "wind":[x,y],"zones":[…]}`. `kind` is `""` when it is clear.
- `Weather(hole, period) string` is the same object for any period that has
  come.
- `SimulateRoundAt`, `SimulateFrom` and `SimulateCommit` preview in the given
  period's weather, and answer with it. `SimulateRoundAt` and `SimulateCommit`
  refuse the periods the commit would refuse (a first stroke takes the current
  period or the one before); `SimulateFrom` takes any period that has come.
- Record with `PlayRoundAt(cur, hole, shots, period)`, passing the period the
  round was previewed in. It is accepted when it is the current period or the
  one before, so a round played across the turn records exactly what was
  shown. A round under way keeps its first stroke's period, and can be played
  on until the next period is over; after that it must be `Reset`.

### A ball does not stop on a hill

When a stroke's substeps run out with the ball on a slope steeper than the
green's drag, it keeps rolling, up to `physics.MaxRollOn` (120) extra
substeps, until it is off the slope: a ball left on a hill runs down it. So a
path can have more points than the hole's substeps — replay every point you
are given, at the same pace.

### Timing: the third field of a shot

A shot is `"angle,power"` or `"angle,power,tick"`. The tick is where the timed
pieces were when the player let go: the tram, the mill's sails, the clock hand,
the planks, the lift, the storm's gusts. The stroke's field starts its clock
there (`physics.Field.Tick`), so a timed wall or zone stands in substep i when
`(i + tick + phase) % every < on`. The chain clamps it to 0..1023, and a
missing third field is tick 0. Show the pieces moving at one substep per tick
of your clock, and send the tick at release. Rounds keep the decisions as
played, in `"shots":"a,p,t;…"`.

## The writes

Every write is a `MsgCall` to the golf realm, signed by the wallet, and takes
the exact version id.

- `PlayRoundAt(cur, hole, shots, period)` records assisted shots, continuing
  the caller's round. To record what `SimulateRoundAt` showed from the tee,
  send `Reset(cur, hole)` and `PlayRoundAt` in the same transaction.
- `PlayRoundPro(cur, hole, shots, period)` is the same for a round played
  without the aim preview. A round keeps the mode of its first stroke.
- `Launch(cur, hole, angle, power)` is one shot, one transaction, always pro:
  it is how gnoweb plays.
- `Reset(cur, hole)` puts the ball back on the tee.

A wallet session scoped to the golf realm's `vm/exec` stops the wallet
prompting for every commit. `PublishMine` is how authors add holes of their
own, and `Publish` is the owner's; neither is a player's concern.

## Skin vocabulary

`hedge shelf gate mill` (walls) · `bumper` (post) · `sand slope tunnel water`
(zones), and many more, world by world: the web client's lookup table is the
catalogue. Weather skins are `wind rain fog storm snow`. A theme pack is a
lookup table from these to meshes, not code. Anything else falls back to
rule 2.

## Coordinates

X right, Y **down**, in board units over the hole's own `board`, angles in
degrees at the realm boundary and radians inside the physics package. A
three.js scene will want Y flipped or the camera rotated; do it once, at the
edge.
