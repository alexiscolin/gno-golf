// Package island5 is the tide line: a shelving beach with no rail on the
// sea side. The whole beach leans toward the water, so a rolling ball
// drifts downhill and the line to the cup is aimed high and let break. A
// band of wet sand above the waterline catches a drifting ball before the
// sea; a log of driftwood, washed up against the dunes,
// shuts the high line: round its end, the beach takes the ball away.
package island5

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 44, H: 22,
	World:     "island",
	Order:     5,
	Title:     "Tide Line",
	Strokes:   3, // par
	Tee:       physics.V(6, 6),
	Pin:       physics.V(38, 8),
	Substeps:  26,
	CupRadius: 1.2,
	Shelter:   0.08, // no rail on the sea side: a gale would blow a ball into it

	Course: &physics.Field{
		Walls: physics.Walls(
			// the dunes behind and the rocks at each end; the sea side is open
			physics.Polyline(physics.V(3, 18), physics.V(3, 3), physics.V(41, 3), physics.V(41, 15)),
			// a driftwood log washed up against the dunes, across the high
			// line: soft, it soaks the pace up
			physics.Soft(physics.Bar(physics.V(19, 3.5), physics.V(23, 8.4), 0.8, '#', "driftwood"), 0.4),
		),
		Zones: []physics.Zone{
			// the sea: everything past the wavy waterline
			{Kind: physics.Hazard, Min: physics.V(0, 0), Max: physics.V(44, 22), Vec: physics.V(6, 6), Mark: '~', Skin: "sea", Outside: true,
				Poly: []physics.Vec2{physics.V(2, 2), physics.V(42, 2), physics.V(42, 15), physics.V(30, 17.5), physics.V(16, 16), physics.V(2, 18)}},
			// the camber: the whole beach falls toward the sea, gently enough
			// for a ball to stop on it
			{Kind: physics.Slope, Min: physics.V(3, 3), Max: physics.V(41, 18), Vec: physics.V(0, 0.08), Skin: "beach"},
			// wet sand above the waterline (after the camber: the last surface wins)
			{Kind: physics.Surface, Min: physics.V(2, 12.5), Max: physics.V(42, 18), Scale: 0.6, Mark: ',', Skin: "wetsand",
				Poly: []physics.Vec2{physics.V(2, 14.5), physics.V(16, 13), physics.V(30, 14.5), physics.V(42, 12.5), physics.V(42, 15), physics.V(30, 17.5), physics.V(16, 16), physics.V(2, 18)}},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register lists this hole's realm with golf, from here or from its own
// init(cur realm): as a community hole, and under golf's namespace only once
// golf's owner expects this path. The course plays the hole as data
// (data/holes.txt), which the owner publishes.
func Register(cur realm) { golf.Register(cross(cur), me) }
