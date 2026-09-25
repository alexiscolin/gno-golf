// Package town7 is a lane the canal cuts in two, with a narrow bridge the only
// dry way over and street lamps on the far bank.
package town7

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

var me = course.Fit(&course.Simple{
	W: 48, H: 16,
	World:     "town",
	Order:     7,
	Title:     "Canal Bridge",
	Strokes:   3, // par
	Tee:       physics.V(5, 7),
	Pin:       physics.V(43, 8),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(8, 4, physics.V(5, 7), physics.V(24, 9), physics.V(43, 8))...),
		),
		// street lamps on the far bank: one at the foot of the bridge, two in
		// the lines off it to the cup
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(26.7, 10.3), R: 0.35}, Bounce: 0.9, Skin: "lamp"},
			{Circle: physics.Circle{C: physics.V(32.9, 7.7), R: 0.35}, Bounce: 0.9, Skin: "lamp"},
			{Circle: physics.Circle{C: physics.V(39.7, 8.8), R: 0.35}, Bounce: 0.9, Skin: "lamp"},
		},
		Zones: []physics.Zone{
			{Kind: physics.Hazard, Min: physics.V(21, 0), Max: physics.V(26, 7.9), Vec: physics.V(15, 8.4), Skin: "canal"},
			{Kind: physics.Hazard, Min: physics.V(21, 10.5), Max: physics.V(26, 16), Vec: physics.V(15, 8.4), Skin: "canal"},
			{Kind: physics.Surface, Min: physics.V(21, 7.9), Max: physics.V(26, 10.5), Scale: 1, Skin: "bridge"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
