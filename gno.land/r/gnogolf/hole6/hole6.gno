// Package hole6 is a bend on ice, then a long run down to the cup: it runs,
// and it does not stop where you hoped.
package hole6

import (
	"math"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

var me = course.Fit(&course.Simple{
	World: "garden", Order: 6,
	W: 40, H: 31,
	Title:     "Icehouse",
	Strokes:   3, // par
	Tee:       physics.V(4, 3.5),
	Pin:       physics.V(35.5, 26),
	Substeps:  24,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Path(
				physics.Arc(physics.V(3.5, 3.5), 3.5, math.Pi/2, 3*math.Pi/2, 5),
				physics.Arc(physics.V(32, 7), 7, -math.Pi/2, 0, 7),
				physics.Arc(physics.V(35.5, 27), 3.5, 0, math.Pi, 5),
				physics.Pts(physics.V(32, 7)),
			)...),
		),
		Zones: []physics.Zone{
			{Kind: physics.Surface, Min: physics.V(8, 0), Max: physics.V(31, 7), Scale: 1.18, Mark: '-', Skin: "ice"},
		},
		Friction: 0.84,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
