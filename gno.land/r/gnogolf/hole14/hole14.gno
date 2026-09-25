// Package hole14 is the longest walk in the garden: a lane that meanders from
// bed to bed, splitting round a planted island a third of the way, and
// swinging twice more before the cup.
package hole14

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

var me = course.Fit(&course.Simple{
	W: 84, H: 16,
	World:     "garden",
	Order:     13,
	Title:     "The Long Meander",
	Strokes:   4, // par
	Tee:       physics.V(4, 8),
	Pin:       physics.V(80, 8),
	Substeps:  30,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Stadium(physics.V(29.4, 10.9), physics.V(34.6, 13.1), 3)...),
			physics.Outline(physics.Lane(6.5, 2, physics.V(4, 8), physics.V(18, 4), physics.V(32, 12), physics.V(46, 4), physics.V(60, 12), physics.V(74, 5), physics.V(80, 8))...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(46, 5.2), R: 0.8}, Bounce: 1.2, Skin: "bumper"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
