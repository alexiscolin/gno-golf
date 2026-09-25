// Package island9 is a pier out to sea, over the gaps where planks went missing; a rail only at the far end.
package island9

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var lane = physics.Lane(5, 4, physics.V(5, 7), physics.V(28, 6), physics.V(50, 8))

var me = course.Fit(&course.Simple{
	W: 56, H: 14,
	World:     "island",
	Order:     9,
	Title:     "The Pier",
	Strokes:   4, // par
	Tee:       physics.V(5, 7),
	Pin:       physics.V(50, 8),
	Substeps:  28,
	CupRadius: 1.2,
	Shelter:   0.08, // no rails: the wind is capped so it cannot blow every line off

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Box(physics.V(0, 0), physics.V(56, 14)),
			physics.Skinned(physics.Polyline(physics.Arc(physics.V(50, 8), 3.4, -1.3, 1.3, 5)...), "pier"),
		),
		Zones: []physics.Zone{
			{Kind: physics.Hazard, Min: physics.V(16, 4.4), Max: physics.V(18, 6.9), Vec: physics.V(5, 7), Skin: "gap"},
			{Kind: physics.Hazard, Min: physics.V(27, 6.2), Max: physics.V(29, 8.6), Vec: physics.V(5, 7), Skin: "gap"},
			{Kind: physics.Hazard, Min: physics.V(38, 4.5), Max: physics.V(40, 6.9), Vec: physics.V(5, 7), Skin: "gap"},
			{Kind: physics.Hazard, Min: physics.V(0, 0), Max: physics.V(56, 14), Vec: physics.V(5, 7), Poly: lane, Outside: true, Skin: "sea"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
