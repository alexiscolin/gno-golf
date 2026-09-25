// Package island10 is a boardwalk over the lagoon with two planks missing:
// one on the near half of the walk, one on the far half of the last stretch.
// A gap is the lagoon, and the lagoon sends you back to the start; thread the
// sound boards between them, and round the crab asleep where the walk turns.
package island10

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var lane = physics.Lane(6, 4, physics.V(5, 5), physics.V(20, 5), physics.V(30, 10), physics.V(44, 10))

var me = course.Fit(&course.Simple{
	W: 50, H: 16,
	World:     "island",
	Order:     10,
	Title:     "Broken Boardwalk",
	Strokes:   3, // par
	Tee:       physics.V(5, 5),
	Pin:       physics.V(44, 10),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Outline(lane...),
		// a crab sunning itself in the middle of the walk, where it turns
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(24, 7), R: 0.6}, Bounce: 0.8, Skin: "crab"},
		},
		Zones: []physics.Zone{
			// the missing planks: the top half (on screen) of the first stretch, the bottom half of the last
			{Kind: physics.Hazard, Min: physics.V(13, 1.5), Max: physics.V(16, 5.2), Vec: physics.V(5, 5), Mark: '~', Skin: "gap"},
			{Kind: physics.Hazard, Min: physics.V(34, 9.8), Max: physics.V(37, 13.5), Vec: physics.V(5, 5), Mark: '~', Skin: "gap"},
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
