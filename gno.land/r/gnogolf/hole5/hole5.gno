// Package hole5 is a lane through a gate to a round green, and the gate shuts
// every other stroke: shut for the first, so the tee shot lays up and the
// second goes through.
package hole5

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

var me = course.Fit(&course.Simple{
	World: "garden", Order: 5,
	W: 43, H: 14,
	Title:     "The Gate",
	Strokes:   3, // par
	Tee:       physics.V(4, 7),
	Pin:       physics.V(36, 7),
	Substeps:  22,
	CupRadius: 1.2,

	// the gate: shut for your first stroke, open for the second, shut again…
	Pulses: []course.Pulse{{
		Every: 2, On: 1, Phase: 0,
		Walls: physics.Bar(physics.V(18, 5.5), physics.V(18, 8.5), 0.8, '=', "gate door"),
	}},
	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Keyhole(0, 8, physics.V(36, 7), 6.5, 5)...),
			physics.Bar(physics.V(18, 3), physics.V(18, 5.5), 0.8, '|', "gate"),
			physics.Bar(physics.V(18, 8.5), physics.V(18, 11), 0.8, '|', "gate"),
		),
		Zones: []physics.Zone{
			// a flowerbed on the straight line to the gate: through it slowly, or round it
			{Kind: physics.Surface, Min: physics.V(8, 5.3), Max: physics.V(12, 8.7), Scale: 0.45, Mark: '*', Skin: "flowerbed", Round: true},
		},
		Friction: 0.86,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
