// Package town12 is a crescent of houses round a garden square: follow the
// curve, and mind the puddle at the bottom of it.
package town12

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 48, H: 22,
	World:     "town",
	Order:     12,
	Title:     "The Crescent",
	Strokes:   3, // par
	Tee:       physics.V(12.0, 4.0),
	Pin:       physics.V(36.0, 4.0),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(6, 2, physics.V(12.0, 4.0), physics.V(13.61, 10.0), physics.V(18.0, 14.39), physics.V(24.0, 16.0), physics.V(30.0, 14.39), physics.V(34.39, 10.0), physics.V(36.0, 4.0))...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(19, 12.7), R: 0.35}, Bounce: 0.9, Skin: "lamp"},
			{Circle: physics.Circle{C: physics.V(29, 12.7), R: 0.35}, Bounce: 0.9, Skin: "lamp"},
		},
		Zones: []physics.Zone{
			{Kind: physics.Surface, Min: physics.V(21.5, 13.4), Max: physics.V(26.5, 18.4), Scale: 0.7, Round: true, Skin: "puddle"},
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
