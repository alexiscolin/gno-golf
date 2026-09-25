// Package hole20 is the seesaw, the garden's finale. A lily pond fills the
// board from wall to wall, and the only way over is a long plank balanced on a
// stone in the middle that rocks, all the time, on a clock: tipped toward the
// tee it rolls a ball back, tipped away it carries it on. A slow ball rocks to
// and fro on it until the stroke is over and stops wherever it is; it does not
// reliably come back. Let go when it is about to tip your way. Past the pond
// the lawn runs round the end of a hedge and back along a row of sunflowers to
// the cup.
package hole20

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

// the seesaw's clock: it rocks one way for half its period, then the other
const (
	rock = 20
	half = 10
)

// a ball that falls in the pond is fished out on the tee's bank
var bank = physics.V(11, 13)

var me = course.Fit(&course.Simple{
	World: "garden", Order: 18,
	W: 50, H: 26,
	Title:     "The Seesaw",
	Strokes:   3, // par
	Tee:       physics.V(6, 13),
	Pin:       physics.V(35.6, 6.2),
	Substeps:  30,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: physics.Walls(
			physics.Box(physics.V(2, 2), physics.V(48, 24)),
			// the hedge that sends the lawn round: along the pond's far bank,
			// then out across the lawn, leaving a gap at the far wall
			physics.Bar(physics.V(29.6, 2), physics.V(29.6, 10), 0.6, '#', "hedge"),
			physics.Bar(physics.V(29.6, 10), physics.V(45, 10), 0.6, '#', "hedge"),
		),
		Posts: []physics.Post{
			// sunflowers along the top lawn: two in the way, two either side
			// of the way in to the cup
			{Circle: physics.Circle{C: physics.V(46, 4.4), R: 0.8}, Bounce: 0.8, Skin: "sunflower"},
			{Circle: physics.Circle{C: physics.V(43.2, 6.8), R: 0.8}, Bounce: 0.8, Skin: "sunflower"},
			{Circle: physics.Circle{C: physics.V(38.8, 4.2), R: 0.8}, Bounce: 0.8, Skin: "sunflower"},
			{Circle: physics.Circle{C: physics.V(38.8, 8.2), R: 0.8}, Bounce: 0.8, Skin: "sunflower"},
		},
		Zones: []physics.Zone{
			// the pond, either side of the plank
			{Kind: physics.Hazard, Min: physics.V(14.5, 2), Max: physics.V(29.3, 11.8), Vec: bank, Mark: '~', Skin: "water",
				Poly: []physics.Vec2{physics.V(15, 2), physics.V(29.3, 2), physics.V(29.3, 11.8), physics.V(15, 11.8), physics.V(14.6, 10.4), physics.V(15.35, 9), physics.V(14.5, 7.6), physics.V(15.3, 6.2), physics.V(14.6, 4.8), physics.V(15.35, 3.4)}},
			{Kind: physics.Hazard, Min: physics.V(14.5, 14.2), Max: physics.V(29.7, 24), Vec: bank, Mark: '~', Skin: "water",
				Poly: []physics.Vec2{physics.V(15, 14.2), physics.V(29.3, 14.2), physics.V(28.95, 15.6), physics.V(29.7, 17), physics.V(29, 18.4), physics.V(29.65, 19.8), physics.V(28.9, 21.2), physics.V(29.6, 22.6), physics.V(29.3, 24), physics.V(15, 24), physics.V(14.6, 22.6), physics.V(15.35, 21.2), physics.V(14.55, 19.8), physics.V(15.3, 18.4), physics.V(14.6, 17), physics.V(15.35, 15.6)}},
			// a border of flowers across the lawn at the foot of the seesaw:
			// it takes the pace off a ball that comes off it fast
			{Kind: physics.Surface, Min: physics.V(30.3, 10.4), Max: physics.V(33.5, 23.6), Scale: 0.45, Mark: ':', Skin: "flowerbed"},
			// a bed of marigolds at the end of the top lawn: a ball run past
			// the cup stays there
			{Kind: physics.Surface, Min: physics.V(29.9, 2.3), Max: physics.V(33.4, 9.7), Scale: 0.4, Mark: ':', Skin: "flowerbed"},
			// the seesaw: tipped toward the tee (it pushes back), then away
			{Kind: physics.Slope, Min: physics.V(15, 11.8), Max: physics.V(29.3, 14.2), Vec: physics.V(-0.22, 0), Mark: '<', Skin: "seesaw", Every: rock, On: half, Phase: 0},
			{Kind: physics.Slope, Min: physics.V(15, 11.8), Max: physics.V(29.3, 14.2), Vec: physics.V(0.22, 0), Mark: '>', Skin: "seesaw", Every: rock, On: half, Phase: half},
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
