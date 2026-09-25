# `gno.land/p/gnogolf/physics`

A small 2D rolling-ball engine. It knows nothing about golf: you give it a
field, a position and a velocity, and it tells you where the ball went, step
by step. Scoring, turns, and what "holed" means belong to the caller (see
[course.md](course.md)), so the package works for any Gno game with a ball
rolling on a board.

Source: `vec2.gno`, `shapes.gno`, `field.gno`, `step.gno`. Tests:
`physics_test.gno`.

## Conventions

- +X is right, +Y is **down**, and 1.0 is one board unit.
- Angles are in **radians** in this package. (The `golf` realm takes degrees
  and converts them.)
- Velocities are in board units **per substep**.
- float64 only. No map iteration, no clock, no randomness.

## Vectors and shapes

```go
type Vec2 struct{ X, Y float64 }

func V(x, y float64) Vec2
func (a Vec2) Add(b Vec2) Vec2
func (a Vec2) Sub(b Vec2) Vec2
func (a Vec2) Scale(s float64) Vec2
func (a Vec2) Dot(b Vec2) float64
func (a Vec2) Len() float64
func FromPolar(angle, r float64) Vec2 // length r, pointing at angle (radians)
func Reflect(v, n Vec2) Vec2           // mirror v across the unit normal n
```

```go
type Segment struct{ A, B Vec2 }
func (s Segment) Normal() Vec2                              // unit left-normal
func (s Segment) Hit(p0, p1 Vec2) (float64, Vec2, bool)    // travel fraction, normal facing the motion
func (s Segment) Toward(p Vec2, r float64) Segment         // pushed r toward p, lengthened r at each end

type Circle struct { C Vec2; R float64 }
func (c Circle) Hit(p0, p1 Vec2) (float64, Vec2, bool)     // swept point vs circle
```

`Circle.Hit` doesn't report a hit when the motion starts inside the circle, so
a post can't trap a ball that somehow got in.

## The field

A `Field` is everything a ball rolls through: walls, posts and zones. There's
no Windmill or Tunnel type. Every mini-golf obstacle is built from these three
(the table in the `Field` doc comment in `field.gno` shows how).

```go
type Field struct {
	Walls    []Wall
	Posts    []Post
	Zones    []Zone
	Friction float64 // per substep; 0.8 rolls to a stop in about a dozen
	Bounce   float64 // default restitution of walls and posts
	Radius   float64 // ball radius; 0 is a point
	Tick     int     // where the stroke starts on the clock of timed walls and zones
}
```

With `Radius > 0` the ball's edge touches walls and posts. Its center stays
`Radius` away from them. All the deployed holes use 0.5.

### Wall

```go
type Wall struct {
	Seg    Segment
	Bounce float64 // 0 = use Field.Bounce
	Mark   rune    // for a text renderer
	Skin   string  // for any other renderer
	Every, On, Phase int // timing, see below
}
func (w Wall) There(i int) bool
```

### Post

```go
type Post struct {
	Circle
	Bounce float64 // 0 = Field.Bounce; above 1 = a bumper that adds energy
	Mark   rune
	Skin   string
}
```

### Zone

```go
type Zone struct {
	Kind     ZoneKind
	Min, Max Vec2
	Vec      Vec2    // Slope: acceleration. Tunnel / Hazard: destination. Loop: where it comes down.
	Scale    float64 // Surface: friction multiplier. Loop: speed needed to go round.
	Mark     rune
	Skin     string
	Round    bool    // the ellipse inscribed in Min..Max
	Poly     []Vec2  // a polygon (within Min..Max)
	Outside  bool    // with Poly: everything in Min..Max except the polygon
	Every, On, Phase int
}
func (z Zone) Contains(p Vec2) bool
func (z Zone) There(i int) bool
```

The zone kinds:

