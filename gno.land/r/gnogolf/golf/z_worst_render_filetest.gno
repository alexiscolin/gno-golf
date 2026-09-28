// PKGPATH: gno.land/r/test/worstrender
package worstrender

import (
	"encoding/hex"
	"strconv"
	"strings"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
	"gno.land/r/gnogolf/golf"
)

// The worst pages golf takes. The worst hole GG1 allows for its page (a
// 96×96 board, 160 walls across it, 32 posts of radius 8, and 32 zones whose
// boxes cover the whole board, 8 of them 64-point polygons) is refused now,
// as z_worst_shot_filetest's a2 is: in its dearest weather a commit would
// have too little room for a shot. Golf takes four zigzag holes, where every
// row of a board crosses every edge of 2 or 4 polygons, and the corner, whose
// weather costs most, in the rain and in a storm. z_worst_play_filetest
// publishes them all and plays a first shot on each corner in its weather
// (the heaviest single shot is z_worst_shot_filetest's);
// z_worst_render_filetest does the same, then renders each zigzag's page and
// each corner's page and its player's. The difference of their gas is the
// eight pages, about 2.34e9. A zigzag's page costs 0.52e9 drawn, with 2
// polygons, and 0.03e9 with 4, too detailed to draw; a corner's 0.23e9, its
// forecast drawn once. Every page stays far under the 3e9 a query may use: a
// page decodes the hole, draws one forecast (bounded at publish, worstGas;
// two for a round begun in the period before, whose last shot the board
// draws in its own), at most maxBoardWork of board and one shot. (Before a
// polygon's row cost only its edges and cells, the reversed zigzag of 2 cost
// 3.7e9 to draw.)

// corner is the hole whose weather costs most among those golf takes: the
// 12 bumper walls it takes (TestTheDearestWeatherIsBoundedAtPublish) in a
// box round the tee, and 4 thin hazard polygons along the far edge, so that
// every puddle try tests every wall and edge.
func corner(world string) *course.Simple {
	var ws []physics.Wall
	for len(ws) < 12 {
		ws = append(ws, build.Box(physics.V(3, 3), physics.V(7, 7))...)
	}
	ws = ws[:12]
	for i := range ws {
		ws[i].Bounce, ws[i].Skin = 1.5, "bumper"
	}
	var zones []physics.Zone
	for i := 0; i < 4; i++ {
		z := physics.Zone{Kind: physics.Hazard, Min: physics.V(0, 0), Max: physics.V(96, 96), Vec: physics.V(5, 5)}
		for k := 0; k < course.MaxPoly; k++ {
			z.Poly = append(z.Poly, physics.V(float64(k)*1.5+float64(i)*0.1, 95.9+float64(k%2)*0.1))
		}
		zones = append(zones, z)
	}
	return &course.Simple{W: 96, H: 96, World: world, Title: "Corner", Strokes: 5,
		Tee: physics.V(5, 5), Pin: physics.V(93, 3), Substeps: course.MaxSubsteps, CupRadius: 1,
		Course: &physics.Field{Walls: ws, Zones: zones, Friction: 0.99, Bounce: 1.5, Radius: 0.5}}
}

// the corners, as their world and the weather their slug is picked for
var corners = [][2]string{{"garden", course.Rain}, {"island", course.Storm}}

// publishCorners publishes the corners, each under the first slug whose
// weather now is its own, plays a tap on each (a first shot in that
// weather), and returns their ids.
func publishCorners(cur realm) []string {
	var ids []string
	me := cur.Address().String()
	for _, c := range corners {
		h := corner(c[0])
		slug := ""
		for i := 0; slug == ""; i++ {
			if course.ForecastFor(me+"/"+c[0]+strconv.Itoa(i)+"/v1", c[0], h, golf.Period()).Kind == c[1] {
				slug = c[0] + strconv.Itoa(i)
			}
		}
		id := golf.PublishMine(cross(cur), slug, hex.EncodeToString([]byte(course.Encode(h))), "")
		golf.Launch(cross(cur), id, 30, 0.01)
		ids = append(ids, id)
	}
	return ids
}

// zigzag is a 96×96 hole of n zones, each a 64-point polygon whose every
// edge runs from the top of the board to the bottom: every row crosses all
// 64. Reversed, the crossings come right to left, the order a sort by
// insertion takes longest over; ascending, left to right.
func zigzag(n int, reversed bool) *course.Simple {
	var zones []physics.Zone
	for i := 0; i < n; i++ {
		z := physics.Zone{Kind: physics.Surface, Min: physics.V(0, 0), Max: physics.V(96, 96), Scale: 0.9, Skin: "sand"}
		for k := 0; k < course.MaxPoly; k++ {
			x, y := 1+float64(k)*94/63+float64(i)*0.1, 0.25
			if reversed {
				x = 96 - x
			}
			if k%2 == 1 {
				y = 95.75
			}
			z.Poly = append(z.Poly, physics.V(x, y))
		}
		zones = append(zones, z)
	}
	return &course.Simple{W: 96, H: 96, World: "garden", Title: "Zigzag", Strokes: 5,
		Tee: physics.V(3, 3), Pin: physics.V(93, 93), Substeps: 14, CupRadius: 1,
		Course: &physics.Field{Walls: build.Box(physics.V(0, 0), physics.V(96, 96)), Zones: zones, Friction: 0.86, Bounce: 0.85, Radius: 0.5}}
}

// the zigzag holes, as their slugs
var zigzags = []string{"zig-rev-2", "zig-rev-4", "zig-asc-2", "zig-asc-4"}

func publishZigzags(cur realm) {
	for _, slug := range zigzags {
		n := 2
		if strings.HasSuffix(slug, "-4") {
			n = 4
		}
		golf.PublishMine(cross(cur), slug, hex.EncodeToString([]byte(course.Encode(zigzag(n, strings.Contains(slug, "rev"))))), "")
	}
}

func main(cur realm) {
	publishZigzags(cur)
	ids := publishCorners(cur)
	// each drawn, or said too detailed to draw here
	for _, slug := range zigzags {
		page := golf.Render(cur.Address().String() + "/" + slug)
		println(slug, strings.Contains(page, "```"), strings.Contains(page, "too detailed to draw here"))
	}
	// each corner's page, and its player's with their round, in its weather
	for _, id := range ids {
		page, mine := golf.Render(id), golf.Render(id+"/"+cur.Address().String())
		println(id, strings.Contains(page, "Weather now"), strings.Contains(mine, "not holed yet"))
	}
}

// Output:
// zig-rev-2 true false
// zig-rev-4 false true
// zig-asc-2 true false
// zig-asc-4 false true
// g1zkdqk2jtaqetqm4wfyxe8nyksymngnkp6msydn/garden1/v1 true true
// g1zkdqk2jtaqetqm4wfyxe8nyksymngnkp6msydn/island7/v1 true true

// Gas:
// 4010126786
