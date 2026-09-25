// Package hole15 is a cup on an island, with one causeway to it.
package hole15

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

var me = course.Fit(&course.Simple{
	World: "garden", Order: 14,
	W: 40, H: 16,
	Title:     "The Moat",
	Strokes:   2, // par
	Tee:       physics.V(4, 8),
	Pin:       physics.V(33, 8),
	Substeps:  22,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Outline(physics.Keyhole(0, 8, physics.V(32, 8), 7.5, 5)...),
		Zones: []physics.Zone{
			{Kind: physics.Hazard, Min: physics.V(25, 0), Max: physics.V(39, 6.2), Vec: physics.V(4, 8), Mark: '~', Skin: "water", Round: true},
			{Kind: physics.Hazard, Min: physics.V(25, 9.8), Max: physics.V(39, 16), Vec: physics.V(4, 8), Mark: '~', Skin: "water", Round: true},
			{Kind: physics.Hazard, Min: physics.V(35.5, 4), Max: physics.V(41, 12), Vec: physics.V(4, 8), Mark: '~', Skin: "water", Round: true},
		},
		Friction: 0.86,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
