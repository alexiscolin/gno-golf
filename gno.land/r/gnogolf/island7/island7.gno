// Package island7 is a round islet cut in two by a great sandcastle and its
// ramparts: the only way through is the tube that spirals round it, and a soft
// shot rolls back out.
package island7

import (
	"math"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

var me = course.Fit(&course.Simple{
	W: 32, H: 26,
	World:     "island",
	Order:     7,
	Title:     "The Sandcastle",
	Strokes:   3, // par
	Tee:       physics.V(7, 13),
	Pin:       physics.V(25, 13),
	Substeps:  24,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Arc(physics.V(16, 13), 11, 0, 2*math.Pi, 20)[:20]...),
			// the ramparts, castle to shore: there is no way round, only
			// through the tube
			[]physics.Wall{
				{Seg: physics.Segment{A: physics.V(17, 1.8), B: physics.V(17, 10.2)}, Skin: "rampart"},
				{Seg: physics.Segment{A: physics.V(17, 15.8), B: physics.V(17, 24.2)}, Skin: "rampart"},
			},
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(17, 13), R: 3.2}, Bounce: 0.6, Skin: "sandcastle"},
		},
		Zones: []physics.Zone{
			// the tube spirals up round the castle: hit it hard enough and the
			// ball comes out by the cup, too soft and it rolls back out. The
			// mouth is 2 deep, more than a move (physics.MaxMove), or a strong
			// ball would step over it and meet the castle instead.
			{Kind: physics.Loop, Min: physics.V(11.4, 12.2), Max: physics.V(13.4, 13.8), Vec: physics.V(21.6, 17), Scale: 2, Skin: "castle tube"},
			{Kind: physics.Slope, Min: physics.V(9.5, 5), Max: physics.V(11.1, 9), Vec: physics.V(-0.3, 0), Skin: "mound"},
			{Kind: physics.Slope, Min: physics.V(11.9, 5), Max: physics.V(13.5, 9), Vec: physics.V(0.3, 0), Skin: "mound"},
			{Kind: physics.Slope, Min: physics.V(11.1, 7.4), Max: physics.V(11.9, 9), Vec: physics.V(0, 0.3), Skin: "mound"},
			{Kind: physics.Slope, Min: physics.V(11.1, 5), Max: physics.V(11.9, 6.6), Vec: physics.V(0, -0.3), Skin: "mound"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
