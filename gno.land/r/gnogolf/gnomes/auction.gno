package gnomes

import (
	"chain"
	"chain/banker"
	"chain/runtime/unsafe"
	"strconv"
)

// A Legendary is auctioned, one at a time (ADR-007): the owner starts it at
// the tier's price as its reserve; the first bid meets the reserve, each
// next beats the last by the larger of 5% and 5 GNOT; a bid in the last ten
// minutes moves the end to ten minutes after it. The realm holds the top
// bid alone: the bid it beats goes back to its bidder in the same call.
// Once the end is past, anyone settles: the gnome to the winner, the bid to
// the treasury; with no bid, the gnome stays unsold for a later auction. An
// auction under way when the sale closes runs to its end (close.gno).
type auction struct {
	id      int64
	reserve int64
	top     int64   // the top bid, 0 before the first
	bidder  address // its bidder, "" before the first
	end     int64   // block time, unix seconds
	settled bool
}

var (
	auc  *auction // the auction under way, or ended and not settled; nil for none
	last *auction // the last one settled, nil before the first
)

const errNoAuction = "gnomes: no auction of this gnome to settle"

// StartAuction auctions Legendary id for hours (1 to 168), its reserve the
// tier's price now. Owner only, while no other auction is under way or
// waiting to be settled, and not once the sale it is in has closed.
func StartAuction(cur realm, id, hours int64) {
	assertOwner(0, cur)
	if !mintOpen {
		panic(errClosed)
	}
	if auc != nil {
		if now() < auc.end {
			panic("gnomes: an auction is under way")
		}
		panic("gnomes: the last auction is not settled yet")
	}
	g, ok := gnomeAt(id)
	if !ok {
		panic(errNoGnome)
	}
	if g.tier != auctionTier {
		panic("gnomes: only a " + tiers[auctionTier].name + " is auctioned")
	}
	if isSold(id) {
		panic(errSold)
	}
	assertNotClosed(id)
	if hours < 1 || hours > maxHours {
		panic("gnomes: an auction runs 1 to 168 hours")
	}
	auc = &auction{id: id, reserve: prices[auctionTier], end: now() + hours*3600}
	chain.Emit("AuctionStarted", "id", itoa(id), "reserve", itoa(auc.reserve), "end", itoa(auc.end))
}

// CancelAuction ends the auction under way before its first bid. Owner only.
func CancelAuction(cur realm) {
	assertOwner(0, cur)
	if auc == nil {
		panic("gnomes: no auction to cancel")
	}
	if auc.bidder != "" {
		panic("gnomes: an auction with a bid runs to its end")
	}
	id := auc.id
	auc = nil
	chain.Emit("AuctionCancelled", "id", itoa(id))
}

// Bid bids on Legendary id: the bid is the coin sent with the call (-send
// "<bid>ugnot"), at least Auction's "min". Only a direct user call is taken,
// as for Buy; the top bidder cannot outbid themselves.
func Bid(cur realm, id int64) {
	if !cur.Previous().IsUserCall() {
		panic(errNotUserCall)
	}
	bidder := cur.Previous().Address()
	if !mintOpen {
		panic(errClosed)
	}
	if auc == nil || auc.id != id {
		panic("gnomes: gnome " + itoa(id) + " is not being auctioned")
	}
	t := now()
	if t >= auc.end {
		panic("gnomes: the auction is over")
	}
	sent := unsafe.OriginSend()
	if len(sent) != 1 || sent[0].Denom != payDenom {
		panic("gnomes: a bid is one coin of " + payDenom)
	}
	amount := sent[0].Amount
	if min := minBid(); amount < min {
		panic("gnomes: a bid is at least " + itoa(min) + payDenom)
	}
	if bidder == auc.bidder {
		panic("gnomes: you hold the top bid already")
	}

	// The state first, then the refund.
	prev, prevTop := auc.bidder, auc.top
	auc.bidder, auc.top = bidder, amount
	if auc.end-t < softClose {
		auc.end = t + softClose
	}
	chain.Emit("Bid", "id", itoa(id), "bidder", bidder.String(), "amount", itoa(amount), "end", itoa(auc.end))
	if prev != "" {
		banker.NewBanker(banker.BankerTypeRealmSend, cur).
			SendCoins(cur.Address(), prev, chain.NewCoins(chain.NewCoin(payDenom, prevTop)))
		chain.Emit("Refund", "id", itoa(id), "to", prev.String(), "amount", itoa(prevTop))
	}
}

