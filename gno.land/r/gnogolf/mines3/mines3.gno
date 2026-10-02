// Package mines3 is the rail yard. The tee is in the roundhouse, where the
// turntable turns each stroke: its rail across the siding (the main line is
// open) or across the main line. Down the main line three fenced tracks cross
// by level crossings, top, bottom, top, and on each an ore cart creeps across
// on its own beat. The siding curves away with no rail over the pit to the
// ore chute, past the second track; the green is a ledge over the pit.
package mines3

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

var v = physics.V

var tee = v(5, 9)

// cart is an ore cart on its track at x, 3 long and 1.6 wide, crossing the
// main line (3 to 12): out of its portal at tick start of every, it creeps
// across in five steps of step ticks each (down the board, or up when up is
// set) and is gone until it comes round again.
func cart(x float64, every, start, step int, up bool) []physics.Wall {
	var out []physics.Wall
	for k := 0; k < 5; k++ {
		y := 4.2 + 1.9*float64(k)
		if up {
			y = 11.8 - 1.9*float64(k)
		}
		t0 := start + k*step
		out = append(out, build.Timed(build.Bar(v(x, y-0.7), v(x, y+0.7), 1.6, '#', "cart"), every, step, (every-t0%every)%every)...)
	}
	return out
}

// ballast is the bed of a track, from x0 to x1 across the main line.
func ballast(x0, x1 float64) physics.Zone {
	return physics.Zone{Kind: physics.Surface, Min: v(x0, 3), Max: v(x1, 12), Scale: 0.7, Mark: ':', Skin: "ballast"}
}

// fence is the rail guard along each side of a track's bed, from x0 to x1,
// but for a level crossing 2.8 wide at the top (top) or at the bottom of the
// main line.
func fence(x0, x1 float64, top bool) []physics.Wall {
	a, b := 5.8, 12.0
	if !top {
		a, b = 3, 9.2
	}
	return build.Skinned(build.Walls(
		build.Polyline(v(x0, a), v(x0, b)),
		build.Polyline(v(x1, a), v(x1, b)),
	), "railguard")
}

func rock(ws []physics.Wall) []physics.Wall {
	return build.Soft(build.Skinned(ws, "rockface"), 0.5)
}

// laneW and laneE are the ground west and east of x = 40, each the Outside
// polygon of its own void zone: the round roundhouse, the main line, the
// siding curving away below it, and off the end of the main line a plank to a
// first pad and a second plank down to the ledge the green is on. The rest is
// the pit.
var laneW = []physics.Vec2{
	v(13, 3), v(11.84, 3.15), v(11.27, 3.39), v(9.68, 2.72), v(8, 2.5), v(6.32, 2.72), v(4.75, 3.37),
	v(3.4, 4.4), v(2.37, 5.75), v(1.72, 7.32), v(1.5, 9), v(1.72, 10.68), v(2.37, 12.25), v(3.4, 13.6),
	v(4.75, 14.63), v(6.32, 15.28), v(8, 15.5), v(9.68, 15.28), v(10.35, 15), v(10.75, 15.71),
	v(11.07, 15.97), v(19.17, 20.87), v(19.72, 21.08), v(32.72, 23.38), v(40, 22.94), v(40, 19.73),
	v(33.09, 20.19), v(20.57, 17.98), v(12.83, 13.29), v(13.73, 12), v(40, 12), v(40, 3),
}

var laneE = []physics.Vec2{
	v(59.66, 3.15), v(58.5, 3), v(40, 3), v(40, 12), v(58.5, 12), v(59.66, 11.85), v(60.75, 11.4),
	v(61.68, 10.68), v(62.4, 9.75), v(62.85, 8.66), v(63, 7.5), v(62.83, 6.3), v(65.82, 6.3), v(66.38, 7.12),
	v(67, 7.6), v(68.39, 7.99), v(71.29, 14.58), v(70.54, 15.5), v(70.14, 16.46), v(70, 17.5),
	v(70.14, 18.54), v(70.54, 19.5), v(71.17, 20.33), v(72, 20.96), v(72.96, 21.36), v(74, 21.5),
	v(75.04, 21.36), v(76, 20.96), v(76.83, 20.33), v(77.46, 19.5), v(77.86, 18.54), v(78, 17.5),
	v(77.86, 16.46), v(77.46, 15.5), v(76.83, 14.67), v(76, 14.04), v(75.04, 13.64), v(73.68, 13.54),
	v(70.77, 6.93), v(71.4, 5.78), v(71.5, 5), v(71.1, 3.5), v(70.62, 2.88), v(69.28, 2.1), v(68.5, 2),
	v(67, 2.4), v(66.38, 2.88), v(65.82, 3.7), v(60.88, 3.7), v(59.66, 3.15), v(45.11, 22.6),
	v(56.62, 20.98), v(57.48, 20.11), v(57.48, 18.88), v(56.61, 18.02), v(55.78, 17.91), v(44.84, 19.41),
	v(40, 19.73), v(40, 22.94), v(45.11, 22.6), v(59.66, 3.15),
}

