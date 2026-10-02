// Package mines15 is the stalactite hall, always dark: a passage from a
// grotto, slaloming between stalagmites and through the narrows where the
// bats roost, a different perch each stroke, into a round gallery that
// rings a frozen lake, the dark all round the lake's island. North round
// the ring the stalactites drop in a wave and stand a while before they
// crumble; south round it, stalagmite gates and more bats. From the far
// side a causeway of ice runs out to the island, where the cup waits by the
// frozen waterfall's column.
package mines15

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

var v = physics.V

// the drops' clock: each stalactite stands 6 substeps in 18, on its own phase
const every = 18

func stalagmite(x, y, r float64) physics.Post {
	return physics.Post{Circle: physics.Circle{C: v(x, y), R: r}, Bounce: 0.6, Skin: "stalagmite"}
}

func bat(p physics.Vec2) physics.Post {
	return physics.Post{Circle: physics.Circle{C: p, R: 0.5}, Bounce: 0.5, Skin: "bat"}
}

// roost is where the flock hangs on one stroke in three.
func roost(phase int, a, b physics.Vec2) course.Pulse {
	return course.Pulse{Every: 3, On: 1, Phase: phase, Posts: []physics.Post{bat(a), bat(b)}}
}

// stalactite is one that drops at (x, y) and stands.
func stalactite(x, y float64, phase int) []physics.Wall {
	return build.Timed(build.Bar(v(x-0.05, y), v(x+0.05, y), 1, '|', "stalactite"), every, 6, phase)
}

// the ground, drawn by hand: the grotto, the passage, the ring round the
// lake, the causeway, the island. Its outline is cut in three (x = 47, and
// y = 20 west of it); the moat round the island is a hole in each part.
var ground0 = []physics.Vec2{
	v(45.93, 3.64), v(44.86, 3.74), v(43.8, 3.92), v(42.76, 4.16), v(41.73, 4.47), v(40.72, 4.85),
	v(39.75, 5.29), v(38.8, 5.8), v(37.89, 6.36), v(37.02, 6.99), v(36.19, 7.67), v(35.4, 8.4),
	v(34.67, 9.19), v(33.99, 10.02), v(33.36, 10.89), v(32.8, 11.8), v(32.29, 12.75), v(31.85, 13.72),
	v(31.47, 14.73), v(31.16, 15.76), v(30.92, 16.8), v(30.66, 18.67), v(27.21, 20), v(34.4, 20),
	v(34.51, 18.36), v(34.64, 17.54), v(34.83, 16.74), v(35.36, 15.18), v(36.09, 13.7), v(36.52, 13),
	v(37, 12.33), v(38.09, 11.09), v(38.69, 10.53), v(40, 9.52), v(40.7, 9.09), v(42.18, 8.36),
	v(43.74, 7.83), v(44.54, 7.64), v(46.18, 7.43), v(47, 7.4), v(47, 3.6), v(45.93, 3.64),
	v(46.43, 14.23), v(45.32, 14.45), v(44.27, 14.88), v(43.32, 15.52), v(42.52, 16.32), v(42.18, 16.78),
	v(41.64, 17.78), v(41.31, 18.87), v(41.2, 20), v(47, 20), v(47, 14.2), v(46.43, 14.23),
	v(45.93, 3.64),
}
var ground1 = []physics.Vec2{
	v(25.32, 20.73), v(19.43, 23.66), v(12.43, 24.69), v(5.93, 27.94), v(4.69, 27.82), v(3.49, 28.18),
	v(2.53, 28.97), v(1.94, 30.07), v(1.82, 31.31), v(2.18, 32.51), v(2.74, 33.26), v(3.78, 33.96),
	v(4.69, 34.18), v(5.93, 34.06), v(6.78, 33.66), v(7.47, 33.03), v(7.96, 32.22), v(8.2, 31.02),
	v(13.57, 28.34), v(20.57, 27.31), v(26.77, 24.24), v(30.83, 22.68), v(31.47, 25.27), v(32.8, 28.2),
	v(33.99, 29.98), v(36.19, 32.33), v(38.8, 34.2), v(41.73, 35.53), v(44.86, 36.26), v(47, 36.4),
	v(47, 32.6), v(44.54, 32.36), v(42.95, 31.93), v(41.43, 31.3), v(40, 30.48), v(38.69, 29.47),
	v(37, 27.67), v(36.09, 26.3), v(35.07, 24.05), v(34.51, 21.64), v(34.4, 20), v(27.21, 20),
	v(25.32, 20.73), v(41.23, 20.57), v(41.64, 22.22), v(42.18, 23.22), v(42.9, 24.1), v(43.78, 24.82),
	v(44.78, 25.36), v(45.87, 25.69), v(47, 25.8), v(47, 20), v(41.2, 20), v(41.23, 20.57),
	v(25.32, 20.73),
}
var ground2 = []physics.Vec2{
	v(62.84, 15.76), v(61.71, 12.75), v(60.64, 10.89), v(59.33, 9.19), v(56.98, 6.99), v(54.25, 5.29),
	v(52.27, 4.47), v(50.2, 3.92), v(47, 3.6), v(47, 7.4), v(49.46, 7.64), v(51.82, 8.36),
	v(54, 9.52), v(55.31, 10.53), v(57, 12.33), v(58.3, 14.43), v(59.17, 16.74), v(59.56, 19),
	v(52.71, 19), v(52.12, 17.27), v(51.48, 16.32), v(50.68, 15.52), v(49.22, 14.64), v(48.13, 14.31),
	v(47, 14.2), v(47, 25.8), v(48.13, 25.69), v(49.22, 25.36), v(50.68, 24.48), v(51.48, 23.68),
	v(52.12, 22.73), v(52.71, 21), v(59.56, 21), v(59.17, 23.26), v(58.3, 25.57), v(57, 27.67),
	v(55.31, 29.47), v(54, 30.48), v(51.82, 31.64), v(49.46, 32.36), v(47, 32.6), v(47, 36.4),
	v(49.14, 36.26), v(51.24, 35.84), v(54.25, 34.71), v(56.11, 33.64), v(57.81, 32.33), v(60.01, 29.98),
	v(61.71, 27.25), v(62.53, 25.27), v(63.08, 23.2), v(63.4, 20), v(63.26, 17.86),
}

