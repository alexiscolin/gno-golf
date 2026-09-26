// PKGPATH: gno.land/r/test/worstrender
package worstrender

import (
	"encoding/hex"
	"math"
	"strings"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

// The worst hole GG1 lets anyone publish for its page: a 96×96 board, 160
// walls across it, 32 posts of radius 8, and 32 zones whose boxes cover the
// whole board, 8 of them 64-point polygons; and four zigzag holes, where
// every row of a board crosses every edge of 2 or 8 polygons.
// z_worst_play_filetest publishes them all and plays a shot on the worst;
// z_worst_render_filetest does the same, then renders the worst's page and
// its player's page, and each zigzag's page. The difference of their gas is
// the six pages, about 1.62e9. The worst's two cost 0.36e9, since its board
// is too detailed to draw (maxBoardWork). A zigzag's page costs 0.58e9 drawn,
// with 2 polygons, and 0.1e9 with 8, too detailed to draw. Every page stays
// far under the 3e9 a query may use. (Before a polygon's row cost only its
// edges and cells, the reversed zigzag of 2 cost 3.7e9 to draw.)
func worst() *course.Simple {
	var walls []physics.Wall
	for i := 0; i < course.MaxWalls; i++ {
		t := float64(i) * 96 / course.MaxWalls
		walls = append(walls, physics.Wall{Seg: physics.Segment{A: physics.V(t, 0), B: physics.V(96-t, 96)}, Bounce: 0.6})
	}
	var posts []physics.Post
	for i := 0; i < course.MaxPosts; i++ {
		posts = append(posts, physics.Post{Circle: physics.Circle{C: physics.V(8+float64(i%6)*16, 8+float64(i/6)*16), R: 8}, Skin: "rock"})
	}
	var zones []physics.Zone
	for i := 0; i < course.MaxZones; i++ {
		z := physics.Zone{Kind: physics.Surface, Min: physics.V(-96, -96), Max: physics.V(192, 192), Scale: 0.9, Skin: "sand", Round: i%2 == 1}
		if i < 8 {
			for k := 0; k < course.MaxPoly; k++ {
				z.Poly = append(z.Poly, physics.V(48, 48).Add(physics.FromPolar(float64(k)*2*math.Pi/course.MaxPoly, 40+float64(i))))
			}
		}
		zones = append(zones, z)
	}
	return &course.Simple{W: 96, H: 96, World: "garden", Title: "Worst", Strokes: 5,
		Tee: physics.V(3, 3), Pin: physics.V(93, 93), Substeps: course.MaxSubsteps, CupRadius: 1,
		Course: &physics.Field{Walls: walls, Posts: posts, Zones: zones, Friction: 0.86, Bounce: 0.85, Radius: 0.5}}
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
		Course: &physics.Field{Walls: physics.Box(physics.V(0, 0), physics.V(96, 96)), Zones: zones, Friction: 0.86, Bounce: 0.85, Radius: 0.5}}
}

// the zigzag holes, as their slugs
var zigzags = []string{"zig-rev-2", "zig-rev-8", "zig-asc-2", "zig-asc-8"}

func publishZigzags(cur realm) {
	for _, slug := range zigzags {
		n := 2
		if strings.HasSuffix(slug, "-8") {
			n = 8
		}
		golf.PublishMine(cross(cur), slug, hex.EncodeToString([]byte(course.Encode(zigzag(n, strings.Contains(slug, "rev"))))), "")
	}
}

func main(cur realm) {
	id := golf.PublishMine(cross(cur), "worst", hex.EncodeToString([]byte(course.Encode(worst()))), "")
	golf.Launch(cross(cur), id, 45, 10)
	page, mine := golf.Render(id), golf.Render(id+"/"+cur.Address().String())
	println(strings.Contains(page, "```"), strings.Contains(mine, "```"), strings.Contains(page+mine, "too detailed"))
	publishZigzags(cur)
	// each drawn, or said too detailed to draw here
	for _, slug := range zigzags {
		page := golf.Render(cur.Address().String() + "/" + slug)
		println(slug, strings.Contains(page, "```"), strings.Contains(page, "too detailed to draw here"))
	}
}

// Output:
// false false true
// zig-rev-2 true false
// zig-rev-8 false true
// zig-asc-2 true false
// zig-asc-8 false true

// Gas:
// 3931538238
