// Package mines6 is the stamp mill. In the mill house the ore conveyor, which
// no ball can rest on, runs under a battery of five stamps pounding in a
// wave: a stamp's slanted shoe that meets the ball throws it into the ore
// bin under it, so ride the gap, or take the walkway past the pit props.
// The hopper drops the ball on the ore heap below, and the lane winds back
// over the race on a plank through the great water wheel that drives the
// mill, its paddles sweeping across it, through a timber set, down the
// man-way and over the tail race on a rope bridge to the cup.
package mines6

import (
	"math"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

var v = physics.V

// the mill's clock: a stamp is down 3 substeps in 14, and the wheel's
// paddles sweep the plank once in the same 14
const every = 14

// stamps are where the battery's five stamps pound the belt, in a wave.
var stamps = []struct {
	x     float64
	phase int
}{{22, 0}, {30, 11}, {38, 8}, {46, 5}, {54, 2}}

// stamp is a stamp's shoe, slanted in its guides across the belt at x: it
// throws a ball that meets it toward the bin under it.
func stamp(x float64, phase int) []physics.Wall {
	return build.Timed(build.Bar(v(x, 3), v(x+1.2, 4), 1.2, '|', "stamp"), every, 3, phase)
}

// bin is the ore bin under the stamp at x.
func bin(x float64) physics.Zone {
	return physics.Zone{Kind: physics.Hazard, Min: v(x-1.5, 4.9), Max: v(x+3.5, 7.5), Vec: v(5, 6), Mark: 'X', Round: true, Skin: "ore bin"}
}

// paddle is the wheel's paddle across the plank at x, there 2 substeps.
func paddle(x float64, phase int) []physics.Wall {
	return build.Timed(build.Bar(v(x, 13.6), v(x, 16.4), 0.6, '|', "paddle"), every, 2, phase)
}

func prop(x, y, r float64) physics.Post {
	return physics.Post{Circle: physics.Circle{C: v(x, y), R: r}, Bounce: 0.6, Skin: "prop"}
}

func orePile(x, y, r float64) physics.Zone {
	return physics.Zone{Kind: physics.Surface, Min: v(x-r, y-r), Max: v(x+r, y+r), Scale: 0.45, Mark: ',', Round: true, Skin: "ore"}
}

// sump is black water in an oval pool beside the lane.
func sump(min, max physics.Vec2) physics.Zone {
	return physics.Zone{Kind: physics.Hazard, Min: min, Max: max, Vec: v(5, 6), Mark: '~', Round: true, Skin: "sump"}
}

// fairway is the outline of a lane along the centre line pts, half as wide
// as hw at each point, its two ends rounded: one side out, the far end's
// cap, the other side back, the near end's cap.
func fairway(pts []physics.Vec2, hw []float64) []physics.Vec2 {
	n := len(pts)
	var left, right []physics.Vec2
	for i := range pts {
		a, b := pts[i], pts[i]
		if i > 0 {
			a = pts[i-1]
		}
		if i+1 < n {
			b = pts[i+1]
		}
		d := b.Sub(a)
		d = d.Scale(1 / d.Len())
		nl := v(-d.Y, d.X).Scale(hw[i])
		left = append(left, pts[i].Add(nl))
		right = append(right, pts[i].Sub(nl))
	}
	rim := func(i int, from physics.Vec2) []physics.Vec2 {
		a := math.Atan2(from.Y-pts[i].Y, from.X-pts[i].X)
		arc := build.Arc(pts[i], hw[i], a, a-math.Pi, 8)
		return arc[1 : len(arc)-1]
	}
	out := append([]physics.Vec2{}, left...)
	out = append(out, rim(n-1, left[n-1])...)
	for i := n - 1; i >= 0; i-- {
		out = append(out, right[i])
	}
	return append(out, rim(0, right[0])...)
}

// the mill house: the loading floor round the tee, the belt under the
// battery, the bins, the walkway, the hopper at the end
var house = fairway([]physics.Vec2{v(5, 6), v(36, 6), v(66, 6)}, []float64{4, 4, 4})

// the lane below: from the ore heap west over the race on the wheel's
// plank, through the timber set, down the man-way by the west wall, east
// along the bottom ledge, over the rope bridge to the cup's green
var lane = fairway(
	build.Path(
		build.Pts(v(86, 15), v(81, 15), v(79, 15), v(71, 15), v(66, 15), v(54, 14.2), v(40, 16.4), v(26, 15.6), v(14, 15.5)),
		turn(v(14, 20.5), 5, 270, 90, 5),
		build.Pts(v(14, 25.5), v(24, 26.6), v(40, 25.2), v(54, 26), v(60, 26), v(70, 26), v(75, 25.8), v(80, 25.6), v(84, 25.6)),
	),
	[]float64{4, 2, 1.25, 1.25, 2, 2, 2, 2, 2, 1.8, 1.7, 1.7, 1.7, 1.8, 2, 2, 2, 1.8, 1.25, 1.25, 2, 3.2, 4},
)

// turn is k points of a centre line round c at radius r, from angle a0 to a1
// (degrees), ends excluded.
func turn(c physics.Vec2, r, a0, a1 float64, k int) []physics.Vec2 {
	arc := build.Arc(c, r, a0*math.Pi/180, a1*math.Pi/180, k+1)
	return arc[1 : k+1]
}

var me = func() *course.Simple {
	walls := build.Walls(
		// the mill house's timbers: round the loading floor, along the belt
		// and the walkway
		build.Polyline(build.Arc(v(5, 6), 4, math.Pi/2, 3*math.Pi/2, 8)...),
		build.Polyline(v(5, 2), v(62, 2)),
		build.Polyline(v(5, 10), v(62, 10)),
		// the heap's timbers, the rope bridge's ropes, the rock lip under the green
		build.Polyline(build.Arc(v(86, 15), 4, -math.Pi/2, math.Pi/2, 8)...),
		build.Skinned(build.Polyline(v(60, 24.75), v(70, 24.75)), "rope"),
		build.Skinned(build.Polyline(v(60, 27.25), v(70, 27.25)), "rope"),
		build.Skinned(build.Polyline(build.Arc(v(84, 25.6), 4, math.Pi/4, math.Pi/2, 2)...), "rockface"),
		// the wheel's paddles, one sweep across the plank
		paddle(77, 0), paddle(75, 12), paddle(73, 10),
	)
	zones := []physics.Zone{
		// the conveyor: steeper than the drag, it carries a ball on to the hopper
		{Kind: physics.Slope, Min: v(12, 2), Max: v(62, 5), Vec: v(0.34, 0), Mark: '>', Skin: "conveyor"},
		// the hopper at the end of the belt and the walkway, down to the heap
		{Kind: physics.Tunnel, Min: v(62, 2), Max: v(70, 10), Vec: v(84, 15), Mark: 'H', Skin: "hopper"},
		orePile(86, 15, 4),
		// the wheel's race either side of the plank, and the tail race under the bridge
		sump(v(71, 9), v(79, 13.7)), sump(v(71, 16.3), v(79, 21)),
		sump(v(61, 20.5), v(69, 24.7)), sump(v(61, 27.3), v(69, 31.5)),
		{Kind: physics.Surface, Min: v(60, 24.75), Max: v(70, 27.25), Scale: 1, Mark: '=', Skin: "rope bridge"},
		// ore piles along the lane
		orePile(47, 14.8, 1.5), orePile(32, 26, 1.4),
		// the man-way down by the west wall
		{Kind: physics.Slope, Min: v(6, 17.5), Max: v(12, 23.5), Vec: v(0, 0.1), Mark: 'v', Skin: "incline"},
		// the dark round the mill house, and round the lane below
		{Kind: physics.Hazard, Min: v(-2, -2), Max: v(95, 10.5), Vec: v(5, 6), Poly: house, Outside: true, Skin: "void"},
		{Kind: physics.Hazard, Min: v(-2, 10.5), Max: v(95, 34), Vec: v(5, 6), Poly: lane, Outside: true, Skin: "void"},
	}
	for _, s := range stamps {
		walls = append(walls, stamp(s.x, s.phase)...)
		zones = append(zones, bin(s.x))
	}
	return author.Fit(&course.Simple{
		W: 93, H: 32,
		World:     "mines",
		Order:     6,
		Title:     "The Stamp Mill",
		Strokes:   10, // par
		Tee:       v(5, 6),
		Pin:       v(82.5, 25.8),
		Substeps:  34,
		CupRadius: 1.2,
		Shelter:   0.04,

		Course: &physics.Field{
			Walls: walls,
			Posts: []physics.Post{
				// the pit props along the walkway, one side then the other
				prop(26, 8.3, 0.4), prop(34, 9.4, 0.4), prop(42, 8.3, 0.4), prop(50, 9.4, 0.4), prop(58, 8.3, 0.4),
				// a timber set across the lane: two props, the way between them
				prop(26, 14.2, 0.5), prop(26, 17, 0.5),
			},
			Zones:    zones,
			Friction: 0.87,
			Radius:   0.5,
			Bounce:   0.85,
		},
	}, 1.5)
}()
