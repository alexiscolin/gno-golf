// Package town14 is the street ends at a house: knock at the front door and it lets you out on the back street, by the cup.
package town14

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 44, H: 22,
	World:     "town",
	Order:     14,
	Title:     "Side Door",
	Strokes:   3, // par
	Tee:       physics.V(5, 5),
	Pin:       physics.V(38, 16),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(6, 4, physics.V(5, 5), physics.V(28, 5))...),
			physics.Outline(physics.Lane(6, 4, physics.V(12, 16), physics.V(26, 17), physics.V(38, 16))...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(28.6, 5), R: 2.2}, Bounce: 0.6, Skin: "house"},
		},
		Zones: []physics.Zone{
			{Kind: physics.Tunnel, Min: physics.V(24.6, 4.2), Max: physics.V(25.8, 5.8), Vec: physics.V(14.4, 16), Round: true, Skin: "door"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
