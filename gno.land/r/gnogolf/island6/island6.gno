// Package island6 is a spit of sand with the sea on both sides and no rail: roll off it and you start again.
package island6

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var lane = physics.Lane(5, 3, physics.V(5, 6), physics.V(17, 12), physics.V(30, 6), physics.V(44, 11))

var me = course.Fit(&course.Simple{
	W: 50, H: 18,
	World:     "island",
	Order:     6,
	Title:     "Sand Spit",
	Strokes:   4, // par
	Tee:       physics.V(5, 6),
	Pin:       physics.V(44, 11),
	Substeps:  24,
	CupRadius: 1.2,
	Shelter:   0.08, // no rails: the wind is capped so it cannot blow every line off

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Box(physics.V(0, 0), physics.V(50, 18)),
		),
		Zones: []physics.Zone{
			{Kind: physics.Hazard, Min: physics.V(0, 0), Max: physics.V(50, 18), Vec: physics.V(5, 6), Poly: lane, Outside: true, Skin: "sea"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
