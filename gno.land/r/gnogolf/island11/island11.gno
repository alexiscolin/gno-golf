// Package island11 is a narrow rope bridge whose loose planks swing up and
// down as you cross.
package island11

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

var lane = build.Lane(4, 4, physics.V(5, 8), physics.V(25, 7), physics.V(45, 8))

var me = author.Fit(&course.Simple{
	W: 50, H: 16,
	World:     "island",
	Order:     11,
	Title:     "Rope Bridge",
	Strokes:   2, // par
	Tee:       physics.V(5, 8),
	Pin:       physics.V(45, 8),
	Substeps:  28,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: build.Walls(
			build.Outline(lane...),
			build.Timed(build.Bar(physics.V(18, 5.4), physics.V(18, 8.8), 0.5, '=', "plank"), 8, 4, 0),
			build.Timed(build.Bar(physics.V(32, 5.4), physics.V(32, 8.8), 0.5, '=', "plank"), 8, 4, 4),
		),
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
