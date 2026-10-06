// PKGPATH: gno.land/r/test/portraitread
package portraitread

import (
	"chain"
	"strconv"
	"strings"
	"testing"

	"gno.land/p/nt/testutils/v0"
	gnomes "gno.land/r/gnogolf/gnomes"
)

// What a portrait costs to draw: z_portrait_base buys gnome 1, whose look is
// the heaviest picture of the Genesis (Figurehead Fen's, 6.0 KB of SVG);
// z_portrait_read buys it and reads its TokenURI. The difference of their
// gas is the read: 0.076e9 (75.8 million), drawing it 0.048e9 of that; a
// Common of 3.7 KB draws for a third less.
func main(cur realm) {
	testing.SetRealm(testing.NewUserRealm(gnomes.Owner()))
	gnomes.AddSeries(cross(cur), "genesis", genesis())
	gnomes.AddWave(cross(cur), 1, 720, 0, 0)
	gnomes.SetMintOpen(cross(cur), true)

	buyer := testutils.TestAddress("buyer")
	price := chain.Coins{{"ugnot", 30_000_000}}
	testing.SetOriginCaller(buyer)
	testing.SetOriginSend(price)
	testing.IssueCoins(chain.PackageAddress("gno.land/r/gnogolf/gnomes"), price)
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/gnogolf/gnomes"))
	testing.SetRealm(testing.NewUserRealm(buyer))
	tid := gnomes.Buy(cross(cur), "1")
	uri, err := gnomes.TokenURI(tid)
	println(tid, err == nil, len(uri))
}

// genesis is z_storage_genesis's, gnome 1 in Figurehead Fen's look.
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
				traits := "01" + strings.Repeat("0", 56-len(s)) + s
				if id == 1 {
					traits = "0101030002040932ff06345100ff000000000100ff02330c0302330cff"
				}
				b.WriteString(s + "|" + t.name + "|Pip Seedwell " + s + "|" + traits + "\n")
				id++
			}
		}
	}
	return strings.TrimSuffix(b.String(), "\n")
}

// Output:
// 1 true 7914

// Gas:
// 1482888074
