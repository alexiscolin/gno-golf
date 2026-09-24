# Writing a client

> A working one lives in `web/` — **Next.js, static export**. `npm install && npm run build` writes
>   `out/`, which is plain files: drop them on Netlify, Vercel, GitHub Pages or
>   IPFS. There is no server side — the game talks to a gno node over HTTP — so
>   nothing needs hosting but the files. `npm run dev` to work on it.
>
> The engine (`lib/scene.js`, `lib/engine.js`, `lib/chain.js`) is plain ES
> modules and knows nothing about React; the interface is a thin component on
> top. Swapping the framework means rewriting the HUD, never the game.
> Config travels in the query string, so one build serves any chain:
> `?rpc=` the node, `?web=` gnoweb for the source links,
> `?hole=` which hole to open (its realm pkgpath), `?shot=angle,power` to fire one on load (that
> last one is how the screenshots and the smoke test are taken).
>
> Style: cel shading — `MeshToonMaterial` over a three-band ramp — plus
> `EdgesGeometry` contours. Flat volumes, dark outlines, no gradients, which is
> the language of the visual reference. The sky is CSS, not geometry: with a
> camera high enough to read the green, nothing above the horizon is ever in
> frame.


The realm is the game. A client draws it and submits shots; it never decides
what a shot does. Everything below was run against a live node, not inferred.

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
   between.
3. **Two points far apart in a path mean a tunnel.** The ball is somewhere else.
   Do not interpolate across the gap; cut, or play a pipe animation.
   **`"air"` says where the ball is off the ground**: a string with one `0`/`1`
   per path point. A fast ball that goes over the top of a slope takes off —
   further the faster it is and the steeper the hill — and in the air it flies
   over water, sand and tunnel mouths, and cannot drop into the cup; walls still
   stop it. Draw a jump only where `air` says so.
4. **Preview is free, committing is not.** A shot resolved by `Simulate` costs
   nothing and needs no wallet. Only `Launch` is a transaction.

## The two reads

Both are `vm/qeval` ABCI queries — plain HTTP GET, no wallet, no gas, ~44 ms
against a local node.

```
GET <rpc>/abci_query?path="vm/qeval"&data=0x<hex of "<pkgpath>.<expression>">
```

The expression syntax is `<pkgpath>.<call>` — a dot, not a newline. The reply
carries a base64 Gno-typed result that has to be unwrapped twice:

```js
const call = `gno.land/r/gnogolf/golf.Simulate("gno.land/r/gnogolf/hole2", 3, 8, 0, 6)`
const hex  = [...new TextEncoder().encode(call)]
               .map(b => b.toString(16).padStart(2, "0")).join("")
const res  = await fetch(`${rpc}/abci_query?path=%22vm/qeval%22&data=0x${hex}`)
const raw  = atob((await res.json()).result.response.ResponseBase.Data)
//  raw === '("{\\"holed\\":false,…}" string)'
const json = JSON.parse(JSON.parse(raw.slice(raw.indexOf("(") + 1, raw.lastIndexOf(" string)"))))
```

`@gnolang/tm2-js-client` and `gno-js-client` wrap this; Adena is built on them.
The raw form above is here so the contract does not depend on a library version.

### `State(hole string) string` — everything to draw

```json
{"version":1,"hole":"gno.land/r/gnogolf/hole3","name":"Down the Tunnel","official":true,
 "board":{"w":32,"h":16},"start":[3,13],"cup":[28,8],"plays":1,
 "walls":[{"a":[0,0],"b":[32,0],"skin":""}, …],
 "posts":[{"c":[9,4],"r":1.4,"skin":"bumper"}],
 "zones":[{"kind":"tunnel","min":[2,2],"max":[5,5],"vec":[26,3],"scale":0,"skin":"tunnel"},
          {"kind":"surface","min":[8,12],"max":[14,16],"vec":[0,0],"scale":0.55,"skin":"sand"},
          {"kind":"slope","min":[20,6],"max":[32,11],"vec":[-0.35,0],"scale":0,"skin":"slope"},
          {"kind":"hazard","min":[18,13],"max":[24,16],"vec":[3,13],"scale":0,"skin":"water"}],
 "wear":{"w":16,"h":8,"cells":[0,0,1, …]},
 "rounds":[{"version":1,"player":"g1…","ball":[26,0.04],"rest":[26,0.0412…],"strokes":1,"done":false,"period":N,"mode":"assisted","shots":"…"}]}
```

