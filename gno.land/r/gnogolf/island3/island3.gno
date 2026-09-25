// Package island3 is a wide beach of sand mounds with two crabs that take
// turns popping up between them: pick your line.
package island3

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var lane = physics.Lane(10, 4, physics.V(5, 9), physics.V(24, 10), physics.V(44, 8))

var me = course.Fit(&course.Simple{
	W: 50, H: 20,
	World:     "island",
	Order:     3,
	Title:     "Crab Beach",
	Strokes:   2, // par
	Tee:       physics.V(5, 9),
	Pin:       physics.V(44, 8),
	Substeps:  26,
	CupRadius: 1.2,

	Pulses: []course.Pulse{
		{Every: 2, On: 1, Phase: 0, Posts: []physics.Post{{Circle: physics.Circle{C: physics.V(23, 9.6), R: 0.8}, Bounce: 0.9, Skin: "crab"}}},
		{Every: 2, On: 1, Phase: 1, Posts: []physics.Post{{Circle: physics.Circle{C: physics.V(37, 8.4), R: 0.8}, Bounce: 0.9, Skin: "crab"}}},
	},

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(lane...),
		),
		Zones: []physics.Zone{
			{Kind: physics.Slope, Min: physics.V(13.6, 4.6), Max: physics.V(15.5, 9.4), Vec: physics.V(-0.3, 0), Skin: "mound"},
			{Kind: physics.Slope, Min: physics.V(16.5, 4.6), Max: physics.V(18.4, 9.4), Vec: physics.V(0.3, 0), Skin: "mound"},
			{Kind: physics.Slope, Min: physics.V(15.5, 7.5), Max: physics.V(16.5, 9.4), Vec: physics.V(0, 0.3), Skin: "mound"},
			{Kind: physics.Slope, Min: physics.V(15.5, 4.6), Max: physics.V(16.5, 6.5), Vec: physics.V(0, -0.3), Skin: "mound"},
			{Kind: physics.Slope, Min: physics.V(28.6, 10.0), Max: physics.V(30.5, 14.8), Vec: physics.V(-0.3, 0), Skin: "mound"},
			{Kind: physics.Slope, Min: physics.V(31.5, 10.0), Max: physics.V(33.4, 14.8), Vec: physics.V(0.3, 0), Skin: "mound"},
			{Kind: physics.Slope, Min: physics.V(30.5, 12.9), Max: physics.V(31.5, 14.8), Vec: physics.V(0, 0.3), Skin: "mound"},
			{Kind: physics.Slope, Min: physics.V(30.5, 10.0), Max: physics.V(31.5, 11.9), Vec: physics.V(0, -0.3), Skin: "mound"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register lists this hole's realm with golf, from here or from its own
// init(cur realm): as a community hole, and under golf's namespace only once
// golf's owner expects this path. The course plays the hole as data
// (data/holes.txt), which the owner publishes.
func Register(cur realm) { golf.Register(cross(cur), me) }
