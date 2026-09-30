// Package mines4 is the chasm. Right in front of the tee a giant pickaxe
// swings across the way onto the first rope bridge, like a pendulum: go when
// its head is at the far end. The bridges have no rails and zigzag over the
// chasm from pillar to pillar, each swaying on its own beat: stop on every
// pillar to turn. The old drift goes round above, railed and out of the
// draught but propped with timber, and comes out on the fourth pillar.
package mines4

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

var v = physics.V

var tee = v(3, 9.3)

// lane is the ground, in two halves either side of x = 40 (each the Outside
// polygon of its own void zone): the tee's round ledge, the old drift winding
// along the top and down into the side of the fourth pillar, and the chain of
// rope bridges and round pillars to the green. The part of the chasm between
// them is a hole in the outline, gone round and back.
var laneW = []physics.Vec2{
	v(38.11, -0.25), v(25.98, 0.35), v(14.07, -0.05), v(6.61, 1.14), v(6.11, 1.43), v(5.42, 2.33),
	v(4, 5.76), v(3, 6.17), v(1.96, 6.96), v(1.17, 8), v(0.67, 9.21), v(0.5, 10.5), v(0.67, 11.79),
	v(1.17, 13), v(1.96, 14.04), v(3, 14.83), v(4.21, 15.33), v(5.5, 15.5), v(6.79, 15.33), v(8, 14.83),
	v(9.25, 13.75), v(17.43, 17.7), v(17.75, 18.8), v(18.16, 19.34), v(19.33, 20.01), v(20, 20.1),
	v(21.3, 19.75), v(21.84, 19.34), v(22.51, 18.17), v(22.57, 17.24), v(29.96, 11.86), v(31, 12.1),
	v(32.04, 11.86), v(39.43, 17.24), v(39.49, 18.17), v(40, 19.13), v(40, 14.44), v(33.57, 9.76),
	v(33.51, 8.83), v(33.25, 8.2), v(32.84, 7.66), v(31.67, 6.99), v(30.33, 6.99), v(29.7, 7.25),
	v(28.75, 8.2), v(28.49, 8.83), v(28.43, 9.76), v(21.04, 15.14), v(20, 14.9), v(19.33, 14.99),
	v(18.56, 15.36), v(10.38, 11.41), v(10.5, 10.5), v(10.33, 9.21), v(9.83, 8), v(9.04, 6.96),
	v(8.53, 6.58), v(9.09, 5.23), v(14.13, 4.46), v(25.93, 4.85), v(38, 4.25), v(40, 4.35), v(40, -0.15),
}

var laneE = []physics.Vec2{
	v(59.06, 10.22), v(61.94, 7.35), v(62.25, 6.18), v(61.54, 4.56), v(57.94, 1.36), v(50.26, 0.36),
	v(40, -0.15), v(40, 4.35), v(49.82, 4.84), v(56.01, 5.55), v(56.73, 6.22), v(56.47, 6.47),
	v(54.86, 6.68), v(53.78, 6.1), v(53, 6), v(51.5, 6.4), v(50.4, 7.5), v(50.1, 8.22), v(50.08, 9.61),
	v(42.97, 15.11), v(42, 14.9), v(40.96, 15.14), v(40, 14.44), v(40, 19.13), v(41.33, 20.01),
	v(42.67, 20.01), v(43.84, 19.34), v(44.51, 18.17), v(44.56, 17.17), v(51.67, 11.67), v(53, 12),
	v(54.52, 11.58), v(62.42, 16.84), v(62.49, 17.67), v(63.16, 18.84), v(63.7, 19.25), v(65, 19.6),
	v(66.3, 19.25), v(66.84, 18.84), v(67.57, 17.25), v(75.12, 13.76), v(76.96, 14.86), v(79.04, 14.86),
	v(80, 14.46), v(81.46, 13), v(82, 11), v(81.46, 9), v(80, 7.54), v(78, 7), v(76.96, 7.14), v(76, 7.54),
	v(74.54, 9), v(74.14, 9.96), v(74.05, 11.39), v(66.48, 14.89), v(65, 14.4), v(63.86, 14.68),
	v(58, 10.77),
}

