package physics

// A field is what a ball rolls through: barriers it bounces off and zones that
// change how it moves. Everything a mini-golf hole is made of decomposes into
// these three, which is why there is no Windmill type and no Tunnel type:
//
//	gate / archway       two Walls with a gap between them
//	narrowing, dogleg    Walls
//	bumper, post, rock   a Post (a Bounce above 1, with a bumper's skin, kicks)
//	tunnel, teleporter   a Tunnel zone
//	ramp, slope, hill    a Slope zone (uphill pushes back, downhill pulls on)
//	sand, ice, carpet    a Surface zone
//	water, pit, the void a Hazard zone
//	loop-the-loop        a Loop zone: round it only when fast enough
//	upper floor          a Tunnel to another part of the board, drawn apart
//	moving obstacle      a course.Timed hole adds pieces per stroke of the round
//	                     (course.Pulse for the simple cases) — nothing here has
//	                     to know about time
//
// Skin carries no meaning for the simulation (what a zone does is in its
// fields — Kind, Air, Capped — never in its name): it is the name a renderer looks
// up to draw a skull, a windmill or a duckling where the geometry says "post".
// Mark is the same thing for a text renderer.
//
// Skin is a hint; the geometry is the contract. A renderer must be able to draw
// any hole from the shapes alone, and treat an unknown skin as the plain form —
// a Wall it does not recognise is a wall, a Post is a post, a Zone is a tinted
// area. That way a course author can ship "giant skull" today and an artist can
// add the mesh next month without either of them breaking anything.
//
// Keep skins to short lower-case ids, not sentences: they are lookup keys,
// and the client's table is the catalogue. Five are reserved for the weather,
// which course lays over the whole board: wind, rain, fog, storm and snow.

// Wall is a straight barrier. Bounce overrides the field's restitution (0
// keeps it); Mark and Skin are for whoever draws it, except that only a
// bumper's skin kicks (Kicks).
type Wall struct {
	Seg    Segment
	Bounce float64 // 0 = use the field default
	Mark   rune
	Skin   string
	// Every, when set, makes the wall come and go within a stroke: it stands
	// in substep i only when (i+Phase) mod Every is below On. A mill's sail
	// sweeping past a door is a wall that is there for a few substeps in
	// every turn of the wheel — time the stroke to slip through between two.
	Every, On, Phase int
}

// there is the timing rule walls and zones share: in substep i, present when
// (i+phase) mod every is below on — a sign-safe mod, so a negative phase
// works too. every <= 0 is untimed: always there.
func there(i, every, on, phase int) bool {
	return every <= 0 || ((i+phase)%every+every)%every < on
}

// WithTick is the field with its clock moved on by tick substeps: the tram,
// the sails, the clock hand and the gusts where they were when the player let
// go. Untimed fields play the same at any tick. It may return f itself (tick
// 0): do not mutate what it returns.
func WithTick(f *Field, tick int) *Field {
	if tick == 0 {
		return f
	}
	g := *f
	g.Tick = f.Tick + tick
	return &g
}

// Post is a round obstacle: a bumper, a rock, a stump. Its Bounce is the
// restitution of the contact, played at MaxBounce at most: a lively post
// gives back most of the ball's speed, a dead one soaks it up. Above 1, with
// a bumper's skin (Kicks), it is a bumper, an active one that kicks the ball
// back faster than it came (at most MaxKick times).
type Post struct {
	Circle
	Bounce float64 // 0 = use the field default; played at MaxBounce at most; above 1 a bumper, if Kicks(Skin)
	Mark   rune
	Skin   string
}

// ZoneKind is what a zone does to a ball inside it.
type ZoneKind int

// The zone kinds, each named in its own line.
const (
	Surface ZoneKind = iota // Scale sets the rolling resistance (Rolling): sand holds, ice frees
	Slope                   // a hill: Vec, gravity along it, is added to velocity each substep
	Tunnel                  // the ball is moved to Vec, keeping its velocity
	Hazard                  // the ball goes back where the stroke was played from: water, a pit, the void
	// Loop is the mouth of a closed tube (a loop-the-loop, a spiral): Min..Max
	// is where its track leaves the lane, Vec where it comes back down, Scale
	// the speed (per substep) a ball needs to make it round. A ball rolling
	// into the mouth towards Vec (within 25°) at Scale or faster goes round
	// and leaves at Vec along the track, LoopKeep of its speed left. Slower,
	// it climbs, falls back and rolls out of the mouth the way it came. One
	// that comes in more than 25° off straight falls off the side of the
	// track and is put down at rest in front of the mouth. The mouth must be
	// at least MaxMove deep, or a fast ball steps over it.
	Loop
)

