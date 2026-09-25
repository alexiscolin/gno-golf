// Package town11 is a little courtyard crowded with gnome statues: one shot,
// and they pass the ball round.
package town11

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 20, H: 14,
	World:     "town",
	Order:     11,
	Title:     "Gnome Courtyard",
	Strokes:   2, // par
	Tee:       physics.V(3.5, 7),
	Pin:       physics.V(16.5, 7),
	Substeps:  20,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.V(-2.5, 13.0), physics.V(22.5, 13.0), physics.V(22.5, 1.0), physics.V(-2.5, 1.0)),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(8, 5.3), R: 0.6}, Bounce: 1.25, Skin: "gnome statue"},
			{Circle: physics.Circle{C: physics.V(8, 8.7), R: 0.6}, Bounce: 1.25, Skin: "gnome statue"},
			{Circle: physics.Circle{C: physics.V(11, 7), R: 0.6}, Bounce: 1.25, Skin: "gnome statue"},
			{Circle: physics.Circle{C: physics.V(13.6, 4.2), R: 0.6}, Bounce: 1.25, Skin: "gnome statue"},
			{Circle: physics.Circle{C: physics.V(13.6, 9.8), R: 0.6}, Bounce: 1.25, Skin: "gnome statue"},
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
