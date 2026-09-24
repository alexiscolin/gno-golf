// Package town18 is the town's grand plaza: an oval square with the fountain in the middle and the tram sweeping across it.
package town18

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 48, H: 24,
	World:     "town",
	Order:     18,
	Title:     "Grand Plaza",
	Strokes:   3, // par
	Tee:       physics.V(6, 12),
	Pin:       physics.V(41, 12),
	Substeps:  28,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Stadium(physics.V(2, 2), physics.V(46, 22), 8)...),
			physics.Timed(physics.Bar(physics.V(34, 3.2), physics.V(34, 20.8), 2, '#', "tram"), 12, 5, 0),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(24, 5.4), R: 0.35}, Bounce: 0.9, Skin: "lamp"},
			{Circle: physics.Circle{C: physics.V(24, 18.6), R: 0.35}, Bounce: 0.9, Skin: "lamp"},
		},
		Zones: []physics.Zone{
			{Kind: physics.Hazard, Min: physics.V(20, 9), Max: physics.V(28, 15), Vec: physics.V(12, 12), Round: true, Skin: "fountain"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
