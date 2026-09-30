// Package mines2 is the glowworm gallery, winding down and up six times in
// round bends in the dark: only the glowworms, the crystals and your lamp
// light it, and its edges drop away into the dark. Stalagmites make a gate
// on four of its legs; the third is a chicane of singing crystals that kick
// the ball back harder than it came. The sump fills the fourth bend but for
// a narrow way round it, and two crystals guard the cup.
package mines2

import (
	"math"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

var v = physics.V

var tee = v(6, 2.5)

// gallery is the floor of the drift, five wide, winding down and up six times
// in round bends; its edges drop into the dark.
var gallery = []physics.Vec2{
	v(3.5, 1.5), v(3.5, 19), v(5.84, 24.66), v(11.5, 27), v(17.16, 24.66), v(19.5, 19), v(19.5, 4.5),
	v(20.38, 2.38), v(22.5, 1.5), v(24.62, 2.38), v(25.5, 4.5), v(25.5, 19), v(27.84, 24.66),
	v(33.5, 27), v(39.16, 24.66), v(41.5, 19), v(41.5, 4.5), v(42.38, 2.38), v(44.5, 1.5),
	v(46.62, 2.38), v(47.5, 4.5), v(47.5, 19), v(49.84, 24.66), v(55.5, 27), v(61.16, 24.66),
	v(63.5, 19), v(63.5, 3), v(62.25, 0.83), v(59.75, 0.83), v(58.5, 3), v(58.5, 19), v(57.62, 21.12),
	v(55.5, 22), v(53.38, 21.12), v(52.5, 19), v(52.5, 4.5), v(50.16, -1.16), v(44.5, -3.5),
	v(38.84, -1.16), v(36.5, 4.5), v(36.5, 19), v(35.62, 21.12), v(33.5, 22), v(31.38, 21.12),
	v(30.5, 19), v(30.5, 4.5), v(28.16, -1.16), v(22.5, -3.5), v(16.84, -1.16), v(14.5, 4.5),
	v(14.5, 19), v(13.62, 21.12), v(11.5, 22), v(9.38, 21.12), v(8.5, 19), v(8.5, 1.5), v(7.25, -0.67),
	v(4.75, -0.67),
}

// bend is the rock round the outside of a bend of the drift, centred at c,
// below it (down) or above.
func bend(c physics.Vec2, down bool) []physics.Wall {
	a0, a1 := math.Pi, 0.0
	if !down {
		a1 = 2 * math.Pi
	}
	return build.Soft(build.Skinned(build.Polyline(build.Arc(c, 8, a0, a1, 4)...), "rockface"), 0.5)
}

func crystal(c physics.Vec2) physics.Post {
	return physics.Post{Circle: physics.Circle{C: c, R: 0.7}, Bounce: 1.3, Mark: '*', Skin: "crystal bumper"}
}

// chicane is a big singing crystal of the chicane: no straight line runs
// past all three.
func chicane(c physics.Vec2) physics.Post {
	return physics.Post{Circle: physics.Circle{C: c, R: 1}, Bounce: 1.3, Mark: '*', Skin: "crystal bumper"}
}

// guard is one of the two small singing crystals either side of the cup.
func guard(c physics.Vec2) physics.Post {
	return physics.Post{Circle: physics.Circle{C: c, R: 0.6}, Bounce: 1.3, Mark: '*', Skin: "crystal bumper"}
}

func stalagmite(c physics.Vec2) physics.Post {
	return physics.Post{Circle: physics.Circle{C: c, R: 0.8}, Bounce: 0.6, Mark: 'o', Skin: "stalagmite"}
}

func pool(min, max physics.Vec2) physics.Zone {
	return physics.Zone{Kind: physics.Surface, Min: min, Max: max, Scale: 0.6, Round: true, Mark: ',', Skin: "drip pool"}
}

var me = author.Fit(&course.Simple{
	W: 64, H: 32,
	World:     "mines",
	Order:     2,
	Title:     "Glowworm Gallery",
	Strokes:   9, // par
	Tee:       tee,
	Pin:       v(61, 3),
	Substeps:  30,
	CupRadius: 1.2,
	Shelter:   0.03,
	Course: &physics.Field{
		Walls: build.Walls(
			build.Box(v(1.5, -4), v(65.5, 28)),
			bend(v(11.5, 19), true), bend(v(22.5, 4.5), false), bend(v(33.5, 19), true),
			bend(v(44.5, 4.5), false), bend(v(55.5, 19), true),
		),
		Posts: []physics.Post{
			// stalagmite gates halfway along four legs
			stalagmite(v(4, 11.75)), stalagmite(v(8, 11.75)),
			stalagmite(v(15, 11.75)), stalagmite(v(19, 11.75)),
			stalagmite(v(37, 11.75)), stalagmite(v(41, 11.75)),
			stalagmite(v(48, 11.75)), stalagmite(v(52, 11.75)),
			// the singing crystals: a chicane down the third leg, and one in
			// the outside of three bends
			chicane(v(26.7, 8)), chicane(v(29.3, 11.75)), chicane(v(26.7, 15.5)),
			crystal(v(11.5, 25.8)), crystal(v(22.5, -2.3)), crystal(v(55.5, 25.8)),
			// two more guard the cup: the last putt goes between them
			guard(v(59.3, 6.3)), guard(v(62.7, 6.3)),
		},
		Zones: []physics.Zone{
			{Kind: physics.Hazard, Min: v(1, -4.5), Max: v(66, 28.5), Vec: tee, Poly: gallery, Outside: true, Skin: "void"},
			// the sump, a flooded winze in the fourth bend: the way round is
			// on its outside
			{Kind: physics.Hazard, Min: v(43.5, -1.5), Max: v(45.5, 0.5), Vec: tee, Round: true, Mark: '~', Skin: "sump"},
			pool(v(15, 14.5), v(19, 18.5)),
			pool(v(48, 5), v(52, 9)),
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
