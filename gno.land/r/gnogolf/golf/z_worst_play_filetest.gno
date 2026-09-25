// PKGPATH: gno.land/r/test/worstplay
package worstplay

import (
	"encoding/hex"
	"math"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

// The worst hole GG1 lets anyone publish for its page: a 96×96 board, 160
// walls across it, 32 posts of radius 8, and 32 zones whose boxes cover the
// whole board, 8 of them 64-point polygons. z_worst_play_filetest publishes it
// and plays a shot; z_worst_render_filetest does the same, then renders its
// page and its player's page. The difference of their gas is the two pages:
// 0.36e9, far under the 3e9 a query may use, since this board is too
// detailed to draw (maxBoardWork); drawn, it would cost 1.8e9 alone.
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

func main(cur realm) {
	id := golf.PublishMine(cross(cur), "worst", hex.EncodeToString([]byte(course.Encode(worst()))), "")
	golf.Launch(cross(cur), id, 45, 10)
	println(id)
}

// Output:
// g15cnntx0j5e7j0ff5r4t970wmx47lynkv5magnu/worst/v1

// Gas:
// 1565755897