Every object a read returns starts with `"version":1`. `official` says the hole
is one of the course's (cups, numbers, rankings); anyone else's hole is a
community hole. `State`'s rounds carry no path: `Round(hole, player)` replays a
round's last stroke, and is `null` after `Reset`.

`zones[].vec` means a different thing per kind: an acceleration for `slope`, a
destination for `tunnel` and `hazard`, nothing for `surface` (which uses
`scale`, a friction multiplier). A `loop` is a loop-the-loop across the lane:
`vec` gives its axis, `scale` the speed per substep needed to go round. A ball
that fast is put just past its far edge with 0.8 of its speed; a slower one
is put back just outside the edge it came in by, rolling back at half speed.
In the path that reads as one step jumping across the zone (round), or a
step ending inside it followed by one back out (fell back).

`wear` is one counter per cell, 16×8 over the board — how many balls came to
rest there. It is the only thing that changes on its own, and it is the theme's
to interpret: a worn track in grass, a glowing trace, cracks, polish. Map the
number to intensity and stay out of the way.

### `Simulate(hole, ballX, ballY, angle, power) string` — what a shot would do

Angle in degrees, 0 = +X, 90 = +Y. Power 0 to 10.

```json
{"holed":false,"bounces":1,
 "path":[[3,8],[9,8],[13.92,8],[17.954,8],[21.2,8],[17.673,8], … ,[4.301,8]]}
```

That one is the bumper on hole2: out to 21.2, back to 4.3. `Launch` from the
same position gives the same numbers — `Preview` and `Play` are the same
physics, one of them just does not record.

### `SimulateRound(hole, shots) string` — preview a shot, the way a record will

`shots` is `"angle,power;angle,power;…"`, the round so far plus the shot being
aimed. The chain replays them from the tee, read-only, and returns the last
shot's path plus `strokes` and `holed`. Use this, not `Simulate`, for anything
after the first stroke: `State` and `Simulate` hand back positions rounded to
three decimals, and after a bounce or two a rounding error is a different ball.
Replaying the decisions is what keeps the free game and a recorded one
identical — `PlayRound` with the same string records exactly what was shown.
Format each number the same way on both calls (the web client uses
`toFixed(4)`).

A long list can be refused as more than one transaction can replay:
`commit the first N, then the rest`. `PlayRound*` refuses it the same way, so
record such a round in several transactions (the first with `Reset`), each
continuing the round.

### `SimulateFrom(hole, ballX, ballY, shot, stroke, period) string` — one stroke, from an exact ball

The same stroke `PlayRoundAt` would play, for one shot's gas instead of the
whole round's. `ballX, ballY` is the `"rest"` of the previous answer (`Round`,
`SimulateRound*`, `SimulateFrom`), passed exactly as it came (it is the
shortest decimal that reads back as the same float64); `shot` is
`"angle,power,tick"`; `stroke` is the stroke number (0 = the first). The web
client asks the first stroke with `SimulateRound` (the tee exactly) and every
later one, aim previews included, with `SimulateFrom`.

### What the physics now knows

- **The ball has a radius** (`Field.Radius`, 0.5 on every hole deployed). Its
  centre stays that far from walls and posts, so draw a ball of that radius and
  it touches walls instead of sinking into them.
- **A ball drops in when it rolls over the cup slowly** — no faster than
  `course.CaptureSpeed` (1.3 units per substep, a ball barely rolling) — not only when it stops on it.
  The path is cut there and ends on the pin. Cup radius is 1.2. Never while the ball is in the air.
- **A board has the hole's own size.** `State().board` is no longer always
  32×16: a hole implementing `course.Sized` (or a `course.Simple` with `W, H`)
  can be up to 96 on a side — The Corridor, The Climb and The Long Green are
  64 long. Wear stays a 16×8 grid stretched over the board.
