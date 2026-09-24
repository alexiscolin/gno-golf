// Package hole12 is two magic holes under a hedge: one comes out by the cup, one does not.
package hole12

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	World: "garden", Order: 11,
	W: 44, H: 10,
	Title:     "Twin Burrows",
	Strokes:   2, // par
	Tee:       physics.V(4, 5),
	Pin:       physics.V(40, 7),
	Substeps:  22,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Stadium(physics.V(0, 0), physics.V(22, 10), 6)...),
			physics.Outline(physics.Stadium(physics.V(26, 0), physics.V(44, 10), 6)...),
		),
		Zones: []physics.Zone{
			{Kind: physics.Tunnel, Min: physics.V(14, 0.8), Max: physics.V(18, 3.8), Vec: physics.V(30, 7), Mark: 'T', Skin: "warp", Round: true},
			{Kind: physics.Tunnel, Min: physics.V(14, 6.2), Max: physics.V(18, 9.2), Vec: physics.V(30, 3), Mark: 'T', Skin: "warp", Round: true},
		},
		Friction: 0.86,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
