// Package town3 is a street into the square, and the cup behind the fountain in its middle,
// between two street lamps.
package town3

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 40, H: 16,
	World:     "town",
	Order:     3,
	Title:     "Fountain Square",
	Strokes:   3, // par
	Tee:       physics.V(4, 8),
	Pin:       physics.V(36.5, 8),
	Substeps:  24,
	CupRadius: 1.2,

	// the houses round the square keep the worst of the wind off it
	Shelter: 0.08,
	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Keyhole(0, 6, physics.V(31, 8), 7, 5)...),
		),
		// two street lamps by the cup, one each side of the way round the fountain
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(35.5, 10.8), R: 0.35}, Bounce: 0.9, Skin: "lamp"},
			{Circle: physics.Circle{C: physics.V(35.5, 5.2), R: 0.35}, Bounce: 0.9, Skin: "lamp"},
		},
		Zones: []physics.Zone{
			{Kind: physics.Hazard, Min: physics.V(28.7, 5.7), Max: physics.V(33.3, 10.3), Vec: physics.V(24, 8), Round: true, Skin: "fountain"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
