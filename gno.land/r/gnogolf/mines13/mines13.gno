// Package mines13 is the lava fall: a long gallery under the vault where two
// curtains of lava pour across the way on periods that never quite agree, so
// their gaps line up only now and then; most stop between them. A lava pool
// squeezes the way to a ledge along the wall, the lava river cuts it, and a
// rail-less basalt bridge zigzags over the river pier to pier to the green of
// crystal ice. The adit, a side passage from the tee, goes round the falls.
package mines13

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

var me = author.Fit(hole(), 1.5)

func hole() *course.Simple {
	v := physics.V
	tee := v(6, 13)
	lava := func(min, max physics.Vec2, poly ...physics.Vec2) physics.Zone {
		return physics.Zone{Kind: physics.Hazard, Min: min, Max: max, Vec: tee, Poly: poly, Mark: '~', Skin: "lava"}
	}
	fall := func(x, y0, y1 float64, every, on int) physics.Zone {
		return physics.Zone{Kind: physics.Hazard, Min: v(x, y0), Max: v(x+2, y1), Vec: tee, Mark: '|', Skin: "lava fall", Every: every, On: on}
	}
	return &course.Simple{
		World:     "mines",
		Order:     13,
		Title:     "The Lava Fall",
		Strokes:   8, // par
		Tee:       tee,
		Pin:       v(79.5, 4),
		Substeps:  30,
		CupRadius: 1.1,
		Shelter:   0.05,

		Course: &physics.Field{
			// the gallery, a rock-walled lane from the tee to the green
			Walls: build.Walls(
				build.Skinned(build.Outline(build.Lane(11.0, 2, v(6, 13), v(21, 11), v(37, 15), v(53, 12), v(67, 13), v(78, 5))...), "rockface"),
				// the rock pocket the adit lets you out in, its gap toward the falls
				build.Skinned(build.Polyline(v(24.5, 12.91), v(23.5, 12.91), v(23.5, 18.91)), "rockface"),
				build.Skinned(build.Polyline(v(26.5, 12.91), v(27.5, 12.91), v(27.5, 18.91)), "rockface"),
			),
			// stalagmites at the green's mouth
			Posts: []physics.Post{
				{Circle: physics.Circle{C: v(71.5, 9), R: 0.9}, Bounce: 0.6, Skin: "stalagmite"},
				{Circle: physics.Circle{C: v(75.5, 11.5), R: 0.9}, Bounce: 0.6, Skin: "stalagmite"},
			},
			Zones: []physics.Zone{
				// the adit: a side passage from behind the tee that lets you out past the
				// falls on scree, heading back toward them
				{Kind: physics.Tunnel, Min: v(-1, 11.5), Max: v(2, 14.5), Vec: v(25.5, 15.21), Round: true, Mark: 'A', Skin: "adit"},
				{Kind: physics.Surface, Min: v(23.5, 12.91), Max: v(27.5, 17.91), Scale: 0.5, Round: true, Mark: ',', Skin: "rubble"},
				fall(13.5, 5.08, 18.08, 14, 10),
				fall(20.5, 4.48, 17.48, 9, 6),
				// the plunge pool the falls pour into, between them
				{Kind: physics.Hazard, Min: v(15.7, 12.23), Max: v(20.3, 18.03), Vec: tee, Round: true, Mark: '~', Skin: "lava"},
				// a lava pool squeezing the way to a ledge along the north wall
				{Kind: physics.Hazard, Min: v(28.5, 13.67), Max: v(42.5, 24.47), Vec: tee, Round: true, Mark: '~', Skin: "lava"},
				// the lava river either side of the basalt bridge
				lava(v(42.57, 5.48), v(66.43, 13.3), v(44, 7.48), v(49.25, 6.11), v(54.5, 5.48), v(59.75, 6.21), v(65, 6.8), v(65.88, 7.44), v(66.43, 8.08), v(66.43, 8.72), v(65.88, 9.36), v(65, 10), v(58.78, 12.95), v(58.5, 12.68), v(58.43, 12.73), v(54.67, 9.35), v(53.5, 8.18), v(51.76, 9.91), v(48.49, 12.99), v(48.18, 13.3), v(44, 11.57), v(43.12, 10.76), v(42.57, 9.94), v(42.57, 9.12), v(43.12, 8.3)),
				lava(v(42.57, 11.71), v(66.43, 20.48), v(44, 14.28), v(47.73, 15.82), v(48.49, 16.58), v(50.23, 14.86), v(53.46, 11.75), v(53.56, 11.71), v(57.31, 15.09), v(58.5, 16.27), v(59.29, 15.48), v(65, 12.77), v(65.88, 14.18), v(66.43, 15.58), v(66.43, 16.99), v(65.88, 18.4), v(65, 19.8), v(59.75, 19.21), v(54.5, 18.48), v(49.25, 19.11), v(44, 20.48), v(43.12, 19.24), v(42.57, 18), v(42.57, 16.76), v(43.12, 15.52)),
				// the crystal-ice green
				{Kind: physics.Surface, Min: v(72.5, -2), Max: v(85, 10.5), Scale: 1.1, Round: true, Mark: '*', Skin: "ice"},
			},
			Friction: 0.87,
			Radius:   0.5,
			Bounce:   0.85,
		},
	}
}
