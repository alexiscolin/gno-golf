package gnomes

import (
	"chain"
	"strings"

	"gno.land/p/gnogolf/jsonq"
	"gno.land/p/nt/grc721/v0"
)

// The gnome a player plays as. Wearing is free: a player wears their best
// gnome (the highest tier they hold, then its lowest id) unless they put
// another on for everyone with Equip, the one call here that costs. The
// game reads Worn (once a visit) and WornMany (once a board page, a rival),
// and dresses the ball from the traits; Equipped is what was put on alone.

// maxPlayers bounds WornMany.
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
	return `"player":` + jsonq.Quote(player.String()) + `,"id":"` + tid + `","name":` + jsonq.Quote(g.name) +
		`,"tier":"` + tierName(g.tier) + `","traits":` + jsonq.Quote(g.traits) + `}`
}

// Worn is the gnome player wears for everyone: the one put on with Equip
// while they still hold it, else their best (their first row: heldKey), ""
// for none. "equipped" says which. One row read either way.
//
//	{"version":1,"player":"g1…","id":"104","name":"…","tier":"legendary","traits":"…","equipped":false}
func Worn(player address) string {
	if row := wornRow(player); row != "" {
		return `{"version":1,` + row
	}
	return ""
}

// wornRow is Worn's fields after its version, "" for none.
func wornRow(player address) string {
	if row := equippedRow(player); row != "" {
		return row[:len(row)-1] + `,"equipped":true}`
	}
	ids, _ := heldPage(player, 0, 1)
	if len(ids) == 0 {
		return ""
	}
	g, ok := tokenAt(ids[0])
	if !ok {
		return ""
	}
	return `"player":` + jsonq.Quote(player.String()) + `,"id":"` + itoa(g.id) + `","name":` + jsonq.Quote(g.name) +
		`,"tier":"` + tierName(g.tier) + `","traits":` + jsonq.Quote(g.traits) + `,"equipped":false}`
}

// WornMany is Worn for the first 50 players of a comma-separated list, those
// who wear one: {"version":1,"rows":[<Worn's fields>, …]}. Repeats and
// non-addresses are skipped, and count toward the 50, so the walk stays
// short whatever the list.
func WornMany(players string) string {
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
		if r := wornRow(address(p)); r != "" {
			if n > 0 {
				b.WriteString(",")
			}
			b.WriteString("{" + r)
			n++
		}
	}
	b.WriteString("]}")
	return b.String()
}
