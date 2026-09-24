// Package hole20 is a jump over a ditch. A ramp rises toward a ditch that cuts
// the lane from wall to wall; the only way over is in the air. Hit the ramp
// hard enough and the ball takes off at its lip and lands on the far side;
// too soft and it drops into the ditch and goes back to the tee.
package hole20

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	World: "garden", Order: 18,
	W: 52, H: 9,
	Title:     "The Ditch Jump",
	Strokes:   2, // par
	Tee:       physics.V(4, 4.5),
	Pin:       physics.V(47, 4.5),
	Substeps:  28,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Outline(physics.Stadium(physics.V(0, 0), physics.V(52, 9), 6)...),
		Zones: []physics.Zone{
			// the ramp, rising toward the ditch (it pushes back down the way it rises)
			{Kind: physics.Slope, Min: physics.V(17, 0), Max: physics.V(24, 9), Vec: physics.V(-0.3, 0), Mark: '^', Skin: "ramp"},
			// the ditch, wall to wall: in the air it is flown over, on the ground it is the tee again
			{Kind: physics.Hazard, Min: physics.V(24, 0), Max: physics.V(28, 9), Vec: physics.V(4, 4.5), Mark: '~', Skin: "ditch"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
