// Package hole11 is a dogleg: along the top, round the bend, down the side.
package hole11

import (
	"math"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	World: "garden", Order: 10,
	W: 40, H: 24,
	Title:     "The Dogleg",
	Strokes:   3, // par
	Tee:       physics.V(3, 3.5),
	Pin:       physics.V(35.5, 20.5),
	Substeps:  22,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(append(append(
				[]physics.Vec2{physics.V(0, 0)},
				physics.Arc(physics.V(32, 7), 7, -math.Pi/2, 0, 8)...),
				physics.V(39, 24), physics.V(32, 24), physics.V(32, 7), physics.V(0, 7))...),
			// hay bales in the corner: a bank shot off them loses its pace
			physics.Soft(physics.Bar(physics.V(35.5, 3.2), physics.V(37.2, 5), 0.9, '#', "hay"), 0.4),
		),
		Friction: 0.86,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
