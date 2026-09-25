// PKGPATH: gno.land/r/test/storedpublish
package storedpublish

import (
	"encoding/hex"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/r/gnogolf/golf"
)

// A data hole is stored as its data: publishing one adds its string and its
// entry to golf, and playing it adds a round and the wear, never the decoded
// hole (about 40 KB for this one, were it kept). z_storage_publish_filetest
// publishes only (22,700 bytes: the data, its entry, and the first leaf of
// each index golf opens for it, the community's first; its author's row in
// it, 403 of them, paid once per author; nothing for rounds or records until
// someone plays); z_storage_play_filetest also plays two
// strokes, which store 2,516 more: the round and its row in the shared
// rounds index, its shots and the version's 512-byte wear. (With a rounds
// tree per version, made at its first stroke, they stored 6,209.)
func main(cur realm) {
	h := &course.Simple{W: 32, H: 16, World: "garden", Title: "Stored", Tee: physics.V(2, 8), Pin: physics.V(28, 8), Substeps: 14, CupRadius: 1.2,
		Course: &physics.Field{Walls: physics.Box(physics.V(0, 0), physics.V(32, 16)), Friction: 0.8, Bounce: 0.9, Radius: 0.5}}
	id := golf.PublishMine(cross(cur), "stored", hex.EncodeToString([]byte(course.Encode(h))), "")
	println(id)
}

// Storage:
// gno.land/r/gnogolf/golf: 22700
// gno.land/r/test/storedpublish: 0

// Output:
// g1hvuayx9ll7dal54kr0f6t89j8867z8lf5vtxgv/stored/v1
