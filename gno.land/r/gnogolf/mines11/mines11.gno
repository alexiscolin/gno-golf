// Package mines11 is the corkscrew: an ore chute plunging down the mine, its
// track looping the loop twice over two lava chasms, loop A onto the ore
// chute's ledge between them and loop B off its end, the points before the
// first set for it one tick in six, else the track runs on into the chasm;
// then the gallery hooks round hard, down past a kicker that jumps a lava channel onto
// an ore pile, and back up through stalagmites to a green inside the hook, a
// lava pool behind the cup. The stairs, a railed rubble flight beside the
// chasms, and the plank bridge beside the channel take longer and are safe.
package mines11

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

var me = author.Fit(hole(), 1.5)

func hole() *course.Simple {
	v := physics.V
	tee := v(10.78, 9.13)
	lava := func(min, max physics.Vec2, poly ...physics.Vec2) physics.Zone {
		return physics.Zone{Kind: physics.Hazard, Min: min, Max: max, Vec: tee, Poly: poly, Mark: '~', Skin: "lava"}
	}
	return &course.Simple{
		World:     "mines",
		Order:     11,
		Title:     "The Corkscrew",
		Strokes:   8, // par
		Tee:       tee,
		Pin:       v(45.11, 60.17),
		Substeps:  30,
		CupRadius: 1.2,
		Shelter:   0.03,

		Course: &physics.Field{
			Walls: build.Walls(
				// the chute and the hook
				build.Skinned(build.Outline(
					v(10.26, 2.44), v(60.96, 22.81), v(69.3, 27.44), v(74.36, 32.09), v(80.49, 42.26), v(81.81, 52.7), v(77.45, 63.75), v(69.26, 70.56), v(62.19, 73.09), v(54.96, 73.04), v(48.65, 71.07), v(42.51, 66.47), v(38.07, 58.65), v(37.12, 53.21), v(37.99, 48.7), v(41.79, 46.12), v(46.3, 46.99), v(51.96, 58.93), v(56.38, 61.1), v(61.68, 60.83), v(67.38, 57.17), v(69.92, 51.08), v(68.99, 45.82), v(65.12, 39.76), v(56.01, 33.75), v(5.74, 13.56), v(2.47, 10.33), v(2.44, 5.74), v(5.67, 2.47)), "rockface"),
				// the stairs' guard rail along the chasms
				build.Skinned([]physics.Wall{{Seg: physics.Segment{A: v(24.37, 15.53), B: v(54.59, 27.48)}}}, "railguard"),
				// the plank bridge's ropes
				build.Skinned([]physics.Wall{
					{Seg: physics.Segment{A: v(78.01, 48.3), B: v(78.01, 51.3)}},
					{Seg: physics.Segment{A: v(80.41, 48.3), B: v(80.41, 51.3)}},
				}, "rope"),
			),
			Posts: []physics.Post{
				// lines of pit props across the stairs, from the wall, the rail, the wall
				{Circle: physics.Circle{C: v(29.19, 22.25), R: 0.8}, Bounce: 0.6, Skin: "prop"},
				{Circle: physics.Circle{C: v(29.79, 20.77), R: 0.8}, Bounce: 0.6, Skin: "prop"},
				{Circle: physics.Circle{C: v(37.99, 21.91), R: 0.8}, Bounce: 0.6, Skin: "prop"},
				{Circle: physics.Circle{C: v(37.41, 23.4), R: 0.8}, Bounce: 0.6, Skin: "prop"},
				{Circle: physics.Circle{C: v(44.2, 28.14), R: 0.8}, Bounce: 0.6, Skin: "prop"},
				{Circle: physics.Circle{C: v(44.76, 26.64), R: 0.8}, Bounce: 0.6, Skin: "prop"},
				// lines of stalagmites across the way back, from either wall
				{Circle: physics.Circle{C: v(65, 71.22), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(65, 69.72), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(65, 68.22), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(65, 66.72), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(65, 65.22), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(59, 62.09), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(59, 63.59), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(59, 65.09), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(59, 66.59), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(53, 71.57), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(53, 70.07), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(53, 68.57), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(53, 67.07), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(53, 65.57), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
			},
			Zones: []physics.Zone{
				// the ore chute's ledge between the chasms
				{Kind: physics.Surface, Min: v(36.4, 12.97), Max: v(45.95, 22.71), Poly: []physics.Vec2{
					v(45.26, 14.96), v(45.92, 15.58), v(45.95, 16.5), v(43.85, 22.02), v(43.22, 22.68), v(42.3, 22.71), v(37.07, 20.69), v(36.41, 20.05), v(36.4, 19.13), v(38.59, 13.66), v(39.21, 12.99), v(40.11, 12.97)}, Scale: 0.45, Mark: ',', Skin: "ore"},
				// loop A drops the ball on the ore chute's ledge between the chasms, loop B past the second;
				// loop A's points are set for it 1 tick in 6, else the track runs on into the chasm
				{Kind: physics.Loop, Min: v(22.59, 8.59), Max: v(24.39, 13.11), Vec: v(38.63, 18.08), Scale: 2, Mark: '@', Skin: "corkscrew", Every: 6, On: 1},
				{Kind: physics.Loop, Min: v(41.4, 16.2), Max: v(43.2, 22.17), Vec: v(56.93, 27.06), Scale: 2, Mark: '@', Skin: "corkscrew"},
				// the chasms under the track
				lava(v(25.17, 8.49), v(39.04, 20.26),
					v(38.41, 12.29), v(39.03, 12.92), v(39.04, 13.83), v(36.75, 19.6), v(36.11, 20.25), v(35.18, 20.26), v(25.83, 16.45), v(25.18, 15.81), v(25.17, 14.89), v(27.51, 9.15), v(28.16, 8.49), v(29.07, 8.49)),
				lava(v(43.28, 15.63), v(56.8, 27.12),
					v(56.12, 19.14), v(56.8, 19.8), v(56.8, 20.71), v(54.47, 26.46), v(53.82, 27.11), v(52.91, 27.12), v(43.97, 23.67), v(43.3, 23.04), v(43.28, 22.12), v(45.48, 16.32), v(46.11, 15.66), v(47.03, 15.63)),
				// the stairs: a railed rubble flight beside the chasms
				{Kind: physics.Surface, Min: v(22.13, 15.91), Max: v(54.48, 32.85), Poly: []physics.Vec2{
					v(53.66, 27.1), v(54.48, 27.91), v(54.47, 29.06), v(53.24, 32.01), v(52.45, 32.83), v(51.33, 32.85), v(22.95, 21.65), v(22.14, 20.84), v(22.13, 19.7), v(23.34, 16.73), v(24.15, 15.92), v(25.29, 15.91)}, Scale: 0.7, Mark: ',', Skin: "rubble"},
				// a steam vent at the top of the hook, blowing toward its inner wall 3 ticks in 8
				{Kind: physics.Slope, Min: v(64.29, 30.36), Max: v(72.29, 38.36), Vec: v(-0.18, 0.18), Round: true, Mark: 'w', Skin: "vent", Air: true, Every: 8, On: 3},
				// the kicker, the lava channel it jumps with the plank bridge the stairs take, the ore pile it lands on
				{Kind: physics.Slope, Min: v(69.11, 45.5), Max: v(77.41, 47.5), Vec: v(0, -0.35), Mark: '^', Skin: "kicker"},
				lava(v(68.64, 48.3), v(78.01, 51.3)),
				{Kind: physics.Surface, Min: v(78.01, 48.3), Max: v(80.41, 51.3), Scale: 1, Mark: '=', Skin: "rope bridge"},
				lava(v(80.41, 48.3), v(82.41, 51.3)),
				{Kind: physics.Surface, Min: v(66.11, 53), Max: v(84.03, 59), Scale: 0.45, Round: true, Mark: ',', Skin: "ore"},
				// the green: crystal ice round the cup
				{Kind: physics.Surface, Min: v(41.61, 56.67), Max: v(48.61, 63.67), Scale: 1.1, Round: true, Mark: 'i', Skin: "ice"},
				// a lava pool behind the cup: hit it too hard and it takes you
				{Kind: physics.Hazard, Min: v(40.18, 51.27), Max: v(46.58, 57.67), Vec: tee, Round: true, Mark: '~', Skin: "lava"},
			},
			Friction: 0.87,
			Radius:   0.5,
			Bounce:   0.85,
		},
	}
}
