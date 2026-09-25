// Package mountain12 is the col: two high valleys joined by a narrow pass.
// The lane climbs from the tee's valley to the saddle and falls away to the
// cup's, pinched to a gap at the top. Too soft and the ball rolls back down
// to where it started; over the saddle fast and it takes off, and a hot
// descent runs into the snowdrift on the low side.
package mountain12

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

var me = course.Fit(&course.Simple{
	W: 48, H: 26,
	World:     "mountain",
	Order:     12,
	Title:     "The Col",
	Strokes:   3, // par
	Tee:       physics.V(6, 19),
	Pin:       physics.V(42, 19),
	Substeps:  28,
	CupRadius: 1.2,
	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.V(2, 3), physics.V(20, 6), physics.V(24, 10.5), physics.V(28, 6), physics.V(46, 3),
				physics.V(46, 23), physics.V(28, 20), physics.V(24, 15.5), physics.V(20, 20), physics.V(2, 23)),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(38.5, 16.5), R: 0.6}, Bounce: 0.5, Skin: "pine"},
			{Circle: physics.Circle{C: physics.V(12, 8), R: 0.6}, Bounce: 0.5, Skin: "pine"},
		},
		Zones: []physics.Zone{
			// the saddle: up to the col, then down the far side, steep enough that
			// a ball stopped on it rolls back down
			{Kind: physics.Slope, Min: physics.V(14, 3), Max: physics.V(24, 23), Vec: physics.V(-0.17, 0), Mark: '/', Skin: "saddle crest"},
			{Kind: physics.Slope, Min: physics.V(24, 3), Max: physics.V(34, 23), Vec: physics.V(0.17, 0), Mark: '\\', Skin: "saddle crest"},
			// a drift on the low line catches a hot descent; a pine shields the cup
			{Kind: physics.Surface, Min: physics.V(30, 14), Max: physics.V(36, 20), Scale: 0.5, Round: true, Mark: ',', Skin: "snowdrift"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
