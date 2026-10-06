package gnomes

// The collection's numbers, in one place. The genesis supply is decided:
// 720 gnomes, ten times a par-72 course. The prices are the defaults the
// owner starts from (SetPrice moves them, between waves). A later drop
// needs nothing here: its size is its rows (catalogue.gno), its sale a wave
// (waves.gno).

// A tier: its name, and its price at deploy, in ugnot. The last tier is
// sold by auction only, its price the reserve of its next auction.
type tier struct {
	name  string
	price int64
}

var tiers = [...]tier{
	{"common", 30_000_000},     // 30 GNOT
	{"rare", 99_000_000},       // 99 GNOT
	{"epic", 333_000_000},      // 333 GNOT
	{"legendary", 777_000_000}, // the reserve: 777 GNOT
}

// auctionTier is the tier sold by auction, never by Buy.
const auctionTier = len(tiers) - 1

// genesisSupply is how many gnomes of each tier the genesis series holds, in
// the order of tiers. AddSeries refuses a genesis that differs.
var genesisSupply = [len(tiers)]int64{504, 144, 65, 7}

// Per wallet: how many of each tier it may buy over its lifetime, and in a
// wave's player window. The auction tier has no cap: it is bid for.
var (
	lifetimeCap = [len(tiers)]int64{10, 5, 2, 0}
	playerCap   = [len(tiers)]int64{3, 2, 1, 0}
)

// The auction's rules: a bid in its last softClose seconds moves its end to
// softClose after that bid; each bid beats the last by the larger of
// minRaiseBps of it and minRaise.
const (
	softClose   = 10 * 60        // seconds
	minRaiseBps = 500            // 5%
	minRaise    = 5_000_000      // 5 GNOT
	maxHours    = 7 * 24         // the longest auction, and the longest player window
	minPrice    = 1_000_000      // 1 GNOT, the least SetPrice takes
	maxPrice    = 10_000_000_000 // 10,000 GNOT, the most
)

const (
	genesisName = "genesis" // the first series, ids 1 to genesisTotal()
	payDenom    = "ugnot"   // the only coin gnomes are sold for
	maxBatch    = 5         // ids one Buy takes
	royaltyBps  = 500       // 5% of a resale, to the owner (advisory, EIP-2981)
	tokenName   = "Gnogolf Gnomes"
	tokenSymbol = "GNOME"
)

// genesisTotal is the size of the genesis: its tiers added up.
func genesisTotal() int64 {
	n := int64(0)
	for _, s := range genesisSupply {
		n += s
	}
	return n
}

// tierAt returns the index of tier name in tiers, or -1.
func tierAt(name string) int {
	for i, tr := range tiers {
		if tr.name == name {
			return i
		}
	}
	return -1
}
