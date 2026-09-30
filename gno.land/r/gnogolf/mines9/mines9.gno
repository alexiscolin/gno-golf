// Package mines9 is the collapsing gallery: one drift through the mine,
// and the mine coming down behind a slow player. Past the scree and a
// dead-end stope, the drift is being bored straight by a tunnel-boring
// machine whose drill head turns across it; then it forks round a rock
// island: the short way north, where the roof falls in for good from the
// third stroke; the long way south past a timber set; and a cut through the
// island packed with dynamite, blown from the fourth. Beyond, the floor
// steps down in terraces whose slabs crack and drop into the dark from the
// seventh, to the cup's chamber. Cracks and dust show a stroke ahead.
package mines9

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

var v = physics.V

// from is a piece absent on strokes 0 to k-1 and there from stroke k on,
// for the rest of any round: a one-way pulse.
func from(k int, p course.Pulse) course.Pulse {
	p.Every, p.On, p.Phase = 64, 64-k, 64-k
	return p
}

// until is a piece there on strokes 0 to k-1, gone from stroke k on.
func until(k int, p course.Pulse) course.Pulse {
	p.Every, p.On, p.Phase = 64, k, 0
	return p
}

// the drill head's clock: its three spokes sweep past each side once in
// every 12 substeps, one side then the other
const every = 12

// drill is where the tunnel-boring machine's head stands across the drift.
const drill = 31

// spoke is where a spoke of the drill head crosses the drift, from y0 to y1,
// there On substeps from phase.
func spoke(y0, y1 float64, on, phase int) []physics.Wall {
	return build.Timed(build.Bar(v(drill, y0+0.4), v(drill, y1-0.4), 0.8, '|', "drill"), every, on, phase)
}

// across is a bar of thickness t across the lane at c, whose direction is d
// (a unit vector), reaching h either side of its centre line.
func across(c, d physics.Vec2, h, t float64, mark rune, skin string) []physics.Wall {
	n := v(-d.Y, d.X).Scale(h - t/2)
	return build.Bar(c.Sub(n), c.Add(n), t, mark, skin)
}

func rubble(min, max physics.Vec2) physics.Zone {
	return physics.Zone{Kind: physics.Surface, Min: min, Max: max, Scale: 0.6, Mark: ',', Round: true, Skin: "rubble"}
}

// slab is an oval floor slab that drops into the dark.
func slab(min, max physics.Vec2) physics.Zone {
	return physics.Zone{Kind: physics.Hazard, Min: min, Max: max, Vec: v(5.5, 22), Mark: '!', Round: true, Skin: "crumble"}
}

// terrace is a step down the floor, a short ramp toward the cup.
func terrace(x0, x1, y0, y1 float64) physics.Zone {
	return physics.Zone{Kind: physics.Slope, Min: v(x0, y0), Max: v(x1, y1), Vec: v(0.13, 0.08), Mark: '>', Skin: "incline"}
}

func prop(c physics.Vec2, r float64) physics.Post {
	return physics.Post{Circle: physics.Circle{C: c, R: r}, Bounce: 0.6, Skin: "prop"}
}

// the ground, drawn by hand: the tee's grotto, the drift with its stope and
// bored straight, the fork round the island (north, south and the cut), the
// terraces, the cup's chamber. Its outline is cut in three on the seams
// x = 36 and x = 66 (the island is a hole in the middle part; each part's
// rings are joined through slits the even-odd rule crosses twice).
var ground0 = []physics.Vec2{
	v(8.15, 6.63), v(7.71, 5.99), v(7.07, 5.55), v(6.3, 5.4), v(5.53, 5.55), v(4.89, 5.99),
	v(4.54, 6.46), v(4.31, 7.2), v(4.39, 7.98), v(4.89, 8.81), v(5.7, 9.31), v(6.97, 11.79),
	v(10.4, 14.87), v(9.5, 16.31), v(6.76, 19.06), v(5.81, 18.82), v(4.57, 18.94), v(3.47, 19.53),
	v(2.68, 20.49), v(2.32, 21.69), v(2.32, 22.31), v(2.54, 23.22), v(3.03, 24.03), v(3.47, 24.47),
	v(4.57, 25.06), v(5.5, 25.2), v(6.43, 25.06), v(7.01, 24.82), v(7.76, 24.26), v(8.32, 23.51),
	v(8.66, 22.5), v(12.61, 18.51), v(14.7, 15.16), v(18.13, 14.32), v(22.36, 14.75), v(23.08, 15.22),
	v(24, 15.4), v(36, 15.4), v(36, 10.6), v(24, 10.6), v(23.53, 10.65), v(22.74, 10.96),
	v(17.87, 10.5), v(12.7, 11.78), v(12.11, 12.2), v(11.8, 12.64), v(9.05, 10.19), v(8.09, 8.28),
	v(8.3, 7.4),
}
var ground1 = []physics.Vec2{
	v(36.1, 15.4), v(41.28, 21.87), v(41.6, 22.19), v(41.97, 22.44), v(42.38, 22.61), v(54.38, 26.11),
	v(54.86, 26.2), v(55.33, 26.17), v(55.8, 26.05), v(64.8, 22.55), v(65.2, 22.35), v(65.55, 22.07),
	v(66, 21.47), v(66, 8.28), v(65, 7.39), v(64.57, 7.11), v(56.31, 3.73), v(55.78, 3.72),
	v(43.78, 5.52), v(43.51, 5.58), v(43.25, 5.7), v(43.02, 5.86), v(37.44, 10.64), v(37, 10.6),
	v(36, 10.6), v(36, 15.4), v(36.1, 15.4), v(55.81, 6.75), v(63.19, 9.79), v(65.37, 11.75),
	v(59.85, 11.61), v(53.45, 13.43), v(53.25, 13.56), v(52.95, 13.92), v(49.55, 20.12), v(44.28, 18.58),
	v(39.61, 12.74), v(44.65, 8.42), v(55.81, 6.75), v(36.1, 15.4), v(65.58, 14.16), v(62.55, 18.7),
	v(54.9, 21.68), v(51.91, 20.81), v(54.81, 15.52), v(60.15, 14), v(65.58, 14.16), v(36.1, 15.4),
}
var ground2 = []physics.Vec2{
	v(69.68, 15.94), v(73.83, 18.37), v(79.78, 22.33), v(84.23, 24.06), v(85.07, 24.2), v(85.5, 24.14),
	v(86.28, 23.79), v(86.87, 23.16), v(87.17, 22.36), v(87.12, 21.44), v(88.4, 20.14), v(89.79, 17.28),
	v(89.89, 16.77), v(90.76, 16.55), v(91.33, 16.24), v(91.83, 15.83), v(92.24, 15.33), v(92.55, 14.76),
	v(92.74, 14.14), v(92.78, 13.18), v(92.55, 12.24), v(92.05, 11.41), v(91.33, 10.76), v(90.46, 10.34),
	v(89.5, 10.2), v(88.54, 10.34), v(87.67, 10.76), v(87.17, 11.17), v(86.76, 11.67), v(86.45, 12.24),
	v(86.22, 13.18), v(86.22, 13.82), v(86.45, 14.76), v(86.76, 15.33), v(87.17, 15.83), v(87.81, 16.33),
	v(86.59, 18.85), v(85.58, 19.87), v(82.01, 18.53), v(76.22, 14.67), v(71.6, 11.97), v(71.16, 11.22),
	v(70.32, 10.53), v(69.27, 10.21), v(68.25, 10.31), v(66, 8.28), v(66, 21.47),
}