// sway is a bridge's deck tipping one way for half of every 24 ticks, then
// (the same zone at phase+12, push reversed) the other way: never on
// together, and under MinRamp, so they launch nothing. push is across the
// bridge.
func sway(min, max, push physics.Vec2, phase int) []physics.Zone {
	return []physics.Zone{
		{Kind: physics.Slope, Min: min, Max: max, Vec: push, Mark: '=', Skin: "rope bridge", Every: 24, On: 12, Phase: phase},
		{Kind: physics.Slope, Min: min, Max: max, Vec: push.Scale(-1), Mark: '=', Skin: "rope bridge", Every: 24, On: 12, Phase: (phase + 12) % 24},
	}
}

// pick is the giant pickaxe's head, 2.5 by 0.8, s across the first bridge's
// approach (on the tee's ledge) from its line, there at its place in the
// swing: every 12 ticks it goes over and back, lingering at each end.
func pick(s float64, on, phase int) []physics.Wall {
	c, n := v(9.3-0.435*s, 12.3+0.9*s), v(-0.435, 0.9)
	return build.Timed(build.Bar(c.Sub(n.Scale(1.25)), c.Add(n.Scale(1.25)), 0.8, '|', "pickaxe"), 12, on, phase)
}

// prop is a timber prop of the old drift.
func prop(c physics.Vec2) physics.Post {
	return physics.Post{Circle: physics.Circle{C: c, R: 0.6}, Bounce: 0.6, Mark: 'o', Skin: "prop"}
}

// zones joins groups of zones.
func zones(groups ...[]physics.Zone) []physics.Zone {
	var out []physics.Zone
	for _, g := range groups {
		out = append(out, g...)
	}
	return out
}

// box is the board's edge, well clear of the lane.
var box = build.Box(v(0, -3), v(84, 22))

var me = author.Fit(&course.Simple{
	W: 84, H: 25,
	World:     "mines",
	Order:     4,
	Title:     "The Chasm",
	Strokes:   9, // par
	Tee:       tee,
	Pin:       v(80.2, 10), // beyond the winch post, on the green's far side
	Substeps:  30,
	CupRadius: 1.2,
	Shelter:   0.06,
	Course: &physics.Field{
		Walls: build.Walls(
			box,
			// the giant pickaxe, swinging over the first bridge's approach
			pick(-3.4, 3, 0), pick(-1.7, 1, 9), pick(0, 1, 8), pick(1.7, 1, 7),
			pick(3.4, 3, 6), pick(1.7, 1, 3), pick(0, 1, 2), pick(-1.7, 1, 1),
		),
		// the winch post in the middle of the green, in the line of the last
		// bridge: stop short of it, then go round
		Posts: []physics.Post{
			// the old drift's timber props, a chicane every few yards
			prop(v(15.36, 0.99)), prop(v(23.78, 3.78)), prop(v(32.26, 1.04)), prop(v(40.75, 3.39)),
			{Circle: physics.Circle{C: v(78, 11), R: 0.8}, Bounce: 0.6, Mark: 'o', Skin: "prop"},
		},
		Zones: zones(
			[]physics.Zone{
				{Kind: physics.Hazard, Min: v(-0.5, -3.5), Max: v(40, 22.5), Vec: tee, Poly: laneW, Outside: true, Skin: "void"},
				{Kind: physics.Hazard, Min: v(40, -3.5), Max: v(84.5, 22.5), Vec: tee, Poly: laneE, Outside: true, Skin: "void"},
				// rubble at the drift's bends, an ore heap on its way
				{Kind: physics.Surface, Min: v(5, 0.5), Max: v(11, 5.5), Scale: 0.6, Round: true, Mark: ',', Skin: "rubble"},
				{Kind: physics.Surface, Min: v(55.5, 2.5), Max: v(61.5, 8.5), Scale: 0.6, Round: true, Mark: ',', Skin: "rubble"},
				{Kind: physics.Surface, Min: v(43, 0.2), Max: v(49, 4.8), Scale: 0.45, Round: true, Mark: ',', Skin: "ore"},
			},
			sway(v(10.6, 11.6), v(18, 17.4), v(-0.0478, 0.0991), 0),
			sway(v(21.6, 10.2), v(29.4, 16.8), v(0.0647, 0.089), 8),
			sway(v(32.6, 10.2), v(40.4, 16.8), v(-0.0647, 0.089), 16),
			sway(v(43.5, 10), v(51.2, 16.8), v(0.0673, 0.087), 4),
			sway(v(55, 9.7), v(63.3, 16.5), v(-0.061, 0.0915), 20),
			sway(v(67.1, 11.6), v(74.6, 17), v(0.0461, 0.0999), 12),
		),
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
