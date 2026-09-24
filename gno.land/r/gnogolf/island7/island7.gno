// Package island7 is a round islet with a great sandcastle in the middle: round it by either side, or straight through its gate.
package island7

import (
	"math"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 32, H: 26,
	World:     "island",
	Order:     7,
	Title:     "The Sandcastle",
	Strokes:   3, // par
	Tee:       physics.V(7, 13),
	Pin:       physics.V(25, 13),
	Substeps:  24,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Arc(physics.V(16, 13), 11, 0, 2*math.Pi, 20)[:20]...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(17, 13), R: 3.2}, Bounce: 0.6, Skin: "sandcastle"},
		},
		Zones: []physics.Zone{
			{Kind: physics.Tunnel, Min: physics.V(12.4, 12.2), Max: physics.V(13.4, 13.8), Vec: physics.V(21.6, 13), Round: true, Skin: "castle gate"},
			{Kind: physics.Slope, Min: physics.V(14, 19), Max: physics.V(15.6, 23), Vec: physics.V(-0.3, 0), Skin: "mound"},
			{Kind: physics.Slope, Min: physics.V(16.4, 19), Max: physics.V(18, 23), Vec: physics.V(0.3, 0), Skin: "mound"},
			{Kind: physics.Slope, Min: physics.V(15.6, 21.4), Max: physics.V(16.4, 23), Vec: physics.V(0, 0.3), Skin: "mound"},
			{Kind: physics.Slope, Min: physics.V(15.6, 19), Max: physics.V(16.4, 20.6), Vec: physics.V(0, -0.3), Skin: "mound"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
