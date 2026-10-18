package gnomes

import "gno.land/r/gnogolf/store"

// hasRecord reports whether addr has a standing on the course, in either
// mode: what a sale's player window asks. golf/v2 keeps one per player in
// store's "totals" ("assisted <addr>", "pro <addr>") from their first
// finished hole on; v1's records were copied in. A read only: this realm
// never writes to store, and store and golf/v2 never read this one.
func hasRecord(addr address) bool {
	return store.Has("totals", "assisted "+addr.String()) || store.Has("totals", "pro "+addr.String())
}
