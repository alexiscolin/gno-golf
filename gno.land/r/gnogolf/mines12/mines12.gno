// Package mines12 is the steam vents: one bare ledge hugging the cliff in a
// broad crescent round the dark, from the tee's knoll high on the right,
// west along the top under a wave of steam vents, round the far bend past
// its rock spurs and geyser jet, back east over a crumbling edge and past
// the steam pump engine, whose three pistons thrust across the ledge on the
// engine's beat, through its exhaust and along the iron vein that pulls
// every rolling ball toward the drop, then up a narrow switchback to the
// cup's shelf in the crescent's mouth.
package mines12

import (
	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

var v = physics.V

// the vents' and the engine's clock: a vent blows 4 substeps in 15, a
// piston is out 5, the exhaust blows 6
const every = 15

// vent is a round plume at c blowing toward the crescent's dark, from phase.
func vent(x, y float64, phase int) physics.Zone {
	return physics.Zone{Kind: physics.Slope, Min: v(x-1.7, y-1.7), Max: v(x+1.7, y+1.7), Vec: v(0, 0.3), Mark: 'w', Skin: "vent", Round: true, Air: true, Every: every, On: 4, Phase: phase}
}

// piston is one of the engine's pistons thrusting across the bottom ledge
// at (x, y), its head 2.4 along the ledge: a ball under it as it thrusts is
// pushed out its nearest side, off the edge if that is the drop's.
func piston(x, y float64, phase int) []physics.Wall {
	return build.Timed(build.Bar(v(x, y-0.2), v(x, y+0.2), 2.4, '|', "piston"), every, 5, phase)
}

// the ground, drawn by hand: the knoll, the top ledge, the bend, the bottom
// ledge, the switchback's narrows, the cup's shelf. Its outline is cut in
// two on the seam x = 45.
var ground0 = []physics.Vec2{
	v(44.75, 3.72), v(44.41, 3.56), v(44.05, 3.5), v(23.05, 2.8), v(21.91, 2.93), v(21.51, 2.64),
	v(21.25, 2.51), v(20.7, 2.36), v(20.41, 2.34), v(20.12, 2.36), v(19.57, 2.51), v(16.9, 3.63),
	v(14.59, 5.38), v(14.18, 5.79), v(12.43, 8.1), v(11.22, 11.04), v(10.82, 13.91), v(10.82, 14.49),
	v(11.22, 17.36), v(12.43, 20.3), v(14.37, 22.83), v(16.66, 24.61), v(17.16, 24.89), v(19.57, 25.89),
	v(20.12, 26.04), v(20.41, 26.06), v(20.98, 25.98), v(21.51, 25.76), v(21.91, 25.47), v(23.07, 25.6),
	v(44, 24.6), v(45, 24.65), v(45, 21.85), v(43.93, 21.8), v(23.06, 22.8), v(22.27, 22.69),
	v(21.97, 22.3), v(21.51, 21.95), v(19.11, 20.94), v(17.5, 19.7), v(16.26, 18.09), v(15.48, 16.21),
	v(15.22, 14.2), v(15.48, 12.19), v(16.26, 10.31), v(17.5, 8.7), v(19.11, 7.46), v(21.51, 6.45),
	v(21.97, 6.1), v(22.27, 5.71), v(23.07, 5.6), v(44.14, 6.29), v(44.49, 6.21), v(44.69, 6.12),
	v(45, 6.13), v(45, 3.72),
}
var ground1 = []physics.Vec2{
	v(84.1, 2.8), v(65.97, 3.8), v(45, 3.72), v(45, 6.13), v(51.99, 6.5), v(65.99, 6.6),
	v(83.85, 5.61), v(84.88, 7.12), v(86.41, 7.94), v(87.87, 7.87), v(89.32, 6.9), v(89.87, 5.87),
	v(89.99, 4.71), v(89.65, 3.59), v(88.9, 2.68), v(87, 2), v(85.85, 2.23), v(84.8, 2.96),
	v(84.1, 2.8), v(47.93, 24.8), v(57.26, 24.88), v(64, 25.4), v(78.27, 25.37), v(84.4, 23.37),
	v(86.66, 19.98), v(86.73, 19.25), v(86.35, 18.59), v(87.83, 16.88), v(88.1, 15.5), v(87.94, 14.45),
	v(87.05, 12.95), v(85.55, 12.06), v(83.8, 11.97), v(82.22, 12.72), v(81.06, 14.45), v(81.06, 16.55),
	v(82.22, 18.28), v(84.27, 19.09), v(82.72, 21.42), v(78.28, 22.63), v(57.32, 22.48), v(45, 21.85),
	v(45, 24.65), v(47.93, 24.8), v(84.1, 2.8),
}

var me = author.Fit(&course.Simple{
	W: 93, H: 29,
	World:     "mines",
	Order:     12,
	Title:     "The Steam Vents",
	Strokes:   10, // par
	Tee:       v(87, 5),
	Pin:       v(84.2, 15.3),
	Substeps:  34,
	CupRadius: 1.2,
	Shelter:   0.03,

	// the ledge's edge crumbling away before the engine, from the 5th stroke
	Pulses: []course.Pulse{{Every: 64, On: 60, Phase: 60, Zones: []physics.Zone{
		{Kind: physics.Hazard, Min: v(24, 24.5), Max: v(28.5, 26.8), Vec: v(87, 5), Mark: '!', Round: true, Skin: "crumble"},
	}}},

	Course: &physics.Field{
		Walls: build.Walls(
			// the rock behind the knoll and at the far bend's head, the deadening
			// rock behind the cup's shelf
			build.Skinned(build.Walls(
				build.Polyline(v(87.87, 7.87), v(89.87, 5.87), v(89.65, 3.59), v(87, 2)),
				build.Polyline(v(16.9, 3.63), v(14.18, 5.79), v(11.22, 11.04), v(10.82, 14.49), v(12.43, 20.3), v(16.66, 24.61)),
			), "rockface"),
			build.Soft(build.Skinned(build.Polyline(v(86.35, 18.59), v(88.1, 15.5), v(87.05, 12.95), v(85.55, 12.06)), "rockface"), 0.35),
			// two rock spurs jutting from the cliff into the far bend, the way
			// past them along the drop
			build.Skinned(build.Bar(v(14.37, 5.57), v(15.54, 6.74), 0.5, '#', ""), "rockface"),
			build.Skinned(build.Bar(v(14.37, 22.83), v(15.54, 21.66), 0.5, '#', ""), "rockface"),
			// the steam pump engine's pistons, thrusting one after another
			// along the bottom ledge
			piston(30, 23.87, 0), piston(36, 23.58, 12), piston(42, 23.3, 9),
		),
		Zones: []physics.Zone{
			// the wave of vents along the top ledge
			vent(72, 4.87, 0), vent(62, 5.16, 12), vent(52, 5.06, 9), vent(42, 4.86, 6), vent(32, 4.51, 3),
			// the geyser jet at the far bend's apex, blowing out over the dark
			{Kind: physics.Slope, Min: v(10.8, 12.4), Max: v(14.4, 16), Vec: v(0.3, 0), Mark: 'w', Skin: "vent", Round: true, Air: true, Every: every, On: 4, Phase: 7},
			// the engine's exhaust, blowing east along the bottom ledge
			{Kind: physics.Slope, Min: v(46, 21), Max: v(58, 26.2), Vec: v(0.35, 0), Mark: '>', Skin: "booster", Round: true, Air: true, Every: every, On: 6},
			// two vents across the bottom ledge, blowing toward the crescent's dark
			{Kind: physics.Slope, Min: v(66.3, 22.3), Max: v(69.7, 25.7), Vec: v(0, -0.3), Mark: 'w', Skin: "vent", Round: true, Air: true, Every: every, On: 4, Phase: 4},
			{Kind: physics.Slope, Min: v(72.8, 22.3), Max: v(76.2, 25.7), Vec: v(0, -0.3), Mark: 'w', Skin: "vent", Round: true, Air: true, Every: every, On: 4, Phase: 10},
			// the iron vein, pulling toward the drop
			{Kind: physics.Slope, Min: v(55, 21.2), Max: v(79, 27), Vec: v(0, 0.08), Mark: 'v', Skin: "magnet", Round: true, Air: true, Capped: true},
			// the dark round the ledge, in two parts meeting on the seam
			{Kind: physics.Hazard, Min: v(-5, -5), Max: v(45, 35), Vec: v(87, 5), Poly: ground0, Outside: true, Skin: "void"},
			{Kind: physics.Hazard, Min: v(45, -5), Max: v(100, 35), Vec: v(87, 5), Poly: ground1, Outside: true, Skin: "void"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
