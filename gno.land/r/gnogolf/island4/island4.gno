// Package island4 is a crescent of sandbar with a rowing boat beached across the top of it and wet sand where the tide went out.
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
			physics.Soft(physics.Bar(physics.V(22.5, 6.6), physics.V(27.5, 5.8), 1.8, 'b', "rowing boat"), 0.5),
		),
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
