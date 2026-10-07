// PKGPATH: gno.land/r/test/proofking
package proofking

import (
	"strconv"
	"testing"

	"gno.land/p/nt/testutils/v0"
	gnomes "gno.land/r/gnogolf/gnomes"
	"gno.land/r/gnogolf/store"
)

// z_proof_seed's cups, then Proof("king"): the four classic cups read
// whole, 72 slots, a best in each mode a slot and each par. The difference
// of the two files' gas (the two `// Gas:` goldens) is the King's proof, the
// heaviest MintEarned makes: 44,705,070 (112,871,682 less 68,166,612, on
// the onyx toolchain, this file's loading of gnomes included), of the order
// of golf's Claim (70.2M). No client sends MintEarned yet; the e2e run
// sends it with 200M.
func f(s string) string { return strconv.Itoa(len(s)) + ":" + s }

func main(cur realm) {
	k := testutils.TestAddress("king")
	p := k.String()
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
	println(gnomes.Proof("king", k))
}

// Output:
// {"version":1,"kind":"king","player":"g1dd5kue6lta047h6lta047h6lta047h6l9pfacj","ok":true,"minted":"","holes":72,"finished":72,"strokes":216,"par":216,"missing":[]}

// Gas:
// 112871682
