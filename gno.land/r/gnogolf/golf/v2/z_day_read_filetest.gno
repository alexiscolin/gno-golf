// PKGPATH: gno.land/r/test/dayread
package dayread

import (
	"encoding/hex"
	"strconv"
	"strings"
	"testing"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
	"gno.land/p/nt/testutils/v0"
	golf "gno.land/r/gnogolf/golf/v2"
)

// The hole of the day's list at its fullest page: the 390 holes of
// z_list_base_filetest (130 authors, perAuthor each), then DayCandidates'
// first page, pageMax (100) rows, each its born read (its v1 found). The
// difference of its gas and z_list_base_filetest's is the read, 0.63e9 for
// its 100 rows, which walks no more than the page however many publish.
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
	day := golf.DayCandidates("", 100)
	println(strings.Count(day, `"id":`), strings.Count(day, `"born":`), strings.HasSuffix(day, `"next":""}`))
}

// Output:
// 100 100 false

// Gas:
// 8237639006
