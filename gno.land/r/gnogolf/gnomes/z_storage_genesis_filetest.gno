// PKGPATH: gno.land/r/test/storedgenesis
package storedgenesis

import (
	"chain"
	"strconv"
	"strings"
	"testing"
	"time"

	"gno.land/p/nt/testutils/v0"
	gnomes "gno.land/r/gnogolf/gnomes"
)

// What publishing the genesis stores, which its owner pays: 720 rows kept
// as one string, as the catalogue lays them out, its closing date and a
// wave over all of it:
// 64,230 bytes, 6.4 GNOT of deposit at 100 ugnot a byte. Then the buyer
// z_storage_buy has, its coins and its realm: that file is this one and its
// Buy, so their difference is the Buy alone.
func main(cur realm) {
	testing.SetRealm(testing.NewUserRealm(gnomes.Owner()))
	gnomes.AddSeries(cross(cur), "genesis", genesis())
	gnomes.SetCloseAt(cross(cur), time.Now().Unix()+30*24*3600) // before any wave
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
}

// genesis is 720 rows "id|tier|name|traits" laid out as the catalogue is
// (spec §2): seven waves, one world each, each its 72 Commons, then its
// Rares (21 in the first four, 20 after), its Epics (10 in the first two, 9
// after) and its Legendary; traits as long as format 1's (58 hex digits),
// names as long as a typical one.
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

// Storage:
// gno.land/r/gnogolf/gnomes: 64230
// gno.land/r/test/storedgenesis: 0

// Gas:
// 1405405821
