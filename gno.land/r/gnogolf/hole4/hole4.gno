// Package hole4 is a windmill across the lane, and the only way past it is
// through one of its three doors. Each door is a tunnel with its own pipe
// through the mill: the middle one comes out by the cup, the top and bottom
// ones leave you in a far corner. The sails turn all the time, and a sail
// sweeping past a door shuts it for as long as it is there: arrive between
// two. It is a course.Simple: the sails are timed walls.
package hole4

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

// the doors, top to bottom: where their mouths are on the mill's face
var doors = []float64{2.4, 6, 9.6}

func door(y float64, to physics.Vec2) physics.Zone {
	return physics.Zone{
		Kind: physics.Tunnel, Min: physics.V(24.6, y-1.1), Max: physics.V(27, y+1.1),
		Vec: to, Mark: 'D', Skin: "tunnel", Round: true,
	}
}

// The wheel turns once in turn substeps and has four sails, so what the
// doors see repeats every quarter turn. A sail hangs straight down over the
// middle door at the start of each quarter and stays over it a substep either
// side; it crosses the side doors, 60° out, a third of the way through the
// quarter (the top door, on screen) and two thirds (the bottom one).
const turn = 24

func sail(i, on, at int) []physics.Wall {
	y := doors[i]
	q := turn / 4
	return physics.Timed(physics.Bar(physics.V(24.2, y-1.4), physics.V(24.2, y+1.4), 0.5, 'S', "sail"), q, on, (q-at)%q)
}

var me = course.Fit(&course.Simple{
	World: "garden", Order: 4,
	W: 48, H: 12,
	Title:     "The Mill",
	Strokes:   2, // par
	Tee:       physics.V(4, 6),
	Pin:       physics.V(44, 6),
	Substeps:  22,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Stadium(physics.V(0, 0), physics.V(48, 12), 6)...),
			// the mill itself, wall to wall: nothing rolls round it
			physics.Box(physics.V(27, 0), physics.V(33, 12)),
			// its sails, over each door while they pass it
			sail(1, 3, turn/4-1), sail(0, 1, 2), sail(2, 1, 4),
		),
		Zones: []physics.Zone{
			// all three come out behind the mill, each at its own height
			door(doors[0], physics.V(36, 1.8)),
			door(doors[1], physics.V(37.5, 6)),
			door(doors[2], physics.V(36, 10.2)),
			// the mill's body, for whoever draws it; the ball never gets here
			{Kind: physics.Surface, Min: physics.V(27, 0), Max: physics.V(33, 12), Scale: 1, Mark: 'M', Skin: "mill"},
		},
		Friction: 0.86,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
