// Package hole1 is a lane that bends one way and back, with a shelf across
// half of it where it changes direction: go round its open end. A stump
// stands off to one side on the way.
package hole1

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	World: "garden", Order: 1,
	W: 50, H: 15,
	Title:     "The Shelf",
	Strokes:   3, // par
	Tee:       physics.V(5, 6),
	Pin:       physics.V(44, 6),
	Substeps:  24,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(6, 4, physics.V(5, 6), physics.V(20, 10), physics.V(34, 4), physics.V(44, 6))...),
			// from the outer bank to just short of the middle
			physics.Bar(physics.V(28.4, 10.2), physics.V(26.8, 6.5), 0.8, '=', "shelf"),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(12, 6.3), R: 0.7}, Bounce: 0.6, Skin: "stump"},
		},
		Friction: 0.86,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register lists this hole's realm with golf, from here or from its own
// init(cur realm): as a community hole, and under golf's namespace only once
// golf's owner expects this path. The course plays the hole as data
// (data/holes.txt), which the owner publishes.
func Register(cur realm) { golf.Register(cross(cur), me) }
