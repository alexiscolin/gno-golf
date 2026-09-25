// Package town1 is a diagonal boulevard across town with a row of lamp posts
// down the middle.
package town1

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 45, H: 28,
	World:     "town",
	Order:     1,
	Title:     "The Boulevard",
	Strokes:   2, // par
	Tee:       physics.V(5, 5),
	Pin:       physics.V(40, 23),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(7, 4, physics.V(5, 5), physics.V(22, 14), physics.V(40, 23))...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(17.3, 11.4), R: 0.35}, Bounce: 0.9, Skin: "lamp"},
			{Circle: physics.Circle{C: physics.V(24.3, 15.0), R: 0.35}, Bounce: 0.9, Skin: "lamp"},
			{Circle: physics.Circle{C: physics.V(31.3, 18.5), R: 0.35}, Bounce: 0.9, Skin: "lamp"},
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
