// PKGPATH: gno.land/r/test/worstshot
package worstshot

import (
	"encoding/hex"
	"math"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

// The heaviest single shot GG1 lets anyone publish, as far as the probes
// found: a 96×96 board of 160 bumper walls (Bounce 1.5, the most) that cross
// it corner to corner, so every move's broad phase lets every one through; a
// hill over the whole board at the steepest grade (|Vec| 0.95), which keeps
// the ball rolling on for all MaxRollOn substeps; 31 ice surfaces over it
// (Scale 8, the most), 8 of them 64-point polygons (512 points); Friction
// 0.99. Without MaxWork this one shot ran out of gas at 3e9. The physics
// ends it at MaxWork: of the gas below, publishing the hole (a transaction
// of its own) is 1.23e9, and the Launch, the hole decoded, its forecast and
// the shot, is 0.92e9, under the 2e9 Adena simulates and far under the 3e9
// a transaction may use.
func worst() *course.Simple {
	var walls []physics.Wall
	for i := 0; i < course.MaxWalls; i++ {
		t := float64(i) * 96 / course.MaxWalls
		walls = append(walls, physics.Wall{Seg: physics.Segment{A: physics.V(t, 0), B: physics.V(96-t, 96)}, Bounce: 1.5})
	}
	zones := []physics.Zone{{Kind: physics.Slope, Min: physics.V(0, 0), Max: physics.V(96, 96), Vec: physics.V(0.67, 0.67), Skin: "slope"}}
	for i := 0; i < course.MaxZones-1; i++ {
		z := physics.Zone{Kind: physics.Surface, Min: physics.V(0, 0), Max: physics.V(96, 96), Scale: 8, Skin: "ice"}
		if i < 8 {
			for k := 0; k < course.MaxPoly; k++ {
				z.Poly = append(z.Poly, physics.V(48, 48).Add(physics.FromPolar(float64(k)*2*math.Pi/course.MaxPoly, 40+float64(i))))
			}
		}
		zones = append(zones, z)
	}
	return &course.Simple{W: 96, H: 96, World: "garden", Title: "Worst shot", Strokes: 5,
		Tee: physics.V(20, 20), Pin: physics.V(93, 3), Substeps: course.MaxSubsteps, CupRadius: 1,
		Course: &physics.Field{Walls: walls, Zones: zones, Friction: 0.99, Bounce: 1.5, Radius: 0.5}}
}

func main(cur realm) {
	id := golf.PublishMine(cross(cur), "worstshot", hex.EncodeToString([]byte(course.Encode(worst()))), "")
	golf.Launch(cross(cur), id, 135, 10)
	println(id)
}

// Output:
// g19ea2wqvcgqxwgg7lg270ut8cvcmy70fr5lup0m/worstshot/v1

// Gas:
// 2151721238
