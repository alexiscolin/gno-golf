// Package mines10 is the geysers: four narrow terraces climbing the cavern
// like a stair, and at the end of each a geyser on its own period that throws
// the ball up to the next. Stop on a geyser's pad and it fires you at the end
// of the stroke, or run over it as it spouts and come out running on the
// terrace above. Hot pools crowd each ledge from either side, steam pistons
// ram across two of them and a vent blows across the third.
package mines10

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

var me = author.Fit(hole(), 1.5)

func hole() *course.Simple {
	v := physics.V
	tee := v(4.9, 27.2)
	hot := func(min, max physics.Vec2, poly ...physics.Vec2) physics.Zone {
		return physics.Zone{Kind: physics.Hazard, Min: min, Max: max, Vec: tee, Poly: poly, Mark: '~', Skin: "hot spring"}
	}
	// a steam piston: a ram across a terrace, out on its beat
	piston := func(a, b physics.Vec2, every, on, phase int) []physics.Wall {
		return build.Timed(build.Bar(a, b, 1.2, 'P', "piston"), every, on, phase)
	}
	return &course.Simple{
		World:     "mines",
		Order:     10,
		Title:     "The Geysers",
		Strokes:   8, // par
		Tee:       tee,
		Pin:       v(85.65, 4.7),
		Substeps:  28,
		CupRadius: 1.2,
		Shelter:   0.04,

		Course: &physics.Field{
			Walls: build.Walls(
				// the four terraces
				build.Skinned(build.Outline(v(2.79, 23.51), v(14.45, 22.8), v(26.11, 23.81), v(29.29, 27.61), v(25.49, 30.79), v(14.35, 29.8), v(3.21, 30.49), v(-0.49, 27.21)), "rockface"),
				build.Skinned(build.Outline(v(23.72, 16.3), v(35.33, 15.7), v(46.95, 16.51), v(50.19, 20.25), v(46.45, 23.49), v(35.27, 22.7), v(24.08, 23.3), v(20.4, 19.98)), "rockface"),
				build.Skinned(build.Outline(v(44.65, 8.8), v(56.23, 8.3), v(67.81, 9.01), v(71.09, 12.71), v(67.39, 15.99), v(56.17, 15.3), v(44.95, 15.8), v(41.3, 12.45)), "rockface"),
				build.Skinned(build.Outline(v(65.55, 1.3), v(77.1, 0.8), v(87.72, 1.3), v(91.05, 4.97), v(87.38, 8.3), v(77.1, 7.8), v(65.85, 8.3), v(62.2, 4.95)), "rockface"),
				// the steam pistons across the second and fourth terraces
				piston(v(29.6, 16.4), v(29.6, 22.8), 12, 6, 0),
				piston(v(71.88, 1.4), v(71.88, 7.8), 10, 5, 0),
			),
			Zones: []physics.Zone{
				{Kind: physics.Tunnel, Min: v(22.12, 25.9), Max: v(24.73, 28.5), Vec: v(27.04, 19.6), Round: true, Mark: 'G', Skin: "geyser", Every: 10, On: 3},
				{Kind: physics.Tunnel, Min: v(43.02, 18.6), Max: v(45.62, 21.2), Vec: v(47.84, 12.2), Round: true, Mark: 'G', Skin: "geyser", Every: 12, On: 3},
				{Kind: physics.Tunnel, Min: v(63.92, 11.1), Max: v(66.52, 13.7), Vec: v(68.74, 4.7), Round: true, Mark: 'G', Skin: "geyser", Every: 15, On: 3},
				hot(v(20.53, 24.3), v(26.32, 30.1), v(21.37, 25.15), v(23.88, 24.34), v(26.01, 25.88), v(26.01, 28.52), v(23.88, 30.06), v(21.37, 29.25), v(22.29, 28.33), v(23.68, 28.78), v(24.85, 27.93), v(24.85, 26.47), v(23.68, 25.62), v(22.29, 26.07)),
				hot(v(41.42, 17), v(47.22, 22.8), v(42.27, 17.85), v(44.78, 17.04), v(46.91, 18.58), v(46.91, 21.22), v(44.78, 22.76), v(42.27, 21.95), v(43.19, 21.03), v(44.58, 21.48), v(45.75, 20.63), v(45.75, 19.17), v(44.58, 18.32), v(43.19, 18.77)),
				hot(v(62.32, 9.5), v(68.12, 15.3), v(63.17, 10.35), v(65.68, 9.54), v(67.81, 11.08), v(67.81, 13.72), v(65.68, 15.26), v(63.17, 14.45), v(64.09, 13.53), v(65.48, 13.98), v(66.65, 13.13), v(66.65, 11.67), v(65.48, 10.82), v(64.09, 11.27)),
				{Kind: physics.Hazard, Min: v(6.3, 26.2), Max: v(14.9, 34.8), Vec: tee, Round: true, Mark: '~', Skin: "hot spring"},
				{Kind: physics.Hazard, Min: v(12.95, 19.1), Max: v(21.55, 27.7), Vec: tee, Round: true, Mark: '~', Skin: "hot spring"},
				{Kind: physics.Hazard, Min: v(29.57, 18.7), Max: v(38.17, 27.3), Vec: tee, Round: true, Mark: '~', Skin: "hot spring"},
				{Kind: physics.Hazard, Min: v(35.75, 11.5), Max: v(44.35, 20.1), Vec: tee, Round: true, Mark: '~', Skin: "hot spring"},
				{Kind: physics.Hazard, Min: v(50.48, 11), Max: v(59.07, 19.6), Vec: tee, Round: true, Mark: '~', Skin: "hot spring"},
				{Kind: physics.Hazard, Min: v(56.65, 4.1), Max: v(65.25, 12.7), Vec: tee, Round: true, Mark: '~', Skin: "hot spring"},
				{Kind: physics.Hazard, Min: v(72.33, -3.3), Max: v(80.92, 5.3), Vec: tee, Round: true, Mark: '~', Skin: "hot spring"},
				{Kind: physics.Hazard, Min: v(78.8, 4.1), Max: v(86.8, 12.1), Vec: tee, Round: true, Mark: '~', Skin: "hot spring"},
				// a steam vent across the third terrace, blowing toward its south wall 3 ticks in 6
				{Kind: physics.Slope, Min: v(48.6, 8.5), Max: v(52.4, 16), Vec: v(0, 0.25), Mark: 'w', Skin: "vent", Air: true, Every: 6, On: 3},
			},
			Friction: 0.87,
			Radius:   0.5,
			Bounce:   0.85,
		},
	}
}
