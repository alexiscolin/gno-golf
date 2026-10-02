// Package town16 is a town square with a railed garden in the middle and the
// cup in the far corner: round it either way, past a street lamp on each side.
package town16

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

var me = author.Fit(&course.Simple{
	W: 28, H: 28,
	World:     "town",
	Order:     16,
	Title:     "Square Garden",
	Strokes:   3, // par
	Tee:       physics.V(5, 5),
	Pin:       physics.V(23, 23),
	Substeps:  24,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: build.Walls(
			build.Outline(physics.V(2, 2), physics.V(26, 2), physics.V(26, 26), physics.V(2, 26)),
			build.Outline(physics.V(9, 9), physics.V(19, 9), physics.V(19, 19), physics.V(9, 19)),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(14, 5.5), R: 0.35}, Bounce: 0.9, Skin: "lamp"},
			{Circle: physics.Circle{C: physics.V(22.5, 14), R: 0.35}, Bounce: 0.9, Skin: "lamp"},
			// and their mirror images across the diagonal: a lamp on every side
			{Circle: physics.Circle{C: physics.V(5.5, 14), R: 0.35}, Bounce: 0.9, Skin: "lamp"},
			{Circle: physics.Circle{C: physics.V(14, 22.5), R: 0.35}, Bounce: 0.9, Skin: "lamp"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
