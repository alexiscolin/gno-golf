package gnomes

import (
	"chain"
	"strings"
	"testing"

	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

const reserve = 777_000_000

func TestOnlyTheOwnerStartsAnAuctionOfAnUnsoldLegendary(cur realm, t *testing.T) {
	fresh(t, cur)
	id := legend()
	testing.SetRealm(asUser(alice, nil))
	urequire.AbortsContains(t, cur, "only the owner", func() { StartAuction(cross(cur), id, 48) })

	testing.SetRealm(asUser(deployer, nil))
	urequire.AbortsContains(t, cur, "legendary", func() { StartAuction(cross(cur), common(), 48) })
	urequire.AbortsContains(t, cur, "no such gnome", func() { StartAuction(cross(cur), lastID()+1, 48) })
	urequire.AbortsContains(t, cur, "hours", func() { StartAuction(cross(cur), id, 0) })
	urequire.AbortsContains(t, cur, "hours", func() { StartAuction(cross(cur), id, maxHours+1) })
	StartAuction(cross(cur), id, 48)
	urequire.AbortsContains(t, cur, "under way", func() { StartAuction(cross(cur), nthOfTier(auctionTier, 1), 48) })
	uassert.Equal(t, int64(reserve), auc.reserve, "the reserve is the tier's price")
}

func TestBidsBeatTheReserveThenTheLastByTheMinimumRaise(cur realm, t *testing.T) {
	fresh(t, cur)
	id := legend()
	testing.SetRealm(asUser(deployer, nil))
	StartAuction(cross(cur), id, 48)

	testing.SetRealm(asUser(alice, ugnot(reserve-1)))
	urequire.AbortsContains(t, cur, "at least", func() { Bid(cross(cur), id) })
	testing.SetRealm(asUser(alice, ugnot(reserve)))
	Bid(cross(cur), id)

	raise := int64(reserve / 20) // 5% beats 5 GNOT here
	testing.SetRealm(asUser(bob, ugnot(reserve+raise-1)))
	urequire.AbortsContains(t, cur, "at least", func() { Bid(cross(cur), id) })
	testing.SetRealm(asUser(alice, ugnot(reserve+raise)))
	urequire.AbortsContains(t, cur, "already", func() { Bid(cross(cur), id) })

	before := balance(alice)
	testing.SetRealm(asUser(bob, ugnot(reserve+raise)))
	held := balance(selfAddr) // bob's bid in
	Bid(cross(cur), id)
	uassert.Equal(t, before+reserve, balance(alice), "the outbid bidder has their bid back at once")
	uassert.Equal(t, held-reserve, balance(selfAddr), "the realm keeps the new top bid alone")
	uassert.Equal(t, int64(reserve+raise), auc.top)
	uassert.Equal(t, bob, auc.bidder)
}

func TestTheMinimumRaiseIsFiveGNOTOnSmallBids(t *testing.T) {
	uassert.Equal(t, int64(10_000_000+minRaise), minBidOver(10_000_000), "5% of 10 GNOT is less than 5 GNOT")
	uassert.Equal(t, int64(1_000_000_000+50_000_000), minBidOver(1_000_000_000))
	uassert.Equal(t, int64(1_000_000_001+50_000_001), minBidOver(1_000_000_001), "5%, rounded up")
}

func TestABidMustBeOneCoinOfUgnot(cur realm, t *testing.T) {
	fresh(t, cur)
	id := legend()
	testing.SetRealm(asUser(deployer, nil))
	StartAuction(cross(cur), id, 48)
	for name, sent := range map[string]chain.Coins{
		"nothing": nil,
		"denom":   chain.Coins{{"uatom", reserve}},
		"two":     chain.Coins{{"uatom", 1}, {"ugnot", reserve}},
	} {
		testing.SetRealm(asUser(alice, sent))
		urequire.AbortsContains(t, cur, "gnomes: ", func() { Bid(cross(cur), id) }, name)
	}
}

func TestABidMustBeADirectUserCall(cur realm, t *testing.T) {
	fresh(t, cur)
	id := legend()
	testing.SetRealm(asUser(deployer, nil))
	StartAuction(cross(cur), id, 48)
	testing.SetOriginCaller(alice)
	testing.SetOriginSend(ugnot(reserve))
	testing.IssueCoins(selfAddr, ugnot(reserve))
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/someone/relay"))
	urequire.AbortsContains(t, cur, "directly", func() { Bid(cross(cur), id) })
}

// A bid in the last ten minutes moves the end to ten minutes after it: no
// sniping at the bell.
func TestALateBidExtendsTheEnd(cur realm, t *testing.T) {
	fresh(t, cur)
	id := legend()
	testing.SetRealm(asUser(deployer, nil))
	StartAuction(cross(cur), id, 1)
	end := auc.end
	skip(3600 - 120)
	testing.SetRealm(asUser(alice, ugnot(reserve)))
	Bid(cross(cur), id)
	uassert.True(t, auc.end > end, "extended")
	uassert.True(t, auc.end >= now()+softClose, "to ten minutes after the bid")

	skip(softClose - 60)
	testing.SetRealm(asUser(bob, ugnot(minBidOver(reserve))))
	Bid(cross(cur), id) // still open: the end moved
	skip(softClose + 5)
	testing.SetRealm(asUser(alice, ugnot(minBidOver(minBidOver(reserve)))))
	urequire.AbortsContains(t, cur, "over", func() { Bid(cross(cur), id) })
}

func TestSettleGivesTheWinnerTheGnomeAndTheOwnerTheBid(cur realm, t *testing.T) {
	fresh(t, cur)
	id := legend()
	testing.SetRealm(asUser(deployer, nil))
	StartAuction(cross(cur), id, 1)
	testing.SetRealm(asUser(alice, ugnot(reserve)))
	Bid(cross(cur), id)

	testing.SetRealm(asUser(bob, nil))
	urequire.AbortsContains(t, cur, "not over", func() { Settle(cross(cur), id) })
	skip(3600)
	before, held := balance(deployer), balance(selfAddr)
	Settle(cross(cur), id) // anyone may
	owner, _ := OwnerOf(itoa(id))
	uassert.Equal(t, alice, owner)
	uassert.Equal(t, before+reserve, balance(deployer))
	uassert.Equal(t, held-reserve, balance(selfAddr), "the escrow is paid out")
	uassert.Equal(t, int64(1), SoldOfTier(auctionTier))
	urequire.AbortsContains(t, cur, "no auction", func() { Settle(cross(cur), id) })

	// it is not auctioned again; the next is
	testing.SetRealm(asUser(deployer, nil))
	urequire.AbortsContains(t, cur, "already sold", func() { StartAuction(cross(cur), id, 48) })
	StartAuction(cross(cur), nthOfTier(auctionTier, 1), 48)
}

func TestAnAuctionWithNoBidLeavesTheGnomeUnsold(cur realm, t *testing.T) {
	fresh(t, cur)
	id := legend()
	testing.SetRealm(asUser(deployer, nil))
	StartAuction(cross(cur), id, 1)
	urequire.AbortsContains(t, cur, "under way", func() { StartAuction(cross(cur), id, 1) })
	skip(3600)
	urequire.AbortsContains(t, cur, "settled", func() { StartAuction(cross(cur), id, 1) })
	Settle(cross(cur), id)
	_, err := OwnerOf(itoa(id))
	uassert.Error(t, err)
	StartAuction(cross(cur), id, 1) // again, at the reserve it was, never lower by itself
}

func TestCancelOnlyBeforeTheFirstBid(cur realm, t *testing.T) {
	fresh(t, cur)
	id := legend()
	testing.SetRealm(asUser(deployer, nil))
	urequire.AbortsContains(t, cur, "no auction", func() { CancelAuction(cross(cur)) })
	StartAuction(cross(cur), id, 48)
	testing.SetRealm(asUser(alice, nil))
	urequire.AbortsContains(t, cur, "only the owner", func() { CancelAuction(cross(cur)) })
	testing.SetRealm(asUser(deployer, nil))
	CancelAuction(cross(cur))
	StartAuction(cross(cur), id, 48)
	testing.SetRealm(asUser(alice, ugnot(reserve)))
	Bid(cross(cur), id)
	testing.SetRealm(asUser(deployer, nil))
	urequire.AbortsContains(t, cur, "a bid", func() { CancelAuction(cross(cur)) })
}

// Coins sent to the realm with any call stay there until swept to the
// owner; the top bid in escrow is never swept.
func TestSweepKeepsTheEscrow(cur realm, t *testing.T) {
	fresh(t, cur)
	id := legend()
	testing.SetRealm(asUser(deployer, nil))
	StartAuction(cross(cur), id, 48)
	testing.SetRealm(asUser(alice, ugnot(reserve)))
	Bid(cross(cur), id)
	testing.IssueCoins(selfAddr, ugnot(123)) // a stray -send
	before, held := balance(deployer), balance(selfAddr)
	testing.SetRealm(asUser(alice, nil))
	urequire.AbortsContains(t, cur, "only the owner", func() { Sweep(cross(cur)) })
	testing.SetRealm(asUser(deployer, nil))
	Sweep(cross(cur))
	uassert.Equal(t, before+held-reserve, balance(deployer), "the strays, 123 among them")
	uassert.Equal(t, int64(reserve), balance(selfAddr), "the escrow stays")
}

// Auction is the one under way, else the last one settled, else an empty id.
func TestAuctionJSONShowsTheNextMinimum(cur realm, t *testing.T) {
	fresh(t, cur)
	uassert.Equal(t, `{"version":1,"id":""}`, Auction())
	id := legend()
	testing.SetRealm(asUser(deployer, nil))
	StartAuction(cross(cur), id, 1)
	end := auc.end
	uassert.Equal(t,
		`{"version":1,"id":"`+itoa(id)+`","reserve":777000000,"top":0,"bidder":"","end":`+itoa(end)+`,"min":777000000,"over":false,"settled":false}`,
		Auction())
	CancelAuction(cross(cur))
	uassert.Equal(t, `{"version":1,"id":""}`, Auction(), "a cancelled auction is not the last one")

	StartAuction(cross(cur), id, 1)
	end = auc.end
	testing.SetRealm(asUser(alice, ugnot(reserve)))
	Bid(cross(cur), id)
	skip(3600)
	Settle(cross(cur), id)
	uassert.Equal(t,
		`{"version":1,"id":"`+itoa(id)+`","reserve":777000000,"top":777000000,"bidder":"`+alice.String()+`","end":`+itoa(end)+`,"min":0,"over":true,"settled":true}`,
		Auction())

	// a cancel after it leaves it the last one
	testing.SetRealm(asUser(deployer, nil))
	StartAuction(cross(cur), nthOfTier(auctionTier, 1), 1)
	CancelAuction(cross(cur))
	uassert.True(t, strings.Contains(Auction(), `"id":"`+itoa(id)+`"`))
}
