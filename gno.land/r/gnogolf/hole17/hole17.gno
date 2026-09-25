// Package hole17 is a crossroads of toadstools: the side arms are where bad
// shots go.
package hole17

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

var me = course.Fit(&course.Simple{
	World: "garden", Order: 15,
	W: 40, H: 20,
	Title:     "The Nursery",
	Strokes:   3, // par
	Tee:       physics.V(3, 10),
	Pin:       physics.V(37, 10),
	Substeps:  22,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Path(
				physics.Pts(physics.V(0, 6), physics.V(16, 6), physics.V(16, 0), physics.V(24, 0), physics.V(24, 6), physics.V(40, 6), physics.V(40, 14), physics.V(24, 14), physics.V(24, 20), physics.V(16, 20), physics.V(16, 14), physics.V(0, 14)),
			)...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(10, 8), R: 0.7}, Bounce: 1.15, Skin: "bumper"},
			{Circle: physics.Circle{C: physics.V(10, 12), R: 0.7}, Bounce: 1.15, Skin: "bumper"},
			{Circle: physics.Circle{C: physics.V(20, 10), R: 1.0}, Bounce: 1.2, Skin: "bumper"},
			{Circle: physics.Circle{C: physics.V(30, 8), R: 0.7}, Bounce: 1.15, Skin: "bumper"},
			{Circle: physics.Circle{C: physics.V(30, 12), R: 0.7}, Bounce: 1.15, Skin: "bumper"},
			{Circle: physics.Circle{C: physics.V(20, 3), R: 1.1}, Bounce: 1.2, Skin: "bumper"},
			{Circle: physics.Circle{C: physics.V(20, 17), R: 1.1}, Bounce: 1.2, Skin: "bumper"},
		},
		Friction: 0.86,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