var me = author.Fit(&course.Simple{
	W: 81, H: 25,
	World:     "mines",
	Order:     3,
	Title:     "The Rail Yard",
	Strokes:   8, // par
	Tee:       tee,
	Pin:       v(74, 17.5),
	Substeps:  30,
	CupRadius: 1.2,
	Shelter:   0.04,
	// the turntable: its rail set across the siding's mouth on even strokes
	// (the main line is open), across the main line's on odd ones
	Pulses: []course.Pulse{
		{Every: 2, On: 1, Phase: 0, Walls: build.Bar(v(13.9, 12.6), v(10.2, 17), 0.6, '/', "turntable")},
		{Every: 2, On: 1, Phase: 1, Walls: build.Bar(v(14.3, 6.2), v(14.3, 12.3), 0.6, '|', "turntable")},
	},
	Course: &physics.Field{
		Walls: build.Walls(
			build.Box(v(0, 0), v(81, 25)),
			// the roundhouse's back wall
			rock(build.Polyline(v(10.57, 14.97), v(7.23, 15.45), v(4.1, 14.2), v(2.02, 11.55), v(1.55, 8.21),
				v(2.81, 5.08), v(5.48, 3.01), v(8.82, 2.55), v(11.94, 3.83), v(14, 6.5))),
			// the main line's rail guards
			build.Skinned(build.Polyline(v(15, 3), v(58.5, 3)), "railguard"),
			build.Skinned(build.Polyline(v(15, 12), v(58.5, 12)), "railguard"),
			fence(21.5, 30.5, true), fence(34.5, 43.5, false), fence(47.5, 56.5, true),
			cart(26, 16, 0, 2, false),
			cart(39, 12, 4, 1, true),
			cart(52, 20, 6, 2, false),
		),
		Zones: []physics.Zone{
			{Kind: physics.Hazard, Min: v(-0.5, -0.5), Max: v(40, 25.5), Vec: tee, Poly: laneW, Outside: true, Skin: "void"},
			{Kind: physics.Hazard, Min: v(40, -0.5), Max: v(81.5, 25.5), Vec: tee, Poly: laneE, Outside: true, Skin: "void"},
			ballast(21.5, 30.5), ballast(34.5, 43.5), ballast(47.5, 56.5),
			// the siding's ballast, the slow way: a bed along its curve
			{Kind: physics.Surface, Min: v(18.4, 18), Max: v(48.3, 23.2), Scale: 0.7, Mark: ':', Skin: "ballast", Poly: []physics.Vec2{
				v(19.33, 20.61), v(33.09, 23.1), v(47.1, 22.03), v(47.72, 21.77), v(48.13, 21.23), v(48.21, 20.56), v(47.95, 19.94),
				v(47.42, 19.53), v(46.75, 19.45), v(33.07, 20.49), v(19.76, 18.04), v(19.11, 18.2), v(18.62, 18.67), v(18.44, 19.31),
				v(18.6, 19.97),
			}},
			// the ore chute, from the siding's end up to a heap of rubble between
			// the second track and the third
			{Kind: physics.Tunnel, Min: v(54.2, 18.2), Max: v(56.8, 20.8), Vec: v(45.5, 7.5), Round: true, Mark: 'O', Skin: "ore chute"},
			{Kind: physics.Surface, Min: v(43.5, 4), Max: v(47.5, 11), Scale: 0.6, Round: true, Mark: ',', Skin: "rubble"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
