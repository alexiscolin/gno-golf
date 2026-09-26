# `gno.land/p/gnogolf/physics`

A small 2D rolling-ball engine. It knows nothing about golf: you give it a
field, a position and a velocity, and it tells you where the ball went, step
by step. Scoring, turns, and what "holed" means belong to the caller (see
[course.md](course.md)), so the package works for any Gno game with a ball
rolling on a board.

Source: `vec2.gno`, `shapes.gno`, `field.gno`, `walls.gno`, `step.gno`.
Tests: `physics_test.gno`, `prepare_test.gno`.

## Conventions

- +X is right, +Y is **down**, and 1.0 is one board unit.
- Angles are in **radians** in this package. (The `golf` realm takes degrees
  and converts them.)
- Velocities are in board units **per substep**.
- float64 only. No map iteration, no clock, no randomness.

## The model

A rigid ball on the board's plane, stepped at a fixed timestep (the
*substep*), with a height only a renderer draws. The laws are the textbook
ones a rigid-body engine (Box2D, cannon.js) uses, in board units and
substeps: speeds are per substep, accelerations per substep².

| Law | Formula | Constants |
|---|---|---|
| Gravity | `G`; along a hill, its `Vec` = `G·sin θ` downhill | `G = 1` |
| Rolling resistance | a constant deceleration `a = Crr·G·cos θ` against the velocity; a ball it would stop, it stops | `Crr = Rolling(Friction, Scale)` |
| Rest on a hill | a ball at rest rolls away when `G·sin θ > Crr·G·cos θ` (`tan θ > Crr`), and does not move at all otherwise | |
| Contact (walls, posts) | normal impulse `jn = −(1+e)·vn`; tangential impulse `jt = min(µ·jn, TangentMass·|vt|)` | `µ = WallFriction = 0.05`, `TangentMass = 2/7` |
| Resting contact | under `RestSpeed` into the surface, `e = 0` and no bounce is counted | `RestSpeed = 0.35` |
| Restitution | `e = min(Bounce, MaxBounce)`; a *bumper* (`Bounce > 1`) kicks at `e = min(Bounce, MaxKick)` | `MaxBounce = 0.92`, `MaxKick = 1.5` |
| Take-off | over a hill's crest, when `(v·uphill)² > G·CrestRadius` | `CrestRadius = 0.5`, a kicker's sharp lip (0.71 per substep) |
| Flight | up at `vz = vu·tan θ`, in the air `2·vz/G`, so it lands `2·vu²·tan θ/G` on; no zone, no rolling resistance | |
| Landing | `jn = (1+e)·vz` with `e = GroundBounce`; the speed along loses `min(LandFriction·jn, TangentMass·|v|)`; a rebound over `HopSpeed` hops again | `GroundBounce = 0.4`, `LandFriction = 0.3`, `HopSpeed = 0.25` |
| Cup (in `course`) | Holmes: drops when crossing at `b` off the middle no faster than `(2·sqrt(R² − b²) − r)·sqrt(G/2r)` | see [course.md](course.md#launch-kick-and-sink) |

**Integration.** Each substep is a semi-implicit Euler step, walked in moves
of at most `MaxMove`:

1. rolling resistance takes half a kick, `a/2`, at the deceleration the ball
   met at the end of the last substep (velocity Verlet: the ball covers
   `v − a/2` in a substep that takes `a` off it, so a ball rolls exactly
   `v²/2a` when `v` is a whole number of `a`, and never more than `a/8` off);
2. each move: the zones under the ball push it (a hill by its `Vec/n`, the
   wind by its own), it moves, and a move that meets a wall or a post takes
   the contact impulse there and spends what is left of it from the contact
   (up to 4 contacts a move);
3. rolling resistance takes its second half-kick, at the mean deceleration of
   the substep's moves on the ground.

**Calibration.** `Friction` (the field's) and a Surface's `Scale` were the two
rules of a speed-dependent drag: a substep kept a share `keep` of the speed
and lost a fixed amount. `Rolling` maps them onto `Crr`, fitted by least
squares so that a full stroke stops where it did on every Friction and Scale
the course uses (within about 3%):

```
keep = min((Friction + 0.05) · Scale, 0.98)
Crr  = ((1 − keep) · RollSpeed + RollDrag / Scale) / G     RollSpeed = 1.8, RollDrag = 0.08
```

| Surface | Scale | Crr (Friction 0.87) |
|---|---|---|
| green | 1 | 0.224 |
| rain | 1.025 | 0.181 |
| ice | 1.18 | 0.104 |
| brick | 0.92 | 0.36 |
| snow | 0.9 | 0.40 |
| sand, snowdrift | 0.5 | 1.13 |

A Scale of 0 is an infinite Crr: the ball stops where it is. With that, and
`course.Launch`'s `Kick·p^(3/4)`, a full stroke rolls 44 on the usual green.
The wind stays a constant acceleration, which never beats the rolling
resistance of a ball at rest (0.08 to 0.15 against 0.100 on wet ice at the
least, and `Capped`, the weather's, never speeds a ball up).

**Grades.** A hill's `Vec` is its gravity along the plane, so `sin θ = |Vec|/G`:
0.3 is 17.5°, 0.12 is 7°. Grades past 72° are played as 72° (`tan θ` at most
3.05; no course hill passes 20°), and `course.Decode` refuses a push past
`G·MaxSin`. On the usual green a hill steeper than
0.219 (12.6°) does not let a ball rest on it; one gentler bends and slows a moving
ball, and holds a stopped one.

## Vectors and shapes

```go
type Vec2 struct{ X, Y float64 }

func V(x, y float64) Vec2
func (a Vec2) Add(b Vec2) Vec2
func (a Vec2) Sub(b Vec2) Vec2
func (a Vec2) Scale(s float64) Vec2
func (a Vec2) Dot(b Vec2) float64
func (a Vec2) Len() float64
func (a Vec2) LenCmp(r float64) int   // compares Len() with r: -1, 0 or 1
func FromPolar(angle, r float64) Vec2 // length r, pointing at angle (radians)
```

```go
type Segment struct{ A, B Vec2 }
func (s Segment) Normal() Vec2             // unit left-normal
func (s Segment) Crosses(p0, p1 Vec2) bool // does the motion p0->p1 cross it
func (s Segment) Closest(p Vec2) Vec2      // the point of the segment nearest p

type Circle struct { C Vec2; R float64 }
func (c Circle) Hit(p0, p1 Vec2) (float64, Vec2, bool)     // swept point vs circle
```

`Circle.Hit` doesn't report a hit when the motion starts inside the circle, so
a post can't trap a ball that somehow got in. `LenCmp` gives exactly what
comparing `Len()` would, but takes the square root only when the two are
within a hair of each other.

## The field

A `Field` is everything a ball rolls through: walls, posts and zones. There's
no Windmill or Tunnel type. Every mini-golf obstacle is built from these three
(the table at the top of `field.gno` shows how).

```go
type Field struct {
	Walls    []Wall
	Posts    []Post
	Zones    []Zone
	Friction float64 // the green's rolling resistance, as Rolling maps it (0.87 is Crr 0.224)
	Bounce   float64 // default restitution of walls and posts
	Radius   float64 // ball radius; 0 is a point
	Tick     int     // where the stroke starts on the clock of timed walls and zones
	// and, unexported, the walls' prep (see Wall prep)
}
```

With `Radius > 0` the ball's edge touches walls and posts. Its center stays
`Radius` away from them. Every course hole uses 0.5.

### Wall

```go
type Wall struct {
	Seg    Segment
	Bounce float64 // 0 = use Field.Bounce
	Mark   rune    // for a text renderer
	Skin   string  // for any other renderer
	Every, On, Phase int // timing, see below
}
```

### Post

```go
type Post struct {
	Circle
	Bounce float64 // 0 = Field.Bounce; up to 1 played at MaxBounce (0.92) at most; above 1 a bumper
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
	Air, Capped bool // a Slope that is moving air; capped air never speeds the ball up
}
func (z Zone) Contains(p Vec2) bool
```

The zone kinds:

| Kind | Effect while the ball is in it (on the ground) |
|---|---|
| `Surface` | Sets the move's surface to `Scale`, which sets the rolling resistance (`Rolling`): sand is below 1 (a high Crr), ice above 1 (a low one). If several Surface zones overlap, the last one in `Zones` wins. |
| `Slope` | A hill: gravity along it, `Vec` (`G·sin θ` downhill), added to the velocity every substep (spread over the moves of that substep). Uphill pushes back, downhill pulls. The ground under a ball is one hill: where two overlap, the first in `Zones` is the hill. With `Air`, moving air: a constant acceleration on top of the hill. |
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

(a sign-safe mod, so a negative phase works too). Walls and zones with
`Every <= 0` are always there.

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
	Path    []Vec2 // the start, one point per substep, plus tunnel/hazard/loop points
	Bounces int    // walls and posts hit
	Air     []bool // same length as Path: true where the ball is off the ground
	Cause   []byte // same length as Path: what most acted on the ball in that substep
}
func (s Shot) Rest() Vec2 // last point of Path, or the zero vector
```

`Step` rolls the ball until it stops or runs out of substeps. The path is the
whole point of it: a renderer replays those points and never simulates again
(see [CLIENT.md](../CLIENT.md)).

`Cause` is one letter per path point, the strongest of what acted on the ball
in the substep that ended there: `b` a bounce, `s` a hill, `w` wind or a gust
(a Slope with `Air`), `i` a slippery surface (scale above 1: ice, rain), `-`
nothing but friction.

Each substep does this:

0. A timed bar (four timed walls from `Timed(Bar(…))`) that comes back this
   substep, or stands on the first one, pushes a ball inside it (or closer
   than `Radius`) out through its nearest side, straight along that side's
   normal, as [`UnstickIn`](#unstickin) does for a stroke's pieces. A push that would carry
   the ball across an untimed wall takes the next nearest side instead, and
   if every side would, the ball stays where it is. A wall never stands on
   the ball, nor pushes it through another. A timed wall of a single segment
   is never crossed either: a ball within its radius of it is stopped by it
   (the near test below).
1. A ball faster than `SpeedCap` is slowed to it. On the ground, rolling
   resistance takes its first half-kick; a ball it stops, where no hill can
   move it, is at rest and the step ends. The substep is then split into
   `int(|vel| / MaxMove) + 1` moves (at most 6), so a fast ball can't skip
   past a zone or a wall.
2. For each move, if the ball is on the ground, the surface is reset to grass
   and the zones that are there (by their timing) and contain the ball are
   applied in order. A hazard or a slanted loop entry ends the shot.
3. The move is swept against every wall that's there (using each wall's two
   offset lines at `Radius`, worked out once per hole: see
   [Wall prep](#wall-prep)) and every post (radius grown by `Radius`), and the
   nearest hit wins. A wall or post whose box the move's box misses is
   skipped first (the broad phase). A ball already within `Radius` of a wall
   and moving into it hits it right away. Both ends of every wall are round
   caps of radius `Radius`, swept like posts from wherever the ball comes:
   the offset lines are square caps with no end face, which left a gap in
   front of an acute corner's tip and let a diagonal move cut a free end.
4. On a hit, the contact impulse: the part of the velocity into the surface
   comes back times the restitution, the part along it loses the Coulomb
   friction (see [the model](#the-model)). Slower into it than `RestSpeed`,
   it is a resting contact. Speed is capped at `SpeedCap` again, and the move
   goes on from the contact with what is left of it.
5. A point is appended to the path.
6. On the ground, rolling resistance takes its second half-kick. A ball it
   stops, on a hill steeper than its rolling resistance, is set at rest and
   the step goes on (the hill pulls it next substep); anywhere else, it has
   stopped. None of this applies in the air.

At the end, the last `Air` flag is set to false, and the zones are applied
once more to the ball at rest, so a ball that stopped in water or in a tunnel
mouth gets resolved now and not on the next stroke. A ball at rest in a
timed Hazard or Tunnel (falling ice, a blowhole) meets it whatever the tick:
it would be there when it next comes on.

### Air and jumps

A ball takes off only when it goes over a hill's crest, the edge its `Vec`
points away from (the uphill end), faster than the crest's curve can hold it:

- it was climbing the hill (moving against its `Vec`) and a move, without
  hitting anything, carries it out through that edge, onto no other climb;
- its speed up the hill `vu = vel · uphill` has `vu² > G·CrestRadius`: the
  ground curves away (radius `CrestRadius`) faster than gravity can bend the
  ball round it, 0.71 per substep: a ball that makes the top at any real pace
  flies;
- the hill is steeper than `MinRamp` (0.12, 7°): a gentler one is a lawn's
  undulation;
- it climbed at least `JumpRun` (half) of the hill's depth, counted from
  where it came onto it: a ball that clipped the hill near its top has not
  ridden it.

Leaving a hill by a side, by its foot, or by turning on it is no take-off. It
flies a ballistic arc: up at `vz = vu·tan θ`, for `2·vz/G` substeps, landing at
the height it took off from, `2·vu²·tan θ/G` on along the hill (its speed
across the hill carries on too). Landing is a contact with the ground: the
rebound is `GroundBounce` of `vz`, the speed along loses the Coulomb friction
`LandFriction·(1+GroundBounce)·vz` (at most 2/7 of it), and a rebound above
`HopSpeed` hops again once the ground it came down on has had its say (water
there still catches it). In the air:

- no zone applies: it goes over water, sand and tunnel mouths;
- walls and posts still stop it;
- there's no rolling resistance;
- it can't drop into a cup (`course.Sink` checks `Air`).

A ball still in the air when the stroke's substeps run out flies on and
lands, within `MaxRollOn`.

### Slopes: rolling back and rolling on

A ball stops on a hill only where the hill can't move it: `G·sin θ` at most
`Crr·G·cos θ`, i.e. `|Vec|` at most the rolling resistance there (0.2186 on
the usual green, so its 0.22 hills just roll a ball back). A ball rolling up a hill slows down on every
substep it climbs: gravity and rolling resistance both take from it. On a
hill steeper than its rolling resistance:

- **Roll-back.** When the ball stops on it, its velocity is set to zero and
  the step goes on, so the slope pulls it back down on the next substep.
- **Roll-on.** When the stroke's substeps run out while the ball is on the
  ground on such a slope, `Step` adds substeps (up to `MaxRollOn` in total)
  until the ball leaves the slope. Only untimed slopes roll a ball on. A ball
  the slope only pins against a wall would jitter in place: while rolling on,
  every 8 substeps, a ball that moved less than 0.1 stops.

A ball pressed into a rail by a hill slides along it: a resting contact,
with no bounce and the rail's Coulomb friction.

A timed Slope (hole20's seesaw) is a hill in the substeps it is there.

A Slope with `Air` set is moving air, not ground: the weather's wind, a
cannon's gust. It pushes the ball with a constant acceleration, but it's
never a hill to take off from, roll back down, or roll on along, and it
doesn't hide a real slope underneath it. `Air` with `Capped` (the weather's
wind) never speeds the ball up: it bends and brakes it only.

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

## UnstickIn

```go
func UnstickIn(ball Vec2, walls []Wall, posts []Post, r float64, stays []Wall) Vec2
```

`UnstickIn` moves a ball out of pieces that appeared on top of it: a gate
shutting, a mole popping up where the ball rests (`course.Simple` calls it
before each stroke, with that stroke's pulse pieces and the hole's own walls
as `stays`). `walls` are read in groups of four, as `Bar` makes them.

- A ball **inside** a bar leaves through the nearest side: it's put on the
  outward normal of that side, from the side's nearest point, `r + 0.02` out.
- A ball merely **closer than `r`** to a bar is pushed off it, along the line
  from the nearest point of the bar, to `r + 0.02`.
- A ball closer than `r` to a post is pushed off it radially, the same way.

No push carries the ball across an untimed wall of `stays`. Out of a bar, the
ball takes the next nearest side instead, and if every side would cross one,
it stays where it is. Off a bar or a post, a push that would cross one is not
made: a ball left inside a post rolls out of it on the shot (a post never
traps a ball). `Step` does the same for timed bars during a stroke (step 0
above), with the field's walls as `stays`.

## Wall prep

A wall is swept as its two offset lines at the ball's radius (one on each
side, lengthened by the radius at each end). Working them out takes three
square roots per wall, which in the GnoVM is expensive, so it's done once per
hole and kept in the field.

```go
func Prepare(f *Field)                        // works out every wall's offsets
func Lengths(s Segment, r float64) (l, lp, lm float64) // the three square roots Prepare takes
func PrepareWith(f *Field, lens []float64)    // Prepare with each wall's Lengths given
func Prepared(f *Field) []float64             // a copy of the prep, for tests
```

- `Prepare` is called by `course.Fit`, once the walls are where they stay.
  Walls that change afterwards (a stroke's extras) are only a cost: `Step`
  checks each entry against its wall and works out any that no longer match.
- `PrepareWith` takes three lengths per wall, in wall order, and gives the same
  prep, bit for bit, when they're the walls' own, without any square root.
  It doesn't check them: whoever stored them must have, once, by comparing
  `Prepared(f)` against `Prepare`'s. With the wrong count it is `Prepare`.
  `course.Decode` uses it, and `course.Exact` is that check.

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
`Bar` returns nil for a zero-length bar.

Use `Bar` for anything free-standing the ball can hit head-on. A ball moving
exactly along a zero-width segment never crosses it. An outer wall is fine as
a bare segment because the ball is always on one side of it. `Unstick` (and
Step's timed bars) also assume that pieces which appear on top of a ball come
in groups of four walls, which is what `Bar` produces.

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
| `G` | 1 | gravity, board units per substep² |
| `RollSpeed`, `RollDrag` | 1.8, 0.08 | the calibration of `Rolling` (Friction, Scale → Crr) |
| `WallFriction` | 0.05 | Coulomb µ of a wall or post |
| `TangentMass` | 2/7 | the most of its speed along a surface a solid ball loses to friction |
| `RestSpeed` | 0.35 | under it into a surface, a contact is resting: no bounce |
| `MaxBounce` | 0.92 | the most restitution a passive piece plays |
| `MaxKick` | 1.5 | the most restitution a bumper (`Bounce > 1`) plays |
| `CrestRadius` | 0.5 | a crest's lip radius: take-off at `vu² > G·CrestRadius` |
| `MinRamp` | 0.12 | the gentlest hill that launches |
| `JumpRun` | 0.5 | share of a hill's depth climbed before its crest can launch |
| `GroundBounce` | 0.4 | the ground's restitution on landing |
| `LandFriction` | 0.3 | the ground's Coulomb µ on landing |
| `HopSpeed` | 0.25 | a landing rebound under it is a roll, not a hop |
| `MaxMove` | 1.5 | longest single move inside a substep |
| `SpeedCap` | 8 | top speed, per substep |
| `MaxRollOn` | 120 | most extra substeps a slope or a flight can add |
| `MaxWork` | 1e6 | the most work units (about a thousand gas each) one stroke may cost |
| `MaxSin` | 0.95 | the steepest grade a hill plays, and the most `|Vec|/G` Decode takes |
| `LoopKeep` | 0.8 | share of the speed kept going round a loop |

## Skins

`Skin` and `Mark` have no effect on the simulation: what a zone does is in
its fields (`Kind`, `Air`, `Capped`). A renderer has to be able to draw any
field from the geometry alone and treat an unknown skin as the plain shape.
Keep skins to short lower-case ids: they're lookup keys, and a client's table
is the catalogue. Five are reserved for the weather: `wind`, `rain`, `fog`,
`storm` and `snow`.

## Determinism and gas

- **Determinism.** The same inputs give the same `Shot` on every validator:
  float64 only, no map iteration, no clock, no randomness. That's why a
  client should replay `Shot.Path` rather than port the engine to another
  language, which would have to match GnoVM float64 behavior exactly.
- **Cost of a shot.** `Step` is `O(moves × (walls + posts + zones))`, with
  `int(speed / MaxMove) + 1` moves per substep, and a broad phase that skips
  the walls and posts a move's box misses. The player pays it on every
  stroke, so the number of obstacles and the `n` you pass to `Arc`, `Lane`
  and `Stadium` are gas budgets. The heaviest full-power tee shot on the
  course measured 45M gas.
- **MaxWork.** `Step` counts what a stroke does as it goes, in `Shot.Work`,
  units of about a thousand gas: a substep 700, a move 15, a wall or post a
  move's broad phase looks at 6, a wall tested for a contact 200 and a post
  300, a zone a move looks at 8 (twice: the zones, then the ground's checks)
  and each polygon point 3, a zone that takes a square root (a loop's mouth,
  capped wind) 200 more, and a wall a timed bar's push checks 20 a side.
  Fitted on the GnoVM's gas and raised by about a third. A stroke that
  reaches `MaxWork` (1e6) ends where the ball is; it is checked before each
  timed bar's push, each move and each contact, so a stroke passes it by
  `MaxWorkStep` (1e5) at most. That holds a hostile field (bumper walls
  across the whole board, the steepest hill keeping the ball rolling on,
  polygons under every move) to under 1e9 gas. The heaviest course stroke
  found, a full shot in a storm's gusts on mountain/11's ice that rolls on
  for 120 substeps, costs 0.57 of `MaxWork` (0.4e9 gas); a tee shot, 0.05.
- **Steepest grade.** A hill's push is `G·sin θ`: `course.Decode` refuses a
  Slope whose `|Vec|` passes `G·MaxSin` (0.95, 72°). The course's steepest is
  0.35.
- **Zone width.** No zone can be crossed without being seen as long as it's
  at least `MaxMove` wide in the direction of travel. Several deployed zones
  are under twice that (town14's door tunnel, hole4's tunnels, island9's and
  island10's gaps): safe, but near the edge.
- **Square roots.** `math.Sqrt` is software in the GnoVM (~160K gas a call).
  `Vec2.LenCmp` compares a length without one unless it has to,
  `Segment.Crosses` tests a crossing without working out a normal, and the
  wall prep is worked out once per hole (`Prepare`, or `PrepareWith` from
  stored lengths).
