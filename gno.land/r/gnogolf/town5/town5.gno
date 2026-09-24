// Package town5 is a mushroom house in the middle of the lane: squeeze round it, or knock and go through the front door.
package town5

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 48, H: 16,
	World:     "town",
	Order:     5,
	Title:     "Mushroom House",
	Strokes:   2, // par
	Tee:       physics.V(5, 8),
	Pin:       physics.V(43, 8),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(8, 4, physics.V(5, 8), physics.V(24, 9), physics.V(43, 8))...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(24, 9), R: 2.4}, Bounce: 0.7, Skin: "house"},
		},
		Zones: []physics.Zone{
			{Kind: physics.Tunnel, Min: physics.V(19.4, 8.0), Max: physics.V(21.2, 10.0), Vec: physics.V(28.4, 9), Round: true, Skin: "door"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
