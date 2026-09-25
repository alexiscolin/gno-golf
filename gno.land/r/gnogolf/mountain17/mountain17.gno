// Package mountain17 is a glacier split by a crevasse: the short way along it
// is sheer ice, the long way round is deep snow, and two pines stand at the
// fork.
package mountain17

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 54, H: 22,
	World:     "mountain",
	Order:     17,
	Title:     "Glacier Split",
	Strokes:   3, // par
	Tee:       physics.V(5, 11),
	Pin:       physics.V(47, 15),
	Substeps:  28,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(12, 4, physics.V(5, 11), physics.V(27, 11), physics.V(49, 11))...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(43.5, 7.6), R: 0.6}, Bounce: 0.7, Skin: "pine"},
			// and two at the fork, where the ice and the snow part
			{Circle: physics.Circle{C: physics.V(13.3, 9.8), R: 0.6}, Bounce: 0.7, Skin: "pine"},
			{Circle: physics.Circle{C: physics.V(11.6, 8.4), R: 0.6}, Bounce: 0.7, Skin: "pine"},
		},
		Zones: []physics.Zone{
			{Kind: physics.Hazard, Min: physics.V(14, 9.6), Max: physics.V(40, 12.4), Vec: physics.V(8, 11), Skin: "crevasse"},
			{Kind: physics.Surface, Min: physics.V(14, 5), Max: physics.V(40, 9.6), Scale: 1.18, Skin: "ice"},
			{Kind: physics.Surface, Min: physics.V(14, 12.4), Max: physics.V(40, 17), Scale: 0.5, Round: true, Skin: "snowdrift"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register lists this hole's realm with golf, from here or from its own
// init(cur realm): as a community hole, and under golf's namespace only once
// golf's owner expects this path. The course plays the hole as data
// (data/holes.txt), which the owner publishes.
func Register(cur realm) { golf.Register(cross(cur), me) }
