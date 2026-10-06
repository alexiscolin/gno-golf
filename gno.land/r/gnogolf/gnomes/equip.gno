package gnomes

import (
	"chain"
	"strings"

	"gno.land/p/nt/grc721/v0"
)

// The gnome a player plays as. The game reads Equipped (once a visit) and
// EquippedMany (once a board page), and dresses the ball from the traits.

// maxPlayers bounds EquippedMany.
const maxPlayers = 50

// Equip wears gnome tid, which the caller must own; "" takes it off.
func Equip(cur realm, tid string) {
	caller := cur.Previous().Address()
	if tid == "" {
		equipped.Remove(caller.String())
	} else {
		if o, err := Token.OwnerOf(grc721.TokenID(tid)); err != nil || o != caller {
			panic(errNotYours)
		}
		equipped.Set(caller.String(), tid)
	}
	chain.Emit("Equipped", "player", caller.String(), "id", tid)
}

// Equipped is the gnome player wears, "" for none. A gnome sold on since is
// no longer worn: ownership is checked on read.
//
//	{"version":1,"player":"g1…","id":"104","name":"…","tier":"legendary","traits":"…"}
func Equipped(player address) string {
	if row := equippedRow(player); row != "" {
		return `{"version":1,` + row
	}
	return ""
}

// equippedRow is Equipped's fields after its version, "" for none.
func equippedRow(player address) string {
	v := equipped.Get(player.String())
	if v == nil {
		return ""
	}
	tid := v.(string)
	if o, err := Token.OwnerOf(grc721.TokenID(tid)); err != nil || o != player {
		return ""
	}
	g, ok := tokenAt(parseID(tid))
	if !ok {
		return ""
	}
	return `"player":` + jsonString(player.String()) + `,"id":"` + tid + `","name":` + jsonString(g.name) +
		`,"tier":"` + tierName(g.tier) + `","traits":` + jsonString(g.traits) + `}`
}

// EquippedMany is Equipped for the first 50 players of a comma-separated
// list, those who wear one: {"version":1,"rows":[<Equipped's fields>, …]}.
// Repeats and non-addresses are skipped, and count toward the 50, so the
// walk stays short whatever the list.
func EquippedMany(players string) string {
	var b strings.Builder
	b.WriteString(`{"version":1,"rows":[`)
	n := 0
	seen := map[string]bool{}
	for i, p := range strings.SplitN(players, ",", maxPlayers+1) {
		if i == maxPlayers || players == "" {
			break
		}
		if seen[p] || !address(p).IsValid() {
			continue
		}
		seen[p] = true
		if row := equippedRow(address(p)); row != "" {
			if n > 0 {
				b.WriteString(",")
			}
			b.WriteString("{" + row)
			n++
		}
	}
	b.WriteString("]}")
	return b.String()
}
