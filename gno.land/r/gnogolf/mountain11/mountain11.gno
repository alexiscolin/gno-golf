// Package mountain11 is the bobsleigh: an iced chute snakes down the
// mountain from the tee and straightens into a loop, the chute itself
// curling up into a vertical ring and coming down beside itself onto the
// run-out. Gravity and the ice do the work, so the stroke is restraint:
// too soft and the ball rolls back out of the loop, too hard or slanted and
// it flies off the top and is set down in front of it. A snowdrift on the
// run-out stops a ball that comes out of the loop, short of the cup.
package mountain11

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

// the chute: round the tee, down the right bank of the S, into the straight
// that runs into the loop's mouth, and back up the left bank
var chute = []physics.Vec2{
	physics.V(4.76, 5.82), physics.V(4.02, 4.95), physics.V(3.81, 3.83), physics.V(4.18, 2.76), physics.V(5.05, 2.02), physics.V(6.17, 1.81),
	physics.V(7.24, 2.18), physics.V(8.54, 3.07), physics.V(10.55, 4.41), physics.V(12.64, 6.09), physics.V(14.15, 8.54), physics.V(13.51, 11.42),
	physics.V(11.97, 13.14), physics.V(10.58, 14.38), physics.V(9.85, 15.19), physics.V(9.61, 15.84), physics.V(9.41, 16.72), physics.V(9.29, 17.63),
	physics.V(8.6, 18), physics.V(8.6, 29.9), physics.V(5.4, 29.9), physics.V(5.4, 18), physics.V(4.93, 16.98), physics.V(5.09, 15.9),
	physics.V(5.42, 14.49), physics.V(6.15, 12.81), physics.V(7.47, 11.26), physics.V(8.9, 9.99), physics.V(9.75, 9.13), physics.V(7.95, 7.97),
	physics.V(6.08, 6.72),
}

// the run-out, beside the chute's end, where the loop comes down
var runout = []physics.Vec2{
	physics.V(9.8, 27.5), physics.V(13, 27.5), physics.V(13, 33), physics.V(14.5, 35), physics.V(14.5, 45), physics.V(13.8, 46.8),
	physics.V(12, 47.5), physics.V(10.2, 46.8), physics.V(9.5, 45), physics.V(9.5, 35), physics.V(9.8, 33),
}

var me = course.Fit(&course.Simple{
	W: 30, H: 50,
	World:     "mountain",
	Order:     11,
	Title:     "The Bobsleigh",
	Strokes:   3, // par
	Tee:       physics.V(6, 4),
	Pin:       physics.V(12, 45),
	Substeps:  30,
	CupRadius: 1.2,
	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(chute...),
			physics.Outline(runout...),
		),
		Zones: []physics.Zone{
			// the chute runs downhill, and it is iced
			{Kind: physics.Slope, Min: physics.V(0, 0), Max: physics.V(24, 26), Vec: physics.V(0, 0.08), Mark: 'v', Skin: "downhill"},
			{Kind: physics.Surface, Min: physics.V(0, 0), Max: physics.V(24, 27), Scale: 1.1, Mark: '-', Skin: "ice"},
			// the drift on the run-out
			{Kind: physics.Surface, Min: physics.V(9.5, 36), Max: physics.V(14.5, 41.5), Scale: 0.5, Round: true, Mark: ',', Skin: "snowdrift"},
			// the loop's mouth, the chute's whole width: round at 2.8 to 4.06 a
			// substep, and set down on the run-out heading on
			{Kind: physics.Loop, Min: physics.V(5.4, 27), Max: physics.V(8.6, 29.9), Vec: physics.V(11.4, 33.6), Scale: 2.8, Mark: '@', Skin: "bob loop"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
