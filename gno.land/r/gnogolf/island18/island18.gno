// Package island18 is two-thirds of a circle on a banked track: aim high on
// the bank and it carries you round to the cup. The bank only steers a ball
// that is rolling: one that stops on it stays where it stopped (the tee and
// the cup both sit on it).
package island18

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 42, H: 32,
	World:     "island",
	Order:     18,
	Title:     "Banked Bend",
	Strokes:   3, // par
	Tee:       physics.V(14.47, 9.5),
	Pin:       physics.V(14.47, 20.5),
	Substeps:  28,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(6, 2, physics.V(14.47, 9.5), physics.V(22.09, 4.17), physics.V(31.07, 6.57), physics.V(35.0, 15.0), physics.V(31.07, 23.43), physics.V(22.09, 25.83), physics.V(14.47, 20.5))...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(36.2, 15), R: 0.6}, Bounce: 0.8, Skin: "palm"},
		},
		Zones: []physics.Zone{
			// the banks lean in at the drag (physics.Drag): they bend a moving
			// ball, never start a stopped one
			{Kind: physics.Slope, Min: physics.V(10, 1), Max: physics.V(16, 29), Vec: physics.V(0.12, 0), Skin: "bank"},
			{Kind: physics.Slope, Min: physics.V(32, 1), Max: physics.V(38, 29), Vec: physics.V(-0.12, 0), Skin: "bank"},
			{Kind: physics.Slope, Min: physics.V(16, 23), Max: physics.V(32, 29), Vec: physics.V(0, -0.12), Skin: "bank"},
			{Kind: physics.Slope, Min: physics.V(16, 1), Max: physics.V(32, 7), Vec: physics.V(0, 0.12), Skin: "bank"},
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
