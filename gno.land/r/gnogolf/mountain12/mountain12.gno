// Package mountain12 is a chalet that fills the path from side to side: the only way on is through its door.
package mountain12

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 46, H: 14,
	World:     "mountain",
	Order:     12,
	Title:     "The Chalet",
	Strokes:   2, // par
	Tee:       physics.V(5, 7),
	Pin:       physics.V(41, 7),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(6, 4, physics.V(5, 7), physics.V(23, 7), physics.V(41, 7))...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(23, 7), R: 2.4}, Bounce: 0.6, Skin: "chalet"},
		},
		Zones: []physics.Zone{
			{Kind: physics.Tunnel, Min: physics.V(18.6, 6.2), Max: physics.V(19.8, 7.8), Vec: physics.V(26.6, 7), Round: true, Skin: "door"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
