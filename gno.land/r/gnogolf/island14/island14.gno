// Package island14 is a cup on a tiny island; the only way there is the cave,
// and the tide lays a log across the path to it every other stroke.
package island14

import (
	"math"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 50, H: 22,
	World:     "island",
	Order:     14,
	Title:     "Treasure Isle",
	Strokes:   3, // par
	Tee:       physics.V(5, 6),
	Pin:       physics.V(42, 16),
	Substeps:  24,
	CupRadius: 1.2,

	// the tide washes a log of driftwood across the path to the cave on
	// your first stroke, and takes it away for the next: lay up, then in
	Pulses: []course.Pulse{{
		Every: 2, On: 1, Offset: 0,
		Walls: physics.Soft(physics.Bar(physics.V(20.2, 4.2), physics.V(20.8, 10.6), 0.8, '#', "driftwood"), 0.4),
	}},
	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(6, 4, physics.V(5, 6), physics.V(17, 8), physics.V(26, 6))...),
			physics.Outline(physics.Arc(physics.V(40, 15), 5.2, 0, 2*math.Pi, 14)[:14]...),
		),
		Zones: []physics.Zone{
			{Kind: physics.Tunnel, Min: physics.V(23.5, 3.7), Max: physics.V(28.5, 8.3), Vec: physics.V(36.8, 15), Round: true, Skin: "cave"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
