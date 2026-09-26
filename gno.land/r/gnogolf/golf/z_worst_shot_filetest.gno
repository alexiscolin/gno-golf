// PKGPATH: gno.land/r/test/worstshot
package worstshot

import (
	"encoding/hex"
	"math"
	"strconv"
	"strings"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

// The heaviest shots GG1 lets anyone publish, as far as the probes found:
// each probe is a 96×96 board at the format's limits, published, then played
// with one Launch, in the weather its slug gets at this test's period (a2 is
// clear, a0, a14, a23 and a24 rainy in the garden, a31 and a60 stormy on the
// island; a new probe takes the first slug with the weather it names). Rain
// doubles a hole's ice (its wet copy), a storm adds four board-wide zones on
// top. Each shot is played with the work its commit has left (golf's cap,
// MaxWork at the most), and one that reaches a cap under MaxWork is refused.
// The Launch of each, decode, forecast and shot, measured end to end on a
// local chain (the qeval filler method), in its weather:
//
//	a2       160 bumper walls across the board, the steepest hill, 31
//	         ice zones, 8 of them 64-point circles                0.87e9
//	a0       4 bumper walls, a board-wide hill, 8 zigzag ice
//	         polygons (every edge across the ball) and 23 ice
//	         zones, in the rain: refused at its cap              1.07e9
//	a60      the 8 zigzags as hills (the ground, looked at several
//	         times a substep) and 24 ice zones, in a storm        1.00e9
//	a14      160 bumper walls, 8 zigzag ice polygons, a hill, in
//	         the rain: the forecast alone 0.54e9 to 0.63e9,
//	         refused at its cap                                   1.03e9
//	a23      38 timed bars, each pushing the ball out as it comes
//	         back, 8 zigzag ice polygons, in the rain (refused
//	         at its cap in some periods' rain)                    0.72e9
//	a31      30 loop mouths rolled across, a storm's gusts        0.87e9
//	a24      15 tunnels and 8 zigzag ice polygons, in the rain    1.04e9
//	endcap   160 short walls stacked beside a ball of radius 1,
//	         a hill holding it there: each test takes the end
//	         cap's two square roots                               0.57e9
//	face     the same above their faces: both caps hit, four
//	         roots a wall                                         1.00e9
//	posts    32 posts stacked, four walls round them              0.31e9
//	corner   160 bumper walls and 32 posts caged in a corner, 8
//	         thin hazard polygons along the far edge, in the rain:
//	         the forecast alone 1.1e9 (every puddle try tests every
//	         wall and edge), then the shot refused, no room left  1.19e9
//	corner   the same in the dry                                  0.77e9
//	cage     160 bumper walls round a board of ice: a commit of
//	         11 taps and a full shot, refused at the full shot's
//	         cap ("commit the first 11"): its 11 taps, then the
//	         full shot alone                                      0.80e9
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
	kind               string // a new probe's weather: its slug is the first with it
}

var probes = []spec{
	{slug: "a2", walls: "cross", hill: true, circ: 8, rects: 23},
	{slug: "a0", walls: "box", hill: true, zig: 8, rects: 23},
	{slug: "a60", world: "island", walls: "box", zigHills: true, zig: 8, rects: 24},
	{slug: "a14", walls: "cross", hill: true, zig: 8},
	{slug: "a23", walls: "bars", hill: true, zig: 8},
	{slug: "a31", world: "island", walls: "box", hill: true, hillVec: physics.V(-0.9, 0), loops: 30, tee: physics.V(94, 50), angle: 180},
	{slug: "a24", walls: "box", hill: true, tunnels: 15, zig: 8},
	{slug: "endcap", walls: "endcap", tee: physics.V(41, 40.8), angle: 225, power: 1},
	{slug: "face", walls: "face", tee: physics.V(40.1, 41.6), angle: 270, power: 1},
	{slug: "posts", walls: "posts", tee: physics.V(41.6, 40.1), angle: 180, power: 1},
	{slug: "corner", walls: "corner", tee: physics.V(5, 5), angle: 30, kind: "rain"},
	{slug: "corner", walls: "corner", tee: physics.V(5, 5), angle: 30, kind: "dry"},
}

func bumpers(ws []physics.Wall) []physics.Wall {
	for i := range ws {
		ws[i].Bounce, ws[i].Skin = 1.5, "bumper"
	}
	return ws
}