// Settle closes the auction of id once its end is past: anyone may (the
// caller pays the token's storage deposit). The gnome goes to the winner and
// the bid to the treasury; with no bid, nothing moves and the gnome can be
// auctioned again (unless its sale has closed: then it never will be).
func Settle(cur realm, id int64) {
	if auc == nil || auc.id != id {
		panic(errNoAuction)
	}
	if !mintOpen {
		panic("gnomes: the sale is paused: the auction settles once it resumes")
	}
	if now() < auc.end {
		panic("gnomes: the auction is not over")
	}
	// The state first: the auction is the last one, and none is under way.
	done := *auc
	done.settled = true
	last, auc = &done, nil
	chain.Emit("AuctionSettled", "id", itoa(id), "winner", done.bidder.String(), "amount", itoa(done.top))
	if done.bidder == "" {
		return
	}
	g, _ := gnomeAt(id)
	mintTo(done.bidder, g)
	banker.NewBanker(banker.BankerTypeRealmSend, cur).
		SendCoins(cur.Address(), treasury, chain.NewCoins(chain.NewCoin(payDenom, done.top)))
}

// Sweep sends the treasury whatever ugnot the realm holds beyond the top bid
// in escrow: coins sent with a call that keeps none. Owner only.
func Sweep(cur realm) {
	assertOwner(0, cur)
	held := banker.NewReadonlyBanker().GetCoin(cur.Address(), payDenom)
	if auc != nil {
		held -= auc.top
	}
	if held <= 0 {
		return
	}
	banker.NewBanker(banker.BankerTypeRealmSend, cur).
		SendCoins(cur.Address(), treasury, chain.NewCoins(chain.NewCoin(payDenom, held)))
	chain.Emit("Swept", "amount", itoa(held), "to", treasury.String())
}

// resume moves the auction under way on by the pause that began at since:
// its end later by the time paused, and to at least the soft close from now,
// as a late bid would (a pause may have kept bids out). An auction already
// over when the pause began stays over.
func resume(since int64) {
	if auc == nil || auc.end <= since {
		return
	}
	t := now()
	auc.end += t - since
	if auc.end-t < softClose {
		auc.end = t + softClose
	}
	chain.Emit("AuctionResumed", "id", itoa(auc.id), "end", itoa(auc.end))
}

// minBid is the least the next bid on the auction under way may be.
func minBid() int64 {
	if auc.bidder == "" {
		return auc.reserve
	}
	return minBidOver(auc.top)
}

// minBidOver is top raised by the larger of minRaiseBps of it, rounded up,
// and minRaise. top is at most the ugnot in existence: no overflow.
func minBidOver(top int64) int64 {
	raise := (top*minRaiseBps + 9_999) / 10_000
	if raise < minRaise {
		raise = minRaise
	}
	return top + raise
}

// Auction is the auction under way, else the last one settled, else
// `{"version":1,"id":""}`. "min" is the next bid's least, 0 once no bid is
// taken ("over": past its end, settled or not):
//
//	{"version":1,"id":"104","reserve":777000000,"top":0,"bidder":"",
//	 "end":<unix>,"min":777000000,"over":false,"settled":false}
func Auction() string {
	a := auc
	if a == nil {
		if a = last; a == nil {
			return noneJSON
		}
	}
	over, min := a.settled || now() >= a.end, int64(0)
	if !over {
		min = minBid()
	}
	return `{"version":1,"id":"` + itoa(a.id) + `","reserve":` + itoa(a.reserve) + `,"top":` + itoa(a.top) +
		`,"bidder":` + jsonString(a.bidder.String()) + `,"end":` + itoa(a.end) + `,"min":` + itoa(min) +
		`,"over":` + strconv.FormatBool(over) + `,"settled":` + strconv.FormatBool(a.settled) + `}`
}
