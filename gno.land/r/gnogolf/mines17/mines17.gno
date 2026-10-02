// Package mines17 is the great shaft: a ledge that spirals once round a
// bottomless shaft, from the tee down to the cup just under it, a rock
// buttress between the two. The ledge leans toward the drop all the way
// round, narrows to a timbered parapet where the rock bulges or the edge has
// crumbled, crystal bumpers stand on it, and the draught blows up the shaft
// with nothing to shelter from it. Or catch the cable car across at the rim.
package mines17

import (
	"math"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

// c is the shaft's middle; on is the point at deg degrees round an ellipse
// of radii rx, ry about it (0 is east, 90 south: clockwise on the board).
var c = physics.V(46.5, 34.5)

func on(rx, ry, deg float64) physics.Vec2 {
	a := deg * math.Pi / 180
	return physics.V(c.X+rx*math.Cos(a), c.Y+ry*math.Sin(a))
}

// The shaft's rim and the ledge's outer wall, as ellipses about c.
const (
	rimX, rimY   = 36, 28
	wallX, wallY = 45, 37
)

// mid is the point deg round the middle of the ledge, d further out.
func mid(deg, d float64) physics.Vec2 { return on((rimX+wallX)/2+d, (rimY+wallY)/2+d, deg) }

// edge is the ledge's outer edge at deg: the ellipse of the shaft's wall,
// the rock bulging in at the north and the south where the ledge narrows to
// a few feet.
func edge(deg float64) physics.Vec2 {
	n := math.Min(math.Abs(math.Mod(deg+360, 180)-90), 90) // how far from north or south
	s := 1 - 0.165*math.Exp(-n*n/300)
	return on(wallX*s, wallY*s, deg)
}

// edges is the outer edge from deg a to deg b, a point each 7.5 degrees.
func edges(a, b float64) []physics.Vec2 {
	var ps []physics.Vec2
	for d := a; d <= b+1e-9; d += 7.5 {
		ps = append(ps, edge(d))
	}
	return ps
}

// bank is the ledge in one eighth of the round, from the shaft's rim out to
// the wall, leaning toward the shaft and down the spiral (clockwise): under
// the drag, so a ball that stops holds, wet or dry, and under a ramp's
// steepness (physics.MinRamp), so nothing takes off from it.
func bank(k int) physics.Zone {
	deg := 45 * float64(k)
	ps := build.Path(build.Pts(on(rimX, rimY, deg-22.5)), edges(deg-22.5, deg+22.5), build.Pts(on(rimX, rimY, deg+22.5)))
	lo, hi := bounds(ps)
	a := deg * math.Pi / 180
	in, down := physics.V(-math.Cos(a), -math.Sin(a)), physics.V(-math.Sin(a), math.Cos(a))
	return physics.Zone{Kind: physics.Slope, Min: lo, Max: hi, Poly: ps, Vec: in.Scale(0.11).Add(down.Scale(0.045)), Skin: "ledge bank"}
}

// bounds is the box round some points.
func bounds(ps []physics.Vec2) (lo, hi physics.Vec2) {
	lo, hi = ps[0], ps[0]
	for _, p := range ps {
		lo.X, lo.Y = math.Min(lo.X, p.X), math.Min(lo.Y, p.Y)
		hi.X, hi.Y = math.Max(hi.X, p.X), math.Max(hi.Y, p.Y)
	}
	return lo, hi
}

// car is where the cable car docks, just over the rim by the tee.
var car = []physics.Vec2{on(rimX, rimY, 205), on(rimX, rimY, 225), on(rimX-2, rimY-2, 225), on(rimX-2, rimY-2, 205)}

// bite is where the ledge has crumbled into the shaft, at deg round the rim:
// only a strip along the wall is left.
func bite(deg float64) physics.Zone {
	p := on(rimX, rimY, deg)
	return physics.Zone{Kind: physics.Hazard, Min: p.Sub(physics.V(6.1, 6.1)), Max: p.Add(physics.V(6.1, 6.1)), Vec: tee, Round: true, Skin: "shaft"}
}

// parapet is the miners' timber kerb along the drop where the ledge is at its
// narrowest, from deg-9 to deg+9, d out from the rim.
func parapet(deg, d float64) []physics.Wall {
	return build.Skinned(build.Polyline(on(rimX+d, rimY+d, deg-9), on(rimX+d, rimY+d, deg+9)), "rope")
}

// ore is a pile of spilled ore that brakes a ball like sand.
func ore(p physics.Vec2) physics.Zone {
	return physics.Zone{Kind: physics.Surface, Min: p.Sub(physics.V(1.8, 1.8)), Max: p.Add(physics.V(1.8, 1.8)), Scale: 0.45, Round: true, Skin: "ore"}
}

// pit is a hole in the ledge round the point deg on the ellipse (rx, ry).
func pit(deg, rx, ry, r float64) physics.Zone {
	p := on(rx, ry, deg)
	if rx >= wallX {
		p = edge(deg)
	}
	return physics.Zone{Kind: physics.Hazard, Min: p.Sub(physics.V(r, r)), Max: p.Add(physics.V(r, r)), Vec: tee, Round: true, Skin: "shaft"}
}

// oreCart is the ore cart crossing the ledge at 305 degrees, from the rock
// out toward the rim, at place k of four: four substeps at each, then its
// track is clear for eight (Every 24, as the cable car).
func oreCart(k int) []physics.Wall {
	p, q := edge(305), on(rimX, rimY, 305)
	u := q.Sub(p).Scale(1 / q.Sub(p).Len())
	at := p.Add(q.Sub(p).Scale(0.15 + 0.23*float64(k)))
	return build.Timed(build.Soft(build.Bar(at.Sub(u.Scale(0.7)), at.Add(u.Scale(0.7)), 1.6, '#', "cart"), 0.4), 24, 4, (24-4*k)%24)
}

// boulder is the boulder rolling down the spiral in the south, at place k of
// four (100 to 124 degrees), across the whole ledge: four substeps at each,
// then the ledge is clear for eight.
func boulder(k int) []physics.Wall {
	d := 100 + 8*float64(k)
	return build.Timed(build.Soft(build.Bar(on(rimX+0.3, rimY+0.3, d), edge(d).Sub(edge(d).Sub(c).Scale(0.3/edge(d).Sub(c).Len())), 2, '#', "boulder"), 0.4), 24, 4, (24-4*k)%24)
}

func crystal(p physics.Vec2) physics.Post {
	return physics.Post{Circle: physics.Circle{C: p, R: 0.8}, Bounce: 1.25, Skin: "crystal bumper"}
}

func carZone() physics.Zone {
	lo, hi := bounds(car)
	return physics.Zone{Kind: physics.Tunnel, Min: lo, Max: hi, Poly: car, Vec: mid(8, 0.5), Skin: "cable car", Every: 24, On: 2}
}

var tee = mid(197, 0)

var me = author.Fit(&course.Simple{
	W: 93, H: 77,
	World:     "mines",
	Order:     17,
	Title:     "The Great Shaft",
	Strokes:   9, // par
	Tee:       tee,
	Pin:       mid(163, 0),
	Substeps:  34,
	CupRadius: 1.1,
	Shelter:   0, // the draught up the shaft, at its strongest

	// the rotten planks in the north-west give way every third stroke (the
	// third, the sixth...)
	Pulses: []course.Pulse{{Every: 3, On: 1, Phase: 1, Zones: []physics.Zone{
		{Kind: physics.Hazard, Min: mid(232, 0).Sub(physics.V(5.2, 5.2)), Max: mid(232, 0).Add(physics.V(5.2, 5.2)), Vec: tee, Round: true, Skin: "crumble"},
	}}},

	Course: &physics.Field{
		Walls: build.Walls(
			// the shaft's rock wall along the north and the south, where it
			// bulges in, and the cable car's landing stage on the east
			build.Skinned(build.Polyline(edges(240, 300)...), "rockface"),
			build.Skinned(build.Polyline(edges(60, 120)...), "rockface"),
			build.Polyline(edges(-15, 15)...),
			// the parapets at the narrows and the crumbled bites
			parapet(270, 0.3), parapet(90, 0.3), parapet(330, 6.3), parapet(135, 6.3),
			// the ore cart crossing the ledge in the north-east, the boulder
			// rolling down the spiral in the south
			oreCart(0), oreCart(1), oreCart(2), oreCart(3),
			boulder(0), boulder(1), boulder(2), boulder(3),
			// the buttress between the top of the spiral and its foot
			build.Skinned(build.Polyline(on(wallX+1, 0, 180), on(rimX-4, 0, 180)), "rockface"),
		),
		Posts: []physics.Post{
			crystal(mid(258, -2.5)),
			crystal(mid(285, 2)),
			crystal(mid(60, -2)),
		},
		Zones: []physics.Zone{
			// the drop off the ledge's outer edge
			{Kind: physics.Hazard, Min: physics.V(-2, -2), Max: physics.V(95, 79), Vec: tee, Poly: edges(0, 352.5), Outside: true, Skin: "void"},
			// the cable car, docked at the rim by the tee two substeps in 24:
			// a ball that rolls off then lands in it and rides across, else
			// it falls
			carZone(),
			bank(0), bank(1), bank(2), bank(3), bank(4), bank(5), bank(6), bank(7),
			{Kind: physics.Hazard, Min: c.Sub(physics.V(rimX, rimY)), Max: c.Add(physics.V(rimX, rimY)), Vec: tee, Round: true, Skin: "shaft"},
			bite(330), bite(135),
			// the plank bridge over the pit in the south-east
			pit(35, rimX, rimY, 3.8), pit(35, wallX*1.0, wallY*1.0, 2.8),
			{Kind: physics.Surface, Min: mid(35, -0.4).Sub(physics.V(1.5, 1.5)), Max: mid(35, -0.4).Add(physics.V(1.5, 1.5)), Scale: 1, Round: true, Skin: "rope bridge"},
			// ore spilled on the ledge
			ore(mid(250, 2)), ore(mid(48, 1.5)),
			// the car's landing, rubble
			{Kind: physics.Surface, Min: mid(8, 0.5).Sub(physics.V(3.5, 3.5)), Max: mid(8, 0.5).Add(physics.V(3.5, 3.5)), Scale: 0.55, Round: true, Skin: "rubble"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
