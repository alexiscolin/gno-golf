// Package mountain13 is a round bowl with the cup in the middle, ringed by bouncy snowmen open only at the back: go round and come in from behind.
package mountain13

import (
	"math"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 28, H: 28,
	World:     "mountain",
	Order:     13,
	Title:     "Snowman Bowl",
	Strokes:   3, // par
	Tee:       physics.V(5, 14),
	Pin:       physics.V(14, 14),
	Substeps:  24,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Arc(physics.V(14, 14), 11, 0, 2*math.Pi, 18)[:18]...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(15.8, 17.1176), R: 0.6}, Bounce: 1.3, Skin: "snowman"},
			{Circle: physics.Circle{C: physics.V(12.2, 17.1176), R: 0.6}, Bounce: 1.3, Skin: "snowman"},
			{Circle: physics.Circle{C: physics.V(10.4, 14.0), R: 0.6}, Bounce: 1.3, Skin: "snowman"},
			{Circle: physics.Circle{C: physics.V(12.2, 10.8824), R: 0.6}, Bounce: 1.3, Skin: "snowman"},
			{Circle: physics.Circle{C: physics.V(15.8, 10.8824), R: 0.6}, Bounce: 1.3, Skin: "snowman"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
