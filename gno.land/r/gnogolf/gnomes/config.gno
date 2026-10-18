package gnomes

// The collection's numbers, in one place. The genesis supply is decided:
// 720 gnomes, ten times a par-72 course. The prices are the defaults the
// owner starts from (SetPrice moves them, between waves). A later drop
// needs nothing here: its size is its rows (catalogue.gno), its sale a wave
// (waves.gno).

// A tier: its name, and its price at deploy, in ugnot. Every tier is sold
// at its wave's price, the first buyer's (Buy): there is no auction.
type tier struct {
	name  string
	price int64
}

var tiers = [...]tier{
	{"common", 36_000_000},       // 36 GNOT: the par of nine holes
	{"rare", 72_000_000},         // 72 GNOT: the par of a course
	{"epic", 336_000_000},        // 336 GNOT: the dimples on a golf ball
	{"legendary", 1_296_000_000}, // 1,296 GNOT: eighteen holes, times par 72
}

// genesisSupply is how many gnomes of each tier the genesis series holds, in
// the order of tiers. AddSeries refuses a genesis that differs.
var genesisSupply = [len(tiers)]int64{504, 144, 65, 7}

// Per wallet: how many of each tier it may buy over its lifetime, and in a
// wave's player window: one Legendary a wallet, ever.
var (
	lifetimeCap = [len(tiers)]int64{10, 5, 2, 1}
	playerCap   = [len(tiers)]int64{3, 2, 1, 1}
)

const (
	maxHours      = 7 * 24           // the longest player window
	maxWaveBehind = 24 * 3600        // the furthest back a wave may start, in seconds: a day
	maxWaveAhead  = 365 * 24 * 3600  // the furthest ahead: a year
	minPrice    = 1_000_000      // 1 GNOT, the least SetPrice takes
	maxPrice    = 10_000_000_000 // 10,000 GNOT, the most
)

const (
	genesisName = "genesis" // the first series, ids 1 to genesisTotal()
	payDenom    = "ugnot"   // the only coin gnomes are sold for
	maxBatch    = 5         // ids one Buy takes
	royaltyBps  = 500       // 5% of a resale, to the treasury (advisory, EIP-2981)
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
