package gnomes

import (
	"testing"

	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

// The review of 1b10df4: each finding's test.

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

