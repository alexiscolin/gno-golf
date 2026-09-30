// Package mines14 is the mine cart run. A gallery runs from the tee past an
// ore cart crossing and along a narrow ledge to the station, where two carts
// call at the head of a runaway track: the red one runs down to the buffers
// of the lower drift, the blue one to a dead-end siding past the pit, and a
// ball that meets neither rolls into it. Or walk down the drift: it splits
// round a rock rib, a boulder rolling down the clear side every other stroke
// and ballast on the other, doubles back past a second cart crossing, and
// climbs an adit under the gallery to the green on the ledge above it.
package mines14

import (
	"math"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

func deg(d float64) float64 { return d * math.Pi / 180 }

// spline is the smooth line (Catmull-Rom) through pts, n points a stretch.
func spline(n int, pts ...physics.Vec2) []physics.Vec2 {
	at := func(i int) physics.Vec2 { return pts[int(math.Max(0, math.Min(float64(i), float64(len(pts)-1))))] }
	var out []physics.Vec2
	for i := 0; i+1 < len(pts); i++ {
		p0, p1, p2, p3 := at(i-1), at(i), at(i+1), at(i+2)
		for k := 0; k < n; k++ {
			t := float64(k) / float64(n)
			t2, t3 := t*t, t*t*t
			out = append(out, p0.Scale(-0.5*t3+t2-0.5*t).Add(p1.Scale(1.5*t3-2.5*t2+1)).Add(p2.Scale(-1.5*t3+2*t2+0.5*t)).Add(p3.Scale(0.5*t3-0.5*t2)))
		}
	}
	return append(out, pts[len(pts)-1])
}

// side is the edge of a lane along line, half[i] to the left of point i (to
// its right for s = -1).
func side(line []physics.Vec2, half []float64, s float64) []physics.Vec2 {
	out := make([]physics.Vec2, len(line))
	for i := range line {
		a, b := line[i], line[i]
		if i > 0 {
			a = line[i-1]
		}
		if i+1 < len(line) {
			b = line[i+1]
		}
		t := b.Sub(a)
		t = t.Scale(1 / t.Len())
		out[i] = line[i].Add(physics.V(-t.Y, t.X).Scale(s * half[i]))
	}
	return out
}

// widths is a half-width per point of a spline of n a stretch, easing from
// one control point's to the next.
func widths(n int, hs ...float64) []float64 {
	var out []float64
	for i := 0; i+1 < len(hs); i++ {
		for k := 0; k < n; k++ {
			t := float64(k) / float64(n)
			out = append(out, hs[i]*(1-t)+hs[i+1]*t)
		}
	}
	return append(out, hs[len(hs)-1])
}

func rev(ps []physics.Vec2) []physics.Vec2 {
	out := make([]physics.Vec2, len(ps))
	for i, p := range ps {
		out[len(ps)-1-i] = p
	}
	return out
}

// arc is a round end of radius r about c, from where it meets a round to
// where it meets b, clockwise on the board.
func arc(c physics.Vec2, r float64, a, b physics.Vec2, n int) []physics.Vec2 {
	p, q := a.Sub(c), b.Sub(c)
	a0, a1 := math.Atan2(p.Y, p.X), math.Atan2(q.Y, q.X)
	for a1 < a0 {
		a1 += 2 * math.Pi
	}
	return build.Arc(c, r, a0, a1, n)
}

// clip is the part of the polygon ps inside the box lo..hi (Sutherland-
// Hodgman), its cuts exactly on the box's edges.
func clip(ps []physics.Vec2, lo, hi physics.Vec2) []physics.Vec2 {
	edge := func(ps []physics.Vec2, in func(physics.Vec2) bool, cut func(a, b physics.Vec2) physics.Vec2) []physics.Vec2 {
		var out []physics.Vec2
		for i := range ps {
			a, b := ps[i], ps[(i+1)%len(ps)]
			if in(a) {
				out = append(out, a)
			}
			if in(a) != in(b) {
				out = append(out, cut(a, b))
			}
		}
		return out
	}
	atX := func(x float64) func(a, b physics.Vec2) physics.Vec2 {
		return func(a, b physics.Vec2) physics.Vec2 { return physics.V(x, a.Y+(x-a.X)/(b.X-a.X)*(b.Y-a.Y)) }
	}
	atY := func(y float64) func(a, b physics.Vec2) physics.Vec2 {
		return func(a, b physics.Vec2) physics.Vec2 { return physics.V(a.X+(y-a.Y)/(b.Y-a.Y)*(b.X-a.X), y) }
	}
	ps = edge(ps, func(p physics.Vec2) bool { return p.X >= lo.X }, atX(lo.X))
	ps = edge(ps, func(p physics.Vec2) bool { return p.X <= hi.X }, atX(hi.X))
	ps = edge(ps, func(p physics.Vec2) bool { return p.Y >= lo.Y }, atY(lo.Y))
	return edge(ps, func(p physics.Vec2) bool { return p.Y <= hi.Y }, atY(hi.Y))
}

var (
	tee     = physics.V(5, 20)
	station = physics.V(58, 20) // a round platform, 5.5 across
	siding  = physics.V(90, 20)
	pit     = physics.V(85.2, 20)
	adit    = physics.V(21.5, 27.2) // the adit's mouth, at the drift's end
	exit    = physics.V(22, 10.8)   // and where it comes out, over the gallery
	green   = physics.V(44, 6)      // a round green, 4.5 across
	// the gallery, tee to station: the ore cart crosses it at x 14, and it
	// narrows to a ledge (2.6 wide) past x 34
	gallery  = spline(2, tee, physics.V(16, 18.5), physics.V(28, 21.5), physics.V(40, 18.5), physics.V(52.5, 20))
	galleryW = widths(2, 3, 2.5, 2.2, 1.3, 2.5)
	// the drift, station to adit: down round the bend, split by the rib,
	// then doubling back west and turning up to the adit
	drift  = spline(2, physics.V(58, 25.4), physics.V(60.5, 29.5), physics.V(50, 32), physics.V(36, 31), physics.V(25, 32.5), physics.V(19.5, 30), adit)
	driftW = widths(2, 2.6, 2.8, 3, 3, 2.8, 2.6, 2.4)
	// the ledge above the gallery, adit to green
	upper  = spline(2, exit, physics.V(27, 7), physics.V(35, 5.5), physics.V(39.8, 5.8))
	upperW = widths(2, 2.2, 2.2, 1.8, 2)
)

// cutY is where the ground's pieces part: the ledge above it, the rest below.
const cutY, seamX = 14, 40

// void is the drop round the ground, as three zones whose boxes tile the
// board: the ledge above cutY, and the rest split at seamX (each polygon at
// most 64 points; they meet on the cuts).
func void() []physics.Zone {
	g := ground()
	zone := func(lo, hi physics.Vec2, ps []physics.Vec2) physics.Zone {
		return physics.Zone{Kind: physics.Hazard, Min: lo, Max: hi, Vec: tee, Poly: ps, Outside: true, Skin: "void"}
	}
	return []physics.Zone{
		zone(physics.V(-5, -5), physics.V(100, cutY), ledge()),
		zone(physics.V(-5, cutY), physics.V(seamX, 45), clip(g, physics.V(-5, cutY), physics.V(seamX, 45))),
		zone(physics.V(seamX, cutY), physics.V(100, 45), clip(g, physics.V(seamX, cutY), physics.V(100, 45))),
	}
}

// ledge is the ledge above the gallery, from the adit round to the green.
func ledge() []physics.Vec2 {
	a, b := side(upper, upperW, -1), side(upper, upperW, 1)
	return build.Path(
		arc(exit, 2.2, b[0], a[0], 5),
		a[1:],
		arc(green, 4.5, a[len(a)-1], b[len(b)-1], 9),
		rev(b)[1:len(b)-1],
	)
}

// ground is the rest: the tee, the gallery, the station with its track and
// the siding past the pit, and the drift down to the adit.
func ground() []physics.Vec2 {
	gn, gs := side(gallery, galleryW, -1), side(gallery, galleryW, 1) // north, south of the gallery
	de, dw := side(drift, driftW, -1), side(drift, driftW, 1)         // east (then south), west (then north) of the drift
	return build.Path(
		arc(tee, 3.5, gs[0], gn[0], 6),
		gn[1:len(gn)-1],
		arc(station, 5.5, gn[len(gn)-1], physics.V(63.3, 18.5), 5),
		build.Pts(physics.V(86.9, 18.5)),
		arc(siding, 3, physics.V(86.9, 18.5), physics.V(86.9, 21.5), 7),
		build.Pts(physics.V(63.3, 21.5)),
		arc(station, 5.5, physics.V(63.3, 21.5), de[0], 2),
		de[1:len(de)-1],
		arc(adit, 2.6, de[len(de)-1], dw[len(dw)-1], 5),
		rev(dw)[1:len(dw)-1],
		arc(station, 5.5, dw[0], gs[len(gs)-1], 2),
		rev(gs)[1:len(gs)-1],
	)
}

// rib is the rock splitting the drift's straight, down its middle.
func rib() []physics.Vec2 { return drift[4:7] }

// boulder is the boulder at place k (0 to 4) down the rib's north side,
// rolling from the bend toward the green, four substeps at each place.
func boulder(k int) []physics.Wall {
	p := rib()[0].Add(rib()[2].Sub(rib()[0]).Scale(0.1 + 0.2*float64(k)))
	return build.Timed(build.Soft(build.Bar(p.Add(physics.V(0, -2.5)), p.Add(physics.V(0, -0.7)), 1.6, '#', "boulder"), 0.4), 20, 4, (20-4*k)%20)
}

// oreCart is an ore cart crossing the lane at x from y0 southward, at place
// k of four (dy apart), three substeps at each; then its track is clear for
// eight.
func oreCart(x, y0, dy float64, k int) []physics.Wall {
	y := y0 + dy*float64(k)
	return build.Timed(build.Soft(build.Bar(physics.V(x, y-0.7), physics.V(x, y+0.7), 1.6, '#', "cart"), 0.4), 20, 3, (20-3*k)%20)
}

// ballast is the rib's south side, laid with ballast: an oval along it.
func ballast() physics.Zone {
	a, b := rib()[0], rib()[2]
	return physics.Zone{Kind: physics.Surface, Min: physics.V(b.X+0.5, math.Min(a.Y, b.Y)+0.1), Max: physics.V(a.X-0.5, math.Max(a.Y, b.Y)+2.7), Scale: 0.7, Round: true, Skin: "ballast"}
}

// cart is a station on the track: a cart standing in it On substeps in 20,
// that carries a ball rolling in to its far end (the ball keeps its speed).
func cart(x float64, to physics.Vec2, on, phase int) physics.Zone {
	return physics.Zone{Kind: physics.Tunnel, Min: physics.V(x, 18.5), Max: physics.V(x+1.3, 21.5), Vec: to, Skin: "cart ride", Every: 20, On: on, Phase: phase}
}

var me = author.Fit(&course.Simple{
	W: 93, H: 37,
	World:     "mines",
	Order:     14,
	Title:     "The Mine Cart Run",
	Strokes:   9, // par
	Tee:       tee,
	Pin:       physics.V(46.8, 4.4),
	Substeps:  32,
	CupRadius: 1.1,
	Shelter:   0.03,

	// the boulder rolls down the drift on the second stroke, the fourth...
	Pulses: []course.Pulse{{Every: 2, On: 1, Phase: 1, Walls: build.Walls(boulder(0), boulder(1), boulder(2), boulder(3), boulder(4))}},

	Course: &physics.Field{
		Walls: build.Walls(
			// the rock behind the tee and over the station, the siding's
			// buffer rail, and the rock behind the green
			build.Skinned(build.Polyline(build.Arc(tee, 3.6, deg(140), deg(220), 2)...), "rockface"),
			build.Skinned(build.Polyline(build.Arc(station, 5.6, deg(215), deg(325), 3)...), "rockface"),
			build.Polyline(build.Arc(siding, 3.1, deg(-50), deg(50), 2)...),
			build.Skinned(build.Polyline(build.Arc(green, 4.6, deg(-60), deg(40), 3)...), "rockface"),
			// the track's guard rails, from the station to the pit
			build.Skinned(build.Polyline(physics.V(63.3, 18.5), physics.V(83, 18.5)), "railguard"),
			build.Skinned(build.Polyline(physics.V(63.3, 21.5), physics.V(83, 21.5)), "railguard"),
			// the rib
			build.Skinned(build.Polyline(rib()...), "rockface"),
			// the ore carts crossing the gallery and the drift
			oreCart(14, 16.3, 2.2, 0), oreCart(14, 16.3, 2.2, 1), oreCart(14, 16.3, 2.2, 2), oreCart(14, 16.3, 2.2, 3),
			oreCart(31, 29.4, 2, 0), oreCart(31, 29.4, 2, 1), oreCart(31, 29.4, 2, 2), oreCart(31, 29.4, 2, 3),
		),
		Posts: []physics.Post{
			// the buffers where the red cart puts down, props on the ledge
			// and in the bend
			{Circle: physics.Circle{C: physics.V(17.2, 29.5), R: 0.5}, Bounce: 0.3, Skin: "buffer"},
			{Circle: physics.Circle{C: physics.V(17.8, 33), R: 0.5}, Bounce: 0.3, Skin: "buffer"},
			{Circle: physics.Circle{C: physics.V(30, 7.6), R: 0.5}, Bounce: 0.5, Skin: "prop"},
			{Circle: physics.Circle{C: physics.V(33, 4.6), R: 0.5}, Bounce: 0.5, Skin: "prop"},
			{Circle: physics.Circle{C: physics.V(57.5, 28.5), R: 0.6}, Bounce: 0.5, Skin: "prop"},
		},
		Zones: append(void(), []physics.Zone{
			// the runaway track: steeper than the drag, down to the pit
			{Kind: physics.Slope, Min: physics.V(63.3, 18.5), Max: physics.V(86.9, 21.5), Vec: physics.V(0.3, 0), Skin: "incline"},
			{Kind: physics.Hazard, Min: pit.Sub(physics.V(2.2, 3)), Max: pit.Add(physics.V(2.2, 3)), Vec: tee, Round: true, Skin: "shaft"},
			cart(70, siding.Sub(physics.V(2.2, 0)), 8, 10), // blue, to the siding
			cart(76, physics.V(19.5, 31.4), 2, 0),          // red, to the lower drift's buffers
			// the siding: rubble, and the adit back up to the station
			{Kind: physics.Surface, Min: siding.Sub(physics.V(3, 3)), Max: siding.Add(physics.V(3, 3)), Scale: 0.55, Round: true, Skin: "rubble"},
			{Kind: physics.Tunnel, Min: physics.V(89.2, 21.4), Max: physics.V(91.8, 22.9), Vec: physics.V(58, 21.5), Round: true, Skin: "adit"},
			// the adit up from the drift's end, under the gallery, to the ledge
			{Kind: physics.Tunnel, Min: adit.Sub(physics.V(1.4, 1.4)), Max: adit.Add(physics.V(1.4, 1.4)), Vec: exit.Add(physics.V(0, -0.8)), Round: true, Skin: "adit"},
			// rubble where the red cart puts down
			{Kind: physics.Surface, Min: physics.V(18.5, 29.4), Max: physics.V(27.5, 33.6), Scale: 0.5, Round: true, Skin: "rubble"},
			// ballast on the rib's south side
			ballast(),
			// a winze in the drift below the bend
			{Kind: physics.Hazard, Min: physics.V(53.3, 29.6), Max: physics.V(55.7, 32), Vec: tee, Round: true, Skin: "shaft"},
		}...),
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
