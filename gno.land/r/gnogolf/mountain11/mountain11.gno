// Package mountain11 is a knife-edge ridge with a drop on both sides: fall off and you start again.
package mountain11

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var lane = physics.Lane(4, 3, physics.V(5, 8), physics.V(18, 4), physics.V(32, 11.5), physics.V(46, 6), physics.V(50, 8))

var me = course.Fit(&course.Simple{
	W: 54, H: 16,
	World:     "mountain",
	Order:     11,
	Title:     "Knife Edge",
	Strokes:   4, // par
	Tee:       physics.V(5, 8),
	Pin:       physics.V(50, 8),
	Substeps:  28,
	CupRadius: 1.2,
	Shelter:   0.08, // no rails: the wind is capped so it cannot blow every line off

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Box(physics.V(0, 0), physics.V(54, 16)),
		),
		Zones: []physics.Zone{
			{Kind: physics.Hazard, Min: physics.V(0, 0), Max: physics.V(54, 16), Vec: physics.V(5, 8), Poly: lane, Outside: true, Skin: "cliff"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
