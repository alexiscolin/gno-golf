// Package island11 is a narrow rope bridge whose loose planks swing up and down as you cross.
package island11

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var lane = physics.Lane(4, 4, physics.V(5, 8), physics.V(25, 7), physics.V(45, 8))

var me = course.Fit(&course.Simple{
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
		Walls: physics.Walls(
			physics.Outline(lane...),
			physics.Timed(physics.Bar(physics.V(18, 5.4), physics.V(18, 8.8), 0.5, '=', "plank"), 8, 4, 0),
			physics.Timed(physics.Bar(physics.V(32, 5.4), physics.V(32, 8.8), 0.5, '=', "plank"), 8, 4, 4),
		),
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
