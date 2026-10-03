// PKGPATH: gno.land/r/test/storedfinish
package storedfinish

import (
	"encoding/hex"
	"testing"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
	"gno.land/p/nt/testutils/v0"
	golf "gno.land/r/gnogolf/golf/v2"
)

// What a finish stores, and who pays for it: a version keeps its rounds,
// bests and board as rows of indexes every version shares, made when golf
// is deployed, so its first finisher pays for their own rows only, as every
// later one does, and not for trees of its own. Publishing this hole and two
// unnamed one-stroke finishes store the total below: each finish its best,
// with the shots that set it (about 50 bytes, for Ghost), its standing, and
// not its round, which is not kept once holed. The two finishes store 1,625
// bytes with the wear they leave (v1: 1,976, with a 512-byte wear grid).
func main(cur realm) {
	h := &course.Simple{W: 32, H: 16, World: "garden", Title: "Finished", Strokes: 3,
		Tee: physics.V(2, 8), Pin: physics.V(4, 8), Substeps: 14, CupRadius: 1.2, Shelter: 0.01,
		Course: &physics.Field{Walls: build.Box(physics.V(0, 0), physics.V(32, 16)), Friction: 0.8, Bounce: 0.9, Radius: 0.5}}
	id := golf.PublishMine(cross(cur), "finished", hex.EncodeToString([]byte(course.Encode(h))), "")
	for _, name := range []string{"first", "second"} {
		testing.SetRealm(testing.NewUserRealm(testutils.TestAddress(name)))
		println(golf.PlayRoundAt(cross(cur), id, "0,1", golf.Period()))
	}
}

// Output:
// holed in 1 strokes
// holed in 1 strokes

// Storage:
// gno.land/r/gnogolf/golf/v2: 24
// gno.land/r/gnogolf/store: 4771
// gno.land/r/sys/users: 0
// gno.land/r/test/storedfinish: 0
