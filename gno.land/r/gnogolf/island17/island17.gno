// Package island17 is a tiny atoll with the cup inside a ring of coral open
// only at the back: bank it in off the rim.
package island17

import (
	"math"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 20, H: 18,
	World:     "island",
	Order:     17,
	Title:     "Coral Atoll",
	Strokes:   2, // par
	Tee:       physics.V(6, 9),
	Pin:       physics.V(17, 9),
	Substeps:  20,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Arc(physics.V(11.5, 9), 7, 0, 2*math.Pi, 14)[:14]...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(17, 11.8), R: 0.45}, Bounce: 0.7, Skin: "coral"},
			{Circle: physics.Circle{C: physics.V(14.58, 10.4), R: 0.45}, Bounce: 0.7, Skin: "coral"},
			{Circle: physics.Circle{C: physics.V(14.2, 9), R: 0.45}, Bounce: 0.7, Skin: "coral"},
			{Circle: physics.Circle{C: physics.V(14.58, 7.6), R: 0.45}, Bounce: 0.7, Skin: "coral"},
			{Circle: physics.Circle{C: physics.V(17, 6.2), R: 0.45}, Bounce: 0.7, Skin: "coral"},
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