| Kind | Effect while the ball is in it (on the ground) |
|---|---|
| `Surface` | Sets the substep's surface to `Scale`, which multiplies friction: sand is below 1, ice is above 1. If several Surface zones overlap, the last one in `Zones` wins. |
| `Slope` | Adds `Vec` to the velocity every substep (spread over the moves of that substep). Uphill pushes back, downhill pulls. |
| `Tunnel` | Moves the ball to `Vec` and keeps its velocity. The path gets a point at `Vec`, so two consecutive path points far apart mean a tunnel. |
| `Hazard` | Ends the shot at `Vec` (water, a pit), with a last path point there. |
| `Loop` | A loop-the-loop mouth. See [Loops](#loops). |

`ZoneKind.String()` returns `"surface"`, `"slope"`, `"tunnel"`, `"hazard"`,
`"loop"` (or `"unknown"`), which are the names the golf realm puts in its JSON.

**Shape.** `Contains` first checks the box `[Min, Max)`, which is half-open.
Inside it:

- with `len(Poly) >= 3`, even-odd point-in-polygon, inverted if `Outside` is
  set;
- otherwise with `Round`, the inscribed ellipse;
- otherwise the whole rectangle.

`Outside` is how you build a lane with no rails: a `Hazard` covering the board
but outside the lane's own outline, so there's sea all around a sand spit with
no gap for the ball to stop in. From `island6`:

```go
{Kind: physics.Hazard, Min: physics.V(0, 0), Max: physics.V(50, 18), Vec: physics.V(5, 6),
	Poly: lane, Outside: true, Skin: "sea"},
```

### Timed walls and zones

A wall or zone with `Every > 0` comes and goes during a stroke. It's there in
substep `i` when

```
(i + Field.Tick + Phase) % Every < On
```

(`There(i)` checks `(i+Phase)%Every < On`, and `Step` calls it with
`i + f.Tick`.) Walls and zones with `Every <= 0` are always there.

`Field.Tick` is where the clock stands when the stroke starts, i.e. where the
moving pieces were when the player let go. `WithTick` returns a copy with the
clock moved forward. It returns the same pointer when `tick == 0`:

```go
func WithTick(f *Field, tick int) *Field
func Timed(ws []Wall, every, on, phase int) []Wall // sets the timing on every wall in ws
```

Two planks across a rope bridge, out of step with each other (`island11`):

```go
physics.Timed(physics.Bar(physics.V(18, 5.4), physics.V(18, 8.8), 0.5, '=', "plank"), 8, 4, 0),
physics.Timed(physics.Bar(physics.V(32, 5.4), physics.V(32, 8.8), 0.5, '=', "plank"), 8, 4, 4),
```

This is timing *within* one stroke. For pieces that change from one stroke to
the next, see `course.Pulse` and `course.Timed`.

## Step and Shot

```go
func (f *Field) Step(pos, vel Vec2, substeps int) Shot

type Shot struct {
	Path    []Vec2 // one point per substep, plus tunnel/hazard/loop points
	Bounces int    // walls and posts hit
	Air     []bool // same length as Path: true where the ball is off the ground
}
func (s Shot) Rest() Vec2 // last point of Path, or the zero vector
```

`Step` rolls the ball until it stops or runs out of substeps. The path is the
whole point of it: a renderer replays those points and never simulates again
(see [CLIENT.md](../CLIENT.md)).

Each substep does this:

0. A timed bar (four timed walls from `Timed(Bar(…))`) that comes back this
   substep, or stands on the first one, pushes a ball inside it (or closer
   than `Radius`) out through its nearest side, as `Unstick` does for a
   stroke's pieces. A wall never stands on the ball.
1. The substep is split into `int(|vel| / MaxMove) + 1` moves, so a fast ball
   can't skip past a zone or a wall.
2. For each move, if the ball is on the ground, the surface is reset to grass
   and the zones that are there (`There`) and contain the ball are applied in
   order. A hazard or a slanted loop entry ends the shot.
3. The move is swept against every wall that's there (using each wall's two
   offset lines at `Radius`, worked out once per hole by `Prepare`, which
   `course.Fit` calls) and every post (radius grown by `Radius`), and the
   nearest hit wins. A wall or post whose box the move's box misses is
   skipped first (the broad phase). A ball already within `Radius` of a wall
   and moving into it hits it right away. A free wall end is a round cap of
   radius `Radius`, swept like a post.
4. On a hit, the part of the velocity along the surface keeps `Along` (0.97)
   of itself. The part into the surface bounces back times the restitution,
   which is played at `MaxBounce` (0.92) at most: nothing adds energy. Speed
   is capped at `SpeedCap`.
5. A point is appended to the path.
6. Rolling resistance on the ground: `keep = min((Friction + 0.05) * surface,
   0.98)`, then `speed = |vel| * keep - Drag / surface`. At `speed <= 0.02`
   the ball stops. None of this applies in the air.

At the end, the last `Air` flag is set to false, and the zones are applied
once more to the ball at rest, so a ball that stopped in water or in a tunnel
mouth gets resolved now and not on the next stroke. A ball at rest in a
timed Hazard or Tunnel (falling ice, a blowhole) meets it whatever the tick:
it would be there when it next comes on.

### Air and jumps

A ball takes off only when it goes over a hill's crest, the edge its `Vec`
points away from (the uphill end):

