package gnomes

import (
	"chain/runtime/unsafe"
	"strings"

	"gno.land/p/nt/grc721/v0"
)

// The pages gnoweb shows: the collection (""), a gnome ("<id>"), an earned
// kind ("<kind>"), a player ("<address>"). Every string on them comes from
// the catalogue, the config or an address; names are the owner's rows, and
// escaped where they go into markup.

// self is this realm's pkgpath, hub its gnoweb path: every link and the bid
// line follow from them, so the same code serves under any namespace.
var (
	self = unsafe.CurrentRealm().PkgPath()
	hub  = strings.TrimPrefix(self, "gno.land")
)

// bidGas is the gas a bid line asks (a bid writes one auction and sends one
// refund), with room to spare.
const bidGas = 50_000_000

func Render(path string) string {
	switch {
	case path == "":
		return renderHome()
	case kindIndex(path) > 0:
		return renderKind(path)
	case address(path).IsValid():
		return renderPlayer(address(path))
	}
	if g, ok := tokenAt(parseID(path)); ok {
		return renderGnome(path, g)
	}
	return "# Not found\n\n[The collection](" + hub + ")\n"
}

func renderHome() string {
	var b strings.Builder
	b.WriteString("# Gnogolf Gnomes\n\nThe ball you play Gnogolf with, as a token: chosen by its number, seen before it is paid for, cosmetic only. " +
		"Common, Rare and Epic gnomes sell at a fixed price, Legendaries by auction, one at a time; the nine earned gnomes are minted free once the chain proves the feat.\n\n")
	if !mintOpen {
		b.WriteString("Sales are paused.\n\n")
	}
	if closeAt != 0 {
		verb := "closes"
		if genesisClosed() {
			verb = "closed"
		}
		b.WriteString("The genesis sale " + verb + " on " + dateOf(closeAt) + ".\n\n")
	}
	b.WriteString("## Waves\n\n| wave | gnomes | opens | common / rare / epic | found a player |\n|---|---|---|---|---|\n")
	for i, w := range waves {
		sold := soldIn(w.first, w.last)
		b.WriteString("| " + itoa(int64(i+1)) + " | " + itoa(w.first) + "–" + itoa(w.last) + " | " + dateOf(w.start) + " | " +
			wholeGNOT(w.prices[0]) + " / " + wholeGNOT(w.prices[1]) + " / " + gnot(w.prices[2]) + " | " +
			itoa(sold) + " of " + itoa(w.last-w.first+1) + " |\n")
	}
	b.WriteString("\n## Auction\n\n")
	a := auc
	switch {
	case a != nil:
		g, _ := gnomeAt(a.id)
		b.WriteString("[" + xmlEscape(g.name) + "](" + hub + ":" + itoa(a.id) + "), until " + dateOf(a.end) + ". ")
		if a.bidder != "" {
			b.WriteString("Top bid: " + gnot(a.top) + ". ")
		}
		if now() < a.end {
			b.WriteString("Minimum bid: " + gnot(minBid()) + ".\n\n    gnokey maketx call -pkgpath " + self + " -func Bid -args " + itoa(a.id) +
				" -send " + itoa(minBid()) + "ugnot -gas-fee 1000000ugnot -gas-wanted " + itoa(bidGas) +
				" -broadcast -chainid <chain-id> -remote <rpc-url> <your-key-name>\n")
		} else {
			b.WriteString("Over: anyone may settle it.\n")
		}
	case last != nil:
		g, _ := gnomeAt(last.id)
		b.WriteString("The last: [" + xmlEscape(g.name) + "](" + hub + ":" + itoa(last.id) + "), settled.\n")
	default:
		b.WriteString("No auction yet.\n")
	}
	return b.String()
}

func renderGnome(tid string, g gnome) string {
	var b strings.Builder
	name := xmlEscape(g.name)
	b.WriteString("# " + name + "\n\n")
	b.WriteString("![" + name + "](" + portrait(g) + ")\n\n")
	b.WriteString("Gnome " + tid + ", " + tierName(g.tier) + ", of the " + g.series + " series.\n\n")
	if o, err := Token.OwnerOf(grc721.TokenID(tid)); err == nil {
		b.WriteString("Owner: " + o.String() + "\n")
	} else if isSold(g.id) {
		b.WriteString("Burned.\n")
	} else if isClosed(g.id) {
		b.WriteString("Unsold when its sale closed: never minted.\n")
	} else {
		b.WriteString("Unsold.\n")
	}
	return b.String()
}

func renderKind(kind string) string {
	k := kindIndex(kind)
	return "# " + earnedNames[k-1] + "\n\nEarned in play: " + earnedNeeds[k-1] +
		". Minted free once the chain proves it (MintEarned), bound to its player.\n"
}

func renderPlayer(player address) string {
	var b strings.Builder
	b.WriteString("# " + player.String() + "\n\n")
	if v := equipped.Get(player.String()); v != nil && Equipped(player) != "" {
		g, _ := tokenAt(parseID(v.(string)))
		b.WriteString("Equipped: [" + xmlEscape(g.name) + "](" + hub + ":" + v.(string) + ")\n\n")
	}
	ids, more := heldPage(player, 0, pageSize)
	for _, id := range ids {
		b.WriteString("- [#" + itoa(id) + "](" + hub + ":" + itoa(id) + ")\n")
	}
	if more {
		b.WriteString("- …\n")
	}
	return b.String()
}

// wholeGNOT is a price as its number of GNOT alone ("30"), for a row of
// prices; gnot the full amount ("815.85 GNOT").
func wholeGNOT(ugnot int64) string { return strings.TrimSuffix(gnot(ugnot), " GNOT") }

func gnot(ugnot int64) string {
	s := itoa(ugnot / 1_000_000)
	if frac := ugnot % 1_000_000; frac != 0 {
		f := itoa(frac + 1_000_000)[1:]
		s += "." + strings.TrimRight(f, "0")
	}
	return s + " GNOT"
}
