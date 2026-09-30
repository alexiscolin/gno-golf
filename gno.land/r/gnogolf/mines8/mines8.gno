// Package mines8 is the cage: a drift that winds down the mine in three legs
// round the lift shaft. On even strokes the cage waits at the top leg's landing
// and takes you down to the middle leg; on odd strokes it waits at the middle
// leg's and takes you down to the bottom one; a landing the cage is not at is
// the open shaft. Its gates open and shut as you aim, and it lets you out just
// short of the next landing: come in soft. The ladder and the drift are there.
package mines8

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

var me = author.Fit(hole(), 1.5)

func hole() *course.Simple {
	v := physics.V
	tee := v(5, 5.5)
	zone := func(k physics.ZoneKind, r [2]physics.Vec2, vec physics.Vec2, skin string) physics.Zone {
		return physics.Zone{Kind: k, Min: r[0], Max: r[1], Vec: vec, Skin: skin}
	}
	// the shaft's landings on the top leg and the middle one
	l1, l2 := [2]physics.Vec2{v(44, 6.2), v(52, 11)}, [2]physics.Vec2{v(44, 16.3), v(52, 21)}
	return &course.Simple{
		World:     "mines",
		Order:     8,
		Title:     "The Cage",
		Strokes:   8, // par
		Tee:       tee,
		Pin:       v(82.5, 29),
		Substeps:  28,
		CupRadius: 1.2,

		Pulses: []course.Pulse{
			// even strokes: the cage at the top landing (down to the middle leg), the middle landing the open shaft
			{Every: 2, On: 1, Phase: 0, Zones: []physics.Zone{
				zone(physics.Tunnel, l1, v(61, 13), "lift"),
				zone(physics.Hazard, l2, tee, "shaft"),
			}},
			// odd strokes: the cage at the middle landing (down one level), the top landing the open shaft
			{Every: 2, On: 1, Phase: 1, Zones: []physics.Zone{
				zone(physics.Tunnel, l2, v(48, 23.4), "lift"),
				zone(physics.Hazard, l1, tee, "shaft"),
			}},
		},

		Course: &physics.Field{
			Walls: build.Walls(
				// the drift, winding down round the shaft
				build.Skinned(build.Outline(
					v(4.89, 0.75), v(26.03, 0.25), v(48.02, 1.05), v(72.1, 0.45), v(83, 2.19), v(89.25, 11), v(82.85, 19.87), v(72.01, 21.05), v(48.01, 20.35), v(26.14, 21.15), v(14.33, 21.16), v(13.25, 21.5), v(14.42, 21.97), v(25.97, 22.25), v(48, 21.55), v(72.03, 22.25), v(81.76, 21.76), v(85.99, 23.92), v(86.23, 28.67), v(82.24, 31.24), v(71.97, 31.75), v(48, 31.05), v(26.03, 31.75), v(11.58, 31.03), v(3.75, 21.5), v(11.67, 12.04), v(25.86, 11.65), v(47.99, 10.85), v(71.99, 11.55), v(79.15, 11.13), v(79.75, 11), v(79, 10.81), v(71.9, 9.95), v(47.98, 10.55), v(25.97, 9.75), v(5.11, 10.25), v(0.94, 7.97), v(0.83, 3.22)), "rockface"),
				// the cage's gates round each landing
				build.Timed(build.Bar(v(43.6, 6.2), v(43.6, 11.4), 0.5, '|', "cage door"), 12, 6, 0),
				build.Timed(build.Bar(v(43.6, 6.2), v(52.4, 6.2), 0.5, '|', "cage door"), 12, 6, 0),
				build.Timed(build.Bar(v(52.4, 6.2), v(52.4, 11.4), 0.5, '|', "cage door"), 12, 6, 0),
				build.Timed(build.Bar(v(43.6, 16.3), v(43.6, 21.4), 0.5, '|', "cage door"), 12, 6, 6),
				build.Timed(build.Bar(v(43.6, 16.3), v(52.4, 16.3), 0.5, '|', "cage door"), 12, 6, 6),
				build.Timed(build.Bar(v(52.4, 16.3), v(52.4, 21.4), 0.5, '|', "cage door"), 12, 6, 6),
			),
			Posts: []physics.Post{
				// a timbered chicane of pit props on the top leg
				{Circle: physics.Circle{C: v(24, 1.7), R: 0.7}, Bounce: 0.6, Skin: "prop"},
				{Circle: physics.Circle{C: v(24, 3.1), R: 0.7}, Bounce: 0.6, Skin: "prop"},
				{Circle: physics.Circle{C: v(24, 4.5), R: 0.7}, Bounce: 0.6, Skin: "prop"},
				{Circle: physics.Circle{C: v(24, 5.9), R: 0.7}, Bounce: 0.6, Skin: "prop"},
				{Circle: physics.Circle{C: v(31, 9.6), R: 0.7}, Bounce: 0.6, Skin: "prop"},
				{Circle: physics.Circle{C: v(31, 8.2), R: 0.7}, Bounce: 0.6, Skin: "prop"},
				{Circle: physics.Circle{C: v(31, 6.8), R: 0.7}, Bounce: 0.6, Skin: "prop"},
				{Circle: physics.Circle{C: v(31, 5.4), R: 0.7}, Bounce: 0.6, Skin: "prop"},
				// a chicane of stalagmites on the bottom leg
				{Circle: physics.Circle{C: v(58, 30.7), R: 0.75}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(58, 29.2), R: 0.75}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(58, 27.7), R: 0.75}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(58, 26.2), R: 0.75}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(58, 24.7), R: 0.75}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(64, 22.2), R: 0.75}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(64, 23.7), R: 0.75}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(64, 25.2), R: 0.75}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(64, 26.7), R: 0.75}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(64, 28.2), R: 0.75}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(70, 31), R: 0.75}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(70, 29.5), R: 0.75}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(70, 28), R: 0.75}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(70, 26.5), R: 0.75}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(70, 25), R: 0.75}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(76, 22.2), R: 0.75}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(76, 23.7), R: 0.75}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(76, 25.2), R: 0.75}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(76, 26.7), R: 0.75}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(76, 28.2), R: 0.75}, Bounce: 0.6, Skin: "stalagmite"},
			},
			Zones: []physics.Zone{
				// the ladder, a manway from the top leg down to the middle one
				{Kind: physics.Tunnel, Min: v(35, 7), Max: v(38, 10), Vec: v(13, 16.5), Round: true, Mark: 'L', Skin: "ladder"},
				// ore piles on the middle leg
				{Kind: physics.Surface, Min: v(25, 13.3), Max: v(31, 19.3), Scale: 0.45, Round: true, Mark: ',', Skin: "ore"},
				{Kind: physics.Surface, Min: v(62, 12.3), Max: v(67, 17.3), Scale: 0.45, Round: true, Mark: ',', Skin: "ore"},
				// the flooded foot of the shaft on the bottom leg
				{Kind: physics.Hazard, Min: v(45, 26.3), Max: v(51, 31.3), Vec: tee, Round: true, Mark: '~', Skin: "sump"},
			},
			Friction: 0.87,
			Radius:   0.5,
			Bounce:   0.85,
		},
	}
}
