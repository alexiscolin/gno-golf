// Package mountain18 is the last climb to the summit, zigzagging up the face
// between the pines.
package mountain18

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 46, H: 28,
	World:     "mountain",
	Order:     18,
	Title:     "The Summit",
	Strokes:   4, // par
	Tee:       physics.V(5, 24),
	Pin:       physics.V(41, 22),
	Substeps:  30,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(5, 3, physics.V(5, 24), physics.V(12, 5), physics.V(22, 23), physics.V(32, 5), physics.V(41, 22))...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(16.4, 14), R: 0.6}, Bounce: 0.7, Skin: "pine"},
			{Circle: physics.Circle{C: physics.V(27.6, 14), R: 0.6}, Bounce: 0.7, Skin: "pine"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register lists this hole's realm with golf, from here or from its own
// init(cur realm): as a community hole, and under golf's namespace only once
// golf's owner expects this path. The course plays the hole as data
// (data/holes.txt), which the owner publishes.
func Register(cur realm) { golf.Register(cross(cur), me) }
