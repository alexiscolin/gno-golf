// Package mountain3 is the mountain road, two hairpin bends stacked one over the other.
package mountain3

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 44, H: 28,
	World:     "mountain",
	Order:     3,
	Title:     "Switchbacks",
	Strokes:   4, // par
	Tee:       physics.V(5, 4),
	Pin:       physics.V(38, 24),
	Substeps:  30,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(5, 2, physics.V(5, 4), physics.V(34, 4), physics.V(39, 9), physics.V(34, 14), physics.V(10, 14), physics.V(5, 19), physics.V(10, 24), physics.V(38, 24))...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(22, 5.0), R: 0.6}, Bounce: 0.7, Skin: "pine"},
			{Circle: physics.Circle{C: physics.V(22, 23.0), R: 0.6}, Bounce: 0.7, Skin: "pine"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
