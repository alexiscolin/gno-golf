package gnomes

import (
	"strings"

	"gno.land/p/nt/bptree/v0"
	"gno.land/p/nt/grc721/v0"
)

// Who holds what, kept by the ledger itself: an extension it calls on every
// mint and transfer. It keeps the locker's index (GnomesOf), drops the gnome
// a holder wore when it leaves them, and refuses to move an earned gnome:
// grc721 runs it after its own write, and its panic reverts the movement.
// A burn's cleanup is in Burn: grc721 removes the owner before OnBurn and
// gives it the id alone. Its rows are in a bptree, not grc721/enumerable's
// lists: measured, enumerable added 5 to 9 KB to a buy (z_storage_buy).
type holdings struct{}

var _ grc721.Extension = holdings{}

// held is "<holder> <id on 9 digits>" -> "", in id order per holder.
var held *bptree.BPTree

const errBound = "gnomes: an earned gnome is bound to its player: it cannot be transferred or approved"

func (holdings) ExtensionKind() string { return "gnomes" }

// (a mint's byBest row is written by mintTo and MintEarned, which hold the
// gnome already: looking its row up again here would cost a parse a mint)
func (holdings) OnMint(to address, tid grc721.TokenID) {
	held.Set(heldKey(to, parseID(string(tid))), "")
}

func (holdings) OnTransfer(from, to address, tid grc721.TokenID) {
	id := parseID(string(tid))
	if isEarned(id) {
		panic(errBound)
	}
	held.Remove(heldKey(from, id))
	held.Set(heldKey(to, id), "")
	if g, ok := tokenAt(id); ok {
		byBest.Remove(bestKey(from, g))
		byBest.Set(bestKey(to, g), "")
	}
	unequip(from, string(tid))
}

func (holdings) OnBurn(tid grc721.TokenID) {} // Burn clears what is the burner's

// heldKey pads the id so that a holder's rows sort by id.
func heldKey(holder address, id int64) string {
	s := itoa(id)
	return holder.String() + " " + strings.Repeat("0", 9-len(s)) + s
}

// heldPage is up to n of holder's ids from offset, in id order, and whether
// more follow. It walks the holder's own rows only, from their first: a
// holder has their caps, the auctions they won, their earned gnomes and
// what they were sent.
func heldPage(holder address, offset int64, n int) ([]int64, bool) {
	var ids []int64
	more, i := false, int64(0)
	prefix := holder.String() + " "
	held.Iterate(prefix, holder.String()+"!", func(key string, _ any) bool {
		if i >= offset {
			if len(ids) == n {
				more = true
				return true
			}
			ids = append(ids, parseID(strings.TrimLeft(key[len(prefix):], "0")))
		}
		i++
		return false
	})
	return ids, more
}

// unequip drops player's equipped gnome when it is tid.
func unequip(player address, tid string) {
	if v := equipped.Get(player.String()); v != nil && v.(string) == tid {
		equipped.Remove(player.String())
	}
}

// seeded is a tree whose first leaf the deployer pays, not its first
// player, as store's are: its key "" sorts before every other and no read
// shows it.
func seeded() *bptree.BPTree {
	t := bptree.NewBPTree32()
	t.Set("", "")
	return t
}
