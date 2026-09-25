// Package island13 is a ring round the lagoon: cut the bend too close and you
// are in it.
package island13

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

var me = course.Fit(&course.Simple{
	W: 46, H: 23,
	World:     "island",
	Order:     13,
	Title:     "Lagoon Ring",
	Strokes:   3, // par
	Tee:       physics.V(5, 4),
	Pin:       physics.V(6, 18),
	Substeps:  28,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(6, 3, physics.V(5, 4), physics.V(30, 4), physics.V(39, 11), physics.V(30, 18), physics.V(6, 18))...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(38.4, 11), R: 0.6}, Bounce: 0.8, Skin: "palm"},
		},
		Zones: []physics.Zone{
			{Kind: physics.Hazard, Min: physics.V(16, 6.3), Max: physics.V(37.2, 15.7), Vec: physics.V(9, 4), Round: true, Skin: "lagoon"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
