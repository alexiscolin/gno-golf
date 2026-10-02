// Package mines7 is the lava tide: a horseshoe round a lake of lava whose
// level follows your stroke count, low, mid, high and low again. A causeway
// zigzags across the bay, tall stones the tide never covers and the low stones
// between them, each under at its own tide: take each on the stroke it is dry,
// or wait on a tall stone for the lake to fall. The rim path round the
// horseshoe is longer, open to the lava, with vents, stalagmites and a bridge.
package mines7

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

var me = author.Fit(hole(), 1.5)

func hole() *course.Simple {
	v := physics.V
	tee := v(9.5, 6.2)
	lava := func(min, max physics.Vec2, poly ...physics.Vec2) physics.Zone {
		return physics.Zone{Kind: physics.Hazard, Min: min, Max: max, Vec: tee, Poly: poly, Mark: '~', Skin: "lava"}
	}
	tide := func(min, max physics.Vec2, poly ...physics.Vec2) physics.Zone {
		return physics.Zone{Kind: physics.Hazard, Min: min, Max: max, Vec: tee, Poly: poly, Mark: '!', Skin: "lava tide"}
	}
	return &course.Simple{
		World:     "mines",
		Order:     7,
		Title:     "The Lava Tide",
		Strokes:   8, // par
		Tee:       tee,
		Pin:       v(11.5, 33.4),
		Substeps:  28,
		CupRadius: 1.2,
		Shelter:   0.05,

		Pulses: []course.Pulse{
			// mid tide, strokes 1, 4, 7…: the low stones under
			{Every: 3, On: 1, Phase: 2, Zones: []physics.Zone{tide(v(10.77, 10.06), v(18.92, 22.59), v(10.77, 11.18), v(16.8, 22.59), v(18.92, 21.47), v(12.9, 10.06)), tide(v(33.65, 16.91), v(39.35, 23.09), v(35.49, 23.09), v(39.35, 18.45), v(37.51, 16.91), v(33.65, 21.55))}},
			// high tide, strokes 2, 5, 8…: the middle ones too
			{Every: 3, On: 1, Phase: 1, Zones: []physics.Zone{tide(v(10.77, 10.06), v(18.92, 22.59), v(10.77, 11.18), v(16.8, 22.59), v(18.92, 21.47), v(12.9, 10.06)), tide(v(19.65, 16.91), v(25.35, 23.09), v(21.49, 23.09), v(25.35, 18.45), v(23.51, 16.91), v(19.65, 21.55)), tide(v(33.65, 16.91), v(39.35, 23.09), v(35.49, 23.09), v(39.35, 18.45), v(37.51, 16.91), v(33.65, 21.55)), tide(v(39.83, 17.6), v(47.61, 31.96), v(39.83, 18.52), v(45.39, 31.96), v(47.61, 31.04), v(42.05, 17.6))}},
		},

		Course: &physics.Field{
			Walls: build.Walls(
				// the horseshoe's outer rock, its tips, and the rib across its mouth
				build.Skinned(build.Polyline(
					v(11, 10.98), v(10.16, 11)), "rockface"),
				build.Skinned(build.Polyline(
					v(10.16, 11), v(5.75, 8.63), v(5.59, 3.64), v(9.84, 1), v(20.96, 0.66), v(35.04, 0.5), v(47.64, 0.85), v(59.04, 2.11), v(67.45, 5.18), v(73.35, 9.29), v(77.19, 14.2), v(78.5, 20), v(77.19, 25.8), v(73.35, 30.71), v(67.45, 34.82), v(59.04, 37.89), v(47.64, 39.15), v(35.04, 39.5), v(20.96, 39.34), v(9.84, 39), v(5.59, 36.36), v(5.75, 31.37), v(10.16, 29)), "rockface"),
				build.Skinned(build.Polyline(v(10.16, 29), v(11, 29.02)), "rockface"),
				build.Skinned([]physics.Wall{{Seg: physics.Segment{A: v(11, 10.98), B: v(11, 29.02)}}}, "rockface"),
				// the rope bridge's ropes
				build.Skinned([]physics.Wall{
					{Seg: physics.Segment{A: v(64, 33.9), B: v(68, 33.9)}},
					{Seg: physics.Segment{A: v(64, 36.3), B: v(68, 36.3)}},
				}, "rope"),
			),
			// lines of stalagmites from alternate sides on the top and the bottom of the horseshoe, and one at the cup
			Posts: []physics.Post{
				{Circle: physics.Circle{C: v(24, 1.6), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(24, 3.1), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(24, 4.6), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(24, 6.1), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(31, 10), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(31, 8.5), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(31, 7), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(31, 5.5), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(38, 1.6), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(38, 3.1), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(38, 4.6), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(38, 6.1), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(45, 10), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(45, 8.5), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(45, 7), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(45, 5.5), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(54, 30.4), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(54, 31.9), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(54, 33.4), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(54, 34.9), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(61, 38.6), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(61, 37.1), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(61, 35.6), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(61, 34.1), R: 0.8}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(16, 33.2), R: 1}, Bounce: 0.6, Skin: "stalagmite"},
			},
			Zones: []physics.Zone{
				// the lake, either side of the causeway
				lava(v(11, 10.97), v(45.5, 29.48), v(11, 10.98), v(11.22, 10.97), v(12.13, 13.76), v(16.39, 21.83), v(16.4, 24.21), v(16.89, 25.72), v(18.2, 26.67), v(19.8, 26.67), v(21.1, 25.73), v(21.6, 24.2), v(21.61, 22.94), v(25.49, 18.28), v(26.49, 18.27), v(30.4, 22.95), v(30.41, 24.22), v(30.89, 25.69), v(32.19, 26.67), v(33.8, 26.67), v(35.1, 25.73), v(35.59, 24.23), v(35.6, 22.95), v(39.49, 18.28), v(39.73, 18.27), v(44.28, 29.27), v(44.69, 29.26), v(45.29, 29.24), v(45.5, 29.23), v(45.29, 29.24), v(36.11, 29.48), v(26.95, 29.48), v(17.79, 29.24), v(11, 29.02)),
				lava(v(12.13, 10.47), v(67.31, 29.03), v(12.57, 10.93), v(19.13, 10.72), v(25.51, 10.55), v(31.8, 10.47), v(37.95, 10.56), v(44.08, 10.72), v(50.46, 11.05), v(56.58, 11.81), v(62.33, 13.78), v(67.31, 17.31), v(66.61, 23.32), v(61.58, 26.59), v(55.79, 28.33), v(49.36, 29.03), v(45.5, 25.95), v(42.61, 18.96), v(42.6, 15.79), v(42.1, 14.27), v(40.8, 13.33), v(39.19, 13.33), v(37.89, 14.28), v(37.4, 15.79), v(37.39, 17.06), v(33.49, 21.73), v(32.5, 21.72), v(28.61, 17.05), v(28.59, 15.78), v(28.09, 14.26), v(26.79, 13.33), v(25.19, 13.33), v(23.89, 14.29), v(23.4, 15.8), v(23.39, 17.06), v(19.5, 21.73), v(19.03, 21.68), v(13.33, 10.91), v(12.13, 10.94)),
				// the causeway's tall stones
				{Kind: physics.Surface, Min: v(16.4, 21.6), Max: v(21.6, 26.8), Scale: 1, Round: true, Mark: 'O', Skin: "causeway"}, {Kind: physics.Surface, Min: v(23.4, 13.2), Max: v(28.6, 18.4), Scale: 1, Round: true, Mark: 'O', Skin: "causeway"}, {Kind: physics.Surface, Min: v(30.4, 21.6), Max: v(35.6, 26.8), Scale: 1, Round: true, Mark: 'O', Skin: "causeway"}, {Kind: physics.Surface, Min: v(37.4, 13.2), Max: v(42.6, 18.4), Scale: 1, Round: true, Mark: 'O', Skin: "causeway"},
				// a lava channel across the bottom of the horseshoe, under a rope bridge
				lava(v(64, 28), v(68, 33.9)), lava(v(64, 36.3), v(68, 41)),
				{Kind: physics.Surface, Min: v(64, 33.9), Max: v(68, 36.3), Scale: 1, Mark: '=', Skin: "rope bridge"},
				// scree at the bend
				{Kind: physics.Surface, Min: v(66.5, 13), Max: v(78.5, 27), Scale: 0.6, Round: true, Mark: ',', Skin: "rubble"},
				// steam vents on the top of the horseshoe, blowing toward the lake 3 ticks in 8
				{Kind: physics.Slope, Min: v(28, 0), Max: v(36, 10.8), Vec: v(0, 0.25), Mark: 'w', Skin: "vent", Air: true, Every: 8, On: 3},
				{Kind: physics.Slope, Min: v(45, 0.5), Max: v(53, 11.3), Vec: v(0, 0.25), Mark: 'w', Skin: "vent", Air: true, Every: 8, On: 3, Phase: 4},
			},
			Friction: 0.87,
			Radius:   0.5,
			Bounce:   0.85,
		},
	}
}
