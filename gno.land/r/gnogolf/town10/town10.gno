// Package town10 is a swing bridge over the canal. It is down on one stroke
// and swung open on the next: down, the ball rolls over; open, the canal is
// water across the whole street and sends you back to the start. Watch it
// before you shoot: it is open for the tee shot, so lay up short and cross
// on the next.
package town10

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var canal = physics.V(20, 0)

var me = course.Fit(&course.Simple{
	W: 50, H: 16,
	World:     "town",
	Order:     10,
	Title:     "Swing Bridge",
	Strokes:   3, // par
	Tee:       physics.V(5, 6),
	Pin:       physics.V(42, 10),
	Substeps:  26,
	CupRadius: 1.2,

	// the bridge: open for the first stroke, down for the second, open again…
	Pulses: []course.Pulse{
		{Every: 2, On: 1, Offset: 1, Zones: []physics.Zone{
			{Kind: physics.Surface, Min: physics.V(20, 0), Max: physics.V(24, 16), Scale: 1, Mark: '=', Skin: "bridge"},
		}},
		{Every: 2, On: 1, Offset: 0, Zones: []physics.Zone{
			{Kind: physics.Hazard, Min: physics.V(20, 0), Max: physics.V(24, 16), Vec: physics.V(5, 6), Mark: '~', Skin: "canal"},
		}},
	},

	Course: &physics.Field{
		Walls: physics.Outline(physics.Lane(6, 4, physics.V(5, 6), physics.V(18, 6), physics.V(28, 10), physics.V(42, 10))...),
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
