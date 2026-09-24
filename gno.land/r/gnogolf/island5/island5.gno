// Package island5 is a beach where every other stroke a wave washes across and takes the ball back with it.
package island5

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var lane = physics.Lane(6, 4, physics.V(5, 6), physics.V(22, 8), physics.V(42, 6))

var me = course.Fit(&course.Simple{
	W: 48, H: 14,
	World:     "island",
	Order:     5,
	Title:     "Tide Line",
	Strokes:   3, // par
	Tee:       physics.V(5, 6),
	Pin:       physics.V(42, 6),
	Substeps:  26,
	CupRadius: 1.2,

	Pulses: []course.Pulse{
		{Every: 2, On: 1, Offset: 1, Zones: []physics.Zone{{Kind: physics.Hazard, Min: physics.V(19, 0), Max: physics.V(23, 14), Vec: physics.V(12, 7.2), Skin: "wave"}}},
	},

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(lane...),
		),
		Zones: []physics.Zone{
			{Kind: physics.Surface, Min: physics.V(27, 4.5), Max: physics.V(32, 10), Scale: 0.6, Round: true, Skin: "wetsand"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
