// Package island8 is a lane over two dunes: up one side, down the other.
package island8

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var lane = physics.Lane(6, 4, physics.V(5, 7), physics.V(26, 6), physics.V(46, 8))

var me = course.Fit(&course.Simple{
	W: 52, H: 14,
	World:     "island",
	Order:     8,
	Title:     "Dune Ramps",
	Strokes:   2, // par
	Tee:       physics.V(5, 7),
	Pin:       physics.V(46, 8),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(lane...),
		),
		Zones: []physics.Zone{
			{Kind: physics.Slope, Min: physics.V(12, 0), Max: physics.V(17, 14), Vec: physics.V(-0.4, 0), Skin: "dune"},
			{Kind: physics.Slope, Min: physics.V(17, 0), Max: physics.V(22, 14), Vec: physics.V(0.4, 0), Skin: "dune"},
			{Kind: physics.Slope, Min: physics.V(30, 0), Max: physics.V(34, 14), Vec: physics.V(-0.45, 0), Skin: "dune"},
			{Kind: physics.Slope, Min: physics.V(34, 0), Max: physics.V(38, 14), Vec: physics.V(0.45, 0), Skin: "dune"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