var me = author.Fit(&course.Simple{
	W: 73, H: 41,
	World:     "mines",
	Order:     15,
	Title:     "The Stalactite Hall",
	Strokes:   8, // par
	Tee:       v(5, 31),
	Pin:       v(45.3, 20.6),
	Substeps:  34,
	CupRadius: 1.1,
	Shelter:   0.03,

	// the flock: in the narrows and round the ring, at one perch a stroke in three
	Pulses: []course.Pulse{
		roost(0, v(23.5, 23.2), v(44.34, 35.07)),
		roost(2, v(27.5, 23), v(35.14, 26.85)),
		roost(1, v(30.5, 20.6), v(56.83, 31.72)),
	},
	Course: &physics.Field{
		Walls: build.Walls(
			// the rock round the grotto and the ring's outer wall at its three far sides
			build.Skinned(build.Walls(
				build.Polyline(v(5.93, 27.94), v(3.49, 28.18), v(1.94, 30.07), v(2.18, 32.51), v(3.78, 33.96), v(5.93, 34.06)),
				build.Polyline(v(45.93, 3.64), v(43.8, 3.92), v(41.73, 4.47), v(39.75, 5.29), v(37.89, 6.36), v(36.19, 7.67)),
				build.Polyline(v(60.01, 29.98), v(62.53, 25.27), v(63.4, 20), v(62.84, 15.76)),
				build.Polyline(v(47, 36.4), v(51.24, 35.84), v(56.11, 33.64), v(57.81, 32.33)),
			), "rockface"),
			// the stalactite forest round the north of the ring, dropping in a wave
			stalactite(33.22, 13.58, 0), stalactite(38.13, 9.43, 3), stalactite(43.07, 5.32, 5),
			stalactite(49.4, 6.41, 7), stalactite(55.72, 7.55, 9), stalactite(58.95, 13.1, 11),
		),
		Posts: []physics.Post{
			// the slalom in the passage
			stalagmite(10.5, 28.6, 0.9), stalagmite(16.5, 24.9, 0.9),
			// two stalagmite gates round the south of the ring
			stalagmite(38.02, 32.82, 0.55), stalagmite(39.34, 30.94, 0.55),
			stalagmite(51.05, 35.12, 0.55), stalagmite(50.46, 32.9, 0.55),
			// the frozen fall, a column of ice on the island
			{Circle: physics.Circle{C: v(50.2, 19.1), R: 0.9}, Bounce: 0.6, Skin: "frozen fall"},
		},
		Zones: []physics.Zone{
			// the frozen lake's island: ice, and the dark all round it
			{Kind: physics.Surface, Min: v(41.2, 14.2), Max: v(52.8, 25.8), Scale: 1.12, Mark: '-', Round: true, Skin: "ice"},
			{Kind: physics.Hazard, Min: v(-5, -5), Max: v(47, 20), Vec: v(5, 31), Poly: ground0, Outside: true, Skin: "void"},
			{Kind: physics.Hazard, Min: v(-5, 20), Max: v(47, 45), Vec: v(5, 31), Poly: ground1, Outside: true, Skin: "void"},
			{Kind: physics.Hazard, Min: v(47, -5), Max: v(100, 45), Vec: v(5, 31), Poly: ground2, Outside: true, Skin: "void"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
