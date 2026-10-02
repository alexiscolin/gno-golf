// Package mountain9 is under the avalanche slopes: every stroke a heap of snow
// comes down across half the road at one bend or the other, and you see which
// the stroke before.
package mountain9

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

var me = author.Fit(&course.Simple{
	W: 58, H: 20,
	World:     "mountain",
	Order:     9,
	Title:     "Avalanche",
	Strokes:   4, // par
	Tee:       physics.V(5, 5),
	Pin:       physics.V(54, 12),
	Substeps:  28,
	CupRadius: 1.2,

	Pulses: []course.Pulse{
		{Every: 2, On: 1, Phase: 0, Zones: []physics.Zone{{Kind: physics.Slope, Min: physics.V(39.3, 1.5), Max: physics.V(40.7, 9.1), Skin: "avalanche-warn"}}, Walls: build.Walls(build.Soft(build.Bar(physics.V(21.2, 11), physics.V(22.2, 15.8), 1.4, '#', "avalanche"), 0.3))},
		{Every: 2, On: 1, Phase: 1, Zones: []physics.Zone{{Kind: physics.Slope, Min: physics.V(20.5, 10.3), Max: physics.V(22.9, 16.5), Skin: "avalanche-warn"}}, Walls: build.Walls(build.Soft(build.Bar(physics.V(40, 8.4), physics.V(40, 2.2), 1.4, '#', "avalanche"), 0.3))},
	},

	Course: &physics.Field{
		Walls: build.Walls(
			build.Outline(build.Lane(7, 3, physics.V(5, 5), physics.V(22, 14), physics.V(40, 5), physics.V(54, 12))...),
		),
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
