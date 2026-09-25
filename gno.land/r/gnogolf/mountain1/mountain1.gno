// Package mountain1 is a nursery slope of sheer ice: the softest touch rolls all the way.
package mountain1

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 38, H: 13,
	World:     "mountain",
	Order:     1,
	Title:     "Ski School",
	Strokes:   2, // par
	Tee:       physics.V(5, 6),
	Pin:       physics.V(34, 6),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(6, 4, physics.V(5, 6), physics.V(20, 7), physics.V(34, 6))...),
		),
		Zones: []physics.Zone{
			{Kind: physics.Surface, Min: physics.V(9, 2), Max: physics.V(31, 11), Scale: 1.18, Round: true, Skin: "ice"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
