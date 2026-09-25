// Package island8 is the rock pools: a shelf of flat rock running up the
// shore, with a tide pool in each bend of it. The line zig-zags up the shelf
// between them, one pool after another; a ball that rolls into one is fished
// out on the near side of it, not sent back to the tee. Wet sand round the
// cup slows the last run in.
package island8

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

// pool is a tide pool: the polygon, drawn and played as it is, and where a
// ball that falls in is put back.
func pool(back physics.Vec2, pts ...physics.Vec2) physics.Zone {
	lo, hi := pts[0], pts[0]
	for _, p := range pts {
		if p.X < lo.X {
			lo.X = p.X
		}
		if p.Y < lo.Y {
			lo.Y = p.Y
		}
		if p.X > hi.X {
			hi.X = p.X
		}
		if p.Y > hi.Y {
			hi.Y = p.Y
		}
	}
	return physics.Zone{Kind: physics.Hazard, Min: lo, Max: hi, Vec: back, Mark: '~', Skin: "tidepool", Poly: pts}
}

var me = course.Fit(&course.Simple{
	W: 28, H: 40,
	World:     "island",
	Order:     8,
	Title:     "Rock Pools",
	Strokes:   3, // par
	Tee:       physics.V(10, 34),
	Pin:       physics.V(16, 6),
	Substeps:  26,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.V(4, 38), physics.V(16, 38), physics.V(24, 32), physics.V(26, 20), physics.V(20, 14),
				physics.V(24, 4), physics.V(12, 2), physics.V(4, 8), physics.V(8, 20), physics.V(3, 28)),
		),
		Zones: []physics.Zone{
			pool(physics.V(9, 33), physics.V(14, 31), physics.V(24.5, 29), physics.V(25, 24), physics.V(15, 26.5)),
			pool(physics.V(12, 24), physics.V(6.5, 15), physics.V(17, 15.5), physics.V(16.5, 19), physics.V(7.6, 20)),
			pool(physics.V(18, 14), physics.V(9, 12), physics.V(15, 10), physics.V(14, 7), physics.V(8, 8)),
			{Kind: physics.Surface, Min: physics.V(14, 9), Max: physics.V(20, 13), Scale: 0.6, Mark: ',', Skin: "wetsand",
				Poly: []physics.Vec2{physics.V(14, 13), physics.V(20, 12), physics.V(19, 9), physics.V(15, 9.5)}},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
