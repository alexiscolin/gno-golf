package gnomes

import (
	"chain"
	"chain/banker"
	"chain/runtime"
	"strings"
	"testing"

	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
)

var (
	deployer = testutils.TestAddress("deployer")
	alice    = testutils.TestAddress("alice")
	bob      = testutils.TestAddress("bob")
	selfAddr = chain.PackageAddress("gno.land/r/gnogolf/gnomes")
)

// `gno test` runs init with no signer: each test starts from a fresh
// collection owned by the deployer, the placeholder genesis published, its
// close a year off, one wave over all of it on sale now with no player
// window, the mint open.
func fresh(t *testing.T, rlm realm) {
	noWave(t, rlm)
	if err := addWave(1, genesisTotal(), now(), 0); err != nil {
		panic(err)
	}
}

// published is a fresh collection with the placeholder genesis published,
// no closing date set.
func published(_ *testing.T, rlm realm) {
	setUp(0, rlm, deployer)
	if err := addSeries(genesisName, placeholderGenesis()); err != nil {
		panic(err)
	}
}

// skip moves block time on by at least seconds (a block is 5 seconds).
func skip(seconds int64) { testing.SkipHeights(seconds/5 + 1) }

// placeholderGenesis stands in for the designer's catalogue (data/gnomes.json),
// laid out as it is: seven waves, one world each, each its 72 Commons, then
// its Rares, its Epics and its Legendary (the first worlds take what is left
// over: 21 Rares, then 20; 10 Epics, then 9). Names "Gnome <id>", traits
// "v0.<id>", as opaque here as on chain.
func placeholderGenesis() string {
	var b strings.Builder
	id := int64(1)
	for w := int64(0); w < genesisWaves; w++ {
		var wave [len(tiers)]int64
		for i, s := range genesisSupply {
			wave[i] = s / genesisWaves
			if w < s%genesisWaves {
				wave[i]++
			}
		}
		b.WriteString(placeholderRows(id, wave) + "\n")
		id += wave[0] + wave[1] + wave[2] + wave[3]
	}
	return strings.TrimSuffix(b.String(), "\n")
}

// genesisWaves is the genesis's worlds, one wave each.
const genesisWaves = 7

// placeholderRows is a series' rows from id first, each tier's in turn,
// Commons first.
func placeholderRows(first int64, supply [len(tiers)]int64) string {
	var b strings.Builder
	id := first
	for i := range tiers {
		for n := int64(0); n < supply[i]; n++ {
			b.WriteString(itoa(id) + "|" + tiers[i].name + "|Gnome " + itoa(id) + "|v0." + itoa(id) + "\n")
			id++
		}
	}
	return strings.TrimSuffix(b.String(), "\n")
}

func TestThePlaceholderIsLaidOutAsTheCatalogue(cur realm, t *testing.T) {
	fresh(t, cur)
	for _, w := range [][5]int64{ // first, last Common, last Rare, last Epic, the Legendary (spec §2)
		{1, 72, 93, 103, 104}, {105, 176, 197, 207, 208}, {209, 280, 301, 310, 311},
		{312, 383, 404, 413, 414}, {415, 486, 506, 515, 516}, {517, 588, 608, 617, 618}, {619, 690, 710, 719, 720},
	} {
		for i, id := range w {
			want := []int{0, 0, 1, 2, topTier}[i]
			uassert.Equal(t, want, mustGnome(id).tier, "id "+itoa(id))
		}
	}
}

// (testing.IssueCoins is not reverted when a call aborts, so the realm's
// balance carries over between tests: the tests check what a call changes.)

// asUser readies a direct call by who, with sent as its -send envelope (the
// coins land on the realm, as maketx call -send does), and returns who's
// realm. The test itself must pass it to testing.SetRealm: SetRealm acts on
// the frame that calls it, so called in here it would be lost on return.
// Each call is its own transaction: nothing of its envelope spent yet.
func asUser(who address, sent chain.Coins) runtime.Realm {
	testing.SetOriginCaller(who)
	testing.SetOriginSend(sent)
	testing.SetOriginSpend(nil)
	if len(sent) > 0 {
		testing.IssueCoins(selfAddr, sent)
	}
	return testing.NewUserRealm(who)
}

func ugnot(n int64) chain.Coins { return chain.Coins{{"ugnot", n}} }

func balance(a address) int64 {
	return banker.NewReadonlyBanker().GetCoin(a, "ugnot")
}

func mustGnome(id int64) gnome {
	g, ok := gnomeAt(id)
	if !ok {
		panic("no gnome " + itoa(id))
	}
	return g
}

// nthOfTier returns the n-th (from 0) catalogue id of tier i.
func nthOfTier(i, n int) int64 {
	for id := int64(1); id <= lastID(); id++ {
		if mustGnome(id).tier == i {
			if n == 0 {
				return id
			}
			n--
		}
	}
	panic("no such gnome of tier " + itoa(int64(i)))
}

// priceOf is what Buy charges for id now.
func priceOf(id int64) int64 {
	w := waveAt(id)
	if w < 0 {
		panic("not in a wave: " + itoa(id))
	}
	return waves[w].prices[mustGnome(id).tier]
}

func common() int64 { return nthOfTier(0, 0) }

func legend() int64 { return nthOfTier(topTier, 0) }

// topTier is the last tier, the Legendaries'.
const topTier = len(tiers) - 1

// --- the config

func TestTheGenesisIs720Gnomes(t *testing.T) {
	want := map[string]int64{"common": 504, "rare": 144, "epic": 65, "legendary": 7}
	total := int64(0)
	for i, tr := range tiers {
		uassert.Equal(t, want[tr.name], genesisSupply[i], tr.name)
		total += genesisSupply[i]
	}
	uassert.Equal(t, int64(720), total, "10x a par-72 course")
	uassert.Equal(t, int64(720), genesisTotal())
}

func TestThePricesAtDeployAreTheDecidedOnes(t *testing.T) {
	want := map[string]int64{"common": 36_000_000, "rare": 72_000_000, "epic": 336_000_000, "legendary": 1_296_000_000}
	for _, tr := range tiers {
		uassert.Equal(t, want[tr.name], tr.price, tr.name)
		uassert.True(t, tr.price >= minPrice && tr.price <= maxPrice, tr.name+": within SetPrice's bounds")
	}
	uassert.Equal(t, "legendary", tiers[topTier].name)
}

func TestTheTiersGetDearerAndScarcer(t *testing.T) {
	for i := 1; i < len(tiers); i++ {
		uassert.True(t, tiers[i].price > tiers[i-1].price, tiers[i].name+": dearer than the tier below")
		uassert.True(t, genesisSupply[i] < genesisSupply[i-1], tiers[i].name+": scarcer than the tier below")
	}
}

func TestEveryTierHasItsCaps(t *testing.T) {
	uassert.Equal(t, int64(1), lifetimeCap[topTier], "one Legendary a wallet")
	for i := range tiers {
		uassert.True(t, playerCap[i] > 0 && playerCap[i] <= lifetimeCap[i], tiers[i].name)
	}
}
