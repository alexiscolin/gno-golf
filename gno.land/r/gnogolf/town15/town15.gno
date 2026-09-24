// Package town15 is the ridge of the rooftops, a chimney in the way; step off and you are back at the start.
package town15

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var lane = physics.Lane(4.5, 3, physics.V(5, 6), physics.V(16, 11), physics.V(28, 6), physics.V(40, 11))

var me = course.Fit(&course.Simple{
	W: 46, H: 16,
	World:     "town",
	Order:     15,
	Title:     "Rooftops",
	Strokes:   4, // par
	Tee:       physics.V(5, 6),
	Pin:       physics.V(40, 11),
	Substeps:  26,
	CupRadius: 1.2,
	Shelter:   0.08, // no rails: the wind is capped so it cannot blow every line off

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Box(physics.V(0, 0), physics.V(46, 16)),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(22, 8.6), R: 0.6}, Bounce: 0.7, Skin: "chimney"},
		},
		Zones: []physics.Zone{
			{Kind: physics.Hazard, Min: physics.V(0, 0), Max: physics.V(46, 16), Vec: physics.V(5, 6), Poly: lane, Outside: true, Skin: "roof"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
