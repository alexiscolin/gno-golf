// PKGPATH: gno.land/r/test/storedpublish
package storedpublish

import (
	"encoding/hex"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
	golf "gno.land/r/gnogolf/golf/v2"
)

// A data hole is stored as its data, in store (golf keeps nothing but its
// settings): publishing one adds its string and its entry, and playing it
// adds a round and the wear, never the decoded hole (about 40 KB for this
// one, were it kept). z_storage_publish_filetest publishes only (3,146 bytes:
// the data, its entry and its rows in the community and authors indexes,
// whose first leaves store made when it was deployed; v1, whose indexes'
// first leaves its first publisher paid, stored 22,700); z_storage_play_filetest
// also plays two strokes, which store 1,145 more: the round under way, its
// shots, and the version's wear, a row a cell played (v1: 2,478).
func main(cur realm) {
	h := &course.Simple{W: 32, H: 16, World: "garden", Title: "Stored", Tee: physics.V(2, 8), Pin: physics.V(28, 8), Substeps: 14, CupRadius: 1.2,
		Course: &physics.Field{Walls: build.Box(physics.V(0, 0), physics.V(32, 16)), Friction: 0.8, Bounce: 0.9, Radius: 0.5}}
	id := golf.PublishMine(cross(cur), "stored", hex.EncodeToString([]byte(course.Encode(h))), "")
	println(id)
}

// Storage:
// gno.land/r/gnogolf/golf/v2: 24
// gno.land/r/gnogolf/store: 3146
// gno.land/r/test/storedpublish: 0

// Output:
// g1hvuayx9ll7dal54kr0f6t89j8867z8lf5vtxgv/stored/v1
