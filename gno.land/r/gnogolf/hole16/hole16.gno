// Package hole16 is a funnel downhill, with water past the cup.
package hole16

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	// moved out of the garden's eighteen: kept, listed under extras
	World: "extras", Order: 16,
	W: 44, H: 10,
	Title:     "Downhill",
	Strokes:   2, // par
	Tee:       physics.V(3, 5),
	Pin:       physics.V(34, 5),
	Substeps:  20,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Outline(physics.V(0, 0), physics.V(24, 2), physics.V(44, 2), physics.V(44, 8), physics.V(24, 8), physics.V(0, 10)),
		Posts: []physics.Post{
			// an old stump on the flat, to one side of the way to the cup
			{Circle: physics.Circle{C: physics.V(29, 6.3), R: 0.7}, Bounce: 0.6, Skin: "stump"},
		},
		Zones: []physics.Zone{
			// downhill, steep enough to roll a stopped ball on
			{Kind: physics.Slope, Min: physics.V(6, 0), Max: physics.V(22, 10), Vec: physics.V(0.17, 0), Mark: '^', Skin: "slope"},
			{Kind: physics.Hazard, Min: physics.V(37.8, 2), Max: physics.V(44, 8), Vec: physics.V(3, 5), Mark: '~', Skin: "water",
				Poly: []physics.Vec2{physics.V(38.6, 2), physics.V(44, 2), physics.V(44, 8), physics.V(38.8, 8), physics.V(38.3, 7), physics.V(37.8, 5.6), physics.V(38.5, 4.4), physics.V(38, 3.2)}},
		},
		Friction: 0.86,
		Radius:   0.5,
		Bounce:   0.8,
	},
}, 1.5)

// Register lists this hole's realm with golf, from here or from its own
// init(cur realm): as a community hole, and under golf's namespace only once
// golf's owner expects this path. The course plays the hole as data
// (data/holes.txt), which the owner publishes.
func Register(cur realm) { golf.Register(cross(cur), me) }
