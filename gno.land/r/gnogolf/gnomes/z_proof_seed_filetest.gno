// PKGPATH: gno.land/r/test/proofseed
package proofseed

import (
	"strconv"
	"testing"

	"gno.land/p/nt/testutils/v0"
	"gno.land/r/gnogolf/store"
)

// The four classic cups as golf/v2 keeps them in store (slotKey,
// encodeEntry, bestOf): 72 current versions, each with a best in both modes
// for one player. z_proof_king seeds the same, then asks Proof("king"): the
// difference of their gas (the `// Gas:` goldens) is the heaviest proof.
func f(s string) string { return strconv.Itoa(len(s)) + ":" + s }

func main(cur realm) {
	p := testutils.TestAddress("king").String()
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/gnogolf/golf/v2"))
	for d, w := range []string{"garden", "island", "town", "mountain"} {
		for n := 1; n <= 18; n++ {
			id := w + "/" + strconv.Itoa(n) + "/v1"
			pad := strconv.Itoa(n)
			for len(pad) < 3 {
				pad = "0" + pad
			}
			e := "1:1" + f(id) + f("Hole") + f("3")
			for i := 3; i < 23; i++ {
				e += "0:"
			}
			store.Set(cross(cur), "slots", strconv.Itoa(d)+w+"/"+pad, id)
			store.Set(cross(cur), "holes", id, e)
			store.Set(cross(cur), "bests", id+" assisted "+p, "3 120 7 0.5,40;0.25,30;0.1,10")
			store.Set(cross(cur), "bests", id+" pro "+p, "3 121 7 0.5,40;0.25,30;0.1,10")
		}
	}
	println(store.Size("slots"))
}

// Output:
// 72

// Gas:
// 68166612
