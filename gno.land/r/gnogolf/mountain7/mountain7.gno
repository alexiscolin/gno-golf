// Package mountain7 is up to the mountain's face and into the ice cave: it
// lets you out on the high path.
package mountain7

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

var me = author.Fit(&course.Simple{
	W: 56, H: 24,
	World:     "mountain",
	Order:     7,
	Title:     "Ice Cave",
	Strokes:   2, // par
	Tee:       physics.V(5, 5),
	Pin:       physics.V(51, 15),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: build.Walls(
			build.Outline(build.Lane(6, 4, physics.V(5, 5), physics.V(19, 6))...),
			build.Outline(build.Lane(6, 4, physics.V(30, 17), physics.V(42, 19), physics.V(51, 15))...),
		),
		Zones: []physics.Zone{
			{Kind: physics.Tunnel, Min: physics.V(17.2, 3.8), Max: physics.V(21.2, 8.2), Vec: physics.V(32, 17.2), Round: true, Skin: "ice cave"},
			{Kind: physics.Surface, Min: physics.V(36, 14), Max: physics.V(46, 22), Scale: 1.18, Round: true, Skin: "ice"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
