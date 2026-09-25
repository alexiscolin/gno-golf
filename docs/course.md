# `gno.land/p/gnogolf/course`

The contract between a hole realm and the `golf` realm. The `Hole` interface
is the only thing the two have to agree on. The package also has
`course.Simple` (a ready-made hole that's only geometry), the stroke-to-stroke
timing, the cup rule, and the weather.

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

### Optional interfaces

`golf` checks for these with type assertions:

| Interface | Method(s) | If missing |
|---|---|---|
| `Sized` | `Board() (w, h int)` | 32×16. Values outside `1..MaxBoard` also fall back. |
| `Parred` | `Par() int` | par 3. Values outside `1..19` also fall back. |
| `Ordered` | `Position() float64` | the number at the end of the pkgpath (`hole7` → 7) |
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
`"mountain"`. The web client dresses the whole scene from it. Its order is
its place in that world, lowest first, so 1.5 goes between 1 and 2. `golf`
reads both once, in `Register`, and lists holes world by world in that order
(`garden`, `island`, `town`, `mountain`, then any other world, alphabetically),
then by order within each world. Two garden realms, `hole10` and `hole16`, use
the world `"extras"`, which the client doesn't count as a cup.

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
that realm's storage. Wear doesn't affect play right now.

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
2. `physics.Unstick` moves the ball out of any of those pieces that appeared on top
   of it.
3. The field is copied, never modified:
   `WithZones(WithExtras(Course, walls, posts), ExtraZones(stroke))`, then
   `WithWeather(..., weather)`, then `physics.WithTick(..., tick)`.
4. `Step(ball, Launch(angle, power), Substeps)`.
5. `Sink(shot, Pin, CupRadius)`.

`PlayWith` is `PreviewWith` followed by `MarkOn(shot.Rest(), W, H)`. The
shorter methods are thin wrappers: `Preview` = `PreviewAt(..., 0)`, and
`PreviewAt` = `PreviewWith(..., stroke, 0, nil)`. The same goes for `Play` and
`PlayAt`.

Declare the value in your hole realm (not in `/p/`) so the wear lives there.
There's a full example in the [README](../README.md#writing-a-hole).

## Pieces that change per stroke

```go
type Pulse struct {
	Every, On, Offset int
	Walls []physics.Wall
	Posts []physics.Post
	Zones []physics.Zone
}
```

A pulse is present on the strokes where `(stroke + Offset) % Every < On`, or
always if `Every <= 0`. The clock is the stroke number in the **player's own
round** (0 = first shot), not something shared between players. So previewing
stroke N and recording it always meet the same course.

```go
// hole2: a mole in the gap, down on the first stroke, up on the second, and so on
Pulses: []course.Pulse{{
	Every: 2, On: 1, Offset: 1,
	Posts: []physics.Post{{Circle: physics.Circle{C: physics.V(26, 4.5), R: 0.9}, Bounce: 1.1, Skin: "mole"}},
}},
```

If you need something `Pulse` can't express (hole4's sails move a notch per
stroke), implement `Timed` yourself:

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
`physics.Wall.Every` (per substep, inside one stroke).

