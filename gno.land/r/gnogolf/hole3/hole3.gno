// Package hole3 is two lanes with a mountain between them: over the sand, and down the tunnel.
package hole3

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	World: "garden", Order: 3,
	W: 48, H: 8,
	Title:     "Down the Tunnel",
	Strokes:   2, // par
	Tee:       physics.V(4, 4),
	Pin:       physics.V(44, 4),
	Substeps:  22,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Stadium(physics.V(0, 0), physics.V(20, 8), 6)...),
			physics.Outline(physics.Stadium(physics.V(28, 0), physics.V(48, 8), 6)...),
		),
		Zones: []physics.Zone{
			{Kind: physics.Surface, Min: physics.V(6.5, -1), Max: physics.V(12.5, 4.2), Scale: 0.55, Mark: ',', Skin: "sand", Round: true},
			{Kind: physics.Tunnel, Min: physics.V(14, 2), Max: physics.V(17.5, 6), Vec: physics.V(32, 4), Mark: 'T', Skin: "tunnel", Round: true},
			{Kind: physics.Hazard, Min: physics.V(33, 4.6), Max: physics.V(40.5, 9.5), Vec: physics.V(34, 2.2), Mark: '~', Skin: "water", Round: true},
			{Kind: physics.Slope, Min: physics.V(40, 0), Max: physics.V(48, 8), Vec: physics.V(-0.22, 0), Mark: '^', Skin: "slope"},
		},
		Friction: 0.86,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
