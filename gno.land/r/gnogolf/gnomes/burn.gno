package gnomes

import "gno.land/p/nt/grc721/v0"

// Burn destroys a gnome the caller holds; its deposit returns to them. Only
// the holder burns: an approved operator cannot. A sold id stays sold, never
// sold again; an earned kind can be minted again by its player, under a new
// id. The cleanup is here, before the ledger's burn, which removes the owner
// before its hook runs and gives the hook the id alone; if the burn panics,
// the call reverts with the cleanup.
func Burn(cur realm, tid string) {
	caller := cur.Previous().Address()
	if o, err := Token.OwnerOf(grc721.TokenID(tid)); err != nil || o != caller {
		panic(errNotYours)
	}
	id := parseID(tid)
	held.Remove(heldKey(caller, id))
	if g, ok := tokenAt(id); ok { // before an earned gnome's kind goes, below
		byBest.Remove(bestKey(caller, g))
	}
	unequip(caller, tid)
	if v := kindOf.Get(tid); v != nil {
		kindOf.Remove(tid)
		earned.Remove(caller.String() + " " + v.(string))
	}
	if err := ledger.Burn(grc721.TokenID(tid)); err != nil {
		panic(err)
	}
}
