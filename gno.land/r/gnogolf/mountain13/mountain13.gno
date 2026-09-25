// Package mountain13 is the ice rink: a frozen rink inside lively boards,
// with the cup in a goal net at the far end, open only toward the rink.
// Skaters go round in three pairs, one pair on the ice each stroke, and they
// come back every third stroke: the board shows where this stroke's pair
// stands. On the first stroke (and the fourth) one of them is the goalie, in
// the mouth of the net.
package mountain13

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

// skaters is one stroke's pair of skaters: the first of size ra (the
// goalie is broader, pads and all), the second an ordinary skater.
func skaters(phase int, a physics.Vec2, ra float64, b physics.Vec2) course.Pulse {
	return course.Pulse{Every: 3, On: 1, Phase: phase, Posts: []physics.Post{
		{Circle: physics.Circle{C: a, R: ra}, Bounce: 0.8, Skin: "skater"},
		{Circle: physics.Circle{C: b, R: 0.7}, Bounce: 0.8, Skin: "skater"},
	}}
}

var me = course.Fit(&course.Simple{
	W: 44, H: 22,
	World:     "mountain",
	Order:     13,
	Title:     "Ice Rink",
	Strokes:   3, // par
	Tee:       physics.V(8, 16),
	Pin:       physics.V(37, 11),
	Substeps:  28,
	CupRadius: 1.2,
	Pulses: []course.Pulse{
		skaters(0, physics.V(34.4, 11), 0.9, physics.V(18, 9)), // strokes 1, 4...: the goalie
		skaters(2, physics.V(22, 13), 0.7, physics.V(28, 8)),   // strokes 2, 5...
		skaters(1, physics.V(26, 15), 0.7, physics.V(30, 11)),  // strokes 3, 6...
	},
	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Stadium(physics.V(2, 2), physics.V(42, 20), 8)...),
			// the goal net round the cup, open toward the rink, its back well
			// clear of the flag
			physics.Soft(physics.Bar(physics.V(39.2, 9), physics.V(39.2, 13), 0.4, '#', "net"), 0.3),
			physics.Soft(physics.Bar(physics.V(35, 9), physics.V(39.2, 9), 0.4, '#', "net"), 0.3),
			physics.Soft(physics.Bar(physics.V(35, 13), physics.V(39.2, 13), 0.4, '#', "net"), 0.3),
		),
		Zones: []physics.Zone{
			{Kind: physics.Surface, Min: physics.V(2, 2), Max: physics.V(42, 20), Scale: 1.15, Mark: '-', Skin: "ice"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.9, // lively boards
	},
}, 1.5)
