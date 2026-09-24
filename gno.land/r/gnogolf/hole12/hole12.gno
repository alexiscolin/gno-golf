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
	"gno.land/r/gnogolf/golf"
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
				Poly: []physics.Vec2{physics.V(2, 16), physics.V(15, 10.3), physics.V(15, 17.3), physics.V(2, 23)}},
			{Kind: physics.Hazard, Min: physics.V(19, 2), Max: physics.V(34, 15.56), Vec: back, Mark: '~', Skin: "water",
				Poly: []physics.Vec2{physics.V(19, 8.56), physics.V(34, 2), physics.V(34, 9), physics.V(19, 15.56)}},
			// the pond on the far bank, either side of the plank causeway that
			// runs out to the cup's island: fished out, it is back over the bridge
			{Kind: physics.Hazard, Min: physics.V(20, 17), Max: physics.V(34, 21.8), Vec: back, Mark: '~', Skin: "water",
				Poly: []physics.Vec2{physics.V(20, 18.8), physics.V(34, 17.2), physics.V(34, 20), physics.V(29, 20), physics.V(29, 21.8), physics.V(20, 21.8)}},
			{Kind: physics.Hazard, Min: physics.V(20, 23.8), Max: physics.V(29, 26), Vec: back, Mark: '~', Skin: "water"},
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

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
