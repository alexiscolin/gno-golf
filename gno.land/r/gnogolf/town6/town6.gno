// Package town6 is the skate park: a concrete bowl cut in two by a long
// ledge. Tee off along the top, past the grind rail, and carve the
// quarter-pipe at the far end to come back along the bottom. On the way home
// a funbox fills the whole alley: hit it soft and the ball rolls over the
// deck, fast and it takes off and flies. The pipes never hold a ball, they
// send it back down.
package town6

import (
	"math"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

var me = course.Fit(&course.Simple{
	W: 50, H: 28,
	World:     "town",
	Order:     6,
	Title:     "Skate Park",
	Strokes:   3, // par
	Tee:       physics.V(6, 7.5),
	Pin:       physics.V(6.5, 18.5),
	Substeps:  28,
	CupRadius: 1.2,
	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Path(
				physics.Arc(physics.V(6, 6), 4, math.Pi, 1.5*math.Pi, 3),
				physics.Arc(physics.V(42, 6), 4, 1.5*math.Pi, 2*math.Pi, 3),
				physics.Arc(physics.V(42, 20), 4, 0, 0.5*math.Pi, 3),
				physics.Arc(physics.V(6, 20), 4, 0.5*math.Pi, math.Pi, 3),
			)...),
			// the ledge down the middle, open at the bowl end
			physics.Bar(physics.V(2, 13), physics.V(32, 13), 0.8, '#', "ledge"),
			// the grind rail along the top alley
			physics.Bar(physics.V(16, 9.5), physics.V(28, 9.5), 0.4, '=', "rail"),
		),
		Zones: []physics.Zone{
			// the quarter-pipes: they push back to the flat, harder than the drag
			{Kind: physics.Slope, Min: physics.V(40, 2), Max: physics.V(46, 24), Vec: physics.V(-0.22, 0), Mark: '^', Skin: "quarter pipe"},
			{Kind: physics.Slope, Min: physics.V(6, 2), Max: physics.V(40, 4.5), Vec: physics.V(0, 0.18), Mark: '^', Skin: "quarter pipe"},
			{Kind: physics.Slope, Min: physics.V(2, 13.4), Max: physics.V(5, 24), Vec: physics.V(0.2, 0), Mark: '^', Skin: "quarter pipe"},
			// the funbox across the bottom alley: up, a flat deck (x 18-21), down
			{Kind: physics.Slope, Min: physics.V(15, 13), Max: physics.V(18, 24), Vec: physics.V(-0.3, 0), Mark: '/', Skin: "funbox"},
			{Kind: physics.Slope, Min: physics.V(21, 13), Max: physics.V(24, 24), Vec: physics.V(0.3, 0), Mark: '\\', Skin: "funbox"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
