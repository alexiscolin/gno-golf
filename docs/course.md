# `gno.land/p/gnogolf/course`

The contract between a hole and the `golf` realm. The `Hole` interface is the
only thing the two have to agree on. The package also has `course.Simple` (a
ready-made hole that's only geometry), `Fit`, the stroke-to-stroke timing, the
cup rule, the weather, and GG1, the format a hole is stored in as data.

It builds on [physics](physics.md). Angles here are in **radians**, and power
goes from 0 to 10.

## The board

```go
const (
	BoardW, BoardH = 32, 16 // the default board
	WearW, WearH   = 16, 8  // the wear grid, stretched over any board
	MaxBoard       = 96     // longest allowed side
)
```

## `Hole`

```go
type Hole interface {
	Name() string
	Start() physics.Vec2
	Cup() physics.Vec2
	Field() *physics.Field
	Preview(ball physics.Vec2, angle, power float64) (physics.Shot, bool)
	Play(ball physics.Vec2, angle, power float64) (physics.Shot, bool)
	Wear() []int
}
```

- `Field` is the geometry, for renderers and for anyone who wants to inspect
  the hole.
- `Preview` resolves a shot and changes nothing. `Play` resolves it and marks
  the course. Both return the whole `Shot` and whether the ball was holed.
  Preview has to equal Play, or players see an animation of something that
  didn't happen.
- `Wear` is the `WearW*WearH` grid, row-major.

No method takes `cur realm`, so a hole never learns who's playing. Identity
stays with `golf`.

A course hole is published as data, and `golf` decodes it into a `Simple` for
each call. A realm can also implement `Hole` itself and register it with
`golf`, as a community hole ([golf.md](golf.md#registercur-realm-h-coursehole)).

### Optional interfaces

`golf` checks for these with type assertions:

| Interface | Method(s) | If missing |
|---|---|---|
| `Sized` | `Board() (w, h int)` | 32×16. Values outside `1..MaxBoard` also fall back. |
| `Parred` | `Par() int` | par 3. Values outside `1..19` also fall back. |
| `Ordered` | `Position() float64` | for a registered realm, the number at the end of its pkgpath (`hole7` → 7) |
| `Worlded` | `WorldName() string` | `"garden"` |
| `Timed` | `Varies() bool`, `Extras(stroke)`, `PreviewAt(...)`, `PlayAt(...)` | the hole is the same on every stroke |
| `Zoned` | `ExtraZones(stroke int) []physics.Zone` | no per-stroke zones |
| `Weatherable` | `PreviewWith(...)`, `PlayWith(...)`, `MaxWind() float64` | played with no weather |

Helpers that apply those fallbacks:

```go
func BoardOf(h Hole) (int, int)
func ParOf(h Hole) int
func OrderOf(h Hole, fallback float64) float64 // Position() if > 0, else fallback
func WorldOf(h Hole) string
```

### World and order

A hole's world is the cup it belongs to: `"garden"`, `"island"`, `"town"` or
`"mountain"`. The web client dresses the whole scene from it. Its order is its
place in that world, lowest first. A course hole's world and order are its
slot (`garden/7` is world `garden`, order 7), and the order is a whole number
from 1 to 999. `golf` reads both once, when a version is published or a realm
registers, and lists the course world by world (`garden`, `island`, `town`,
`mountain`, then any other world), then by order. Two holes, `extras/10` and
`extras/16`, use the world `"extras"`, which the client doesn't count as a cup.

## Wear

```go
func WearIndex(p physics.Vec2) int              // cell on the default board
func WearIndexOn(p physics.Vec2, w, h int) int  // cell on a w×h board, clamped

type Marks struct { /* [WearW*WearH]int */ }
func (m *Marks) Mark(p physics.Vec2)
func (m *Marks) MarkOn(p physics.Vec2, w, h int)
func (m *Marks) Wear() []int // a copy
```

`Marks` is meant to be embedded. Its methods are declared in `/p/`, but the
array belongs to the realm that allocated the hole, so the writes go into
that realm's storage. A data hole is decoded afresh for every call, so `golf`
keeps its wear on the version's own entry instead, marked the same way. Wear
doesn't affect play: it's there for renderers to show.

## `Simple`

A hole that's only its geometry. It implements `Hole`, `Sized`, `Parred`,
`Ordered`, `Worlded`, `Timed`, `Zoned` and `Weatherable`.

```go
type Simple struct {
	Marks
	W, H      int            // the board; 0 means 32x16
	Title     string         // Name()
	Strokes   int            // par; 0 means 3
	Tee, Pin  physics.Vec2   // Start(), Cup()
	Course    *physics.Field // Field(); required
	Pulses    []Pulse        // pieces that come and go with the stroke number
	Substeps  int            // passed to Field.Step
	CupRadius float64        // passed to Sink
	World     string         // "" is "garden"
	Order     float64        // place in the world, 1 first; 0 falls back to the pkgpath number
	Shelter   float64        // caps the wind (MaxWind); 0 means the world's own range
}
```

What a stroke does in `PreviewWith(ball, angle, power, stroke, tick, weather)`:

1. `Extras(stroke)` gathers the walls and posts of the pulses that are on.
2. `physics.UnstickIn` moves the ball out of any of those pieces that appeared
   on top of it, never across one of the hole's own walls.
3. The field is copied, never modified:
   `WithZones(WithExtras(Course, walls, posts), ExtraZones(stroke))`, then
   `WithWeather(..., weather)`, then `physics.WithTick(..., tick)`.
4. `Step(ball, Launch(angle, power), Substeps)`.
5. `Sink(shot, Pin, CupRadius)`.

`PlayWith` is `PreviewWith` followed by `MarkOn(shot.Rest(), W, H)`. The
shorter methods are thin wrappers: `Preview` = `PreviewAt(..., 0)`, and
`PreviewAt` = `PreviewWith(..., stroke, 0, nil)`. The same goes for `Play` and
`PlayAt`.

There's a full example in the [README](../README.md#writing-a-hole).

### `Fit`

```go
func Fit(h *Simple, margin float64) *Simple

var me = course.Fit(&course.Simple{…}, 1.5)
```

`Fit` moves a hole so its walls sit `margin` inside the board, and sizes the
board to them: a client draws the green over the board only, so a wall on or
past its edge would cut the green off in a straight line. Everything moves by
the same offset (tee, pin, walls, posts, zones and the pulses' pieces; a
Slope's `Vec` is a push and stays), and `W, H` become the walls' extent plus a
margin each side. A zone that covered the whole old board covers the new one,
and a plain rectangle that runs past the new board is cut at its edge. Then it
calls `physics.Prepare`. Every course hole is written this way. Call it once,
where the hole is declared, and encode the hole after it.

## Pieces that change per stroke

```go
type Pulse struct {
	Every, On, Phase int
	Walls []physics.Wall
	Posts []physics.Post
	Zones []physics.Zone
}
```

A pulse is present on the strokes where `(stroke + Phase) % Every < On` (a
sign-safe mod), or always if `Every <= 0`: the same rule as a timed wall's
within a stroke. The clock is the stroke number in the **player's own round**
(0 = first shot), not something shared between players. So previewing stroke
N and recording it always meet the same course.

```go
// hole2: a mole in the gap, down on the first stroke, up on the second, and so on
Pulses: []course.Pulse{{
	Every: 2, On: 1, Phase: 1,
	Posts: []physics.Post{{Circle: physics.Circle{C: physics.V(26, 4.5), R: 0.9}, Bounce: 1.1, Skin: "mole"}},
}},
```

If you need something `Pulse` can't express, write a hole type of your own and
implement `Timed`:

```go
type Timed interface {
	Varies() bool
	Extras(stroke int) ([]physics.Wall, []physics.Post)
	PreviewAt(ball physics.Vec2, angle, power float64, stroke int) (physics.Shot, bool)
	PlayAt(ball physics.Vec2, angle, power float64, stroke int) (physics.Shot, bool)
}
```

`Varies` says whether anything actually changes (`Simple` returns
`len(Pulses) > 0`). `Extras` is what a renderer draws on top of `Field()` for
the stroke being aimed. Keep `Timed` (per stroke) separate from
`physics.Wall.Every` (per substep, inside one stroke): hole4's sails, for one,
are timed walls, not a pulse.

Field builders, each returning a new `*physics.Field` (or `f` itself when
there's nothing to add):

```go
func WithExtras(f *physics.Field, walls []physics.Wall, posts []physics.Post) *physics.Field // appended after f's
func WithZones(f *physics.Field, zones []physics.Zone) *physics.Field                       // put before f's
func WithWeather(f *physics.Field, weather []physics.Zone) *physics.Field
```

Each may return `f` itself (nothing to add): do not mutate what they return.

`physics.UnstickIn` treats `walls` as groups of four (`physics.Bar`). A ball
inside a bar leaves through the nearest side it can leave by without crossing
one of the hole's own walls, pushed straight out along that side's normal to
just clear of it. A ball closer than the radius to a bar or a post is pushed
off it, unless the push would cross one of those walls. See
[physics.md](physics.md#unstickin).

## Launch, Kick and Sink

```go
const Kick = 0.79
func Launch(angle, power float64) physics.Vec2 // FromPolar(angle, Kick·power^(3/4))

func Capture(cup, ball, off float64) float64
func Sink(shot physics.Shot, pin physics.Vec2, radius, ball float64) (physics.Shot, bool)
```

Every hole should use `Launch`, so the same pull means the same shot
everywhere. The speed is `Kick·p^(3/4)`: under a constant rolling
deceleration a ball rolls `v²/2a`, so the distance grows as `p^(3/2)`, the
way it grew before the physics rework. A full stroke (power 10) starts at 4.44
units per substep and rolls 44 on a green of Friction 0.87; a pull of 3 rolls
7.2, one of 1 rolls 1.4. `Kick` is the calibration that keeps every course
hole's par.

`Capture` is Holmes's capture criterion (B. W. Holmes, *Am. J. Phys.* 59,
1991). A ball of radius `r` crossing a cup of radius `R` off its centre by
`b` has its centre over a chord `2·sqrt(R² − b²)`. It falls freely from the
near rim, and it drops if it has fallen its own radius by the time its leading
edge meets the far rim, a chord less `r` later:

```
Capture(R, r, b) = (2·sqrt(R² − b²) − r) · sqrt(G / 2r)
```

That's 1.9 units per substep over the middle of a 1.2 cup for the course's 0.5
ball, and 0 from about 1.17 off the middle: a graze is not a hole. A ball
smaller than 0.5, a point ball included, drops as one of 0.5.

`Sink` decides whether the ball is holed. It is, if either:

- one step of the path passes within `radius` of the pin, off it by `off`,
  no longer than `Capture(radius, ball, off)`. Steps in the air, steps longer
  than the fastest drop (`Capture(radius, ball, 0)`), and a short step right
  after one longer than 1.5 times it (the rest of a tunnel exit or a bounce)
  don't count; or
- the ball comes to rest within `radius` of the pin.

When the ball is holed, the path is cut there and ends on the pin, and `Air`
and `Cause` are trimmed to match. Preview and Play both go through `Sink`.

## Weather

The weather is the `golf` realm's to choose. A hole only says how much wind
it can take (`Weatherable.MaxWind`, which is `Simple.Shelter`).

```go
const (
	Clear = ""
	Wind  = "wind"  // a Slope: a steady push, Vec per substep
	Rain  = "rain"  // a Surface, a touch quicker than dry grass
	Fog   = "fog"   // a Surface of scale 1
	Storm = "storm" // rain, wind in gusts, and lightning to look at
	Snow  = "snow"  // a Surface, a little slower
)

const (
	WindMin   = 0.08
	WindMax   = 0.15
	RainScale = 1.025
	WetIce    = 1.06
	SnowScale = 0.9
)

type Forecast struct {
	Period int64
	Kind   string
	Wind   physics.Vec2
	Zones  []physics.Zone
}

func ForecastFor(id, world string, h Hole, period int64) Forecast
func WeatherFor(kind string, h Hole, seed uint64) (physics.Vec2, []physics.Zone)
```

`ForecastFor` computes `seed` as the 64-bit FNV-1a hash of
`id + "#" + period` and picks the kind with `seed % 100` against the world's
climate (a world that isn't listed uses the garden's). Then
`WeatherFor(kind, h, seed)` builds the zones from a small LCG seeded with
`seed`. Nobody picks the weather, and anyone can recompute it. The climates
are unexported, so nothing can change them.

| world | clear | wind | rain | fog | storm | snow |
|---|---|---|---|---|---|---|
| garden | 55 | 20 | 15 | 10 | | |
| island | 50 | 25 | 15 | | 10 | |
| town | 50 | 15 | 20 | 15 | | |
| mountain | 40 | 20 | | 15 | | 25 |

What each kind puts on the board (whole-board zones cover `0..W, 0..H`):

- **wind**: one Slope skinned `wind`, with `Air` and `Capped` set. `Vec` has a
  strength between `WindMin` and `WindMax`, capped at `MaxWind()` when that's
  greater than 0, and a direction taken from the seed.
- **rain**: a Surface `rain` at `RainScale`. Also a copy of each of the hole's
  Surface zones skinned `ice`, at `WetIce` times its scale. Also 2 to 4
  `puddle`s: Round Surface zones at scale 0.6 with half-width 1.1 to 1.8
  (height 0.8 times that), placed only inside the lane's outline (even-odd
  over the untimed walls), off any skinned Surface zone and any Tunnel,
  Hazard or Loop zone, at least 0.3 clear of the untimed walls and the posts,
  at least 2 clear of the tee and the cup, and not overlapping each other. It
  makes up to 60 tries.
- **storm**: a Surface `storm` at 1, the rain as above, and two gusting Slope
  zones `wind` (air, capped), each 0.7 rad (about 40°) on either side of the
  forecast wind, with `Every: 6, On: 3` and `Phase` 0 and 3.
- **fog**: a Surface `fog` at 1.
- **snow**: a Surface `snow` at `SnowScale`.

`WithWeather` puts the sky's zones (skins `wind rain fog storm snow`)
**before** the hole's own zones, so they lie under them and the hole's sand
still counts as sand in the rain, because the last matching Surface wins. The
rest (puddles, wet ice) goes **after**, on top.

The period (five minutes of chain time), which period a round is played in,
and the id that seeds it are decided by `golf`. See
[golf.md](golf.md#period-int64-and-periodseconds).

## Holes as data: GG1

A course hole is stored as one compact binary string, GG1, and decoded into a
`*Simple` on every call. Nothing of the decoded hole is ever stored, so a hole
costs its data (1 to 3 KB for the course holes) and not its geometry.

```go
const Magic = "GG1"
func Encode(h *Simple) string
func Decode(s string) (*Simple, error)
func Exact(h *Simple) bool
func Diff(a, b *Simple) string
```

- **`Encode`** writes a `Simple` as it stands: call it on a hole after `Fit`,
  with its walls prepared. It stores each float's bits, so a decoded hole
  plays bit for bit like the one encoded, `-0` included.
- **`Decode`** reads it back, never calling `Fit` or any other builder. It
  prepares the walls from the stored lengths (`physics.PrepareWith`), which it
  trusts. Anything outside the format, its limits or its value bounds is an
  error, and nothing is returned with it.
- **`Exact`** reports whether a decoded hole's stored lengths are its walls'
  own: whether its prep is, bit for bit, the one `physics.Prepare` works out.
  Decode doesn't check this, so run `Exact` once on data from anyone before
  trusting it. `golf` does, at every publish.
- **`Diff`** is the first difference between two holes, field by field and
  float by float (by their bits), the walls' prep included, or `""`. The wear
  isn't compared. It's how a decoded hole is proved to be the hole it was
  encoded from, and a test fails to build when a field is added to any of the
  types without it.

`golf` also refuses data that isn't exactly what `Encode` writes for the hole
it decodes to, so one hole has one string.

### Layout

Little-endian. `str` is a `u8` length and its bytes.

```
"GG1"
header : W,H u16 · Strokes u8 · Substeps u16 · World str · Order f64 · Title str
         Tee f64×2 · Pin f64×2 · CupRadius f64 · Shelter f64
field  : Friction, Bounce, Radius f64            (Tick is always 0)
skins  : n u16, n × str
walls  : n u16 · style runs [count u16, Bounce f64, Mark i32, Skin u16, Every/On/Phase i32]
         then per wall: Ax Ay Bx By, then l, lp, lm (physics.Lengths)
posts  : n u16 · per post: Cx Cy R Bounce f64, Mark i32, Skin u16
zones  : n u16 · per zone: Kind u8, flags u8 (Round|Outside|Air|Capped), Min Max Vec f64×6,
         Scale f64, Mark i32, Skin u16, Every/On/Phase i32, npoly u16, poly f64×2n
pulses : n u8 · per pulse: Every/On/Phase i32, then walls (no lengths), posts, zones
```

Skins are an index into the skin table. Walls come in runs that share
everything but their segment. A pulse's walls carry no lengths: they're a
stroke's extras, and `Step` works theirs out itself.

### Frozen limits

The format is frozen with the package, and so are its limits. Pulses count
toward the totals.

```go
const (
	MaxWalls     = 160
	MaxPosts     = 32
	MaxZones     = 32
	MaxPoly      = 64  // points in one polygon
	MaxPolyTotal = 512 // points in all of them
	MaxPulses    = 16
	MaxSkins     = 64
	MaxSubsteps  = 60
	MaxTiming    = 4096
	MaxOrder     = 999
	MaxWorld     = 16
)
```

A hole at every limit at once is about 21 KB of data. The course holes are far
inside them.

### Value bounds

`Decode` refuses:

- a wrong magic, trailing bytes, truncated data, or any float that is NaN or
  infinite;
- a board side outside `1..96`, par above 19, substeps outside `1..60`;
- a world that isn't 1 to 16 letters `a-z` (so a data hole must name its
  world), an order outside `0..999`;
- a cup radius outside `(0, 2]`, a shelter outside `[0, 1]`, a friction
  outside `[0, 1)`, a ball radius outside `[0, 1]`;
- a bounce (the field's, a wall's or a post's) outside `[0, 1.5]`, a post
  radius outside `(0, 8]`, a zone scale outside `[0, 8]`;
- a Surface or Slope `Vec` longer than `G·MaxSin` (0.95: a hill no steeper than 72°);
- a tee, pin, wall end, post centre, polygon point, or a Tunnel, Hazard or
  Loop destination off the board by more than 1 (`[-1, W+1] × [-1, H+1]`);
- a zone's box corner off the board by more than 96 (`Fit` keeps a round or
  polygon zone's box whole, so it can run past the board);
- timing that isn't all zeros (untimed) or `Every` in `1..4096`, `On` in
  `0..Every` and `Phase` in `0..Every-1`, for walls, zones and pulses alike;
- an unknown zone kind or flag bit, a skin index outside the table, a wall run
  that doesn't fit the walls, a polygon of 1 or 2 points;
- anything past the frozen limits.

## `course/fingerprint`

`gno.land/p/gnogolf/course/fingerprint` pins a real hole's physics for its
tests. It's for tests only: nothing on chain calls it, and it isn't deployed.

```go
func Of(h *course.Simple) string
func Full(h *course.Simple) string
func Check(t T, h *course.Simple, want string)

type T interface { // *testing.T is one
	Logf(format string, args ...any)
	Errorf(format string, args ...any)
	Fatalf(format string, args ...any)
	Fatal(args ...any)
}
```

- **`Of`** is the hole's fingerprint: 24 angles × 3 powers × 2 (tick 0 on
  stroke 0, tick 5 on stroke 1) from the tee, in calm, rain and wind, plus the
  rain and wind zones themselves. Every path point, air flag, cause letter,
  bounce count and holed flag goes into a sha256, bit for bit, and it's kept to
  16 hex characters.
- **`Full`** covers what `Of` doesn't see: every piece's kind, flags, timing,
  mark and skin, the header (title, world, order, par, board, shelter,
  substeps), and on a pulse hole the shots of every stroke its pulses cycle
  through beyond `Of`'s first two. It pins no value of its own: `Check`
  compares it between a hole and the same hole encoded and decoded.
- **`Check`** fails the test when `Of(h)` isn't `want`, and prints the new
  one. It also proves the hole survives as data: `Decode(Encode(h))` must equal
  `h` field by field (`Diff`, the prep included), pass `Exact`, encode back to
  the same bytes, have the same `Of` and the same `Full`. Then it logs the data
  as `data <slot> <sha8> <hex>`, which is how `data/holes.txt` is built.

Each hole's own test calls `fingerprint.Check(t, me, "…")`, so a change to the
physics, the weather or a hole shows up as the list of holes it moves.