var me = author.Fit(&course.Simple{
	W: 93, H: 28,
	World:     "mines",
	Order:     9,
	Title:     "The Collapsing Gallery",
	Strokes:   10, // par
	Tee:       v(5.5, 22),
	Pin:       v(89.4, 13.3),
	Substeps:  34,
	CupRadius: 1.2,
	Shelter:   0.03,

	Pulses: []course.Pulse{
		// the roof over the short way north, from the third stroke
		from(2, course.Pulse{Walls: across(v(58, 6), v(0.924, 0.381), 2, 1, '!', "rockfall")}),
		// the dynamite packed in the cut, blown before the fourth stroke
		until(3, course.Pulse{Walls: across(v(52.2, 17.8), v(0.48, -0.877), 1.7, 1.2, '=', "dynamite")}),
		// the terraces' slabs, from the seventh
		from(6, course.Pulse{Zones: []physics.Zone{
			slab(v(73, 13), v(76.5, 16.9)),
			slab(v(81, 18.5), v(84.5, 22)),
		}}),
	},
	Course: &physics.Field{
		Walls: build.Walls(
			// the rock round the grotto, the cup's chamber and the long way's floor
			build.Skinned(build.Walls(
				build.Polyline(v(2.32, 21.69), v(3.03, 24.03), v(5.5, 25.2), v(6.43, 25.06)),
				build.Polyline(v(92.55, 14.76), v(92.55, 12.24), v(90.46, 10.34), v(87.67, 10.76), v(86.45, 12.24)),
				build.Polyline(v(54.38, 26.11), v(54.86, 26.2), v(55.33, 26.17), v(55.8, 26.05)),
			), "rockface"),
			// the drill head turning across the bored straight: its hub, and
			// each side's inner and outer reach of the spokes as they sweep by
			build.Skinned(build.Bar(v(drill, 12.9), v(drill, 13.1), 0.8, 'o', ""), "drill"),
			spoke(11.6, 12.5, 6, 0), spoke(10.6, 11.6, 3, 10),
			spoke(13.5, 14.4, 6, 6), spoke(14.4, 15.4, 3, 4),
		),
		Posts: []physics.Post{
			// pit props, and a timber set across the long way
			prop(v(15.5, 14.2), 0.4), prop(v(40, 15.2), 0.4),
			prop(v(59.4, 21.4), 0.5), prop(v(60.2, 23.4), 0.5),
		},
		Zones: []physics.Zone{
			// the scree across the drift, the dead-end stope's rubble
			rubble(v(17.3, 10), v(20.7, 15)), rubble(v(4.3, 5.4), v(8.3, 9.4)),
			// the terraces stepping down toward the cup
			terrace(71, 73.5, 12, 17.5), terrace(78, 80.5, 15, 22),
			// the dark round the drift, in three parts meeting on the seams
			{Kind: physics.Hazard, Min: v(-5, -5), Max: v(36, 35), Vec: v(5.5, 22), Poly: ground0, Outside: true, Skin: "void"},
			{Kind: physics.Hazard, Min: v(36, -5), Max: v(66, 35), Vec: v(5.5, 22), Poly: ground1, Outside: true, Skin: "void"},
			{Kind: physics.Hazard, Min: v(66, -5), Max: v(100, 35), Vec: v(5.5, 22), Poly: ground2, Outside: true, Skin: "void"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
