// Package town8 is the square under the clock tower, whose great hand sweeps
// round the lane as the ball rolls.
package town8

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 44, H: 22,
	World:     "town",
	Order:     8,
	Title:     "Clock Tower",
	Strokes:   2, // par
	Tee:       physics.V(5, 9),
	Pin:       physics.V(39, 9),
	Substeps:  28,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(11, 4, physics.V(5, 9), physics.V(22, 11), physics.V(39, 9))...),
			physics.Timed(physics.Bar(physics.V(17.8, 10.8), physics.V(26.2, 10.8), 0.4, '#', "clock hand"), 8, 2, 0),
			physics.Timed(physics.Bar(physics.V(19.03018, 7.83018), physics.V(24.96982, 13.769820000000001), 0.4, '#', "clock hand"), 8, 2, 6),
			physics.Timed(physics.Bar(physics.V(22.0, 6.6000000000000005), physics.V(22.0, 15.0), 0.4, '#', "clock hand"), 8, 2, 4),
			physics.Timed(physics.Bar(physics.V(24.96982, 7.83018), physics.V(19.03018, 13.769820000000001), 0.4, '#', "clock hand"), 8, 2, 2),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(22, 10.8), R: 1.0}, Bounce: 0.8, Skin: "clock"},
		},
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
