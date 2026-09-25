// Package hole19 is a round maze: three rings of fence, each with one gap, and
// walls between them that turn the short way into a dead end. The cup is in
// the middle. Getting lost is the point.
package hole19

import (
	"math"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var c = physics.V(20, 20)

// ring is a hedge round the centre with a gap of the given width (radians)
// centred on angle gap.
func ring(r, gap, width float64, n int) []physics.Wall {
	return physics.Polyline(physics.Arc(c, r, gap+width/2, gap-width/2+2*math.Pi, n)...)
}

// spoke is a straight hedge from one ring to the next, at an angle.
func spoke(r0, r1, a float64) []physics.Wall {
	return physics.Polyline(c.Add(physics.FromPolar(a, r0)), c.Add(physics.FromPolar(a, r1)))
}

var me = course.Fit(&course.Simple{
	World: "garden", Order: 17,
	W: 40, H: 40,
	Title:     "The Maze",
	Strokes:   5, // par
	Tee:       physics.V(20, 36),
	Pin:       c,
	Substeps:  30,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Arc(c, 18.5, 0, 2*math.Pi*9/10, 9)...),
			ring(13.5, -math.Pi/2, 0.45, 8),   // out through the top…
			ring(9, math.Pi/2, 0.6, 7),        // …in through the bottom…
			ring(4.6, math.Pi, 1.0, 6),        // …and the cup opens to the left
			spoke(13.5, 18.5, math.Pi/2-0.35), // the short way round from the tee is shut
			spoke(9, 13.5, -math.Pi/2+0.5),
			spoke(9, 13.5, math.Pi/5),
			spoke(4.6, 9, 0.3),
		),
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.8,
	},
}, 1.5)

func Register(cur realm) { golf.Register(cross(cur), me) }
