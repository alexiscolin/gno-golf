// Package town18 is the Grand Plaza, the cup's finale: a vast brick piazza
// entered from an avenue, a bandstand in the middle, two trams crossing its
// gate, a market row to the north, flower beds to the south, and the cup on a
// polished marble rosette under the clock obelisk.
package town18

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

// the plaza's outline: an avenue from the west into a chamfered square
var plaza = []physics.Vec2{
	physics.V(0, 16), physics.V(6, 16), physics.V(6, 8), physics.V(14, 0),
	physics.V(62, 0), physics.V(70, 8), physics.V(70, 36), physics.V(62, 44),
	physics.V(14, 44), physics.V(6, 36), physics.V(6, 28), physics.V(0, 28),
}

var me = course.Fit(&course.Simple{
	W: 70, H: 44,
	World:     "town",
	Order:     18,
	Title:     "Grand Plaza",
	Strokes:   4, // par
	Tee:       physics.V(3, 22),
	Pin:       physics.V(63, 14),
	Substeps:  30,
	CupRadius: 1.2,

	// pigeons on the paving: one on each route, never both at once
	Pulses: []course.Pulse{
		{Every: 2, On: 1, Offset: 0, Posts: []physics.Post{{Circle: physics.Circle{C: physics.V(45, 11), R: 0.6}, Bounce: 0.6, Skin: "pigeon"}}},
		{Every: 2, On: 1, Offset: 1, Posts: []physics.Post{{Circle: physics.Circle{C: physics.V(47, 31), R: 0.6}, Bounce: 0.6, Skin: "pigeon"}}},
	},

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(plaza...),
			// the two trams cross the plaza's gate on one line, north and south,
			// half a turn apart, each up 5 ticks in 24: the middle of the gate is
			// always open, and a tram has time to cross the plaza between two
			physics.Timed(physics.Bar(physics.V(20, 1.5), physics.V(20, 18.5), 2.4, '#', "tram"), 24, 5, 0),
			physics.Timed(physics.Bar(physics.V(20, 25.5), physics.V(20, 42.5), 2.4, '#', "tram"), 24, 5, 12),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(38, 22), R: 4.2}, Bounce: 0.7, Skin: "bandstand"},
			{Circle: physics.Circle{C: physics.V(53, 16), R: 1.5}, Bounce: 0.8, Skin: "obelisk"},
			{Circle: physics.Circle{C: physics.V(30, 7), R: 1.5}, Bounce: 0.6, Skin: "stall"},
			{Circle: physics.Circle{C: physics.V(38, 5), R: 1.5}, Bounce: 0.6, Skin: "stall"},
			{Circle: physics.Circle{C: physics.V(46, 7), R: 1.5}, Bounce: 0.6, Skin: "stall"},
			{Circle: physics.Circle{C: physics.V(31, 15), R: 0.35}, Bounce: 0.9, Skin: "lamp"},
			{Circle: physics.Circle{C: physics.V(45, 29), R: 0.35}, Bounce: 0.9, Skin: "lamp"},
		},
		Zones: []physics.Zone{
			// the whole floor is brick, a touch slower than a green; the patches
			// after it play their own way (the last surface a ball is on counts)
			{Kind: physics.Surface, Min: physics.V(0, 0), Max: physics.V(70, 44), Poly: plaza, Scale: 0.92, Skin: "brick"},
			{Kind: physics.Surface, Min: physics.V(26, 1), Max: physics.V(50, 11), Scale: 0.88, Skin: "herringbone"},
			{Kind: physics.Surface, Min: physics.V(26, 31), Max: physics.V(36, 38), Scale: 0.5, Round: true, Skin: "flowerbed"},
			{Kind: physics.Surface, Min: physics.V(52, 33), Max: physics.V(62, 40), Scale: 0.5, Round: true, Skin: "flowerbed"},
			{Kind: physics.Surface, Min: physics.V(57, 8), Max: physics.V(69, 20), Scale: 1.05, Round: true, Skin: "marble"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
