// Package hole12 is the moon bridge: a stream cuts the garden from wall to
// wall, and the only way over is a steep arched bridge with no rails. Too
// soft and the ball rolls back down to the bank; too hard and it leaves the
// top of the arch and flies, and a ball that flies off at an angle comes
// down in the stream. On the far bank a stone lantern stands in front of the
// cup.
package hole12

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

// the stream, either side of the bridge; a ball that falls in is fished out
// on the tee's bank
var back = physics.V(10, 7)

var me = course.Fit(&course.Simple{
	World: "garden", Order: 11,
	W: 36, H: 28,
	Title:     "The Moon Bridge",
	Strokes:   4, // par
	Tee:       physics.V(6, 6),
	Pin:       physics.V(31, 22.8),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.V(2, 2), physics.V(30, 2), physics.V(34, 8), physics.V(34, 26), physics.V(2, 26)),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(32.6, 21.4), R: 0.7}, Bounce: 0.6, Skin: "lantern"},
		},
		Zones: []physics.Zone{
			{Kind: physics.Hazard, Min: physics.V(2, 10.3), Max: physics.V(15, 23), Vec: back, Mark: '~', Skin: "water",
				Poly: []physics.Vec2{physics.V(2, 16), physics.V(3.77, 15.61), physics.V(5.13, 14.3), physics.V(7.06, 14.27), physics.V(8.42, 12.97), physics.V(10.25, 12.71), physics.V(11.61, 11.4), physics.V(13.48, 11.24), physics.V(15, 10.3), physics.V(15, 17.3), physics.V(13.5, 18.29), physics.V(11.61, 18.4), physics.V(10.21, 19.62), physics.V(8.34, 19.78), physics.V(7.02, 21.18), physics.V(5.13, 21.3), physics.V(3.73, 22.52), physics.V(2, 23)}},
			{Kind: physics.Hazard, Min: physics.V(19, 2), Max: physics.V(34, 15.6), Vec: back, Mark: '~', Skin: "water",
				Poly: []physics.Vec2{physics.V(19, 8.56), physics.V(21, 8.01), physics.V(22.61, 6.6), physics.V(24.79, 6.47), physics.V(26.4, 5.05), physics.V(28.52, 4.78), physics.V(30.13, 3.37), physics.V(32.21, 3), physics.V(34, 2), physics.V(34, 9), physics.V(32.27, 10.14), physics.V(30.13, 10.37), physics.V(28.54, 11.83), physics.V(26.4, 12.05), physics.V(24.75, 13.37), physics.V(22.61, 13.6), physics.V(20.96, 14.92), physics.V(19, 15.56)}},
			// the pond on the far bank, either side of the plank causeway that
			// runs out to the cup's island: fished out, it is back over the bridge
			{Kind: physics.Hazard, Min: physics.V(19.7, 17.1), Max: physics.V(34, 21.8), Vec: back, Mark: '~', Skin: "water",
				Poly: []physics.Vec2{physics.V(20, 18.8), physics.V(22.03, 18.87), physics.V(23.96, 18), physics.V(26.05, 18.51), physics.V(27.97, 17.59), physics.V(30.04, 18), physics.V(31.97, 17.18), physics.V(34, 17.2), physics.V(34, 20), physics.V(29, 20), physics.V(29, 21.8), physics.V(20, 21.8), physics.V(20.3, 20.8), physics.V(19.75, 19.8)}},
			{Kind: physics.Hazard, Min: physics.V(20, 23.8), Max: physics.V(29, 26), Vec: back, Mark: '~', Skin: "water",
				Poly: []physics.Vec2{physics.V(20, 23.8), physics.V(29, 23.8), physics.V(28.8, 24.9), physics.V(29, 26), physics.V(20, 26), physics.V(20.35, 24.9)}},
			{Kind: physics.Surface, Min: physics.V(20, 21.8), Max: physics.V(29, 23.8), Scale: 1, Mark: '=', Skin: "bridge"},
			// the arch: up from the tee's bank to its crown, and down to the far one
			{Kind: physics.Slope, Min: physics.V(15, 8), Max: physics.V(19, 12.5), Vec: physics.V(0, -0.25), Mark: '^', Skin: "moon bridge"},
			{Kind: physics.Slope, Min: physics.V(15, 12.5), Max: physics.V(19, 17.5), Vec: physics.V(0, 0.25), Mark: 'v', Skin: "moon bridge"},
		},
		Friction: 0.86,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
