package gnomes

import (
	"chain"
	"errors"
	"time"
)

// The genesis sale's closing date (ADR-007): optional. None at deploy, and
// the genesis may be sold without one: it then sells until sold out. The
// owner may set one later, once the genesis is published; once set it comes
// forward, never back, and is never removed: a buyer can count on the date
// announced, and on no gnome of the genesis being sold after it. The
// genesis's sale starts before it. From that block on, its unsold gnomes are
// closed for good: Buy and OpenSale refuse them, and the genesis's final
// supply is what was sold (Collection's "sold"). A later series is not closed by
// it, and earned gnomes never are. 0 is no date set: never closes.
var closeAt int64

// closeNotice is the least notice of a close (or of one brought forward):
// a buyer of a sale with no date, or with a later one, is never surprised.
const closeNotice int64 = 7 * 24 * 3600

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
	if at < now()+closeNotice {
		panic("gnomes: a closing date is announced at least 7 days ahead")
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

func errClosedOn() string { return "gnomes: the genesis sale closed on " + dateOf(closeAt) }

// checkCloseFor checks a sale of series si from start against the close:
// for the genesis (the first series), none once it has closed, nor one
// starting at or after a date set, which nobody could buy from. No date set
// holds nothing: the genesis then sells until sold out.
func checkCloseFor(si int, start int64) error {
	switch {
	case si != 0:
		return nil
	case genesisClosed():
		return errors.New(errClosedOn())
	case closeAt != 0 && start >= closeAt:
		return errors.New("gnomes: the genesis sale starts before it closes, on " + dateOf(closeAt))
	}
	return nil
}

// dateOf writes a unix time as "2026-11-30 18:00 UTC".
func dateOf(t int64) string { return time.Unix(t, 0).UTC().Format("2006-01-02 15:04 UTC") }
