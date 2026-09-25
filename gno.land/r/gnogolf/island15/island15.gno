// Package island15 is the blowhole: an inlet of the sea cuts into the rock
// across the straight line to the cup, and in front of it is a blowhole.
// Every so often the sea spouts through it: a ball that rolls over the hole
// while it spouts is thrown over the inlet and carries on; one that rolls
// over it between spouts goes on into the water. Or take the long way, round
// the head of the inlet under the cliff.
package island15

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 48, H: 24,
	World:     "island",
	Order:     15,
	Title:     "The Blowhole",
	Strokes:   3, // par
	Tee:       physics.V(5, 15),
	Pin:       physics.V(42, 18),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			// the cliff along the top is jagged: a bank off it never runs true
			physics.Outline(physics.V(2, 4), physics.V(20, 2), physics.V(25, 3.6), physics.V(30, 2.3), physics.V(35, 4.4), physics.V(40, 3), physics.V(46, 4),
				physics.V(46, 20), physics.V(30, 21.5), physics.V(2, 20)),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(34, 8.5), R: 0.9}, Bounce: 0.6, Skin: "outcrop"},
		},
		Zones: []physics.Zone{
			// the blowhole: it spouts 4 substeps in 12, and a ball on it then
			// is thrown over the inlet, heading on the way it went
			{Kind: physics.Tunnel, Min: physics.V(18, 13), Max: physics.V(21, 17), Vec: physics.V(31, 15), Mark: 'O', Skin: "blowhole", Round: true, Every: 12, On: 4},
			// the inlet: the sea, cut into the rock from the shore
			{Kind: physics.Hazard, Min: physics.V(21.3, 6.5), Max: physics.V(30.3, 21.8), Vec: physics.V(15, 15), Mark: '~', Skin: "sea",
				Poly: []physics.Vec2{physics.V(21.3, 21.3), physics.V(22, 12), physics.V(24, 8), physics.V(26.5, 6.5), physics.V(29, 8.5), physics.V(30, 12), physics.V(30.3, 21.8)}},
			// wet sand where a thrown ball comes down, so it does not run on past the cup
			{Kind: physics.Surface, Min: physics.V(32, 11), Max: physics.V(38, 19), Scale: 0.5, Round: true, Mark: ',', Skin: "wetsand"},
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
