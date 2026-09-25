// Package hole8 is a lane of lively bumpers.
package hole8

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

var me = course.Fit(&course.Simple{
	World: "garden", Order: 8,
	W: 40, H: 11,
	Title:     "Pinball",
	Strokes:   3, // par
	Tee:       physics.V(4, 5.5),
	Pin:       physics.V(36, 5.5),
	Substeps:  22,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Stadium(physics.V(0, 0), physics.V(40, 11), 6)...),
			// a pile of logs off the low bank: it soaks up a ball, bumpers do not
			physics.Soft(physics.Bar(physics.V(32, 0.6), physics.V(32, 3.4), 0.9, '=', "logs"), 0.5),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(11, 3.2), R: 1.0}, Bounce: 1.25, Skin: "bumper"},
			{Circle: physics.Circle{C: physics.V(11, 7.8), R: 1.0}, Bounce: 1.25, Skin: "bumper"},
			{Circle: physics.Circle{C: physics.V(19, 5.5), R: 1.2}, Bounce: 1.3, Skin: "bumper"},
			{Circle: physics.Circle{C: physics.V(27, 3.2), R: 1.0}, Bounce: 1.25, Skin: "bumper"},
			{Circle: physics.Circle{C: physics.V(27, 7.8), R: 1.0}, Bounce: 1.25, Skin: "bumper"},
			// across from the logs, guarding the low bank shot to the cup
			{Circle: physics.Circle{C: physics.V(32, 8.2), R: 0.8}, Bounce: 1.25, Skin: "bumper"},
		},
		Friction: 0.86,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
