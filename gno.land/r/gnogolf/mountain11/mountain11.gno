// Package mountain11 is the bobsleigh: an iced chute snakes from the tee
// and drops straight down the mountain, runs out into a banked hairpin at
// the bottom, and comes back up the braking stretch to the cup. The bank,
// leaning in, carries a fast ball round the hairpin; a slow one slides down
// into its inside. The braking stretch climbs gently back up to the cup: a
// soft ball stops short on it, and a snowdrift short of the cup catches a
// ball still running hot.
package mountain11

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

var me = course.Fit(&course.Simple{
	W: 30, H: 40,
	World:     "mountain",
	Order:     11,
	Title:     "The Bobsleigh",
	Strokes:   3, // par
	Tee:       physics.V(6, 4),
	Pin:       physics.V(19.5, 11),
	Substeps:  30,
	CupRadius: 1.2,
	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Outline(physics.Lane(4.4, 2, physics.V(6, 4), physics.V(11, 9), physics.V(6, 14), physics.V(6, 23), physics.V(9, 29), physics.V(19, 28), physics.V(19.5, 11))...),
		),
		Zones: []physics.Zone{
			// the drop: a straight run down the chute, steeper than the drag, so a
			// ball never rests on it (straight, so no bank of it faces uphill)
			{Kind: physics.Slope, Min: physics.V(2, 15.5), Max: physics.V(10, 22), Vec: physics.V(0, 0.16), Mark: 'v', Skin: "downhill"},
			// the hairpin's bank, leaning in toward the inside of the turn, steep
			// enough on the ice to slide a stopped ball in (at 0.12 it held it)
			{Kind: physics.Slope, Min: physics.V(0, 27), Max: physics.V(26, 34), Vec: physics.V(0, -0.16), Mark: '^', Skin: "bank"},
			// the braking stretch climbs back up to the cup: too gentle to move a
			// stopped ball (the cup sits on it)
			{Kind: physics.Slope, Min: physics.V(15, 6), Max: physics.V(26, 25), Vec: physics.V(0, 0.07), Mark: '/', Skin: "slope"},
			// the whole run is iced
			{Kind: physics.Surface, Min: physics.V(0, 0), Max: physics.V(26, 34), Scale: 1.1, Mark: '-', Skin: "ice"},
			// a drift short of the cup
			{Kind: physics.Surface, Min: physics.V(17, 13.5), Max: physics.V(22, 17.5), Scale: 0.5, Round: true, Mark: ',', Skin: "snowdrift"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)

// Register publishes this hole to golf. A hole cannot do it from init(): there
// is no `cur` there, so it takes one transaction after the deploy.
func Register(cur realm) { golf.Register(cross(cur), me) }
