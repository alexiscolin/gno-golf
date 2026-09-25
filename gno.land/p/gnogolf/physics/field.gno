package physics

import "math"

// A field is what a ball rolls through: barriers it bounces off and zones that
// change how it moves. Everything a mini-golf hole is made of decomposes into
// these three, which is why there is no Windmill type and no Tunnel type:
//
//	gate / archway       two Walls with a gap between them
//	narrowing, dogleg    Walls
//	bumper, post, rock   a Post (Bounce up to MaxBounce: nothing adds energy)
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
// keeps it); Mark and Skin are for whoever draws it.
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

// Timed gives walls a timing: see Wall.Every.
func Timed(ws []Wall, every, on, phase int) []Wall {
	for i := range ws {
		ws[i].Every, ws[i].On, ws[i].Phase = every, on, phase
	}
	return ws
}

// Post is a round obstacle: a bumper, a rock, a stump. Its Bounce is played
// at MaxBounce at most: a lively bumper gives back most of the ball's speed,
// a dead one soaks it up.
type Post struct {
	Circle
	Bounce float64 // 0 = use the field default; above MaxBounce plays as MaxBounce
	Mark   rune
	Skin   string
}

// ZoneKind is what a zone does to a ball inside it.
type ZoneKind int

// The zone kinds, each named in its own line.
const (
	Surface ZoneKind = iota // Scale multiplies friction: sand slows, ice frees
	Slope                   // Vec is added to velocity each substep
	Tunnel                  // the ball is moved to Vec, keeping its velocity
	Hazard                  // the ball stops at Vec: water, a pit, a hungry skull
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
	Vec      Vec2    // Slope: acceleration. Tunnel / Hazard: destination. Loop: where its track comes down.
	Scale    float64 // Surface: friction multiplier. Loop: the speed to go round.
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
	// which stronger than Drag kept a ball drifting for ever on the flat.
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
	Friction float64 // per substep, 0.8 rolls to a stop in about a dozen
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
	// prep is the walls' offsets, worked out once (Prepare).
	prep []float64
}

// Bar returns the four walls of a barrier of the given thickness from a to b.
//
// Free-standing obstacles need it. With Radius 0 the ball is a point, and a
// point travelling exactly along a zero-width segment never crosses it — it
// slides straight through a blade or a bar it is perfectly aligned with. An
// outer wall is safe as a bare Segment because the ball is always on one side
// of it; anything the ball can meet head-on is built with Bar.
func Bar(a, b Vec2, thickness float64, mark rune, skin string) []Wall {
	d := b.Sub(a)
	l := d.Len()
	if l == 0 {
		return nil
	}
	n := Vec2{-d.Y / l, d.X / l}.Scale(thickness / 2)
	e := d.Scale(thickness / 2 / l) // extend the caps so corners meet cleanly
	a, b = a.Sub(e), b.Add(e)

	corners := []Vec2{a.Add(n), b.Add(n), b.Sub(n), a.Sub(n)}
	out := make([]Wall, 4)
	for i := range corners {
		out[i] = Wall{
			Seg:  Segment{A: corners[i], B: corners[(i+1)%4]},
			Mark: mark,
			Skin: skin,
		}
	}
	return out
}

// Soft gives walls their own bounce: a hay bale or a pile of logs that takes
// the pace off a ball instead of sending it back.
func Soft(ws []Wall, bounce float64) []Wall {
	for i := range ws {
		ws[i].Bounce = bounce
	}
	return ws
}

// Skinned gives walls a look: a lane's edge built as a boardwalk's rail or a
// pier's side instead of the plain kerb.
func Skinned(ws []Wall, skin string) []Wall {
	for i := range ws {
		ws[i].Skin = skin
	}
	return ws
}

// Walls joins groups of walls; a hole is usually a box plus a few bars.
func Walls(groups ...[]Wall) []Wall {
	out := []Wall{}
	for _, g := range groups {
		out = append(out, g...)
	}
	return out
}

// Outline returns the walls of a closed polygon through the points, in order:
// the outer edge of a hole that is not a rectangle — an L, a funnel, a
// diagonal. Whatever it leaves out of the board is ground the ball never
// reaches, and a renderer draws it as such.
func Outline(points ...Vec2) []Wall {
	out := make([]Wall, 0, len(points))
	for i := range points {
		out = append(out, Wall{Seg: Segment{A: points[i], B: points[(i+1)%len(points)]}})
	}
	return out
}

// Arc returns n+1 points on a circle around c of radius r, from angle a0 to a1
// (radians), for an Outline: a curved bank is a polygon with enough sides.
// Each side is a wall, so n is a gas budget — 6 to 10 reads as a curve.
func Arc(c Vec2, r, a0, a1 float64, n int) []Vec2 {
	out := make([]Vec2, 0, n+1)
	for i := 0; i <= n; i++ {
		a := a0 + (a1-a0)*float64(i)/float64(n)
		out = append(out, c.Add(FromPolar(a, r)))
	}
	return out
}

