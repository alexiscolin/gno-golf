// Package hole7 is a U-turn round a pond: the dry way hugs the inside of the bend.
package hole7

import (
	"math"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	World: "garden", Order: 7,
	W: 44, H: 20,
	Title:     "The Pond",
	Strokes:   4, // par
	Tee:       physics.V(4, 4),
	Pin:       physics.V(4, 16),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Path(
				physics.Pts(physics.V(0, 0), physics.V(34, 0)),
				physics.Arc(physics.V(34, 10), 10, -math.Pi/2, math.Pi/2, 8),
				physics.Pts(physics.V(0, 20), physics.V(0, 12), physics.V(34, 12)),
				physics.Arc(physics.V(34, 10), 2, math.Pi/2, -math.Pi/2, 4),
				physics.Pts(physics.V(0, 8)),
			)...),
		),
		Zones: []physics.Zone{
			{Kind: physics.Hazard, Min: physics.V(39.5, 4), Max: physics.V(47, 16), Vec: physics.V(4, 4), Mark: '~', Skin: "water", Round: true},
		},
		Friction: 0.86,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
