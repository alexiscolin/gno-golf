// Package mines18 is the mother lode. The station: catch the red cart down
// the runaway track, or walk the drift along the lava lake's shore before it
// caves in behind you. The lake: the Heart stands on an island in it, reached
// by the causeway whose two stretches the tide drowns stroke by stroke (one
// time in three), or by the railed rim path round the shore and the rope
// bridge. The Heart: a crystal chamber whose facets kick, the cup in a druse of
// kicking crystals, the way in through crystal gates or fired up by the geyser.
package mines18

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

func bounds(ps []physics.Vec2) (lo, hi physics.Vec2) {
	lo, hi = ps[0], ps[0]
	for _, p := range ps {
		lo.X, lo.Y, hi.X, hi.Y = math.Min(lo.X, p.X), math.Min(lo.Y, p.Y), math.Max(hi.X, p.X), math.Max(hi.Y, p.Y)
	}
	return lo, hi
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
	tee     = physics.V(7.5, 69.5)
	station = physics.V(9, 68)  // the station, a round platform
	lake    = physics.V(48, 44) // the lava lake's middle, and the Heart's
	heart   = lake
	landN   = physics.V(73, 24.5) // the north-east landing, where the drift comes down
	landS   = physics.V(48, 70.5) // the south landing, at the rim path's end
	// Act I, the drift: up the lake's west shore and along its north shore to
	// the north-east landing
	drift  = spline(2, physics.V(9, 62.5), physics.V(6.5, 48), physics.V(10, 30), physics.V(20, 14.5), physics.V(38, 11.5), physics.V(55, 13.5), physics.V(66, 16.5), physics.V(71, 20.5))
	driftW = widths(2, 2, 2, 2, 2, 2, 2, 2.2, 2.4)
)

// The lake is the ellipse lakeX, lakeY round lake; the island in it a circle
// of isle; the rim path runs round its east and south between the lake and
// the ellipse rimX, rimY (its rail).
const (
	lakeX, lakeY = 30, 22
	isle         = 12.5
	rimX, rimY   = 35.5, 27.5
)

// onLake is the point deg round an ellipse of radii rx, ry about the lake.
func onLake(rx, ry, d float64) physics.Vec2 {
	return lake.Add(physics.V(rx*math.Cos(deg(d)), ry*math.Sin(deg(d))))
}

// ring is points round the ellipse (rx, ry) from deg a to b, about every
// step degrees.
func ring(rx, ry, a, b, step float64) []physics.Vec2 {
	n := int(math.Ceil(math.Abs(b-a) / step))
	var ps []physics.Vec2
	for i := 0; i <= n; i++ {
		ps = append(ps, onLake(rx, ry, a+(b-a)*float64(i)/float64(n)))
	}
	return ps
}

// meet is where the line through the lake's middle at deg, pushed off to
// its left by off, meets the ellipse (rx, ry): a causeway's edge on a shore.
func meet(rx, ry, d, off float64) physics.Vec2 {
	u := physics.FromPolar(deg(d), 1)
	p := lake.Add(physics.V(-u.Y, u.X).Scale(off))
	// |p + t u - lake| on the ellipse: a t² + b t + c = 0
	dx, dy := p.X-lake.X, p.Y-lake.Y
	a := u.X*u.X/(rx*rx) + u.Y*u.Y/(ry*ry)
	b := 2 * (dx*u.X/(rx*rx) + dy*u.Y/(ry*ry))
	c := dx*dx/(rx*rx) + dy*dy/(ry*ry) - 1
	t := (-b + math.Sqrt(b*b-4*a*c)) / (2 * a)
	return p.Add(u.Scale(t))
}

// angle is the deg of p round the lake.
func angle(p physics.Vec2) float64 {
	return math.Atan2(p.Y-lake.Y, p.X-lake.X) * 180 / math.Pi
}

