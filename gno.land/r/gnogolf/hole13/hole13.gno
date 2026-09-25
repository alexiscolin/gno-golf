// Package hole13 is a lane that splits round a long flower bed and meets again: the wide way is through the bunker, the narrow way is clean, but a stump waits where the two meet.
package hole13

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 46, H: 16,
	World:     "garden",
	Order:     12,
	Title:     "Round the Bed",
	Strokes:   3, // par
	Tee:       physics.V(4, 8),
	Pin:       physics.V(42, 8),
	Substeps:  24,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Walls(physics.Outline(physics.Stadium(physics.V(0, 0), physics.V(46, 16), 8)...), physics.Outline(physics.Stadium(physics.V(13, 4), physics.V(33, 9), 4)...)),
		),
		// a stump where the two ways meet, in the line off the narrow one
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(39, 6), R: 0.8}, Bounce: 0.6, Skin: "stump"},
		},
		Zones: []physics.Zone{
			{Kind: physics.Surface, Min: physics.V(15, 10.2), Max: physics.V(31, 15.6), Scale: 0.5, Round: true, Skin: "sand"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