Field builders, each returning a new `*physics.Field` (or `f` itself when
there's nothing to add):

```go
func WithExtras(f *physics.Field, walls []physics.Wall, posts []physics.Post) *physics.Field // appended after f's
func WithZones(f *physics.Field, zones []physics.Zone) *physics.Field                       // put before f's
func WithWeather(f *physics.Field, weather []physics.Zone) *physics.Field
```

`physics.Unstick` (it moved to physics, where Step also uses it for timed
bars) treats `walls` as groups of four (`physics.Bar`). A ball inside a
bar leaves straight out of the nearest side, and a ball closer than `r` to a bar or a
post is pushed off it.

## Launch, Kick and Sink

```go
const Kick = 0.6
func Launch(angle, power float64) physics.Vec2 // FromPolar(angle, power*Kick)

const CaptureSpeed = 1.3
func Sink(shot physics.Shot, pin physics.Vec2, radius float64) (physics.Shot, bool)
```

Every hole should use `Launch`, so the same pull means the same shot
everywhere. A full stroke (power 10) starts at 6 units per substep.

`Sink` decides whether the ball is holed. It is, if either:

- one step of the path passes within `radius` of the pin, slower than
  `CaptureSpeed * sqrt(1 - (off/radius)²)`, where `off` is how far the step
  passes from the pin (so near the rim it has to be slower). Steps in the air,
  steps longer than `CaptureSpeed`, and a short step right after one longer
  than `1.5 * CaptureSpeed` (the rest of a tunnel exit or a bounce) don't
  count; or
- the ball comes to rest within `radius` of the pin.

When the ball is holed, the path is cut there and ends on the pin, and `Air`
is trimmed to match. Preview and Play both go through `Sink`.

## Weather

The weather is the `golf` realm's to choose. A hole only says how much wind
it can take (`Weatherable.MaxWind`, which is `Simple.Shelter`).

```go
const (
	Clear = ""
	Wind  = "wind"  // a Slope: a steady push, Vec per substep
	Rain  = "rain"  // a Surface, quicker than dry grass
	Fog   = "fog"   // a Surface of scale 1
	Storm = "storm" // rain, and lightning to look at
	Snow  = "snow"  // a Surface, a little slower
)

const (
	WindMin   = 0.08
	WindMax   = 0.15
	RainScale = 1.12
	WetIce    = 1.06
	SnowScale = 0.9
)

type Chance struct { Percent int; Kind string }
var climates = map[string][]Chance{ /* per world, see below; unexported, read through ForecastFor */ }

type Forecast struct {
	Period int64
	Kind   string
	Wind   physics.Vec2
	Zones  []physics.Zone
}

func Hash(s string) uint64 // 64-bit FNV-1a
func ForecastFor(id, world string, h Hole, period int64) Forecast
func WeatherFor(kind string, h Hole, seed uint64) (physics.Vec2, []physics.Zone)
```

`ForecastFor` computes `seed = Hash(id + "#" + period)` and picks the kind
with `seed % 100` against the world's climate (a world that isn't listed uses
the garden's). Then `WeatherFor(kind, h, seed)` builds the zones from a small
LCG seeded with `seed`. Nobody picks the weather, and anyone can recompute it.

| world | clear | wind | rain | fog | storm | snow |
|---|---|---|---|---|---|---|
| garden | 55 | 20 | 15 | 10 | | |
| island | 50 | 25 | 15 | | 10 | |
| town | 50 | 15 | 20 | 15 | | |
| mountain | 40 | 20 | | 15 | | 25 |

What each kind puts on the board (whole-board zones cover `0..W, 0..H`):

- **wind**: one Slope skinned `wind`, with `Air` and `Capped` set. `Vec` has a strength between `WindMin`
  and `WindMax`, capped at `MaxWind()` when that's greater than 0, and a
  direction taken from the seed.
- **rain**: a Surface `rain` at `RainScale`. Also a copy of each of the hole's
  Surface zones skinned `ice`, at `WetIce` times its scale. Also 2 to 4
  `puddle`s: Round Surface zones at scale 0.6 with half-width 1.1 to 1.8
  (height 0.8 times that), placed only inside the lane's outline (even-odd
  over the untimed walls), off any skinned Surface zone and any Tunnel,
  Hazard or Loop zone, at least 0.3 clear of walls and posts, at
  least 2 clear of the tee and the cup, and not overlapping each other. It
  makes up to 60 tries.
- **storm**: a Surface `storm` at 1, the rain as above, and two gusting Slope
  zones `wind`, each 0.7 rad (about 40°) on either side of the forecast wind,
  with `Every: 6, On: 3` and `Phase` 0 and 3.
- **fog**: a Surface `fog` at 1.
- **snow**: a Surface `snow` at `SnowScale`.

`WithWeather` puts the sky's zones (skins `wind rain fog storm snow`)
**before** the hole's own zones, so they lie under them and the hole's sand
still counts as sand in the rain, because the last matching Surface wins. The
rest (puddles, wet ice) goes **after**, on top.

The period (five minutes of chain time) and which period a round is played in
are decided by `golf`. See [golf.md](golf.md#weather).
