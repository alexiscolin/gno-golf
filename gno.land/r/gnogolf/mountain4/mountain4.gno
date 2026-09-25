// Package mountain4 is deep snow drifted across the lane from one side, then
// the other: find the path between, round the pines that stand by it.
package mountain4

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

var me = course.Fit(&course.Simple{
	W: 48, H: 16,
	World:     "mountain",
	Order:     4,
	Title:     "Snowdrifts",
	Strokes:   3, // par
	Tee:       physics.V(5, 8),
	Pin:       physics.V(43, 8),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(8, 4, physics.V(5, 8), physics.V(24, 7.5), physics.V(43, 8))...),
		),
		// a pine at the foot of the first drift, and one in the path between
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(12, 10.3), R: 0.6}, Bounce: 0.7, Skin: "pine"},
			{Circle: physics.Circle{C: physics.V(22, 9), R: 0.6}, Bounce: 0.7, Skin: "pine"},
		},
		Zones: []physics.Zone{
			{Kind: physics.Surface, Min: physics.V(13, 3), Max: physics.V(19, 10), Scale: 0.5, Round: true, Skin: "snowdrift"},
			{Kind: physics.Surface, Min: physics.V(26, 5.5), Max: physics.V(32, 12.5), Scale: 0.5, Round: true, Skin: "snowdrift"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
