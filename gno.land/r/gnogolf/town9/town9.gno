// Package town9 is the narrow alleys behind the bakery: four corners, no
// curves, and a stump in the way.
package town9

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 48, H: 18,
	World:     "town",
	Order:     9,
	Title:     "Back Alleys",
	Strokes:   4, // par
	Tee:       physics.V(4, 4),
	Pin:       physics.V(44, 4),
	Substeps:  28,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.V(2.0, 6.0), physics.V(16.0, 6.0), physics.V(16.0, 16.0), physics.V(34.0, 16.0), physics.V(34.0, 6.0), physics.V(47.0, 6.0), physics.V(47.0, 2.0), physics.V(30.0, 2.0), physics.V(30.0, 12.0), physics.V(20.0, 12.0), physics.V(20.0, 2.0), physics.V(2.0, 2.0)),
			physics.Soft(physics.Bar(physics.V(32.1, 9.6), physics.V(33.3, 8.6), 0.6, '#', "logs"), 0.4),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(25, 14.6), R: 0.6}, Bounce: 0.6, Skin: "stump"},
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
