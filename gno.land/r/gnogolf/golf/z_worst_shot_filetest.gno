// PKGPATH: gno.land/r/test/worstshot
package worstshot

import (
	"encoding/hex"
	"math"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

// The heaviest shots GG1 lets anyone publish, as far as the probes found:
// each probe is a 96×96 board at the format's limits, published, then played
// with one Launch, in the weather its slug gets at this test's period (a2 is
// clear, a0, a14, a23 and a24 rainy in the garden, a31 and a60 stormy on the
// island). Rain doubles a hole's ice (its wet copy), a storm adds four
// board-wide zones on top. The physics ends every stroke at MaxWork. The
// Launch of each, the hole decoded, its forecast and the shot (measured on
// its own, publishing left out; the gas below is all seven publishes and
// Launches):
//
//	worst    160 bumper walls across the board, the steepest hill, 31
//	         ice zones, 8 of them 64-point circles                0.75e9
//	zigzag   4 bumper walls, a board-wide hill, 8 zigzag ice
//	         polygons (every edge across the ball) and 23 ice
//	         zones, in the rain                                   1.27e9
//	hills    the 8 zigzags as hills (the ground, looked at several
//	         times a substep) and 24 ice zones, in a storm        0.99e9
//	forecast 160 bumper walls, 8 zigzag ice polygons, a hill, in
//	         the rain: the forecast alone (60 puddle tries over
//	         them) is 0.5e9 (0.55e9 and a Launch of 1.44e9 in
//	         another period's rain)                               1.39e9
//	bars     38 timed bars, each pushing the ball out as it comes
//	         back, 8 zigzag ice polygons, in the rain             0.69e9
//	loops    30 loop mouths rolled across, a storm's gusts        0.59e9
//	tunnels  15 tunnels and 8 zigzag ice polygons, in the rain    1.02e9
//
// All are under 1.6e9, and the 2e9 Adena simulates.
type spec struct {
	slug, world, walls string
	zig, circ, rects   int
	zigHills, hill     bool
	hillVec            physics.Vec2
	loops, tunnels     int
	tee                physics.Vec2
	angle, power       float64
}

var probes = []spec{
	{slug: "a2", walls: "cross", hill: true, circ: 8, rects: 23},
	{slug: "a0", walls: "box", hill: true, zig: 8, rects: 23},
	{slug: "a60", world: "island", walls: "box", zigHills: true, zig: 8, rects: 24},
	{slug: "a14", walls: "cross", hill: true, zig: 8},
	{slug: "a23", walls: "bars", hill: true, zig: 8},
	{slug: "a31", world: "island", walls: "box", hill: true, hillVec: physics.V(-0.9, 0), loops: 30, tee: physics.V(94, 50), angle: 180},
	{slug: "a24", walls: "box", hill: true, tunnels: 15, zig: 8},
}

func bumpers(ws []physics.Wall) []physics.Wall {
	for i := range ws {
		ws[i].Bounce, ws[i].Skin = 1.5, "bumper"
	}
	return ws
}

func build(s spec) *course.Simple {
	var walls []physics.Wall
	switch s.walls {
	case "cross":
		for i := 0; i < course.MaxWalls; i++ {
			t := float64(i) * 96 / course.MaxWalls
			walls = append(walls, physics.Wall{Seg: physics.Segment{A: physics.V(t, 0), B: physics.V(96-t, 96)}})
		}
		walls = bumpers(walls)
	case "box", "bars":
		walls = bumpers(physics.Box(physics.V(0, 0), physics.V(96, 96)))
		for i := 0; s.walls == "bars" && len(walls)+4 <= course.MaxWalls; i++ {
			x, y := 2+float64(i%13)*7, 2+float64(i/13)*30
			walls = append(walls, physics.Timed(physics.Bar(physics.V(x, y), physics.V(x+5, y+0.2), 0.3, '=', "tram"), 2, 1, i%2)...)
		}
	}
	var zones []physics.Zone
	if s.hill {
		v := s.hillVec
		if v == (physics.Vec2{}) {
			v = physics.V(0.67, 0.67)
		}
		zones = append(zones, physics.Zone{Kind: physics.Slope, Min: physics.V(0, 0), Max: physics.V(96, 96), Vec: v, Skin: "slope"})
	}
	for i := 0; i < s.loops; i++ {
		x := float64(i) * 3
		zones = append(zones, physics.Zone{Kind: physics.Loop, Min: physics.V(x, 0), Max: physics.V(x+2.5, 96), Vec: physics.V(x+1, 50), Scale: 7.9, Skin: "loop"})
	}
	for i := 0; i < s.tunnels; i++ {
		x := float64(i) * 6
		zones = append(zones, physics.Zone{Kind: physics.Tunnel, Min: physics.V(x, 60), Max: physics.V(x+2, 62), Vec: physics.V(80, 10+float64(i)), Round: true, Skin: "tunnel"})
	}
	for i := 0; i < s.zig; i++ {
		// every edge runs from the bottom of the board to its top
		z := physics.Zone{Kind: physics.Surface, Min: physics.V(0, 0), Max: physics.V(96, 96), Scale: 8, Skin: "ice"}
		if s.zigHills {
			z.Kind, z.Vec, z.Scale, z.Skin = physics.Slope, physics.V(0.6, 0.6), 0, "slope"
		}
		for k := 0; k < course.MaxPoly; k++ {
			z.Poly = append(z.Poly, physics.V(float64(k)*1.5+float64(i)*0.1, float64(k%2)*96))
		}
		zones = append(zones, z)
	}
	for i := 0; i < s.circ; i++ {
		z := physics.Zone{Kind: physics.Surface, Min: physics.V(0, 0), Max: physics.V(96, 96), Scale: 8, Skin: "ice"}
		for k := 0; k < course.MaxPoly; k++ {
			z.Poly = append(z.Poly, physics.V(48, 48).Add(physics.FromPolar(float64(k)*2*math.Pi/course.MaxPoly, 40+float64(i))))
		}
		zones = append(zones, z)
	}
	for i := 0; i < s.rects; i++ {
		zones = append(zones, physics.Zone{Kind: physics.Surface, Min: physics.V(0, 0), Max: physics.V(96, 96), Scale: 8, Skin: "ice"})
	}
	world, tee := s.world, s.tee
	if world == "" {
		world = "garden"
	}
	if tee == (physics.Vec2{}) {
		tee = physics.V(20, 20)
	}
	return &course.Simple{W: 96, H: 96, World: world, Title: "Worst shot", Strokes: 5,
		Tee: tee, Pin: physics.V(93, 3), Substeps: course.MaxSubsteps, CupRadius: 1,
		Course: &physics.Field{Walls: walls, Zones: zones, Friction: 0.99, Bounce: 1.5, Radius: 0.5}}
}

func main(cur realm) {
	for _, s := range probes {
		id := golf.PublishMine(cross(cur), s.slug, hex.EncodeToString([]byte(course.Encode(build(s)))), "")
		angle, power := s.angle, s.power
		if angle == 0 {
			angle = 135
		}
		if power == 0 {
			power = 10
		}
		golf.Launch(cross(cur), id, angle, power)
		println(id)
	}
}

// Output:
// g19ea2wqvcgqxwgg7lg270ut8cvcmy70fr5lup0m/a2/v1
// g19ea2wqvcgqxwgg7lg270ut8cvcmy70fr5lup0m/a0/v1
// g19ea2wqvcgqxwgg7lg270ut8cvcmy70fr5lup0m/a60/v1
// g19ea2wqvcgqxwgg7lg270ut8cvcmy70fr5lup0m/a14/v1
// g19ea2wqvcgqxwgg7lg270ut8cvcmy70fr5lup0m/a23/v1
// g19ea2wqvcgqxwgg7lg270ut8cvcmy70fr5lup0m/a31/v1
// g19ea2wqvcgqxwgg7lg270ut8cvcmy70fr5lup0m/a24/v1

// Gas:
// 11336531702