- **A stroke's power is scaled by `course.Kick` (0.6)**, and a substep is
  walked in moves of at most `physics.MaxMove` (1.5), so a fast ball meets
  every zone it crosses. A tunnel or hazard jump is recognised by where the
  step *lands* (the zone's `vec`), not by where it starts — a fast ball enters
  the zone after the last point it recorded outside it.
- **Some holes change with the stroke** (`State().timed`): the mill's blade
  turns, a gate shuts every other stroke, a mole pops up one stroke in three.
  The clock is the stroke number in the player's own round, so `SimulateRound`
  and `PlayRound` always meet the same course. `Extras(hole, stroke)` returns
  the extra walls and posts for stroke N (0 = the first shot); draw them over
  `State`'s field and refresh after every shot.
- **Holes need not be rectangles.** `physics.Outline` walls a polygon; the
  board stays 32×16, and whatever the walls fence off is ground the ball never
  reaches. The web client flood-fills from the tee to find the green and draws
  the rest as garden.

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
one). It is `course.ForecastFor(id, world string, h course.Hole, period int64)`: a hash of the hole and
the period, looked up in the world's table, in percent:

| world | clear | wind | rain | fog | storm | snow |
|---|---|---|---|---|---|---|
| garden | 55 | 20 | 15 | 10 | | |
| island | 50 | 25 | 15 | | 10 | |
| town | 50 | 15 | 20 | 15 | | |
| mountain | 40 | 20 | | 15 | | 25 |

- **wind**: one Slope zone over the board, `vec` = the push, 0.08–0.15 per
  substep (never over the hole's `Shelter`), its direction from the hash.
- **rain**: a Surface ×1.12 over the board (a quicker green), the hole's ice
  again at ×1.06 over its own, and 2–4 `puddle` zones (Surface ×0.6, round,
  radius 1.1–1.8) on the lane, never within 2 of the tee or the cup.
- **storm**: `storm` (×1, to look at), the rain as above, and the wind in two
  gusting Slope zones with `every: 6, on: 3, phase: 0 | 3`, 40° either side of
  the forecast's `wind`.
- **fog** (×1) and **snow** (×0.9) over the board.

The sky's zones lie under the hole's own (its sand stays sand in the rain);
puddles and wet ice lie over them. A round is played in one weather, from its
first stroke to the cup.

- `State(hole)` has `"period":N` and `"weather":{"period":N,"kind":"wind",
  "wind":[x,y],"zones":[…]}`. `kind` is `""` when it is clear.
- `Weather(hole, period) string` is the same object for any period.
- `SimulateRoundAt(hole, shots, period)` previews in that period's weather.
  `SimulateRound(hole, shots)` uses the current one. Both answers say
  `"period"`.
- Record with `PlayRoundAt(cur, hole, shots, period)`, passing the period the
  round was previewed in. It is accepted when it is the current period or the
  one before, so a round played across the turn records exactly what was
  shown. `PlayRound(cur, hole, shots)` uses the current period. A round under
  way keeps its first stroke's period, and rounds say `"period"`.

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

## The write

`Launch(cur realm, hole string, angle, power float64)` is a `MsgCall`, signed by
the wallet, ~3.2 s on pearl, ~0.025 GNOT. Ask for a session subaccount scoped to
`vm/exec:gno.land/r/gnogolf/golf` at the start of a round and the wallet stops
prompting; gas then comes from whichever account created the session.

Also on the write side: `Reset(cur realm, hole string)` puts the ball back on
the tee, and `Register(cur realm, id string, h course.Hole)` is how a hole realm
publishes itself — a user cannot call it, `MsgCall` cannot build a `course.Hole`
argument.

## Skin vocabulary

`hedge shelf gate mill` (walls) · `bumper` (post) · `sand slope tunnel water`
(zones). The full list, world by world, is in `gno.land/p/gnogolf/physics`'s
package doc; weather skins are `wind rain fog storm snow`. A theme pack is a lookup table from these to meshes, not code. Anything
else falls back to rule 2.

## Coordinates

X right, Y **down**, 32 × 16 board units, angles in degrees at the realm
boundary and radians inside the physics package. A three.js scene will want
Y flipped or the camera rotated; do it once, at the edge.
