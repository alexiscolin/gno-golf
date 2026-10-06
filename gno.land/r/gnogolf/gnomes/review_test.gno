package gnomes

import (
	"strings"
	"testing"

	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

// The review of 1b10df4: each finding's test.

// A pause freezes an auction: no bid, no settle, and its clock stops. On
// resume, the end moves on by the time paused, and at least to the soft
// close from then, so a pause (or a stolen owner key: bid, then pause)
// cannot end an auction at its current top bid.
func TestAPauseFreezesTheAuction(cur realm, t *testing.T) {
	fresh(t, cur)
	id := legend()
	testing.SetRealm(asUser(deployer, nil))
	StartAuction(cross(cur), id, 1)
	end := auc.end
	testing.SetRealm(asUser(alice, ugnot(reserve)))
	Bid(cross(cur), id)

	skip(1800)
	testing.SetRealm(asUser(deployer, nil))
	SetMintOpen(cross(cur), false)
	skip(3600) // past the end it had
	urequire.AbortsContains(t, cur, "paused", func() { Settle(cross(cur), id) })
	urequire.AbortsContains(t, cur, "closed", func() { StartAuction(cross(cur), nthOfTier(auctionTier, 1), 1) })

	testing.SetRealm(asUser(deployer, nil))
	SetMintOpen(cross(cur), true)
	uassert.True(t, auc.end >= end+3600, "pushed on by the time paused")
	uassert.True(t, auc.end >= now()+softClose)
	testing.SetRealm(asUser(bob, ugnot(minBidOver(reserve))))
	Bid(cross(cur), id) // outbid after the resume
	uassert.Equal(t, bob, auc.bidder)
}

// Paused when the end has already passed, the auction still cannot be
// settled until the sale resumes; then it reopens for at least the soft
// close, since the pause may have kept a bid out.
func TestAPausePastTheEndRefusesTheSettle(cur realm, t *testing.T) {
	fresh(t, cur)
	id := legend()
	testing.SetRealm(asUser(deployer, nil))
	StartAuction(cross(cur), id, 1)
	testing.SetRealm(asUser(alice, ugnot(reserve)))
	Bid(cross(cur), id)
	skip(3600 - 60)
	testing.SetRealm(asUser(deployer, nil))
	SetMintOpen(cross(cur), false)
	skip(120) // the end passes during the pause
	testing.SetRealm(asUser(bob, nil))
	urequire.AbortsContains(t, cur, "paused", func() { Settle(cross(cur), id) })
	testing.SetRealm(asUser(deployer, nil))
	SetMintOpen(cross(cur), true)
	testing.SetRealm(asUser(bob, nil))
	urequire.AbortsContains(t, cur, "not over", func() { Settle(cross(cur), id) })
	skip(softClose + 60)
	testing.SetRealm(asUser(bob, nil))
	Settle(cross(cur), id)
	who, _ := OwnerOf(itoa(id))
	uassert.Equal(t, alice, who)
}

// During a pause Auction says so, and keeps the minimum the auction will
// resume at: it is not over, even past the end it had.
func TestAPausedAuctionSaysPaused(cur realm, t *testing.T) {
	fresh(t, cur)
	id := legend()
	testing.SetRealm(asUser(deployer, nil))
	StartAuction(cross(cur), id, 1)
	uassert.True(t, strings.Contains(Auction(), `"min":777000000,"over":false,"paused":false,"settled":false`), Auction())
	SetMintOpen(cross(cur), false)
	uassert.True(t, strings.Contains(Auction(), `"min":777000000,"over":false,"paused":true,"settled":false`), Auction())
	skip(2 * 3600) // past the end it had
	uassert.True(t, strings.Contains(Auction(), `"min":777000000,"over":false,"paused":true,"settled":false`), Auction())
	SetMintOpen(cross(cur), true)
	uassert.True(t, strings.Contains(Auction(), `"over":false,"paused":false`), Auction())
}

// One over before the pause began stays over through it.
func TestAnAuctionOverBeforeThePauseSaysOver(cur realm, t *testing.T) {
	fresh(t, cur)
	testing.SetRealm(asUser(deployer, nil))
	StartAuction(cross(cur), legend(), 1)
	skip(3600 + 60)
	SetMintOpen(cross(cur), false)
	uassert.True(t, strings.Contains(Auction(), `"min":0,"over":true,"paused":true,"settled":false`), Auction())
}

// Never a discount: a Legendary offered once comes back at no less than its
// first reserve, whatever SetPrice did since; one never offered takes the
// price in force.
func TestALegendaryComesBackAtItsReserve(cur realm, t *testing.T) {
	fresh(t, cur)
	a, b := legend(), nthOfTier(auctionTier, 1)
	testing.SetRealm(asUser(deployer, nil))
	StartAuction(cross(cur), a, 1)
	skip(3600)
	Settle(cross(cur), a) // no bid
	SetPrice(cross(cur), "legendary", 300_000_000)
	StartAuction(cross(cur), a, 1)
	uassert.Equal(t, int64(777_000_000), auc.reserve, "its first reserve")
	CancelAuction(cross(cur))
	StartAuction(cross(cur), b, 1)
	uassert.Equal(t, int64(300_000_000), auc.reserve, "never offered: the price in force")
	CancelAuction(cross(cur))
	// a cancelled offer counts as offered
	SetPrice(cross(cur), "legendary", 200_000_000)
	StartAuction(cross(cur), b, 1)
	uassert.Equal(t, int64(300_000_000), auc.reserve)
	CancelAuction(cross(cur))
	// a higher price in force is taken: no discount, a raise is the owner's
	SetPrice(cross(cur), "legendary", 900_000_000)
	StartAuction(cross(cur), a, 1)
	uassert.Equal(t, int64(900_000_000), auc.reserve)
}

// An auction that ended before the pause is not reopened by the resume.
func TestAnAuctionOverBeforeThePauseStaysOver(cur realm, t *testing.T) {
	fresh(t, cur)
	id := legend()
	testing.SetRealm(asUser(deployer, nil))
	StartAuction(cross(cur), id, 1)
	end := auc.end
	skip(3600 + 60)
	SetMintOpen(cross(cur), false)
	skip(600)
	SetMintOpen(cross(cur), true)
	uassert.Equal(t, end, auc.end)
}

// A world of more than a page of slots (store's 300) is refused, not proven
// from its first page.
func TestACupTooLargeForThePageRefuses(cur realm, t *testing.T) {
	f := withRows(t, cur)
	ids := cupHoles(f, "garden", maxCupSlots+1)
	for _, id := range ids[:maxCupSlots] {
		best(f, id, "assisted", alice.String(), 3)
	}
	urequire.PanicsContains(t, cur, "cup too large for the proof", func() { prove("wizard", alice.String()) })
	f.c["slots"].Remove("0garden/301")
	ok, _, _ := prove("wizard", alice.String())
	uassert.True(t, ok, "300 slots, one page: proven")
}

// A Legendary in its auction, under way or ended and unsettled, is not
// closed by the close: it may still sell.
func TestALegendaryInItsAuctionIsNotClosed(cur realm, t *testing.T) {
	fresh(t, cur)
	id := legend()
	testing.SetRealm(asUser(deployer, nil))
	StartAuction(cross(cur), id, 2)
	SetCloseAt(cross(cur), now()+3600)
	skip(3600)
	uassert.False(t, isClosed(id), "under way")
	uassert.True(t, strings.Contains(Gnome(itoa(id)), `"closed":false`))
	skip(3600)
	uassert.False(t, isClosed(id), "ended, not settled")
	Settle(cross(cur), id)
	uassert.True(t, isClosed(id), "settled with no bid: closed")
}

// Between the end and the settle no bid is taken: Auction says so, its
// "min" 0 and "over" true, as Render does.
func TestAnEndedAuctionShowsNoMinimum(cur realm, t *testing.T) {
	fresh(t, cur)
	id := legend()
	testing.SetRealm(asUser(deployer, nil))
	StartAuction(cross(cur), id, 1)
	uassert.True(t, strings.Contains(Auction(), `"min":777000000,"over":false,"paused":false,"settled":false`), Auction())
	skip(3600)
	uassert.True(t, strings.Contains(Auction(), `"min":0,"over":true,"paused":false,"settled":false`), Auction())
	Settle(cross(cur), id)
	uassert.True(t, strings.Contains(Auction(), `"min":0,"over":true,"paused":false,"settled":true`), Auction())
}
