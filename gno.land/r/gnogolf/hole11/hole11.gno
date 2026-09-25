// Package hole11 is the vegetable patch: three slanted rows of soil across
// the plot, with grass paths between them. Soil is slow going, so the line
// to the cup is a choice: along the top path and down the headland past the
// wheelbarrow, or threaded along a path between the rows, or straight
// through the cabbages — short, and heavy.
package hole11

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

// a row of the patch: a slanted strip of soil from the fence (x 2) to the
// headland (x 32), falling 5 over its length
func row(y0, w float64) physics.Zone {
	return physics.Zone{
		Kind: physics.Surface, Min: physics.V(2, y0), Max: physics.V(32, y0+5+w), Scale: 0.35, Mark: ':', Skin: "soil",
		Poly: []physics.Vec2{physics.V(2, y0), physics.V(32, y0+5), physics.V(32, y0+5+w), physics.V(2, y0+w)},
	}
}

var me = course.Fit(&course.Simple{
	World: "garden", Order: 10,
	W: 40, H: 30,
	Title:     "The Vegetable Patch",
	Strokes:   3, // par
	Tee:       physics.V(6, 5),
	Pin:       physics.V(21, 21.7),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.V(2, 2), physics.V(38, 2), physics.V(38, 28), physics.V(12, 28), physics.V(2, 18)),
			// the wheelbarrow at the head of the top path: it soaks up a shot along it
			physics.Soft(physics.Bar(physics.V(35.4, 3.6), physics.V(36.9, 5.4), 1.2, '#', "wheelbarrow"), 0.4),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(27.5, 23.3), R: 0.7}, Bounce: 0.6, Skin: "scarecrow"},
		},
		Zones: []physics.Zone{
			row(8, 3),
			row(14, 3),
			row(20, 2.5),
		},
		Friction: 0.86,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
