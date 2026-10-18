// PKGPATH: gno.land/r/test/portraitbase
package portraitbase

import (
	"chain"
	"strconv"
	"strings"
	"testing"

	"gno.land/p/nt/testutils/v0"
	gnomes "gno.land/r/gnogolf/gnomes"
)

// What a portrait costs to read: z_portrait_base buys gnome 199, Figurehead
// Fen, the heaviest picture of the Genesis (an Epic: its look and its tier's
// two rings, 8,170 bytes of data URI; of every Genesis gnome's, measured,
// the largest), at its real row: its tier, its name, its traits;
// z_portrait_read buys it and reads its TokenURI. The difference of their
// gas is the read as `gno test` counts it: 76.0M (75.8M on a Common row).
//
// A chain counts more: 83.08M for the same TokenURI on a local chain built
// from this toolchain. `gno test` runs on a store with no gas meter, so it
// never charges what a fresh call pays to load each object it reads from
// the chain's store (per object 59,000 to read, then 17 a byte, and amino's
// decoding a byte), the catalogue's 60 KB string and the ledger's nodes
// among them. Budget a TokenURI call from the chain's figure, not this one.
func main(cur realm) {
	testing.SetRealm(testing.NewUserRealm(gnomes.Owner()))
	gnomes.AddSeries(cross(cur), "genesis", genesis())
	gnomes.AddWave(cross(cur), 1, 720, 0, 0)
	gnomes.SetMintOpen(cross(cur), true)

	buyer := testutils.TestAddress("buyer")
	price := chain.Coins{{"ugnot", 336_000_000}}
	testing.SetOriginCaller(buyer)
	testing.SetOriginSend(price)
	testing.IssueCoins(chain.PackageAddress("gno.land/r/gnogolf/gnomes"), price)
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/gnogolf/gnomes"))
	testing.SetRealm(testing.NewUserRealm(buyer))
	tid := gnomes.Buy(cross(cur), "199")
	println(tid)
}

// genesis is z_storage_genesis's, gnome 199 at its real row (an Epic of
// wave 2, Figurehead Fen, its traits as data/gnomes.json has them).
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
				name, traits := "Pip Seedwell "+s, "01"+strings.Repeat("0", 56-len(s))+s
				if id == 199 {
					name, traits = "Figurehead Fen", "0101030002040932ff06345100ff000000000100ff02330c0302330cff"
				}
				b.WriteString(s + "|" + t.name + "|" + name + "|" + traits + "\n")
				id++
			}
		}
	}
	return strings.TrimSuffix(b.String(), "\n")
}

// Output:
// 199

// Gas:
// 1396924700
