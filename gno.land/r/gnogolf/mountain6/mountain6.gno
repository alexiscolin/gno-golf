// Package mountain6 is a long path onto a frozen lake, the cup on its far
// shore and three boulders out on the ice.
package mountain6

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 64, H: 22,
	World:     "mountain",
	Order:     6,
	Title:     "Frozen Lake",
	Strokes:   3, // par
	Tee:       physics.V(-18, 11),
	Pin:       physics.V(35.5, 11),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Keyhole(-22, 6, physics.V(30, 11), 9, 6)...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(27, 8.2), R: 0.9}, Bounce: 0.6, Skin: "boulder"},
			{Circle: physics.Circle{C: physics.V(31, 14.4), R: 0.9}, Bounce: 0.6, Skin: "boulder"},
			{Circle: physics.Circle{C: physics.V(30.5, 11), R: 0.9}, Bounce: 0.6, Skin: "boulder"},
		},
		Zones: []physics.Zone{
			{Kind: physics.Surface, Min: physics.V(22, 3), Max: physics.V(38, 19), Scale: 1.18, Round: true, Skin: "ice"},
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
