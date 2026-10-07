package gnomes

import (
	"chain"
	"errors"
	"time"
)

// The genesis sale's closing date (ADR-007). The owner sets it once the
// genesis is published, before any wave and before the sale opens, and may
// bring it forward, never push it back: a buyer can count on the date
// announced, and on no gnome of the genesis being sold after it. No genesis
// wave starts at or after it. From that block on, its unsold gnomes are
// closed for good: Buy and AddWave refuse them, and the genesis's final
// supply is what was sold (Collection's "sold"). A later series is not closed by
// it, and earned gnomes never are. 0 is no date set.
var closeAt int64

// CloseAt is the genesis sale's closing date (unix seconds, block time), 0
// before one is set.
func CloseAt() int64 { return closeAt }

// SetCloseAt sets the genesis sale's closing date, or brings it forward:
// later than the one set is refused, as is a date not in the future or one
// already reached. Owner only, once the genesis is published.
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

const errNoClose = "gnomes: set the genesis sale's closing date first"

// checkCloseFor checks a wave of ids from first, from start, against the
// close: no wave until its date is set; for the genesis's ids (the first
// series: a range is the genesis's when its first id is), none once it has
// closed, nor one starting at or after it, which nobody could buy from.
func checkCloseFor(first, start int64) error {
	switch {
	case closeAt == 0:
		return errors.New(errNoClose)
	case seriesAt(first) != 0:
		return nil
	case genesisClosed():
		return errors.New(errClosedOn())
	case start >= closeAt:
		return errors.New("gnomes: a genesis wave starts before the genesis sale closes, on " + dateOf(closeAt))
	}
	return nil
}

// dateOf writes a unix time as "2026-11-30 18:00 UTC".
func dateOf(t int64) string { return time.Unix(t, 0).UTC().Format("2006-01-02 15:04 UTC") }
