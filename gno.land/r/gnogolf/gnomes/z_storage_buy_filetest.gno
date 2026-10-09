// PKGPATH: gno.land/r/test/storedbuy
package storedbuy

import (
	"chain"
	"strconv"
	"strings"
	"testing"

	"gno.land/p/nt/testutils/v0"
	gnomes "gno.land/r/gnogolf/gnomes"
)

// What a first buy stores, which its buyer pays: z_storage_genesis, then one
// common bought (that file is this one but the Buy), the bytes below less that file's: 3,850 bytes, 0.39 GNOT
// of deposit (with grc721/enumerable it was 10,465), the sold bitmap's first
// write among them. Most of it is the ledger's own two rows for a new
// holder, its owner and its balance. Its gas less z_storage_genesis's is
// the buy's, 7.55M: a sale writes nothing beside the catalogue's rows,
// so it never rewrites them.
// The -send envelope lands on the realm called, as on chain: the test names
// gnomes its payee.
func main(cur realm) {
	testing.SetRealm(testing.NewUserRealm(gnomes.Owner()))
	gnomes.AddSeries(cross(cur), "genesis", genesis())
	gnomes.AddWave(cross(cur), 1, 720, 0, 0)
	gnomes.SetMintOpen(cross(cur), true)
	println(gnomes.Gnome("720"))

	buyer := testutils.TestAddress("buyer")
	price := chain.Coins{{"ugnot", 36_000_000}}
	testing.SetOriginCaller(buyer)
	testing.SetOriginSend(price)
	testing.IssueCoins(chain.PackageAddress("gno.land/r/gnogolf/gnomes"), price)
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/gnogolf/gnomes"))
	testing.SetRealm(testing.NewUserRealm(buyer))
	println(gnomes.Buy(cross(cur), "1"))
}

// genesis is z_storage_genesis's.
func genesis() string {
	var b strings.Builder
	id := 1
	for w := 0; w < 7; w++ {
		rares, epics := 20, 9
		if w < 4 {
			rares = 21
		}
		if w < 2 {
			epics = 10
		}
		for _, t := range []struct {
			name string
			n    int
		}{{"common", 72}, {"rare", rares}, {"epic", epics}, {"legendary", 1}} {
			for i := 0; i < t.n; i++ {
				s := strconv.Itoa(id)
				b.WriteString(s + "|" + t.name + "|Pip Seedwell " + s + "|01" + strings.Repeat("0", 56-len(s)) + s + "\n")
				id++
			}
		}
	}
	return strings.TrimSuffix(b.String(), "\n")
}

// Output:
// {"version":1,"id":"720","series":"genesis","name":"Pip Seedwell 720","tier":"legendary","traits":"0100000000000000000000000000000000000000000000000000000720","owner":"","price":1296000000,"sold":false,"closed":false}
// 1

// Storage:
// gno.land/r/gnogolf/gnomes: 68080
// gno.land/r/test/storedbuy: 0

// Gas:
// 1412691209
