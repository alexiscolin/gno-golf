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

// held is "<holder> <rank><id on 9 digits>" -> "", best first per holder (heldKey).
var held *bptree.BPTree

const errBound = "gnomes: an earned gnome is bound to its player: it cannot be transferred or approved"

func (holdings) ExtensionKind() string { return "gnomes" }

// OnMint keeps an earned gnome's row; a catalogue gnome's is mintTo's, which
// has its row parsed already (a second read of it would cost the sale twice
// its gas).
func (holdings) OnMint(to address, tid grc721.TokenID) {
	if id := parseID(string(tid)); isEarned(id) {
		held.Set(heldKey(to, id, len(tiers)), "")
	}
}

func (holdings) OnTransfer(from, to address, tid grc721.TokenID) {
	id := parseID(string(tid))
	if isEarned(id) {
		panic(errBound)
	}
	r := rankOf(id)
	held.Remove(heldKey(from, id, r))
	held.Set(heldKey(to, id, r), "")
	unequip(from, string(tid))
}

func (holdings) OnBurn(tid grc721.TokenID) {} // Burn clears what is the burner's

// heldKey sorts a holder's rows best first: the rank of the gnome's tier
// (the last tier 0, down the tiers, an earned gnome last), then its id
// padded. So a holder's first row is the gnome they wear by default (Worn),
// and their pages come as their team is shown, Legendary first.
func heldKey(holder address, id int64, rank int) string {
	s := itoa(id)
	return holder.String() + " " + string(rune('0'+rank)) + strings.Repeat("0", 9-len(s)) + s
}

// rankOfTier is where a tier sorts in a holder's rows: 0 is the best.
func rankOfTier(t int) int {
	if t == earnedTier {
		return len(tiers)
	}
	return len(tiers) - 1 - t
}

// rankOf is rankOfTier of gnome id, read from its row: a transfer's and a
// burn's, which have only the id.
func rankOf(id int64) int {
	g, ok := tokenAt(id)
	if !ok {
		return len(tiers)
	}
	return rankOfTier(g.tier)
}

// heldPage is up to n of holder's ids from offset, best first (heldKey),
// and whether more follow. It walks the holder's own rows only, from their
// first: a holder has their caps, their earned gnomes and what they were
// sent.
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
			ids = append(ids, parseID(strings.TrimLeft(key[len(prefix)+1:], "0")))
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
