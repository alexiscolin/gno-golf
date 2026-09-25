// Package town17 is up the market lane to a T junction: the cup is down the
// left, where a stall's awning comes down across the way every other stroke.
package town17

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

var me = course.Fit(&course.Simple{
	W: 44, H: 24,
	World:     "town",
	Order:     17,
	Title:     "Night Market",
	Strokes:   3, // par
	Tee:       physics.V(22, 19.5),
	Pin:       physics.V(5, 5),
	Substeps:  26,
	CupRadius: 1.2,

	Pulses: []course.Pulse{
		{Every: 2, On: 1, Phase: 1, Walls: physics.Walls(physics.Bar(physics.V(13, 2.4), physics.V(13, 7.6), 0.8, '#', "awning"))},
	},

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.V(2, 2), physics.V(42, 2), physics.V(42, 8), physics.V(25, 8), physics.V(25, 22), physics.V(19, 22), physics.V(19, 8), physics.V(2, 8)),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(22, 12), R: 0.35}, Bounce: 0.9, Skin: "lamp"},
			{Circle: physics.Circle{C: physics.V(33, 5), R: 0.35}, Bounce: 0.9, Skin: "lamp"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
