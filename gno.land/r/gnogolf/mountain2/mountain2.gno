// Package mountain2 is a slalom through the pines, left of one and right of the next.
package mountain2

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 50, H: 16,
	World:     "mountain",
	Order:     2,
	Title:     "Pine Slalom",
	Strokes:   2, // par
	Tee:       physics.V(5, 8),
	Pin:       physics.V(45, 8),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(8, 4, physics.V(5, 8), physics.V(25, 8.5), physics.V(45, 8))...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(13, 7.3), R: 0.6}, Bounce: 0.7, Skin: "pine"},
			{Circle: physics.Circle{C: physics.V(20, 9.4), R: 0.6}, Bounce: 0.7, Skin: "pine"},
			{Circle: physics.Circle{C: physics.V(27, 7.4), R: 0.6}, Bounce: 0.7, Skin: "pine"},
			{Circle: physics.Circle{C: physics.V(34, 9.4), R: 0.6}, Bounce: 0.7, Skin: "pine"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
