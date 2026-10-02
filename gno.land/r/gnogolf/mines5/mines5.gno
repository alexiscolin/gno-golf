// Package mines5 is the geode: a hollow of crystal, its floor a sheet of
// crystal ice. Three bands of agate ring the heart, their facets kicking and
// dull in turn, each with one gate; beside the outer two gates a wall of
// crystal closes the short way, so you go the long way round, past crystals
// that ring. A hard bank comes back faster than it went in, a soft one
// behaves. In the heart a druse of kicking crystals stands round the cup.
package mines5

import (
	"math"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/course/author"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
)

var v = physics.V

var (
	tee   = v(25, 47)
	heart = v(25, 23.5) // the cup, and the centre of the bands and the druse
)

// facet skins: a kicking crystal, and the dull one that takes the pace off
func kick(ws []physics.Wall) []physics.Wall {
	return build.Soft(build.Skinned(ws, "crystal bumper"), 1.25)
}

func dull(ws []physics.Wall) []physics.Wall {
	return build.Soft(build.Skinned(ws, "crystal"), 0.6)
}

// bumps is how far in or out each of the shell's corners stands: a geode is
// no egg.
var bumps = []float64{0, 1.2, -0.6, 0.8, 1.4, -0.4, 0.6, -1, 0.4, 1.2, -0.8, 0.6, 1, 0}

// shell is the geode's wall, 13 facets from the crack's left lip round to
// its right, in pairs that kick and pairs that do not.
func shell() []physics.Wall {
	var pts []physics.Vec2
	n := len(bumps)
	for i, b := range bumps {
		a := math.Pi/2 + math.Pi/float64(n) + float64(i)*2*math.Pi/float64(n)
		pts = append(pts, v(25+(24+b)*math.Cos(a), 23.5+(22+b)*math.Sin(a)))
	}
	var out []physics.Wall
	for i := 0; i+1 < len(pts); i++ {
		w := build.Polyline(pts[i], pts[i+1])
		if i/2%2 == 0 {
			out = append(out, dull(w)...)
		} else {
			out = append(out, kick(w)...)
		}
	}
	// the crack the tee is in, down from the shell's lips
	lips := build.Polyline(pts[len(pts)-1], v(26.5, 49), v(23.5, 49), pts[0])
	return append(out, build.Skinned(lips, "rockface")...)
}

// deg is an angle round the heart, in degrees (0 is +X, 90 down the board).
func deg(d float64) float64 { return d * math.Pi / 180 }

// ring is a band of the agate round the heart, radius r: its gate is at the
// angle gate (degrees), 3.6 wide, and n facets go round from one side of the
// gate to the other, every other one a kicking crystal.
func ring(r, gate float64, n int) []physics.Wall {
	half := math.Asin(1.8/r) * 180 / math.Pi
	ws := build.Polyline(build.Arc(heart, r, deg(gate+half), deg(gate+360-half), n)...)
	var out []physics.Wall
	for i := range ws {
		if i%2 == 0 {
			out = append(out, dull(ws[i:i+1])...)
		} else {
			out = append(out, kick(ws[i:i+1])...)
		}
	}
	return out
}

// septum is a wall of crystal across the band from r0 to r1 at an angle,
// closing the short way to the next gate.
func septum(at, r0, r1 float64) []physics.Wall {
	return dull(build.Polyline(heart.Add(physics.FromPolar(deg(at), r0)), heart.Add(physics.FromPolar(deg(at), r1))))
}

// bands are the three rings, and the septa beside the outer two's gates:
// the way in is the long way round.
func bands() []physics.Wall {
	return build.Walls(
		ring(17, 60, 10), septum(75, 17, 25),
		ring(12, 30, 8), septum(45, 12, 17),
		ring(7.5, 0, 6),
	)
}

// clusters are kicking crystals growing out of the floor of each band, in
// the middle of it: a ball slides by on either side, or rings off them.
func clusters() []physics.Post {
	var ps []physics.Post
	for _, d := range []float64{150, 210, 270, 330, 30} {
		ps = append(ps, crystal(heart.Add(physics.FromPolar(deg(d), 20.5)), 0.8))
	}
	for _, d := range []float64{90, 170, 250, 330} {
		ps = append(ps, crystal(heart.Add(physics.FromPolar(deg(d), 14.5)), 0.7))
	}
	return ps
}

func crystal(c physics.Vec2, r float64) physics.Post {
	return physics.Post{Circle: physics.Circle{C: c, R: r}, Bounce: 1.3, Mark: '*', Skin: "crystal bumper"}
}

// druse is the crystals round the cup, open toward the left, away from the
// inner gate.
func druse() []physics.Post {
	var ps []physics.Post
	for _, d := range []float64{-60, 0, 60, 120, 240} {
		ps = append(ps, physics.Post{Circle: physics.Circle{C: heart.Add(physics.FromPolar(deg(d), 2.8)), R: 0.9}, Bounce: 1.3, Mark: '*', Skin: "crystal bumper"})
	}
	return ps
}

var me = author.Fit(&course.Simple{
	W: 50, H: 49,
	World:     "mines",
	Order:     5,
	Title:     "The Geode",
	Strokes:   9, // par
	Tee:       tee,
	Pin:       heart,
	Substeps:  34,
	CupRadius: 1.2,
	Shelter:   0.03,
	Course: &physics.Field{
		Walls: build.Walls(shell(), bands()),
		Posts: append(druse(), clusters()...),
		Zones: []physics.Zone{
			{Kind: physics.Surface, Min: v(0.5, 1), Max: v(49.5, 46), Scale: 1.12, Round: true, Mark: '-', Skin: "ice"},
			{Kind: physics.Surface, Min: v(21.5, 43), Max: v(28.5, 49), Scale: 0.6, Mark: ',', Skin: "rubble"},
		},
		Friction: 0.87,
		Radius:   0.5,
		Bounce:   0.85,
	},
}, 1.5)
