package gnomes

import (
	"strings"
	"testing"

	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

// The genesis sale's closing date is optional: the owner may set one once
// the genesis is published, and may bring it forward, never push it back nor
// remove it. From then on its unsold gnomes are closed for good.

func TestOnlyTheOwnerSetsTheCloseOncePublished(cur realm, t *testing.T) {
	setUp(0, cur, deployer)
	testing.SetRealm(asUser(deployer, nil))
	urequire.AbortsContains(t, cur, "genesis", func() { SetCloseAt(cross(cur), now()+closeNotice) })
	urequire.NoError(t, addSeries(genesisName, placeholderGenesis()))
	testing.SetRealm(asUser(alice, nil))
	urequire.AbortsContains(t, cur, "only the owner", func() { SetCloseAt(cross(cur), now()+closeNotice) })
	testing.SetRealm(asUser(deployer, nil))
	// a week's notice at least: never a close sprung on the buyers
	urequire.AbortsContains(t, cur, "7 days ahead", func() { SetCloseAt(cross(cur), now()) })
	urequire.AbortsContains(t, cur, "7 days ahead", func() { SetCloseAt(cross(cur), now()+closeNotice-1) })
	SetCloseAt(cross(cur), now()+closeNotice)
	uassert.Equal(t, now()+closeNotice, CloseAt())
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
	urequire.AbortsContains(t, cur, "only the owner", func() { SetCloseAt(cross(cur), now()+closeNotice) })
}

// The boundary: open in the block before the date, closed in the block at it.
func TestTheSaleClosesAtItsDateToTheBlock(cur realm, t *testing.T) {
	fresh(t, cur)
	at := now() + 5 // the next block
	closeAt = at // (set as stored: the block's boundary here, not the notice SetCloseAt asks)
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
	SetCloseAt(cross(cur), now()+closeNotice)
	skip(closeNotice)
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
	SetCloseAt(cross(cur), now()+closeNotice)
	skip(closeNotice)
	testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
	uassert.Equal(t, "721", Buy(cross(cur), "721"))
	testing.SetRealm(asUser(alice, nil))
	uassert.Equal(t, "1000001", MintEarned(cross(cur), "wizard"))
}

func TestTheCloseDateReads(t *testing.T) {
	uassert.Equal(t, "2026-11-30 18:00 UTC", dateOf(1796061600))
}

// The genesis may sell with no closing date: the sale opens, the genesis's
// sale opens and sells, and nothing closes it (it sells until sold out).
// The owner may set a date later, after its start, only bringing it
// forward; from that date its unsold gnomes are closed. Once one is set, the
// genesis's sale does not start at or after it, which nobody could buy from.
func TestTheGenesisSellsWithNoCloseSet(cur realm, t *testing.T) {
	setUp(0, cur, deployer)
	testing.SetRealm(asUser(deployer, nil))
	SetMintOpen(cross(cur), true)
	uassert.True(t, MintOpen(), "nothing published, no date: the switch is the owner's")
	SetMintOpen(cross(cur), false)
	urequire.NoError(t, addSeries(genesisName, placeholderGenesis()))
	SetMintOpen(cross(cur), true)
	OpenSale(cross(cur), genesisName, now(), 0)
	uassert.Equal(t, int64(0), CloseAt())
	testing.SetRealm(asUser(alice, ugnot(priceOf(1))))
	Buy(cross(cur), "1")
	skip(400 * 24 * 3600) // over a year on: no date, never closed
	uassert.False(t, genesisClosed())
	uassert.False(t, isClosed(2))
	uassert.True(t, strings.Contains(Collection(), `"closesAt":0,`))
	uassert.True(t, strings.Contains(Gnome("2"), `"sold":false,"closed":false`))
	testing.SetRealm(asUser(alice, ugnot(priceOf(2))))
	Buy(cross(cur), "2")

	// a date set later: in the future, forward only, never removed
	testing.SetRealm(asUser(deployer, nil))
	urequire.AbortsContains(t, cur, "7 days ahead", func() { SetCloseAt(cross(cur), 0) }, "never removed")
	at := now() + closeNotice
	SetCloseAt(cross(cur), at)
	urequire.AbortsContains(t, cur, "never later", func() { SetCloseAt(cross(cur), at+1) })
	urequire.AbortsContains(t, cur, "7 days ahead", func() { SetCloseAt(cross(cur), 0) })
	uassert.Equal(t, at, CloseAt())
	skip(closeNotice)
	uassert.True(t, isClosed(3), "an unsold genesis gnome is closed from the date on")
	uassert.False(t, isClosed(1), "a sold one is not")
	testing.SetRealm(asUser(alice, ugnot(priceOf(3))))
	urequire.AbortsContains(t, cur, "gnomes: the genesis sale closed on "+dateOf(at), func() { Buy(cross(cur), "3") })
}

// With a date set, the genesis's sale does not start at or after it.
func TestTheGenesisSaleStartsBeforeAClose(cur realm, t *testing.T) {
	setUp(0, cur, deployer)
	testing.SetRealm(asUser(deployer, nil))
	urequire.NoError(t, addSeries(genesisName, placeholderGenesis()))
	at := now() + closeNotice
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
	start := now() + closeNotice + 2*24*3600 // (past the notice a close asks)
	urequire.NoError(t, openSale(genesisName, start, 0))
	testing.SetRealm(asUser(deployer, nil))
	urequire.AbortsContains(t, cur, "gnomes: the genesis sale starts on "+dateOf(start), func() { SetCloseAt(cross(cur), start) })
	urequire.AbortsContains(t, cur, "gnomes: the genesis sale starts on "+dateOf(start), func() { SetCloseAt(cross(cur), now()+closeNotice) })
	SetCloseAt(cross(cur), start+3600)
	urequire.AbortsContains(t, cur, "gnomes: the genesis sale starts on "+dateOf(start), func() { SetCloseAt(cross(cur), start-5) })
	uassert.Equal(t, start+3600, CloseAt())

	// a later series' sale does not hold the genesis's date
	urequire.NoError(t, addSeries("winter-2027", placeholderRows(721, [len(tiers)]int64{3})))
	urequire.NoError(t, openSale("winter-2027", start+7200, 0))
	SetCloseAt(cross(cur), start+5)
	uassert.Equal(t, start+5, CloseAt())
}
