// Package hole18 is the long way: a lane that snakes four times across the
// garden, a flowerbed in the second bend and a rock to steer round.
package hole18

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

// the lane's centreline, tee to cup
var line = []physics.Vec2{
	physics.V(5, 5), physics.V(18, 13), physics.V(32, 5), physics.V(46, 13), physics.V(58, 7),
}

var me = course.Fit(&course.Simple{
	World: "garden", Order: 16,
	W: 64, H: 18,
	Title:     "The Long Green",
	Strokes:   3, // par
	Tee:       physics.V(5, 5),
	Pin:       physics.V(58, 7),
	Substeps:  28,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Outline(physics.Lane(5, 3, line...)...),
		Posts: []physics.Post{
			// a rock on the inside of the third bend: round it, or bank off it
			{Circle: physics.Circle{C: physics.V(44.5, 11.5), R: 0.9}, Bounce: 0.7, Skin: "rock"},
		},
		Zones: []physics.Zone{
			// the flowerbed filling the inside of the second bend
			{Kind: physics.Surface, Min: physics.V(29.5, 4.5), Max: physics.V(34.5, 8.5), Scale: 0.45, Mark: '*', Skin: "flowerbed", Round: true},
		},
		Friction: 0.88,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