// The causeway crosses the lava from the north-east landing to the island at
// 315 degrees (2.5 wide); the rope bridge from the south landing at 90 (2.8).
const (
	cwD, cwH = 315, 1.25
	brD, brH = 90, 1.4
)

// lava is the lake between the island and the shore, from the causeway round
// to the bridge (east), or from the bridge round to the causeway (west).
func lava(east bool) physics.Zone {
	a0, a1 := meet(lakeX, lakeY, cwD, cwH), meet(lakeX, lakeY, brD, -brH) // on the shore
	i0, i1 := meet(isle, isle, cwD, cwH), meet(isle, isle, brD, -brH)     // on the island
	if !east {
		a0, a1 = meet(lakeX, lakeY, brD, brH), meet(lakeX, lakeY, cwD, -cwH)
		i0, i1 = meet(isle, isle, brD, brH), meet(isle, isle, cwD, -cwH)
	}
	d0, d1 := angle(a0), angle(a1)
	for d1 < d0 {
		d1 += 360
	}
	e0, e1 := angle(i0), angle(i1)
	for e1 < e0 {
		e1 += 360
	}
	ps := build.Path(build.Pts(a0), ring(lakeX, lakeY, d0, d1, 20)[1:], build.Pts(a1, i1), rev(ring(isle, isle, e0, e1, 30))[1:], build.Pts(i0))
	lo, hi := bounds(ps)
	return physics.Zone{Kind: physics.Hazard, Min: lo, Max: hi, Vec: tee, Poly: ps, Skin: "lava"}
}

// ground is everything a ball may stand on: the station and its track, the
// drift with its side stope, the north-east landing, the rim path round to
// the south landing, and the lake (the lava covers all of it but the
// causeway, the rope bridge and the island).
func ground() []physics.Vec2 {
	dn, ds := side(drift, driftW, -1), side(drift, driftW, 1) // outside, lake side of the drift
	return build.Path(
		arc(station, 5.5, physics.V(14.3, 69.5), dn[0], 4), // round the station, from the track
		dn[1:10],
		build.Arc(physics.V(46.5, 10.6), 2.3, deg(180), deg(360), 4), // the side stope
		dn[10:],
		arc(landN, 4.5, dn[len(dn)-1], onLake(rimX, rimY, 330), 4),              // round the landing
		ring(rimX, rimY, 330, 444, 29),                                          // the rim path's rail
		arc(landS, 3.5, onLake(rimX, rimY, 84), meet(lakeX, lakeY, 110, 0), 5), // round the south landing
		ring(lakeX-1, lakeY-1, 110, 290, 20)[1:],                                // the lava's far shore
		arc(landN, 4.5, onLake(lakeX, lakeY, 290), ds[len(ds)-1], 2),
		rev(ds)[1:len(ds)-1],
		arc(station, 5.5, ds[0], physics.V(14.3, 66.5), 2),
		build.Pts(physics.V(36.4, 66.5), physics.V(36.4, 69.5)), // the track
	)
}

// void is the drop round the ground, as two zones whose boxes tile the board
// at x = seamX (each polygon at most 64 points; they meet on the seam).
const seamX = 40

func void() []physics.Zone {
	g := ground()
	zone := func(lo, hi physics.Vec2) physics.Zone {
		return physics.Zone{Kind: physics.Hazard, Min: lo, Max: hi, Vec: tee, Poly: clip(g, lo, hi), Outside: true, Skin: "void"}
	}
	return []physics.Zone{zone(physics.V(-5, -5), physics.V(seamX, 90)), zone(physics.V(seamX, -5), physics.V(100, 90))}
}

// causeway is the point a share f of the way from the causeway's shore end to
// its island end.
func causeway(f float64) physics.Vec2 {
	a, b := meet(lakeX, lakeY, cwD, 0), meet(isle, isle, cwD, 0)
	return a.Add(b.Sub(a).Scale(f))
}

