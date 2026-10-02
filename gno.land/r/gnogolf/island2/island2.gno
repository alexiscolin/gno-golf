// Package island2 is a sand spit that curls in on itself like a shell, the cup
// at its heart.
package island2

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

var lane = build.Lane(5, 2, physics.V(5, 5), physics.V(30, 5), physics.V(38, 13), physics.V(30, 21), physics.V(14, 20), physics.V(12, 13), physics.V(22, 12.5))

var me = author.Fit(&course.Simple{
	W: 44, H: 26,
	World:     "island",
	Order:     2,
	Title:     "Snail Shell",
	Strokes:   4, // par
	Tee:       physics.V(5, 5),
	Pin:       physics.V(22, 12.5),
	Substeps:  30,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: build.Walls(
			build.Outline(lane...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(37.2, 13), R: 0.6}, Bounce: 0.8, Skin: "palm"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
