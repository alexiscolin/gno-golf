// Package town13 is a roundabout with the cup on its far side: go round, never
// across.
package town13

import (
	"math"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

var me = course.Fit(&course.Simple{
	W: 40, H: 24,
	World:     "town",
	Order:     13,
	Title:     "Roundabout",
	Strokes:   2, // par
	Tee:       physics.V(12, 12),
	Pin:       physics.V(28.5, 12),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Arc(physics.V(20, 12), 10, 0, 2*math.Pi, 20)[:20]...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(20, 12), R: 3.2}, Bounce: 0.8, Skin: "roundabout"},
			{Circle: physics.Circle{C: physics.V(20, 4.6), R: 0.35}, Bounce: 0.9, Skin: "lamp"},
			{Circle: physics.Circle{C: physics.V(20, 19.4), R: 0.35}, Bounce: 0.9, Skin: "lamp"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
