// Package island16 is a long path to the volcano and the cup in its crater on
// top: hard enough to climb, soft enough to stay.
package island16

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 66, H: 22,
	World:     "island",
	Order:     16,
	Title:     "The Volcano",
	Strokes:   3, // par
	Tee:       physics.V(-18, 11),
	Pin:       physics.V(34, 11),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Keyhole(-22, 6, physics.V(34, 11), 9, 6)...),
		),
		Zones: []physics.Zone{
			{Kind: physics.Slope, Min: physics.V(28, 5), Max: physics.V(32.6, 17), Vec: physics.V(-0.3, 0), Skin: "volcano"},
			{Kind: physics.Slope, Min: physics.V(35.4, 5), Max: physics.V(40, 17), Vec: physics.V(0.3, 0), Skin: "volcano"},
			{Kind: physics.Slope, Min: physics.V(32.6, 12.4), Max: physics.V(35.4, 17), Vec: physics.V(0, 0.3), Skin: "volcano"},
			{Kind: physics.Slope, Min: physics.V(32.6, 5), Max: physics.V(35.4, 9.6), Vec: physics.V(0, -0.3), Skin: "volcano"},
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
