// Package town2 is the market square on market day: rows of stalls with gaps
// between, and no two gaps in line.
package town2

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

var me = course.Fit(&course.Simple{
	W: 48, H: 20,
	World:     "town",
	Order:     2,
	Title:     "Market Square",
	Strokes:   3, // par
	Tee:       physics.V(6, 10),
	Pin:       physics.V(42, 10),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.V(-5.0, 18.0), physics.V(53.0, 18.0), physics.V(53.0, 2.0), physics.V(-5.0, 2.0)),
			physics.Bar(physics.V(14, 2.6), physics.V(14, 7.2), 1.2, '#', "stall"),
			physics.Bar(physics.V(14, 12.4), physics.V(14, 17.4), 1.2, '#', "stall"),
			physics.Bar(physics.V(24, 7.4), physics.V(24, 12.6), 1.2, '#', "stall"),
			physics.Bar(physics.V(34, 2.6), physics.V(34, 5.8), 1.2, '#', "stall"),
			physics.Bar(physics.V(34, 10.6), physics.V(34, 17.4), 1.2, '#', "stall"),
		),
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
