// Package hole2 is a lane of bumpers, and a mole guarding the gap.
package hole2

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	World: "garden", Order: 2,
	W: 44, H: 9,
	Title:     "Bumper Alley",
	Strokes:   3, // par
	Tee:       physics.V(4, 4.5),
	Pin:       physics.V(40, 4.5),
	Substeps:  22,
	CupRadius: 1.2,

	// a mole in the gap: down for your first stroke — a clean shot is allowed —
	// up for the second, down again… Its molehill shows where it lives.
	Pulses: []course.Pulse{{
		Every: 2, On: 1, Phase: 1,
		Posts: []physics.Post{{Circle: physics.Circle{C: physics.V(26, 4.5), R: 0.9}, Bounce: 1.1, Skin: "mole"}},
	}},
	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Stadium(physics.V(0, 0), physics.V(44, 9), 6)...),
			physics.Bar(physics.V(26, 0), physics.V(26, 3), 0.8, '|', "gate"),
			physics.Bar(physics.V(26, 6), physics.V(26, 9), 0.8, '|', "gate"),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(12, 2.8), R: 1.0}, Bounce: 1.2, Skin: "bumper"},
			{Circle: physics.Circle{C: physics.V(12, 6.2), R: 1.0}, Bounce: 1.2, Skin: "bumper"},
			{Circle: physics.Circle{C: physics.V(34, 4.5), R: 1.1}, Bounce: 1.3, Skin: "bumper"},
		},
		Zones: []physics.Zone{
			{Kind: physics.Surface, Min: physics.V(25, 3.4), Max: physics.V(27, 5.6), Scale: 1, Mark: 'm', Skin: "molehill"},
		},
		Friction: 0.86,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register lists this hole's realm with golf, from here or from its own
// init(cur realm): as a community hole, and under golf's namespace only once
// golf's owner expects this path. The course plays the hole as data
// (data/holes.txt), which the owner publishes.
func Register(cur realm) { golf.Register(cross(cur), me) }
