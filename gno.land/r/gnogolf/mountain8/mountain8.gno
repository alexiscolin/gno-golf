// Package mountain8 is the ski lift: a chairlift runs up the lane from the
// tee to the cup, its benches gliding along it one after another. Each one
// sinks down onto the lane as it passes over one of three spots, and a ball
// that meets it there bounces off; the spots take turns, up the lane, a
// third of the time each. A snowdrift across the run-out stops a ball still
// running hot off the lift.
package mountain8

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 48, H: 16,
	World:     "mountain",
	Order:     8,
	Title:     "Ski Lift",
	Strokes:   3, // par
	Tee:       physics.V(5, 8),
	Pin:       physics.V(43, 8),
	Substeps:  28,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(7, 4, physics.V(5, 8), physics.V(24, 9), physics.V(43, 8))...),
			physics.Timed(physics.Bar(physics.V(20, 4.8), physics.V(20, 13.2), 0.8, '#', "lift"), 12, 4, 0),
			physics.Timed(physics.Bar(physics.V(24.5, 5), physics.V(24.5, 13.2), 0.8, '#', "lift"), 12, 4, 8),
			physics.Timed(physics.Bar(physics.V(29, 4.8), physics.V(29, 13.2), 0.8, '#', "lift"), 12, 4, 4),
		),
		Zones: []physics.Zone{
			// a drift across the run-out: a ball still running hot off the lift dies in it
			{Kind: physics.Surface, Min: physics.V(34, 5), Max: physics.V(40, 12), Scale: 0.5, Round: true, Mark: ',', Skin: "snowdrift"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
