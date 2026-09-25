// Package mountain5 is a kicker, then a crevasse across the lane: hit the ramp
// hard enough to fly it.
package mountain5

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

var me = course.Fit(&course.Simple{
	W: 50, H: 14,
	World:     "mountain",
	Order:     5,
	Title:     "Crevasse Jump",
	Strokes:   2, // par
	Tee:       physics.V(5, 7),
	Pin:       physics.V(45, 7),
	Substeps:  28,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(6, 4, physics.V(5, 7), physics.V(25, 7), physics.V(45, 7))...),
		),
		Zones: []physics.Zone{
			{Kind: physics.Slope, Min: physics.V(15, 0), Max: physics.V(19, 14), Vec: physics.V(-0.35, 0), Skin: "kicker"},
			{Kind: physics.Hazard, Min: physics.V(19.5, 0), Max: physics.V(22.5, 14), Vec: physics.V(5, 7), Skin: "crevasse"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
