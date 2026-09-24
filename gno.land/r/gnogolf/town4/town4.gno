// Package town4 is a street two tram lines cross: time the shot to go behind
// the first tram and still find the second gone.
package town4

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 46, H: 14,
	World:     "town",
	Order:     4,
	Title:     "Tram Crossing",
	Strokes:   3, // par
	Tee:       physics.V(5, 7),
	Pin:       physics.V(41, 7),
	Substeps:  28,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(6, 4, physics.V(5, 7), physics.V(23, 7.5), physics.V(41, 7))...),
			// two tram lines across the street, their trams a quarter turn apart
			physics.Timed(physics.Bar(physics.V(22, 3), physics.V(22, 12), 3, '#', "tram"), 12, 7, 0),
			physics.Timed(physics.Bar(physics.V(32, 3), physics.V(32, 12), 3, '#', "tram"), 12, 7, 3),
		),
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
