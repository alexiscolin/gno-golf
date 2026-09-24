// Package town15 is the rooftops: four flat roofs one after another, joined
// by narrow planks laid over the streets below, with a turn at every roof.
// Chimneys stand on the tall roof and on the third. A cat sleeps on the
// second plank every other stroke (the first, the third...): cross it on
// the second. Step off a roof or a plank and you are back where that stretch
// began.
package town15

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

// roofs is the walkable outline: roof A (the tee), plank 1, roof B (tall),
// plank 2, roof C, plank 3, roof D (the cup). A fresh copy for each zone:
// Fit moves every zone's polygon in place.
func roofs() []physics.Vec2 {
	return []physics.Vec2{
		physics.V(3, 3), physics.V(14, 3), physics.V(14, 6.5), physics.V(22, 6.5), physics.V(22, 3), physics.V(30, 3),
		physics.V(30, 17.5), physics.V(37, 17.5), physics.V(37, 12), physics.V(45, 12), physics.V(45, 12.5), physics.V(51, 12.5),
		physics.V(51, 3), physics.V(58, 3), physics.V(58, 16), physics.V(51, 16), physics.V(51, 15.5), physics.V(45, 15.5),
		physics.V(45, 23), physics.V(37, 23), physics.V(37, 20), physics.V(30, 20), physics.V(30, 22), physics.V(22, 22),
		physics.V(22, 9), physics.V(14, 9), physics.V(14, 12), physics.V(3, 12),
	}
}

var me = course.Fit(&course.Simple{
	W: 61, H: 26,
	World:     "town",
	Order:     15,
	Title:     "Rooftops",
	Strokes:   4, // par
	Tee:       physics.V(6, 7.5),
	Pin:       physics.V(55, 11),
	Substeps:  28,
	CupRadius: 1.2,
	Shelter:   0.08, // no rails: the wind is capped so it cannot blow every line off
	Pulses: []course.Pulse{
		// the cat, asleep on plank 2 on strokes 1, 3, 5...
		{Every: 2, On: 1, Offset: 0, Posts: []physics.Post{{Circle: physics.Circle{C: physics.V(33.5, 18.75), R: 0.6}, Bounce: 0.7, Skin: "cat"}}},
	},
	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Box(physics.V(0, 0), physics.V(61, 26)),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(26, 7.5), R: 0.8}, Bounce: 0.7, Skin: "chimney"},
			{Circle: physics.Circle{C: physics.V(26, 15), R: 0.8}, Bounce: 0.7, Skin: "chimney"},
			{Circle: physics.Circle{C: physics.V(41, 16), R: 0.8}, Bounce: 0.7, Skin: "chimney"},
		},
		Zones: []physics.Zone{
			// off the roofs: back to the start of the stretch you fell from (the
			// first zone a ball is in acts: past plank 2, past plank 1, the rest)
			{Kind: physics.Hazard, Min: physics.V(37, 0), Max: physics.V(62, 26), Vec: physics.V(41, 21), Poly: roofs(), Outside: true, Skin: "roof"},
			{Kind: physics.Hazard, Min: physics.V(22, 0), Max: physics.V(37, 26), Vec: physics.V(24.5, 5.5), Poly: roofs(), Outside: true, Skin: "roof"},
			{Kind: physics.Hazard, Min: physics.V(0, 0), Max: physics.V(61, 26), Vec: physics.V(6, 7.5), Poly: roofs(), Outside: true, Skin: "roof"},
			// the planks over the streets (drawn as planks; they play as the roofs)
			{Kind: physics.Surface, Min: physics.V(14, 6.5), Max: physics.V(22, 9), Scale: 1, Skin: "plank bridge"},
			{Kind: physics.Surface, Min: physics.V(30, 17.5), Max: physics.V(37, 20), Scale: 1, Skin: "plank bridge"},
			{Kind: physics.Surface, Min: physics.V(45, 12.5), Max: physics.V(51, 15.5), Scale: 1, Skin: "plank bridge"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
