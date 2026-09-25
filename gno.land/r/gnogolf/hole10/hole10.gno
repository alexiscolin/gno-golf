// Package hole10 is a round green ringed with toadstools, and one way in.
package hole10

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

var me = course.Fit(&course.Simple{
	// moved out of the garden's eighteen: kept, listed under extras
	World: "extras", Order: 10,
	W: 41, H: 16,
	Title:     "Toadstool Ring",
	Strokes:   2, // par
	Tee:       physics.V(4, 8),
	Pin:       physics.V(33, 8),
	Substeps:  22,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Outline(physics.Keyhole(0, 8, physics.V(33, 8), 7.5, 5)...),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(36.8, 8.0), R: 1.1}, Bounce: 1.2, Skin: "bumper"},
			{Circle: physics.Circle{C: physics.V(34.9, 11.29), R: 1.1}, Bounce: 1.2, Skin: "bumper"},
			{Circle: physics.Circle{C: physics.V(31.1, 11.29), R: 1.1}, Bounce: 1.2, Skin: "bumper"},
			{Circle: physics.Circle{C: physics.V(31.1, 4.71), R: 1.1}, Bounce: 1.2, Skin: "bumper"},
			{Circle: physics.Circle{C: physics.V(34.9, 4.71), R: 1.1}, Bounce: 1.2, Skin: "bumper"},
		},
		Friction: 0.86,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
