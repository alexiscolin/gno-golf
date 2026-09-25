// Package island1 is a gentle bend along the beach, one palm leaning over it.
package island1

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var lane = physics.Lane(6, 4, physics.V(5, 6), physics.V(19, 9), physics.V(33, 7))

var me = course.Fit(&course.Simple{
	W: 38, H: 15,
	World:     "island",
	Order:     1,
	Title:     "Sandy Start",
	Strokes:   2, // par
	Tee:       physics.V(5, 6),
	Pin:       physics.V(33, 7),
	Substeps:  22,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(lane...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(19, 7.2), R: 0.6}, Bounce: 0.8, Skin: "palm"},
		},
		Zones: []physics.Zone{
			{Kind: physics.Surface, Min: physics.V(24, 6), Max: physics.V(29, 10.5), Scale: 0.6, Round: true, Skin: "wetsand"},
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
