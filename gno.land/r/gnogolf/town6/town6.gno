// Package town6 is a flight of three steps up to the cup: each one takes the pace off, and too little sends you back down.
package town6

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 50, H: 12,
	World:     "town",
	Order:     6,
	Title:     "The Staircase",
	Strokes:   2, // par
	Tee:       physics.V(5, 6),
	Pin:       physics.V(45, 6),
	Substeps:  28,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(6, 4, physics.V(5, 6), physics.V(25, 5.5), physics.V(45, 6))...),
		),
		Zones: []physics.Zone{
			{Kind: physics.Slope, Min: physics.V(12, 0), Max: physics.V(15, 12), Vec: physics.V(-0.35, 0), Skin: "stairs"},
			{Kind: physics.Slope, Min: physics.V(21, 0), Max: physics.V(24, 12), Vec: physics.V(-0.35, 0), Skin: "stairs"},
			{Kind: physics.Slope, Min: physics.V(30, 0), Max: physics.V(33, 12), Vec: physics.V(-0.35, 0), Skin: "stairs"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
