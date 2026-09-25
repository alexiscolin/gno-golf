// Package hole7 is a U-turn round a pond: the dry way hugs the inside of the
// bend.
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

// Register lists this hole's realm with golf, from here or from its own
// init(cur realm): as a community hole, and under golf's namespace only once
// golf's owner expects this path. The course plays the hole as data
// (data/holes.txt), which the owner publishes.
func Register(cur realm) { golf.Register(cross(cur), me) }
