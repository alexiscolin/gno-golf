// Package island12 is a lane that splits round a big rock: left or right, and mind the small ones, the last two just short of the cup.
package island12

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var lane = physics.Lane(8, 4, physics.V(5, 9), physics.V(24, 8), physics.V(44, 10))

var me = course.Fit(&course.Simple{
	W: 50, H: 18,
	World:     "island",
	Order:     12,
	Title:     "Outcrops",
	Strokes:   3, // par
	Tee:       physics.V(5, 9),
	Pin:       physics.V(44, 10),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(lane...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(24, 8.2), R: 2.2}, Bounce: 0.7, Skin: "outcrop"},
			{Circle: physics.Circle{C: physics.V(14, 11.2), R: 0.6}, Bounce: 0.7, Skin: "outcrop"},
			{Circle: physics.Circle{C: physics.V(34, 6.5), R: 0.6}, Bounce: 0.7, Skin: "outcrop"},
			{Circle: physics.Circle{C: physics.V(40.5, 8.5), R: 0.5}, Bounce: 0.7, Skin: "outcrop"},
			{Circle: physics.Circle{C: physics.V(36.5, 11.6), R: 0.5}, Bounce: 0.7, Skin: "outcrop"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
