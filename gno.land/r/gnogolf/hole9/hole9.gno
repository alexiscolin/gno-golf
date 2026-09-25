// Package hole9 is three hills in a row: climb, roll down the far side, climb
// again.
package hole9

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

var me = course.Fit(&course.Simple{
	World: "garden", Order: 9,
	W: 64, H: 8,
	Title:     "The Climb",
	Strokes:   3, // par
	Tee:       physics.V(4, 4),
	Pin:       physics.V(60, 4),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Outline(physics.Stadium(physics.V(0, 0), physics.V(64, 8), 6)...),
		Zones: []physics.Zone{
			{Kind: physics.Slope, Min: physics.V(12, 0), Max: physics.V(24, 8), Vec: physics.V(-0.22, 0), Mark: '^', Skin: "slope"},
			{Kind: physics.Slope, Min: physics.V(30, 0), Max: physics.V(40, 8), Vec: physics.V(0.2, 0), Mark: 'v', Skin: "slope"},
			{Kind: physics.Slope, Min: physics.V(46, 0), Max: physics.V(58, 8), Vec: physics.V(-0.25, 0), Mark: '^', Skin: "slope"},
		},
		Friction: 0.86,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
