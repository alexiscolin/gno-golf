// PKGPATH: gno.land/r/test/storedearned
package storedearned

import (
	"strconv"
	"testing"

	"gno.land/p/nt/testutils/v0"
	gnomes "gno.land/r/gnogolf/gnomes"
	"gno.land/r/gnogolf/store"
)

// What an earned gnome stores, which its player pays: the Garden Cup's 18
// slots in store as golf/v2 keeps them, a best on each, then the Wizard
// minted. The gnomes line below is the mint alone: the ledger's owner and
// balance rows, the locker's, and the earned and kind rows, no cap row:
// 3,555 bytes, 0.36 GNOT of deposit (the spec estimated 3 to 5 KB). Its
// gas is the cup's slots written and the mint.
func f(s string) string { return strconv.Itoa(len(s)) + ":" + s }

func main(cur realm) {
	earner := testutils.TestAddress("earner")
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/gnogolf/golf/v2"))
	for n := 1; n <= 18; n++ {
		id := "garden/" + strconv.Itoa(n) + "/v1"
		pad := strconv.Itoa(n)
		for len(pad) < 3 {
			pad = "0" + pad
		}
		e := "1:1" + f(id) + f("Hole") + f("3")
		for i := 3; i < 23; i++ {
			e += "0:"
		}
		store.Set(cross(cur), "slots", "0garden/"+pad, id)
		store.Set(cross(cur), "holes", id, e)
		store.Set(cross(cur), "bests", id+" assisted "+earner.String(), "4 120 7 0.5,40;0.25,30;0.1,10")
	}
	testing.SetOriginCaller(earner)
	testing.SetRealm(testing.NewUserRealm(earner))
	println(gnomes.MintEarned(cross(cur), "wizard"))
}

// Output:
// 1000001

// Storage:
// gno.land/r/gnogolf/gnomes: 3555
// gno.land/r/gnogolf/store: 25207
// gno.land/r/test/storedearned: 0

// Gas:
// 20181226
