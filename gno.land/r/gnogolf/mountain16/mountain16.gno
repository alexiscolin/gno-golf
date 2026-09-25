// Package mountain16 is a long downhill run with the cup on a landing halfway:
// too hard and you run to the bottom, by the cliff edge, and must come back
// up. An avalanche comes down across the run above the landing every other
// stroke, the first one included: lay up above it, then run down to the cup.
package mountain16

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

var me = course.Fit(&course.Simple{
	W: 58, H: 16,
	World:     "mountain",
	Order:     16,
	Title:     "Downhill Run",
	Strokes:   3, // par
	Tee:       physics.V(5, 10),
	Pin:       physics.V(24, 6.2),
	Substeps:  30,
	CupRadius: 1.2,

	// an avalanche heap across the run above the landing on your first
	// stroke (and every other one), its warning there on the strokes between
	Pulses: []course.Pulse{
		{Every: 2, On: 1, Phase: 0, Walls: physics.Walls(physics.Soft(physics.Bar(physics.V(19.6, 3.2), physics.V(20.4, 10.8), 1.4, '#', "avalanche"), 0.3))},
		{Every: 2, On: 1, Phase: 1, Zones: []physics.Zone{{Kind: physics.Slope, Min: physics.V(19, 3.6), Max: physics.V(21, 10.4), Skin: "avalanche-warn"}}},
	},
	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(6, 4, physics.V(5, 10), physics.V(25, 6), physics.V(45, 10), physics.V(52, 8))...),
		),
		Zones: []physics.Zone{
			{Kind: physics.Slope, Min: physics.V(8, 0), Max: physics.V(18.5, 16), Vec: physics.V(0.2, 0), Skin: "downhill"},
			{Kind: physics.Slope, Min: physics.V(26, 0), Max: physics.V(50, 16), Vec: physics.V(0.2, 0), Skin: "downhill"},
			{Kind: physics.Surface, Min: physics.V(34, 7.5), Max: physics.V(39, 12.5), Scale: 0.5, Round: true, Skin: "snowdrift"},
			{Kind: physics.Hazard, Min: physics.V(55, 5), Max: physics.V(57.5, 11), Vec: physics.V(5, 10), Skin: "cliff"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
