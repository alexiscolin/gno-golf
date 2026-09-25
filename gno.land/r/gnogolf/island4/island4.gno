// Package island4 is a crescent of sandbar with a rowing boat beached across
// its neck: squeeze past its bow, then over the wet sand where the tide went
// out, round the palm in the line to the cup.
package island4

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var lane = physics.Lane(7, 4, physics.V(5, 12), physics.V(16, 5), physics.V(30, 4), physics.V(42, 10))

var me = course.Fit(&course.Simple{
	W: 48, H: 16,
	World:     "island",
	Order:     4,
	Title:     "Beached Boat",
	Strokes:   3, // par
	Tee:       physics.V(5, 12),
	Pin:       physics.V(42, 10),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(lane...),
			// the rowing boat, beached across the neck from stern to bow: the
			// only way on is the gap between its bow and the far bank
			physics.Soft(physics.Bar(physics.V(27.1, 6), physics.V(22.8, 3), 1.5, 'b', "rowing boat"), 0.5),
		),
		// a palm on the last of the crescent, in the line down to the cup
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(40.5, 8), R: 0.6}, Bounce: 0.8, Skin: "palm"},
		},
		Zones: []physics.Zone{
			{Kind: physics.Surface, Min: physics.V(32, 5), Max: physics.V(38, 10.5), Scale: 0.6, Round: true, Skin: "wetsand"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
