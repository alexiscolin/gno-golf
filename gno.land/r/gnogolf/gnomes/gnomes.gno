package gnomes

import (
	"chain"
	"chain/runtime"
	"chain/runtime/unsafe"
	"strconv"

	"gno.land/p/nt/bptree/v0"
	"gno.land/p/nt/grc721/royalty/v0"
	"gno.land/p/nt/grc721/v0"
)

// The gnomes of Gnogolf as GRC721 tokens. The ball is a gnome: a player
// buys the one they choose from the catalogue, at its wave's price, and
// equips it. The realm holds no funds: a sale's payment goes to the treasury
// in the same call. The catalogue is data the owner publishes a series at a time
// (catalogue.gno), sold in waves (waves.gno). This file is the state.
var (
	Token     *grc721.Token    // the read side: name, symbol, owners, balances, approvals
	Royalties *royalty.Royalty // EIP-2981, read side
)

// The rest of the state. Nothing of it is returned by reference: the
// ledgers and trees have mutators.
var (
	ledger        *grc721.PrivateLedger // write side: mint
	teller        grc721.Teller         // acts as this realm's caller: transfers, approvals
	royaltyLedger *royalty.Ledger

	mintOpen bool // the owner's switch over every sale; starts closed

	catalogue []series          // in publishing order, ids following on
	waves     []wave            // in publishing order
	soldTier  [len(tiers)]int64 // sold per tier, every series
	sold      []byte            // a bit per catalogue id, bit id-1 set once sold, for good (a burn does not clear it)

	// bptrees, which pack many rows a node: an avl node was measured at
	// about 2 KB of deposit a row (z_storage_buy)
	bought   *bptree.BPTree // buyer -> [len(tiers)]int64, for the lifetime cap
	inWindow *bptree.BPTree // "<wave> <buyer>" -> [len(tiers)]int64, for the player cap
	equipped *bptree.BPTree // player -> token id
)

func init(cur realm) { setUp(0, cur, ownerAtDeploy(unsafe.OriginCaller(), runtime.ChainID())) }

// setUp starts the collection empty, the catalogue unpublished, the sale
// closed, owned by deployer: the token, its extensions, its royalty to the
// owner. rlm is this realm's live cur, which grc721 records as the token's
// home. The tests call it again for a fresh collection.
func setUp(_ int, rlm realm, deployer address) {
	Token, ledger = grc721.NewToken(tokenName, tokenSymbol, 0, rlm)
	teller = ledger.CallerTeller()
	Royalties, royaltyLedger = royalty.NewRoyalty(ledger, royaltyBps)
	ledger.RegisterExtension(holdings{})
	if deployer.IsValid() {
		if err := royaltyLedger.SetDefaultRoyalty(deployer, royaltyBps); err != nil {
			panic(err)
		}
	}
	owner, pending, mintOpen = deployer, "", false
	treasury, pendingTreasury, siteURL = deployer, "", ""
	for i, tr := range tiers {
		prices[i] = tr.price
	}
	catalogue, waves, soldTier, sold = nil, nil, [len(tiers)]int64{}, nil
	closeAt, rules = 0, rulesAtDeploy
	bought, inWindow, equipped, held = seeded(), seeded(), seeded(), seeded()
	earned, kindOf, nextEarned, rows = seeded(), seeded(), firstEarned, storeReader{}
}

// MintOpen reports whether sales are taken.
func MintOpen() bool { return mintOpen }

// SetMintOpen opens or closes every sale at once: the owner's switch for a
// fault. Owner only.
func SetMintOpen(cur realm, open bool) {
	assertOwner(0, cur)
	if open == mintOpen {
		return
	}
	mintOpen = open
	chain.Emit("MintOpen", "open", strconv.FormatBool(open))
}

// mintTo mints catalogue gnome g to whom: a sale's last step.
func mintTo(whom address, g gnome) {
	if err := ledger.Mint(whom, grc721.TokenID(itoa(g.id))); err != nil {
		panic(err)
	}
	held.Set(heldKey(whom, g.id, rankOfTier(g.tier)), "") // (its holder's row: holdings.OnMint)
	for int64(len(sold))*8 < g.id {
		sold = append(sold, 0)
	}
	sold[(g.id-1)/8] |= 1 << uint((g.id-1)%8)
	soldTier[g.tier]++
}

// soldIn is how many of ids first to last were ever sold, read from the sold
// bitmap: a query's count, kept nowhere (a count in a series would rewrite
// its rows with every sale).
func soldIn(first, last int64) int64 {
	n := int64(0)
	for id := first; id <= last; id++ {
		if isSold(id) {
			n++
		}
	}
	return n
}

// isSold reports whether catalogue gnome id was ever sold: once sold, an id
// stays sold, burned or not.
func isSold(id int64) bool {
	return id >= 1 && id <= int64(len(sold))*8 && sold[(id-1)/8]&(1<<uint((id-1)%8)) != 0
}

// tokenAt is gnome id, of the catalogue or earned: what the reads show.
func tokenAt(id int64) (gnome, bool) {
	if isEarned(id) {
		return earnedAt(id)
	}
	return gnomeAt(id)
}

// tierName is a tier's name, an earned gnome's included.
func tierName(t int) string {
	if t == earnedTier {
		return "earned"
	}
	return tiers[t].name
}

// SoldOfTier returns how many gnomes of tier i were sold, every series.
func SoldOfTier(i int) int64 {
	if i < 0 || i >= len(tiers) {
		return 0
	}
	return soldTier[i]
}

// The refusals, as strings: a stored error value costs a kilobyte of
// deposit, a string constant its length.
const (
	errNotOwner    = "gnomes: only the owner can do this"
	errNotUserCall = "gnomes: call this directly from your account (maketx call)"
	errClosed      = "gnomes: the sale is closed"
	errNoGnome     = "gnomes: no such gnome"
	errSold        = "gnomes: this gnome is already sold"
	errNotYours    = "gnomes: not your gnome"
)

func itoa(n int64) string { return strconv.FormatInt(n, 10) }
