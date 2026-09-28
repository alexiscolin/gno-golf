// PKGPATH: gno.land/r/test/listbase
package listbase

import (
	"encoding/hex"
	"strconv"
	"testing"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
	"gno.land/p/nt/testutils/v0"
	"gno.land/r/gnogolf/golf"
)

// The lists at their fullest: 130 authors, each with perAuthor holes, more
// than Holes and the hub have room for (120). z_list_base_filetest publishes
// them; z_list_read_filetest publishes the same, then reads Holes and renders
// the hub. The difference of their gas is the two reads, 0.49e9 for their
// 120 rows each, which walk no more than they list however many publish. (The authors the owner hid are not
// walked at all: TestAHiddenHoleTakesNoPlace. A filetest has no owner to
// hide with.)
func publishAll(cur realm) {
	data := hex.EncodeToString([]byte(course.Encode(&course.Simple{W: 32, H: 16, World: "garden", Title: "Listed", Strokes: 3,
		Tee: physics.V(2, 8), Pin: physics.V(20, 8), Substeps: 14, CupRadius: 1.5,
		Course: &physics.Field{Walls: build.Box(physics.V(0, 0), physics.V(32, 16)), Friction: 0.8, Bounce: 0.9}})))
	for i := 0; i < 130; i++ {
		for j := 0; j < 3; j++ {
			testing.SetRealm(testing.NewUserRealm(testutils.TestAddress("author" + strconv.Itoa(i))))
			golf.PublishMine(cross(cur), "h"+strconv.Itoa(j), data, "")
		}
	}
}

func main(cur realm) {
	publishAll(cur)
	println(golf.Current(testutils.TestAddress("author129").String() + "/h2"))
}

// Output:
// g1v96hg6r0wgcnyw2lta047h6lta047h6lur7p3c/h2/v1

// Gas:
// 7054992889
