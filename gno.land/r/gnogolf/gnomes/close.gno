package gnomes

import (
	"chain"
	"errors"
	"time"
)

// The genesis sale's closing date (ADR-007): none at deploy, and the
// genesis is not sold until the owner sets one, once it is published: the
// sale does not open (SetMintOpen) and the genesis's sale is not opened
// (OpenSale) before it, so a buyer always knows when the sale ends. Once set it comes
// forward, never back: a buyer can count on the date
// announced, and on no gnome of the genesis being sold after it. The
// genesis's sale starts before it. From that block on, its unsold gnomes are
// closed for good: Buy and OpenSale refuse them, and the genesis's final
// supply is what was sold (Collection's "sold"). A later series is not closed by
// it, and earned gnomes never are. 0 is no date set.
var closeAt int64

// CloseAt is the genesis sale's closing date (unix seconds, block time), 0
// before one is set.
func CloseAt() int64 { return closeAt }

// SetCloseAt sets the genesis sale's closing date, or brings it forward:
// later than the one set is refused, as is a date not in the future or one
// already reached, and one at or before the start of the genesis's sale yet
// to start (it would never sell). Owner only, once
// the genesis is published.
func SetCloseAt(cur realm, at int64) {
	assertOwner(0, cur)
	if len(catalogue) == 0 {
		panic("gnomes: publish the genesis first")
	}
	if genesisClosed() {
		panic("gnomes: the genesis sale closed on " + dateOf(closeAt))
	}
	if at <= now() {
		panic("gnomes: a closing date is in the future")
	}
	if closeAt != 0 && at > closeAt {
		panic("gnomes: the closing date comes forward, never later than " + dateOf(closeAt))
	}
	if i := saleOf(genesisName); i >= 0 && sales[i].start >= at {
		panic("gnomes: the genesis sale starts on " + dateOf(sales[i].start) + ": the close comes after it")
	}
	closeAt = at
	chain.Emit("CloseAtSet", "at", itoa(at))
}

// genesisClosed reports whether the genesis sale has closed: at its date's
// block on.
func genesisClosed() bool { return closeAt != 0 && now() >= closeAt }

// isClosed reports whether gnome id was left unsold by a closed sale.
func isClosed(id int64) bool {
	return genesisClosed() && seriesAt(id) == 0 && !isSold(id)
}

// errNoClose refuses the genesis's sale before its closing date is set.
const errNoClose = "gnomes: the genesis sells only once its closing date is set (SetCloseAt)"

func errClosedOn() string { return "gnomes: the genesis sale closed on " + dateOf(closeAt) }

// checkCloseFor checks a sale of series si from start against the close:
// for the genesis (the first series), none before a date is set, none once
// it has closed, nor one starting at or after it, which nobody could buy
// from.
func checkCloseFor(si int, start int64) error {
	switch {
	case si != 0:
		return nil
	case closeAt == 0:
		return errors.New(errNoClose)
	case genesisClosed():
		return errors.New(errClosedOn())
	case start >= closeAt:
		return errors.New("gnomes: the genesis sale starts before it closes, on " + dateOf(closeAt))
	}
	return nil
}

// dateOf writes a unix time as "2026-11-30 18:00 UTC".
func dateOf(t int64) string { return time.Unix(t, 0).UTC().Format("2006-01-02 15:04 UTC") }
