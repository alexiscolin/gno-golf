// Package mountain15 is the serac fall: a rising traverse under an icefall.
// Three seracs lean over the path, and each drops its ice across it in turn,
// over and over: a ball caught under falling ice is swept back down to the
// start. Watch the rhythm and let go so the ball runs the gaps, or lay up
// short of a serac and wait for the next stroke. Old debris lies where a
// lay-up would be easy.
package mountain15

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

// serac is where one serac's ice comes down: there 4 substeps in 12. The
// three take turns, one after another up the traverse.
func serac(min, max physics.Vec2, phase int) physics.Zone {
	return physics.Zone{Kind: physics.Hazard, Min: min, Max: max, Vec: physics.V(9, 17), Round: true, Mark: '*', Skin: "serac", Every: 12, On: 4, Phase: phase}
}

var me = course.Fit(&course.Simple{
	W: 52, H: 24,
	World:     "mountain",
	Order:     15,
	Title:     "Serac Fall",
	Strokes:   3, // par
	Tee:       physics.V(5, 18),
	Pin:       physics.V(47, 6),
	Substeps:  28,
	CupRadius: 1.2,
	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(7, 4, physics.V(5, 18), physics.V(20, 16), physics.V(34, 9), physics.V(47, 6))...),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(24, 18), R: 1.0}, Bounce: 0.5, Skin: "boulder"},
			{Circle: physics.Circle{C: physics.V(43, 10), R: 1.0}, Bounce: 0.5, Skin: "boulder"},
		},
		Zones: []physics.Zone{
			// the traverse rises toward the cup: it bends a rolling ball, and is too
			// gentle to move one that has stopped
			{Kind: physics.Slope, Min: physics.V(0, 0), Max: physics.V(52, 24), Vec: physics.V(-0.05, 0.02), Mark: '/', Skin: "slope"},
			serac(physics.V(16, 13), physics.V(21, 19), 0),
			serac(physics.V(26, 9.5), physics.V(31, 15.5), 8),
			serac(physics.V(36, 5.5), physics.V(41, 11.5), 4),
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