// Polyline returns the walls of an open line through the points: a curved
// hedge, a ring of a maze with its gap left open.
func Polyline(points ...Vec2) []Wall {
	out := make([]Wall, 0, len(points))
	for i := 0; i+1 < len(points); i++ {
		out = append(out, Wall{Seg: Segment{A: points[i], B: points[i+1]}})
	}
	return out
}

// Path joins groups of points into one outline: a straight bit, an Arc, a
// straight bit… Pts makes a group of single points.
func Path(parts ...[]Vec2) []Vec2 {
	out := []Vec2{}
	for _, p := range parts {
		out = append(out, p...)
	}
	return out
}

// Pts makes a group of single points for Path.
func Pts(ps ...Vec2) []Vec2 { return ps }

// Stadium is the outline of a lane with both ends rounded, from min to max
// (wider than it is tall): the classic mini-golf lane. n is the number of
// walls per rounded end.
func Stadium(min, max Vec2, n int) []Vec2 {
	r := (max.Y - min.Y) / 2
	cy := min.Y + r
	return Path(
		Arc(Vec2{min.X + r, cy}, r, math.Pi/2, 3*math.Pi/2, n),
		Arc(Vec2{max.X - r, cy}, r, -math.Pi/2, math.Pi/2, n),
	)
}

// Keyhole is a lane of the given width, rounded at its start (x0), running
// into a round green of radius R around c: the lane's axis is c.Y. It is the
// shape of a cup on a platform — the ball has to come down the lane to it.
func Keyhole(x0, width float64, c Vec2, R float64, n int) []Vec2 {
	h := width / 2
	a := math.Asin(h / R)
	return Path(
		Arc(Vec2{x0 + h, c.Y}, h, math.Pi/2, 3*math.Pi/2, n),
		Arc(c, R, -(math.Pi-a), math.Pi-a, 2*n),
	)
}

// Lane is the outline of a park lane: a ribbon of the given width that flows
// through pts along a smooth curve (Catmull-Rom), with a round pad at each end
// — the tee's and the cup's — a little wider than the lane. n is the number of
// walls per stretch between two points on each side, so a lane through k
// points costs about 2n(k-1) + 16 walls: n is a gas budget, 3 to 5 reads as a
// curve. A bend tighter than half the width folds the inner side on itself:
// keep the points far enough apart for the turns they make.
func Lane(width float64, n int, pts ...Vec2) []Vec2 {
	h, R := width/2, width*0.8
	at := func(i int) Vec2 {
		if i < 0 {
			i = 0
		}
		if i >= len(pts) {
			i = len(pts) - 1
		}
		return pts[i]
	}
	// the centreline, sampled
	var mid []Vec2
	for i := 0; i+1 < len(pts); i++ {
		p0, p1, p2, p3 := at(i-1), at(i), at(i+1), at(i+2)
		for k := 0; k < n; k++ {
			t := float64(k) / float64(n)
			t2, t3 := t*t, t*t*t
			mid = append(mid, p0.Scale(-0.5*t3+t2-0.5*t).
				Add(p1.Scale(1.5*t3-2.5*t2+1)).
				Add(p2.Scale(-1.5*t3+2*t2+0.5*t)).
				Add(p3.Scale(0.5*t3-0.5*t2)))
		}
	}
	mid = append(mid, pts[len(pts)-1])
	dirAt := func(i int) Vec2 {
		j, k := i-1, i+1
		if j < 0 {
			j = 0
		}
		if k > len(mid)-1 {
			k = len(mid) - 1
		}
		a, b := mid[j], mid[k]
		d := b.Sub(a)
		return d.Scale(1 / d.Len())
	}
	first, last := mid[0], mid[len(mid)-1]
	clear := func(p Vec2) bool { return p.Sub(first).Len() >= R && p.Sub(last).Len() >= R }
	var left, right []Vec2
	for i, c := range mid {
		d := dirAt(i)
		nl := Vec2{-d.Y, d.X}.Scale(h)
		if l := c.Add(nl); clear(l) {
			left = append(left, l)
		}
		if r := c.Sub(nl); clear(r) {
			right = append(right, r)
		}
	}
	d0, d1 := dirAt(0), dirAt(len(mid)-1)
	a0, a1 := math.Atan2(d0.Y, d0.X), math.Atan2(d1.Y, d1.X)
	cut := math.Asin(h / R)
	out := Arc(first, R, a0+cut, a0+2*math.Pi-cut, 8) // round the tee's pad
	out = append(out, right...)                       // down the right side
	out = append(out, Arc(last, R, a1+math.Pi+cut, a1+3*math.Pi-cut, 8)...)
	for i := len(left) - 1; i >= 0; i-- { // and back up the left
		out = append(out, left[i])
	}
	return out
}

// Box returns the four walls of a rectangle, the usual outer edge of a hole.
func Box(min, max Vec2) []Wall {
	tl, tr := Vec2{min.X, min.Y}, Vec2{max.X, min.Y}
	br, bl := Vec2{max.X, max.Y}, Vec2{min.X, max.Y}
	return []Wall{
		{Seg: Segment{tl, tr}},
		{Seg: Segment{tr, br}},
		{Seg: Segment{br, bl}},
		{Seg: Segment{bl, tl}},
	}
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
