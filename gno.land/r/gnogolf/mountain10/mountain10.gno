// Package mountain10 is a narrow ridge swept by a snow cannon. Past the first
// stretch the way narrows to a spine with a drop on each side, and the cannon
// blows across it in bursts. Cross while it rests, or be blown over the edge
// and start again. A pine by the tee stands in the straight line along it.
package mountain10

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

// the cannon blows for 4 substeps in every 10
const gustEvery, gustOn = 10, 4

var me = course.Fit(&course.Simple{
	W: 46, H: 18,
	World:     "mountain",
	Order:     10,
	Title:     "Snow Cannon Ridge",
	Strokes:   3, // par
	Tee:       physics.V(5, 9),
	Pin:       physics.V(40, 9),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Outline(physics.Lane(7, 4, physics.V(5, 9), physics.V(40, 9))...),
		// a pine just off the tee, square in the line along the spine
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(7.9, 9.3), R: 0.6}, Bounce: 0.7, Skin: "pine"},
		},
		Zones: []physics.Zone{
			// the drops either side of the spine
			{Kind: physics.Hazard, Min: physics.V(16, 4), Max: physics.V(30, 7.6), Vec: physics.V(5, 9), Mark: '~', Skin: "cliff"},
			{Kind: physics.Hazard, Min: physics.V(16, 10.4), Max: physics.V(30, 14), Vec: physics.V(5, 9), Mark: '~', Skin: "cliff"},
			// the cannon's bursts, across the spine
			{Kind: physics.Slope, Min: physics.V(16, 4), Max: physics.V(30, 14), Vec: physics.V(0, 0.35), Mark: '>', Skin: "gust", Every: gustEvery, On: gustOn, Air: true},
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
