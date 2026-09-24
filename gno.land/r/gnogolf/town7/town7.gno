// Package town7 is a lane the canal cuts in two, with a narrow bridge the only dry way over.
package town7

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 48, H: 16,
	World:     "town",
	Order:     7,
	Title:     "Canal Bridge",
	Strokes:   3, // par
	Tee:       physics.V(5, 7),
	Pin:       physics.V(43, 8),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(8, 4, physics.V(5, 7), physics.V(24, 9), physics.V(43, 8))...),
		),
		Zones: []physics.Zone{
			{Kind: physics.Hazard, Min: physics.V(21, 0), Max: physics.V(26, 7.9), Vec: physics.V(15, 8.4), Skin: "canal"},
			{Kind: physics.Hazard, Min: physics.V(21, 10.5), Max: physics.V(26, 16), Vec: physics.V(15, 8.4), Skin: "canal"},
			{Kind: physics.Surface, Min: physics.V(21, 7.9), Max: physics.V(26, 10.5), Scale: 1, Skin: "bridge"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