// tide is the lava risen over the causeway round the share f of its way (an
// oval: the stone in the middle and the ends stay dry).
func tide(f float64) physics.Zone {
	p := causeway(f)
	return physics.Zone{Kind: physics.Hazard, Min: p.Sub(physics.V(3, 3)), Max: p.Add(physics.V(3, 3)), Vec: tee, Round: true, Skin: "lava tide"}
}

// rockfall is where the drift caves in across its point i, for good from
// stroke k on; h is how far it reaches either side of the drift's middle.
func rockfall(i int, h float64, k int) course.Pulse {
	t := drift[i+1].Sub(drift[i-1])
	n := physics.V(-t.Y, t.X).Scale(h / t.Len())
	return course.Pulse{Every: 64, On: 64 - k, Phase: 64 - k, Walls: build.Soft(build.Bar(drift[i].Sub(n), drift[i].Add(n), 1.2, '#', "rockfall"), 0.3)}
}

// facet is the Heart's corner k: a decagon of radius 9.5 whose side between
// corners 8 and 9 (facing the causeway) is the slot.
func facet(k int) physics.Vec2 {
	return heart.Add(physics.FromPolar(deg(18+36*float64(k)), 9.5))
}

// slot is the slot's middle, the way along its side, and the way out.
func slot() (m, t, n physics.Vec2) {
	a, b := facet(8), facet(9)
	m = a.Add(b).Scale(0.5)
	t = b.Sub(a).Scale(1 / b.Sub(a).Len())
	n = m.Sub(heart).Scale(1 / m.Sub(heart).Len())
	return m, t, n
}

// gate is one of the slot's two crystal gates: a leaf across its half from
// the middle toward side s (-1 or +1), in the wall's own line, its ends
// overlapping the jamb and the other leaf so no gap is left to wedge a ball
// in. The two swing on the same beat, out of step: the slot is open only
// while both are away.
func gate(s float64, phase int) []physics.Wall {
	m, t, _ := slot()
	return build.Timed(build.Bar(m, m.Add(t.Scale(1.2*s)), 0.5, '|', "crystal gate"), 12, 6, phase)
}

// crystal is one of the druse's kicking crystals round the cup.
func crystal(d float64) physics.Post {
	return physics.Post{Circle: physics.Circle{C: heart.Add(physics.FromPolar(deg(d), 3)), R: 0.6}, Bounce: 1.15, Skin: "crystal bumper"}
}

// round is a round hazard about a point.
func round(kind physics.ZoneKind, c physics.Vec2, r float64, skin string) physics.Zone {
	return physics.Zone{Kind: kind, Min: c.Sub(physics.V(r, r)), Max: c.Add(physics.V(r, r)), Vec: tee, Round: true, Skin: skin}
}

var pad = heart.Add(physics.V(0, 11)) // the geyser's pad, on the island's south rim

