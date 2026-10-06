package gnomes

import (
	"strconv"
	"strings"

	"gno.land/p/nt/bptree/v0"
)

// The gnome others see a player wear (ADR-007): the one they equipped,
// while they own it, else their best owned, else none. Wearing costs
// nothing: every client works it out from this one read, and Equip is only
// for showing others another gnome than the best. A player plays any gnome
// they own for themselves in the browser, with no call at all.

// byBest is each holder's gnomes, best first: "<holder> <rank> <id on 9
// digits>" -> "", rank 0 for a Legendary, 1 an Epic, 2 a Rare, 3 a Common, 4
// an earned gnome, so a holder's first row is the gnome they wear when none
// is equipped. Kept beside held by the ledger extension and Burn.
var byBest *bptree.BPTree

// bestKey is g's row in byBest for holder.
func bestKey(holder address, g gnome) string {
	rank := len(tiers) // an earned gnome, after every tier
	if g.tier != earnedTier {
		rank = len(tiers) - 1 - g.tier
	}
	s := itoa(g.id)
	return holder.String() + " " + strconv.Itoa(rank) + " " + strings.Repeat("0", 9-len(s)) + s
}

// Worn is the gnome player wears for everyone, "" when they own none:
//
//	{"version":1,"player":"g1…","id":"104","name":"…","tier":"legendary",
//	 "traits":"…","equipped":false}
//
// "equipped" says whether they chose it (Equip) or it is their best.
func Worn(player address) string {
	if row := wornRow(player); row != "" {
		return `{"version":1,` + row
	}
	return ""
}

// wornRow is Worn's fields after its version, "" for none.
func wornRow(player address) string {
	if v := equipped.Get(player.String()); v != nil {
		if row := equippedRow(player); row != "" {
			return strings.TrimSuffix(row, "}") + `,"equipped":true}`
		}
	}
	key := ""
	prefix := player.String() + " "
	byBest.Iterate(prefix, player.String()+"!", func(k string, _ any) bool {
		key = k
		return true
	})
	if key == "" {
		return ""
	}
	g, ok := tokenAt(parseID(strings.TrimLeft(key[strings.LastIndexByte(key, ' ')+1:], "0")))
	if !ok {
		return ""
	}
	return wearerFields(player, g) + `,"equipped":false}`
}

// WornMany is Worn for the first 50 players of a comma-separated list, those
// who wear one, as EquippedMany: a board's page, a duel's ghosts, in one
// read. {"version":1,"rows":[<Worn's fields>, …]}
func WornMany(players string) string { return rowsFor(players, wornRow) }
