// Package mountain14 is up two terraces, then a long run down to the cup on a
// patch of ice: stop it if you can.
package mountain14

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

var me = author.Fit(&course.Simple{
	W: 52, H: 14,
	World:     "mountain",
	Order:     14,
	Title:     "Terraces",
	Strokes:   2, // par
	Tee:       physics.V(5, 7),
	Pin:       physics.V(47, 7),
	Substeps:  28,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: build.Walls(
			build.Outline(build.Lane(6, 4, physics.V(5, 7), physics.V(26, 7.5), physics.V(47, 7))...),
		),
		Zones: []physics.Zone{
			{Kind: physics.Slope, Min: physics.V(10, 0), Max: physics.V(13, 14), Vec: physics.V(-0.3, 0), Skin: "terrace"},
			{Kind: physics.Slope, Min: physics.V(18, 0), Max: physics.V(21, 14), Vec: physics.V(-0.3, 0), Skin: "terrace"},
			{Kind: physics.Slope, Min: physics.V(27, 0), Max: physics.V(39, 14), Vec: physics.V(0.16, 0), Skin: "downhill"},
			{Kind: physics.Surface, Min: physics.V(39, 3), Max: physics.V(51, 11), Scale: 1.18, Round: true, Skin: "ice"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