var me = author.Fit(&course.Simple{
	W: 93, H: 77,
	World:     "mines",
	Order:     18,
	Title:     "The Mother Lode",
	Strokes:   9, // par
	Tee:       tee,
	Pin:       heart,
	Substeps:  28,
	CupRadius: 1.0,
	Shelter:   0.03,

	Pulses: []course.Pulse{
		// the drift caves in behind a slow walker: on its west leg from the
		// fourth stroke, at the head of its descent from the sixth
		rockfall(5, 2.3, 3),
		rockfall(12, 2.5, 5),
		// the tide over the causeway: its shore stretch on the first stroke
		// of every three, its island stretch on the second, down on the third
		{Every: 3, On: 1, Phase: 0, Zones: []physics.Zone{tide(0.23)}},
		{Every: 3, On: 1, Phase: 2, Zones: []physics.Zone{tide(0.77)}},
	},

	Course: &physics.Field{
		Walls: build.Walls(
			// the rock round the back of the station
			build.Skinned(build.Polyline(build.Arc(station, 5.6, deg(95), deg(215), 2)...), "rockface"),
			// the side stope's back wall
			build.Skinned(build.Polyline(build.Arc(physics.V(46.5, 10.6), 2.4, deg(200), deg(340), 2)...), "rockface"),
			// the rim path's timber rail, and the rope bridge's anchor rail
			build.Polyline(ring(rimX, rimY, 330, 444, 29)...),
			build.Polyline(build.Arc(landS, 3.6, deg(40), deg(140), 2)...),
			// the Heart: nine kicking facets, and the slot's jambs
			build.Skinned(build.Soft(build.Polyline(facet(9), facet(10), facet(11), facet(12), facet(13), facet(14), facet(15), facet(16), facet(17), facet(18)), 1.05), "crystal bumper"),
			jambs(),
			// the crystal gates across the slot, two leaves out of step
			gate(-1, 0), gate(1, 3),
		),
		Posts: []physics.Post{crystal(36), crystal(108), crystal(180), crystal(252), crystal(324)},
		Zones: append(void(), []physics.Zone{
			// the red cart, calling two substeps in 20, to the north-east landing
			{Kind: physics.Tunnel, Min: physics.V(22, 66.5), Max: physics.V(23.3, 69.5), Vec: landN.Sub(physics.V(2.5, 0)), Skin: "cart ride", Every: 20, On: 2},
			// the geyser, firing its pad into the Heart three substeps in 12
			{Kind: physics.Tunnel, Min: pad.Sub(physics.V(1.1, 1.1)), Max: pad.Add(physics.V(1.1, 1.1)), Vec: heart.Add(physics.FromPolar(deg(72), 5.5)), Round: true, Skin: "geyser", Every: 12, On: 3},
			lava(true), lava(false),
			round(physics.Hazard, pad.Add(physics.V(-3.4, 0.2)), 1.2, "hot spring"),
			round(physics.Hazard, pad.Add(physics.V(3.4, 0.2)), 1.2, "hot spring"),
			// the runaway track, a trestle with no rails, and its pit
			{Kind: physics.Slope, Min: physics.V(14.3, 66.5), Max: physics.V(36.4, 69.5), Vec: physics.V(0.3, 0), Skin: "incline"},
			{Kind: physics.Hazard, Min: physics.V(32, 65), Max: physics.V(36.4, 71), Vec: tee, Round: true, Skin: "shaft"},
			// the side stope's ladder, back up to the station
			{Kind: physics.Tunnel, Min: physics.V(45.3, 9.1), Max: physics.V(47.7, 11.1), Vec: physics.V(8, 65.5), Round: true, Skin: "ladder"},
			// where the red cart puts down: rubble
			{Kind: physics.Surface, Min: landN.Sub(physics.V(4, 4)), Max: landN.Add(physics.V(4, 4)), Scale: 0.55, Round: true, Skin: "rubble"},
			// the causeway's basalt stone, and the rope bridge
			{Kind: physics.Surface, Min: causeway(0.5).Sub(physics.V(1.3, 1.3)), Max: causeway(0.5).Add(physics.V(1.3, 1.3)), Scale: 1, Round: true, Skin: "causeway"},
			{Kind: physics.Surface, Min: physics.V(lake.X-brH, 56.5), Max: physics.V(lake.X+brH, 66), Scale: 1, Skin: "rope bridge"},
			// the Heart's floor, crystal
			{Kind: physics.Surface, Min: heart.Sub(physics.V(9.5, 9.5)), Max: heart.Add(physics.V(9.5, 9.5)), Scale: 1.1, Round: true, Skin: "ice"},
		}...),
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// jambs are the slot's sides, from its corners to the gap (2.4 wide).
func jambs() []physics.Wall {
	m, t, _ := slot()
	return build.Skinned(build.Walls(build.Polyline(facet(8), m.Sub(t.Scale(1.2))), build.Polyline(m.Add(t.Scale(1.2)), facet(9))), "crystal")
}