// LoopKeep is how much speed a ball keeps once round a loop.
const LoopKeep = 0.8

// Zone is an area of the board that changes how the ball moves: the rectangle
// Min..Max, or the ellipse inside it (Round), or a polygon (Poly), or all of it
// but a polygon (Outside). Vec and Scale mean what the kind says.
type Zone struct {
	Kind     ZoneKind
	Min, Max Vec2
	Vec      Vec2    // Slope: acceleration (G·sin θ downhill). Tunnel: destination. Loop: where its track comes down. Hazard: unused (a hazard sends the ball back to the stroke's start).
	Scale    float64 // Surface: its rolling resistance (Rolling). Loop: the speed to go round.
	Mark     rune
	Skin     string
	// Round makes the zone the ellipse inscribed in Min..Max rather than the
	// whole rectangle: a pond or a bunker with no corners. A renderer draws
	// exactly that ellipse, so what looks wet is wet.
	Round bool
	// Poly, when set, makes the zone that polygon (within Min..Max); Outside
	// turns it inside out — everything in Min..Max but the polygon. A lane
	// with no rails is a Hazard that is Outside the lane's own outline: the
	// sea all round a sand spit, with no gap a ball could stop in.
	Poly    []Vec2
	Outside bool
	// Every, On, Phase time a zone within the stroke, as for a Wall: a gust
	// of wind that blows for a few substeps, then another from elsewhere.
	Every, On, Phase int
	// Air makes a Slope moving air (the weather's wind, a cannon's gust)
	// rather than a hill: it pushes the ball, but is no hill to take off
	// from or roll back down, and it hides none under it. Capped air never
	// speeds the ball up — it bends and brakes it only: the weather's wind,
	// which on ice would beat the rolling resistance and keep a ball drifting.
	Air, Capped bool
}

// Contains says whether p is in the zone, by its shape.
func (z Zone) Contains(p Vec2) bool { return z.contains(p) }

// contains is Contains through a pointer: Step tests zones on every move, and
// a Zone is too big a value to copy that often.
func (z *Zone) contains(p Vec2) bool {
	if p.X < z.Min.X || p.X >= z.Max.X || p.Y < z.Min.Y || p.Y >= z.Max.Y {
		return false
	}
	if len(z.Poly) >= 3 {
		return inPoly(z.Poly, p) != z.Outside
	}
	if !z.Round {
		return true
	}
	hx, hy := (z.Max.X-z.Min.X)/2, (z.Max.Y-z.Min.Y)/2
	dx, dy := (p.X-z.Min.X-hx)/hx, (p.Y-z.Min.Y-hy)/hy
	return dx*dx+dy*dy < 1
}

// Field is a complete course geometry. A hole exposes its own so that any
// renderer (the text board, the 3D client) can draw it without the hole realm
// knowing anything about drawing.
type Field struct {
	Walls    []Wall
	Posts    []Post
	Zones    []Zone
	Friction float64 // the green's rolling resistance, as Rolling maps it: 0.87 is Crr 0.224
	Bounce   float64 // default restitution of barriers
	// Radius of the ball (0 plays it as a point). A renderer that draws a
	// ball of some size needs the physics to know that size, or the ball is
	// drawn half inside every wall it touches.
	Radius float64
	// Tick is where the stroke starts on the clock of the timed walls and
	// zones: the substep they were at when the player let go. The page shows
	// a tram or a mill turning all the time, and the moment of release is a
	// decision like the angle and the power — so the chain replays it.
	Tick int
	// Cap, above 0 and under MaxWork, is what a stroke may cost in its
	// place (golf gives a commit's shot what is left of its budget). A
	// stroke that reaches it ends as one that reaches MaxWork does.
	Cap int
	// prep is the walls' offsets, worked out once (Prepare).
	prep []float64
}

// String is the kind's name as clients read it in State: "surface", "slope",
// "tunnel", "hazard", "loop".
func (k ZoneKind) String() string {
	switch k {
	case Surface:
		return "surface"
	case Slope:
		return "slope"
	case Tunnel:
		return "tunnel"
	case Hazard:
		return "hazard"
	case Loop:
		return "loop"
	}
	return "unknown"
}

// inPoly is the even-odd test: is p inside the closed polygon through pts?
func inPoly(pts []Vec2, p Vec2) bool {
	in := false
	for i := range pts {
		a, b := pts[i], pts[(i+1)%len(pts)]
		if (a.Y > p.Y) != (b.Y > p.Y) && p.X < a.X+(p.Y-a.Y)*(b.X-a.X)/(b.Y-a.Y) {
			in = !in
		}
	}
	return in
}
