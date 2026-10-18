package gnomes

import (
	"strings"
	"testing"

	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

// The genesis sale has a hard closing date: the owner sets it once the
// genesis is published, and may bring it forward, never push it back. From
// then on its unsold gnomes are closed for good.

func TestOnlyTheOwnerSetsTheCloseOncePublished(cur realm, t *testing.T) {
	setUp(0, cur, deployer)
	testing.SetRealm(asUser(deployer, nil))
	urequire.AbortsContains(t, cur, "genesis", func() { SetCloseAt(cross(cur), now()+3600) })
	urequire.NoError(t, addSeries(genesisName, placeholderGenesis()))
	testing.SetRealm(asUser(alice, nil))
	urequire.AbortsContains(t, cur, "only the owner", func() { SetCloseAt(cross(cur), now()+3600) })
	testing.SetRealm(asUser(deployer, nil))
	urequire.AbortsContains(t, cur, "future", func() { SetCloseAt(cross(cur), now()) })
	SetCloseAt(cross(cur), now()+3600)
	uassert.Equal(t, now()+3600, CloseAt())
}

// Monotonic: earlier, never later; the next owner is held to it too.
func TestTheCloseComesForwardNeverBack(cur realm, t *testing.T) {
	fresh(t, cur)
	at := now() + 30*24*3600
	testing.SetRealm(asUser(deployer, nil))
	SetCloseAt(cross(cur), at)
	urequire.AbortsContains(t, cur, "never later", func() { SetCloseAt(cross(cur), at+1) })
	SetCloseAt(cross(cur), at) // the same date: nothing moves
	SetCloseAt(cross(cur), at-3600)
	uassert.Equal(t, at-3600, CloseAt())

	Transfer(cross(cur), alice)
	testing.SetRealm(asUser(alice, nil))
	Accept(cross(cur))
	urequire.AbortsContains(t, cur, "never later", func() { SetCloseAt(cross(cur), at) })
	uassert.Equal(t, at-3600, CloseAt())
}

func TestAnEmptyOwnerCannotSetTheClose(cur realm, t *testing.T) {
	fresh(t, cur)
	owner = ""
	testing.SetRealm(asUser("", nil))
	urequire.AbortsContains(t, cur, "only the owner", func() { SetCloseAt(cross(cur), now()+3600) })
}

// The boundary: open in the block before the date, closed in the block at it.
func TestTheSaleClosesAtItsDateToTheBlock(cur realm, t *testing.T) {
	fresh(t, cur)
	at := now() + 5 // the next block
	testing.SetRealm(asUser(deployer, nil))
	SetCloseAt(cross(cur), at)
	testing.SetRealm(asUser(alice, ugnot(priceOf(1))))
	Buy(cross(cur), "1") // the block before: open

	testing.SkipHeights(1)
	uassert.Equal(t, at, now(), "the block at the date")
	testing.SetRealm(asUser(alice, ugnot(priceOf(2))))
	urequire.AbortsContains(t, cur, "gnomes: the genesis sale closed on "+dateOf(at), func() { Buy(cross(cur), "2") })
	testing.SetRealm(asUser(deployer, nil))
	urequire.AbortsContains(t, cur, "closed", func() { SetCloseAt(cross(cur), now()-5) })
}

func TestAClosedGnomeIsNeverSold(cur realm, t *testing.T) {
	fresh(t, cur)
	testing.SetRealm(asUser(alice, ugnot(priceOf(1))))
	Buy(cross(cur), "1")
	testing.SetRealm(asUser(deployer, nil))
	SetCloseAt(cross(cur), now()+5)
	skip(5)
	uassert.True(t, strings.Contains(Gnome("1"), `"sold":true,"closed":false`), "a sold gnome is not closed")
	uassert.True(t, strings.Contains(Gnome("2"), `"sold":false,"closed":true`))
	uassert.True(t, strings.Contains(Collection(), `"series":[{"name":"genesis","first":1,"last":720,"sold":1,"closed":true,"sale":{`))
	uassert.True(t, strings.Contains(Collection(), `"closesAt":`+itoa(closeAt)))
	// nor put on sale again: the close is said first
	urequire.ErrorContains(t, openSale(genesisName, now(), 0), "gnomes: the genesis sale closed on")
}

// A later series has its own sale: the genesis's date does not close it.
// Earned gnomes are never closed.
func TestTheCloseIsTheGenesissOnly(cur realm, t *testing.T) {
	f := withRows(t, cur)
	for _, id := range cupHoles(f, "garden", 18) {
		best(f, id, "assisted", alice.String(), 3)
	}
	urequire.NoError(t, addSeries("winter-2027", placeholderRows(721, [len(tiers)]int64{3})))
	urequire.NoError(t, openSale("winter-2027", now(), 0))
	testing.SetRealm(asUser(deployer, nil))
	SetCloseAt(cross(cur), now()+5)
	skip(5)
	testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
	uassert.Equal(t, "721", Buy(cross(cur), "721"))
	testing.SetRealm(asUser(alice, nil))
	uassert.Equal(t, "1000001", MintEarned(cross(cur), "wizard"))
}

func TestTheCloseDateReads(t *testing.T) {
	uassert.Equal(t, "2026-11-30 18:00 UTC", dateOf(1796061600))
}

// The genesis is sold only once its closing date is set: before it, the
// sale does not open and the genesis's is not opened (a buyer always knows
// when its sale ends). A later series is not held to it. Once one is set,
// the genesis's sale does not start at or after it, which nobody could buy
// from.
func TestTheGenesisSellsOnlyOnceItsCloseIsSet(cur realm, t *testing.T) {
	setUp(0, cur, deployer)
	testing.SetRealm(asUser(deployer, nil))
	urequire.AbortsContains(t, cur, errNoClose, func() { SetMintOpen(cross(cur), true) }, "nothing published")
	urequire.NoError(t, addSeries(genesisName, placeholderGenesis()))
	urequire.AbortsContains(t, cur, errNoClose, func() { SetMintOpen(cross(cur), true) })
	urequire.AbortsContains(t, cur, errNoClose, func() { OpenSale(cross(cur), genesisName, now(), 0) })
	uassert.False(t, MintOpen())
	uassert.Equal(t, 0, len(sales))
	SetMintOpen(cross(cur), false) // closing it is always taken
	urequire.NoError(t, addSeries("winter-2027", placeholderRows(721, [len(tiers)]int64{3})))
	urequire.NoError(t, openSale("winter-2027", now(), 0), "a later series is not the genesis's")

	at := now() + 3600
	SetCloseAt(cross(cur), at)
	SetMintOpen(cross(cur), true)
	uassert.True(t, MintOpen())
	urequire.ErrorContains(t, openSale(genesisName, at, 0), "gnomes: the genesis sale starts before it closes, on "+dateOf(at))
	urequire.ErrorContains(t, openSale(genesisName, at+5, 0), "starts before it closes")
	OpenSale(cross(cur), genesisName, at-5, 0)
}

// From the other side: a close is never set, nor brought forward, to at or
// before the start of the genesis's sale yet to open, which nobody could
// then buy from.
func TestTheCloseNeverComesBeforeTheGenesisSaleOpens(cur realm, t *testing.T) {
	noSale(t, cur)
	start := now() + 2*24*3600
	urequire.NoError(t, openSale(genesisName, start, 0))
	testing.SetRealm(asUser(deployer, nil))
	urequire.AbortsContains(t, cur, "gnomes: the genesis sale starts on "+dateOf(start), func() { SetCloseAt(cross(cur), start) })
	urequire.AbortsContains(t, cur, "gnomes: the genesis sale starts on "+dateOf(start), func() { SetCloseAt(cross(cur), now()+3600) })
	SetCloseAt(cross(cur), start+3600)
	urequire.AbortsContains(t, cur, "gnomes: the genesis sale starts on "+dateOf(start), func() { SetCloseAt(cross(cur), start-5) })
	uassert.Equal(t, start+3600, CloseAt())

	// a later series' sale does not hold the genesis's date
	urequire.NoError(t, addSeries("winter-2027", placeholderRows(721, [len(tiers)]int64{3})))
	urequire.NoError(t, openSale("winter-2027", start+7200, 0))
	SetCloseAt(cross(cur), start+5)
	uassert.Equal(t, start+5, CloseAt())
}
