// Package island15 is a wide bay full of buoys that knock the ball about.
package island15

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 50, H: 20,
	World:     "island",
	Order:     15,
	Title:     "Buoy Bay",
	Strokes:   3, // par
	Tee:       physics.V(5, 9),
	Pin:       physics.V(44, 8),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(9, 4, physics.V(5, 9), physics.V(24, 11), physics.V(44, 8))...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(15, 8.6), R: 0.7}, Bounce: 1.2, Skin: "buoy"},
			{Circle: physics.Circle{C: physics.V(21, 13), R: 0.7}, Bounce: 1.2, Skin: "buoy"},
			{Circle: physics.Circle{C: physics.V(27, 9.4), R: 0.7}, Bounce: 1.2, Skin: "buoy"},
			{Circle: physics.Circle{C: physics.V(35, 11.4), R: 0.7}, Bounce: 1.2, Skin: "buoy"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
