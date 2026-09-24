// Package hole20 is the loop-the-loop, the garden's finale. A narrow chute
// runs from the tee into the loop: the lane itself curls up into a vertical
// ring and comes down beside itself onto a second lane. Only a straight ball
// at the right pace goes round: too soft and it rolls back down, too hard or
// slanted and it flies off the top. Out of the loop the lane swings round a
// long bend to the cup.
package hole20

import (
	"math"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

// the tee's lane, funnelling into the chute that runs into the loop
var approach = physics.Path(
	physics.Arc(physics.V(5, 6), 2.5, math.Pi/2, 3*math.Pi/2, 6),
	physics.Pts(physics.V(12, 3.5), physics.V(15.5, 4.4), physics.V(22.9, 4.4),
		physics.V(22.9, 7.6), physics.V(15.5, 7.6), physics.V(12, 8.5)),
)

// where the loop comes down, beside the chute, and the long bend to the cup
var bend = physics.Path(
	physics.Pts(physics.V(20.5, 8.8), physics.V(40, 8.8)),
	physics.Arc(physics.V(40, 16.5), 7.7, -math.Pi/2, math.Pi/2, 8),
	physics.Pts(physics.V(12, 24.2)),
	physics.Arc(physics.V(12, 21.6), 2.6, math.Pi/2, 3*math.Pi/2, 6),
	physics.Pts(physics.V(40, 19)),
	physics.Arc(physics.V(40, 16.5), 2.5, math.Pi/2, -math.Pi/2, 6),
	physics.Pts(physics.V(27, 14), physics.V(25, 12), physics.V(20.5, 12)),
)

var me = course.Fit(&course.Simple{
	World: "garden", Order: 18,
	W: 50, H: 26,
	Title:     "The Loop-the-Loop",
	Strokes:   4, // par
	Tee:       physics.V(5, 6),
	Pin:       physics.V(12, 21.6),
	Substeps:  30,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(approach...),
			physics.Outline(bend...),
			// a clipped hedge across the way home, one gap in it
			physics.Bar(physics.V(19, 19), physics.V(19, 20.4), 0.6, '#', "hedge"),
			physics.Bar(physics.V(19, 22.8), physics.V(19, 24.2), 0.6, '#', "hedge"),
		),
		Posts: []physics.Post{
			// a boulder in the bend: a bank round it is never quite the same twice
			{Circle: physics.Circle{C: physics.V(45.3, 16.5), R: 0.9}, Bounce: 0.6, Skin: "rock"},
		},
		Zones: []physics.Zone{
			// a flowerbed on the inside of the bend: cut the corner and it holds you up
			{Kind: physics.Surface, Min: physics.V(38, 12.6), Max: physics.V(44, 20.4), Scale: 0.45, Round: true, Skin: "flowerbed"},
			// the loop's mouth, the chute's whole width: round at 2.4 to 3.48
			// a substep, and set down on the second lane heading on
			{Kind: physics.Loop, Min: physics.V(20, 4.4), Max: physics.V(22.9, 7.6), Vec: physics.V(26.5, 10.4), Scale: 2.4, Mark: '@', Skin: "loop-the-loop"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
