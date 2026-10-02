// Package mines16 is the strongroom: a gauntlet of a corridor from the
// gnomes' counting room to the great round vault. Past an iron grille, a
// niche of kicking jewels and a second grille; a swinging door sweeping the
// corridor on the vault's clock; the outer great round door, shut on every
// other stroke; a safe door rolling across in its groove; round a narrow
// bend to the inner great door, shut on every third, the dial over each
// saying which will open next; three brass tripwires on staggered beats;
// then the vault, its floor a slick of gold coins, racks of bars standing
// out from its wall, and the cup at its heart in a ring of kicking jewels.
package mines16

import (
	"math"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

var v = physics.V

// the vault's heart, where the cup is
var heart = v(22, 30)

func jewel(x, y float64) physics.Post {
	return physics.Post{Circle: physics.Circle{C: v(x, y), R: 0.8}, Bounce: 1.25, Skin: "jewel bumper"}
}

// ring is the jewels round the cup, radius 2.8, one missing on the south-west side.
func ring() []physics.Post {
	var ps []physics.Post
	for k := 0; k < 8; k++ {
		if k == 3 {
			continue // the way in
		}
		a := float64(k) * math.Pi / 4
		ps = append(ps, jewel(heart.X+2.8*math.Cos(a), heart.Y+2.8*math.Sin(a)))
	}
	return ps
}

// the vault's clock: the swinging door, the rolling safe door and the
// tripwires all run on 12 substeps
const every = 12

// swing is the swinging door at one position of its sweep, hinged on the
// corridor's north side at x, pointing at angle a (degrees), there 2
// substeps from phase.
func swing(x, a float64, phase int) []physics.Wall {
	hinge := v(x, 3.03)
	d := physics.FromPolar(a*math.Pi/180, 1)
	return build.Timed(build.Bar(hinge.Add(d.Scale(0.3)), hinge.Add(d.Scale(3.9)), 0.6, '/', "swing door"), every, 2, phase)
}

// safeDoor is the round safe door rolling across the corridor at x, its slab
// at y, there 3 substeps from phase.
func safeDoor(x, y float64, phase int) []physics.Wall {
	return build.Timed(build.Bar(v(x, y-0.5), v(x, y+0.5), 1.4, 'O', "safe door"), every, 3, phase)
}

// tripwire is a brass wire strung across the return leg at c (the leg's
// direction d), there 3 substeps from phase.
func tripwire(c, d physics.Vec2, phase int) []physics.Wall {
	n := v(-d.Y, d.X).Scale(2.05)
	return build.Timed(build.Bar(c.Sub(n), c.Add(n), 0.25, '-', "tripwire"), every, 3, phase)
}

// vaultDoor is a great round vault door, a thick slab of steel, shut across
// the corridor at c, whose direction is d (a unit vector).
func vaultDoor(c, d physics.Vec2) []physics.Wall {
	n := v(-d.Y, d.X).Scale(1.5)
	return build.Bar(c.Sub(n), c.Add(n), 1.4, '=', "vault door")
}

// the ground, drawn by hand: the counting room, the corridor and its bend,
// the round vault. Its outline is cut in two on the seam x = 30.
var ground0 = []physics.Vec2{
	v(6.78, 2.34), v(5.62, 1.86), v(4.38, 1.86), v(3.22, 2.34), v(2.34, 3.22), v(1.86, 4.38),
	v(1.86, 5.62), v(2.34, 6.78), v(3.22, 7.66), v(4.07, 8.06), v(5, 8.2), v(6.22, 7.96),
	v(7.31, 7.21), v(22.37, 7.58), v(21.88, 8.32), v(21.72, 8.9), v(21.88, 10.08), v(22.18, 10.6),
	v(22.85, 11.19), v(24, 11.5), v(24.88, 11.32), v(25.4, 11.02), v(26.12, 10.08), v(26.3, 9.2),
	v(26.22, 8.6), v(25.59, 7.54), v(30, 7.5), v(30, 3.1), v(20.02, 3.2), v(7.33, 2.81),
	v(6.78, 2.34), v(29.78, 22.22), v(28.11, 20.85), v(26.21, 19.84), v(24.15, 19.21), v(22, 19),
	v(19.85, 19.21), v(17.79, 19.84), v(15.89, 20.85), v(14.22, 22.22), v(12.85, 23.89), v(11.84, 25.79),
	v(11.21, 27.85), v(11, 30), v(11.21, 32.15), v(11.84, 34.21), v(12.85, 36.11), v(14.22, 37.78),
	v(15.89, 39.15), v(17.79, 40.16), v(19.85, 40.79), v(22, 41), v(24.15, 40.79), v(26.21, 40.16),
	v(28.11, 39.15), v(29.78, 37.78), v(30, 37.54), v(30, 22.46), v(29.78, 22.22), v(6.78, 2.34),
}
var ground1 = []physics.Vec2{
	v(39.93, 7.4), v(53.84, 8.39), v(54.27, 8.38), v(54.79, 8.25), v(57.99, 10.17), v(57.32, 13.51),
	v(53.12, 15.12), v(52.91, 15), v(52.5, 14.86), v(52.07, 14.8), v(51.64, 14.83), v(51.23, 14.94),
	v(39.25, 19.43), v(30.77, 22.43), v(30.24, 22.71), v(30, 22.46), v(30, 37.54), v(30.73, 36.7),
	v(31.15, 36.11), v(31.87, 34.87), v(32.42, 33.54), v(32.79, 32.15), v(32.98, 30.72), v(32.98, 29.28),
	v(32.79, 27.85), v(32.43, 26.51), v(40.77, 23.56), v(52.77, 19.06), v(53.16, 18.87), v(53.5, 18.61),
	v(53.79, 18.28), v(54, 17.91), v(54.09, 17.64), v(58.98, 15.76), v(59.23, 15.64), v(59.44, 15.47),
	v(59.61, 15.26), v(59.74, 15.02), v(59.82, 14.76), v(60.82, 9.76), v(60.85, 9.49), v(60.82, 9.22),
	v(60.73, 8.95), v(60.6, 8.71), v(60.42, 8.51), v(60.19, 8.34), v(56.18, 5.94), v(56.09, 5.51),
	v(55.91, 5.11), v(55.66, 4.76), v(55.35, 4.46), v(54.98, 4.23), v(54.58, 4.08), v(54.16, 4.01),
	v(40.16, 3.01), v(30, 3.1), v(30, 7.5),
}

var me = author.Fit(&course.Simple{
	W: 66, H: 44,
	World:     "mines",
	Order:     16,
	Title:     "The Strongroom",
	Strokes:   9, // par
	Tee:       v(5, 5),
	Pin:       heart,
	Substeps:  34,
	CupRadius: 1.1,
	Shelter:   0.03,

	Pulses: []course.Pulse{
		// the outer door, shut on strokes 1, 3, 5, 7...
		{Every: 2, On: 1, Phase: 0, Walls: vaultDoor(v(44, 5.5), v(0.997, 0.07))},
		// the inner door, shut on strokes 1, 4, 7...
		{Every: 3, On: 1, Phase: 0, Walls: vaultDoor(v(45, 19.6), v(-0.936, 0.351))},
	},
	Course: &physics.Field{
		Walls: build.Walls(
			// the counting room's back wall, the corridor's bend, the vault's wall
			// round all but its door
			build.Polyline(v(5.62, 1.86), v(3.22, 2.34), v(1.86, 4.38), v(2.34, 6.78), v(4.07, 8.06), v(6.22, 7.96)),
			build.Polyline(v(58.98, 15.76), v(59.61, 15.26), v(59.82, 14.76), v(60.82, 9.76), v(60.73, 8.95), v(60.19, 8.34)),
			build.Polyline(v(33, 30), v(31.53, 35.5), v(26.21, 40.16), v(22, 41), v(14.22, 37.78), v(11, 30), v(14.22, 22.22), v(22, 19), v(26.21, 19.84)),
			// the iron grilles across the corridor, open at alternate sides
			build.Skinned(build.Walls(
				build.Polyline(v(16, 2.7), v(16, 5)), build.Polyline(v(30, 7.8), v(30, 5.5)),
			), "grate"),
			// the swinging door, one sweep across the corridor in 6 substeps of 12
			swing(37, 60, 0), swing(37, 90, 10), swing(37, 120, 8),
			// the safe door rolling across in its groove, north to south
			safeDoor(49.5, 4.3, 0), safeDoor(49.5, 5.9, 9), safeDoor(49.5, 7.5, 6),
			// the tripwires on the return leg, on staggered beats
			tripwire(v(41.5, 20.94), v(-0.936, 0.351), 0), tripwire(v(37.5, 22.38), v(-0.943, 0.333), 4),
			tripwire(v(34.5, 23.44), v(-0.943, 0.333), 8),
			// the racks of gold bars standing out from the vault's wall
			build.Polyline(v(27.4, 39.35), v(24.9, 35.02)), build.Polyline(v(12.65, 24.6), v(16.98, 27.1)),
		),
		// the ring of jewels round the cup, and a niche of them off the corridor
		Posts: append(ring(), jewel(22.4, 10.1), jewel(25.6, 10.1), jewel(24, 11)),
		Zones: []physics.Zone{
			// the vault's floor of gold
			{Kind: physics.Surface, Min: v(11, 19), Max: v(33, 41), Scale: 1.15, Mark: '$', Round: true, Skin: "gold"},
			// the dark round the corridor and the vault, in two parts meeting on the seam
			{Kind: physics.Hazard, Min: v(-5, -5), Max: v(30, 50), Vec: v(5, 5), Poly: ground0, Outside: true, Skin: "void"},
			{Kind: physics.Hazard, Min: v(30, -5), Max: v(100, 50), Vec: v(5, 5), Poly: ground1, Outside: true, Skin: "void"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