- it was climbing the hill (moving against its `Vec`) and a move, without
  hitting anything, carries it out through that edge, onto no other climb;
- its speed up the hill (`vel · uphill`) is above `JumpSpeed`;
- the hill is steeper than `Drag`;
- it climbed at least `JumpRun` (half) of the hill's depth, counted from
  where it came onto it: a ball that clipped the hill near its top has not
  ridden it.

Leaving a hill by a side, by its foot, or by turning on it is no take-off. It
flies `(uphill speed - JumpSpeed) * steepness * Lift` board units, where
steepness is `|Vec|` of the hill: head-on that is the whole speed, and a
slanted crossing flies shorter. In the air:

- no zone applies: it goes over water, sand and tunnel mouths;
- walls and posts still stop it;
- there's no rolling resistance;
- it can't drop into a cup (`course.Sink` checks `Air`).

### Slopes: rolling back and rolling on

A Slope whose `|Vec|` is greater than `Drag` doesn't let a ball rest on it
(a slope at or under `Drag` bends a moving ball but never starts a stopped
one; just above it, up to about 0.152 on grass, a ball set down on it only
creeps `|Vec|` a substep, so a hole that wants a stopped ball to roll uses
0.16 or more):

- **Roll-back.** When the ball stops on it, its velocity is set to zero and
  the step goes on, so the slope pulls it back down on the next substep.
- **Roll-on.** When the stroke's substeps run out while the ball is on the
  ground on such a slope, `Step` adds substeps (up to `MaxRollOn` in total)
  until the ball leaves the slope. Only untimed slopes roll a ball on.

