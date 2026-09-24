// Package mountain15 is a wide slope strewn with boulders that stop a ball dead.
package mountain15

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 50, H: 20,
	World:     "mountain",
	Order:     15,
	Title:     "Boulder Field",
	Strokes:   3, // par
	Tee:       physics.V(5, 10),
	Pin:       physics.V(44, 10),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(10, 4, physics.V(5, 10), physics.V(24, 9), physics.V(44, 10))...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(14, 7.2), R: 1.2}, Bounce: 0.5, Skin: "boulder"},
			{Circle: physics.Circle{C: physics.V(19, 12.6), R: 1.0}, Bounce: 0.5, Skin: "boulder"},
			{Circle: physics.Circle{C: physics.V(25, 8.4), R: 1.6}, Bounce: 0.5, Skin: "boulder"},
			{Circle: physics.Circle{C: physics.V(32, 12.2), R: 1.0}, Bounce: 0.5, Skin: "boulder"},
			{Circle: physics.Circle{C: physics.V(36, 6.6), R: 1.2}, Bounce: 0.5, Skin: "boulder"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
