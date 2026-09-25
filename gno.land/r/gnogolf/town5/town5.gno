// Package town5 is a mushroom house in the middle of the lane: squeeze round
// it, or knock and go through the front door.
package town5

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 48, H: 16,
	World:     "town",
	Order:     5,
	Title:     "Mushroom House",
	Strokes:   2, // par
	Tee:       physics.V(5, 8),
	Pin:       physics.V(43, 8),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(8, 4, physics.V(5, 8), physics.V(24, 9), physics.V(43, 8))...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(24, 9), R: 2.4}, Bounce: 0.7, Skin: "house"},
		},
		Zones: []physics.Zone{
			{Kind: physics.Tunnel, Min: physics.V(19.4, 8.0), Max: physics.V(21.2, 10.0), Vec: physics.V(28.4, 9), Round: true, Skin: "door"},
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