A timed Slope (hole20's seesaw) is a hill in the substeps it is there.

A Slope with `Air` set is moving air, not ground: the weather's wind, a
cannon's gust. It pushes the ball, but it's never a hill to take off from,
roll back down, or roll on along, and it doesn't hide a real slope underneath
it. `Air` with `Capped` (the weather's wind) never speeds the ball up: it
bends and brakes it only.

### Loops

A `Loop` zone is the mouth of a closed tube (a loop-the-loop, a spiral). `Vec` is where the track comes
back down and `Scale` is the speed (per substep) the ball needs to go round.
The axis is X or Y, whichever the direction from the mouth's center to `Vec`
is mostly along. When the ball is in the mouth and heading in (within 45° of
the axis), it's decided right away:

| Entry | Result |
|---|---|
| more than 25° off straight | falls off the side: put down, at rest, 1.5 in front of the mouth; the shot ends |
| at least `Scale` | goes round: placed at `Vec`, moving along the axis at `LoopKeep` of its speed |
| slower | falls back: placed just outside the edge it came in by, at `-0.5` of its velocity |

The mouth must be at least `MaxMove` deep along the axis, or a fast ball
steps over it. From `island7`, the only loop left:

```go
{Kind: physics.Loop, Min: physics.V(11.4, 12.2), Max: physics.V(13.4, 13.8),
	Vec: physics.V(21.6, 17), Scale: 2, Skin: "castle tube"},
```

## Helpers

Walls:

```go
func Box(min, max Vec2) []Wall                                  // four walls of a rectangle
func Bar(a, b Vec2, thickness float64, mark rune, skin string) []Wall // a thick bar: four walls
func Outline(points ...Vec2) []Wall                             // closed polygon
func Polyline(points ...Vec2) []Wall                            // open line
func Walls(groups ...[]Wall) []Wall                             // concatenate
func Timed(ws []Wall, every, on, phase int) []Wall              // set timing
func Soft(ws []Wall, bounce float64) []Wall                     // set Bounce (hay, logs)
func Skinned(ws []Wall, skin string) []Wall                     // set Skin (boardwalk, pier)
```

`Timed`, `Soft` and `Skinned` change the slice you pass in and return it.

Use `Bar` for anything free-standing the ball can hit head-on. A ball moving
exactly along a zero-width segment never crosses it. An outer wall is fine as
a bare segment because the ball is always on one side of it. `Unstick` (and
Step's timed bars) also assume that pieces which appear on top of a ball come in groups of four
walls, which is what `Bar` produces.

Points, for `Outline` or `Polyline`:

```go
func Arc(c Vec2, r, a0, a1 float64, n int) []Vec2     // n+1 points on a circle, a0..a1 radians
func Path(parts ...[]Vec2) []Vec2                      // concatenate point groups
func Pts(ps ...Vec2) []Vec2                            // a group of single points
func Stadium(min, max Vec2, n int) []Vec2              // lane with both ends rounded (wider than tall)
func Keyhole(x0, width float64, c Vec2, R float64, n int) []Vec2 // a lane into a round green around c
func Lane(width float64, n int, pts ...Vec2) []Vec2    // a smooth ribbon through pts, with round pads at the ends
```

`Lane` follows a Catmull-Rom curve through `pts`. It has a pad of radius
`0.8 * width` at each end and costs about `2n(k-1) + 16` walls for `k` points.
Bends tighter than half the width fold the inner side over itself.

Examples from the deployed holes:

```go
// hole1: a lane that bends and comes back, with a shelf across it
physics.Walls(
	physics.Outline(physics.Lane(6, 4, physics.V(5, 6), physics.V(20, 10), physics.V(34, 4), physics.V(44, 6))...),
	physics.Bar(physics.V(28.4, 10.2), physics.V(26.8, 6.5), 0.8, '=', "shelf"),
)

// hole2: a stadium lane with a gate in the middle
physics.Walls(
	physics.Outline(physics.Stadium(physics.V(0, 0), physics.V(44, 9), 6)...),
	physics.Bar(physics.V(26, 0), physics.V(26, 3), 0.8, '|', "gate"),
	physics.Bar(physics.V(26, 6), physics.V(26, 9), 0.8, '|', "gate"),
)

// island9: a curved pier edge
physics.Skinned(physics.Polyline(physics.Arc(physics.V(50, 8), 3.4, -1.3, 1.3, 5)...), "pier")
```

A whole field, and one stroke:

```go
f := &physics.Field{
	Walls:    physics.Box(physics.V(0, 0), physics.V(32, 16)),
	Zones:    []physics.Zone{{Kind: physics.Surface, Min: physics.V(12, 0), Max: physics.V(16, 16), Scale: 0.55, Skin: "sand"}},
	Friction: 0.86,
	Bounce:   0.85,
	Radius:   0.5,
}
shot := f.Step(physics.V(4, 8), physics.FromPolar(0, 4), 24)
rest := shot.Rest() // shot.Path, shot.Air, shot.Bounces
```

## Constants

| Name | Value | Meaning |
|---|---|---|
| `MaxMove` | 1.5 | longest single move inside a substep |
| `Drag` | 0.12 | fixed speed lost per substep on grass (divided by the surface scale) |
| `Along` | 0.97 | share of the speed along a wall kept on a bounce |
| `MaxBounce` | 0.92 | the most restitution ever played |
| `SpeedCap` | 8 | top speed, per substep |
| `JumpSpeed` | 1.5 | speed needed to take off at the top of a slope |
| `Lift` | 12 | flight distance factor |
| `JumpRun` | 0.5 | share of a hill's depth climbed before its crest can launch |
| `MaxRollOn` | 120 | most extra substeps a slope can add |
| `LoopKeep` | 0.8 | share of the speed kept going round a loop |

## Skins

`Skin` and `Mark` have no effect on the simulation: what a zone does is in
its fields (`Kind`, `Air`, `Capped`). A renderer has to be able to draw any
field from the geometry alone and treat an unknown skin as the plain shape.
The skins used so far are listed in the `Field` doc comment in `field.gno`.

## Determinism and gas

- **Determinism.** The same inputs give the same `Shot` on every validator:
  float64 only, no map iteration, no clock, no randomness. That's why a
  client should replay `Shot.Path` rather than port the engine to another
  language, which would have to match GnoVM float64 behavior exactly.
- **Cost of a shot.** `Step` is `O(moves × (walls + posts + zones))`, with
  `ceil(speed / MaxMove)` moves per substep. The player pays it on every
  stroke, so the number of obstacles and the `n` you pass to `Arc`, `Lane`
  and `Stadium` are gas budgets. We measured about 7.3M gas fixed per
  shot plus about 860k gas per substep against 4 obstacles, on the early
  holes.
- **Cost of importing.** We measured about 275 gas per byte of
  imported source on every call of an importer, even for code it never calls.
  Keep that in mind before making the package bigger. (That's a measurement
  from an older version of the package, not re-checked for this doc.)
- **Zone width.** No zone can be crossed without being seen as long as it's
  at least `MaxMove` wide in the direction of travel. Several deployed zones
  are under twice that (town14's door tunnel, hole4's tunnels, island9's and
  island10's gaps): safe, but near the edge.
- **Square roots.** `math.Sqrt` is software in the GnoVM (~160K gas a call).
  `Vec2.LenCmp` compares a length without one unless it has to, and
  `Segment.Crosses` is `Hit` without its normal.