func build(s spec) *course.Simple {
	var walls []physics.Wall
	var posts []physics.Post
	var zones []physics.Zone
	radius, friction := 0.5, 0.99
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
	case "endcap", "face":
		// every wall one short segment: a ball of radius 1 beside its end,
		// or above its face, tests all of them on every move, square roots
		// and all; a hill holds it there
		radius = 1
		walls = physics.Box(physics.V(34, 34), physics.V(46, 46))
		for len(walls) < course.MaxWalls {
			walls = append(walls, physics.Wall{Seg: physics.Segment{A: physics.V(40, 40), B: physics.V(40.2, 40)}})
		}
		v := physics.V(-0.6, -0.6)
		if s.walls == "face" {
			v = physics.V(0, -0.9)
		}
		zones = append(zones, physics.Zone{Kind: physics.Slope, Min: physics.V(0, 0), Max: physics.V(96, 96), Vec: v, Skin: "slope"})
	case "posts":
		radius = 1
		walls = physics.Box(physics.V(34, 34), physics.V(46, 46))
		for i := 0; i < course.MaxPosts; i++ {
			posts = append(posts, physics.Post{Circle: physics.Circle{C: physics.V(40, 40), R: 0.5}})
		}
		zones = append(zones, physics.Zone{Kind: physics.Slope, Min: physics.V(0, 0), Max: physics.V(96, 96), Vec: physics.V(-0.9, 0), Skin: "slope"})
	case "cage":
		// bumpers round a board of ice: a tap stays put, a full shot
		// bounces on until its cap
		for len(walls) < course.MaxWalls {
			walls = append(walls, bumpers(physics.Box(physics.V(10, 10), physics.V(30, 30)))...)
		}
	case "corner":
		// the forecast's worst: every wall and post in a corner cage (each
		// puddle try away from it tests them all, and finds no lane), thin
		// hazard polygons along the far edge (each try tests every edge)
		for len(walls) < course.MaxWalls {
			walls = append(walls, bumpers(physics.Box(physics.V(3, 3), physics.V(7, 7)))...)
		}
		for i := 0; i < course.MaxPosts; i++ {
			posts = append(posts, physics.Post{Circle: physics.Circle{C: physics.V(3.5+float64(i%4), 3.5+float64(i/4%4)), R: 0.1}, Bounce: 1.5, Skin: "bumper"})
		}
		for i := 0; i < course.MaxPolyTotal/course.MaxPoly; i++ {
			z := physics.Zone{Kind: physics.Hazard, Min: physics.V(0, 0), Max: physics.V(96, 96), Vec: physics.V(5, 5)}
			for k := 0; k < course.MaxPoly; k++ {
				z.Poly = append(z.Poly, physics.V(float64(k)*1.5+float64(i)*0.1, 95.9+float64(k%2)*0.1))
			}
			zones = append(zones, z)
		}
		for len(zones) < course.MaxZones {
			zones = append(zones, physics.Zone{Kind: physics.Surface, Min: physics.V(0, 0), Max: physics.V(96, 96), Scale: 8})
		}
	}
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
		Course: &physics.Field{Walls: walls, Posts: posts, Zones: zones, Friction: friction, Bounce: 1.5, Radius: radius}}
}

// slugFor is the probe's slug: its own, or for a new probe the first of
// its name whose weather at this period is the one it names.
func slugFor(cur realm, s spec, h *course.Simple) string {
	if s.kind == "" {
		return s.slug
	}
	want := s.kind
	if want == "dry" {
		want = course.Clear
	}
	me := cur.Address().String() // the author: this test's realm
	for i := 0; ; i++ {
		slug := s.slug + strconv.Itoa(i)
		if course.ForecastFor(me+"/"+slug+"/v1", h.World, h, golf.Period()).Kind == want {
			return slug
		}
	}
}

func main(cur realm) {
	for _, s := range probes {
		h := build(s)
		id := golf.PublishMine(cross(cur), slugFor(cur, s, h), hex.EncodeToString([]byte(course.Encode(h))), "")
		angle, power := s.angle, s.power
		if angle == 0 {
			angle = 135
		}
		if power == 0 {
			power = 10
		}
		if r := revive(func() { golf.Launch(cross(cur), id, angle, power) }); r != nil {
			println(id, r)
		} else {
			println(id)
		}
	}
	h := build(spec{walls: "cage", zig: 8, rects: 23})
	id := golf.PublishMine(cross(cur), slugFor(cur, spec{slug: "cage", kind: "dry"}, h), hex.EncodeToString([]byte(course.Encode(h))), "")
	taps := strings.Repeat("0,0.01;", 11)
	println(id, revive(func() { golf.PlayRoundAt(cross(cur), id, taps+"135,10", golf.Period()) }))
	golf.Reset(cross(cur), id) // a test does not revert what the refused commit did; a transaction does
	println(golf.PlayRoundAt(cross(cur), id, taps, golf.Period()))
	println(golf.PlayRoundAt(cross(cur), id, "135,10", golf.Period()))
}

// Output:
// g19ea2wqvcgqxwgg7lg270ut8cvcmy70fr5lup0m/a2/v1
// g19ea2wqvcgqxwgg7lg270ut8cvcmy70fr5lup0m/a0/v1 golf: one shot on this hole could cost more than a transaction can replay
// g19ea2wqvcgqxwgg7lg270ut8cvcmy70fr5lup0m/a60/v1
// g19ea2wqvcgqxwgg7lg270ut8cvcmy70fr5lup0m/a14/v1 golf: one shot on this hole could cost more than a transaction can replay
// g19ea2wqvcgqxwgg7lg270ut8cvcmy70fr5lup0m/a23/v1
// g19ea2wqvcgqxwgg7lg270ut8cvcmy70fr5lup0m/a31/v1
// g19ea2wqvcgqxwgg7lg270ut8cvcmy70fr5lup0m/a24/v1
// g19ea2wqvcgqxwgg7lg270ut8cvcmy70fr5lup0m/endcap/v1
// g19ea2wqvcgqxwgg7lg270ut8cvcmy70fr5lup0m/face/v1
// g19ea2wqvcgqxwgg7lg270ut8cvcmy70fr5lup0m/posts/v1
// g19ea2wqvcgqxwgg7lg270ut8cvcmy70fr5lup0m/corner2/v1 golf: one shot on this hole could cost more than a transaction can replay
// g19ea2wqvcgqxwgg7lg270ut8cvcmy70fr5lup0m/corner0/v1
// g19ea2wqvcgqxwgg7lg270ut8cvcmy70fr5lup0m/cage2/v1 golf: more shots than one transaction can replay on this hole: commit the first 11, then the rest
// 11 shots replayed, ball at 20.0,20.0 after 11 strokes
// 1 shots replayed, ball at 26.2,25.8 after 12 strokes
