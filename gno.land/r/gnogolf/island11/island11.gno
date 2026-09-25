// Package island11 is a narrow rope bridge whose loose planks swing up and
// down as you cross.
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

// Register lists this hole's realm with golf, from here or from its own
// init(cur realm): as a community hole, and under golf's namespace only once
// golf's owner expects this path. The course plays the hole as data
// (data/holes.txt), which the owner publishes.
func Register(cur realm) { golf.Register(cross(cur), me) }
