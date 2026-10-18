package gnomes

import (
	"chain/runtime/unsafe"
	"strings"

	"gno.land/p/nt/grc721/v0"
)

// The pages gnoweb shows: the collection (""), a gnome ("<id>"), an earned
// kind ("<kind>"), a player ("<address>"). Every string on them comes from
// the catalogue, the config or an address; names are the owner's rows, held
// to plain letters by AddSeries (rows.gno plainName), and escaped as Markdown
// wherever they go all the same (markdownEscape).

// self is this realm's pkgpath, hub its gnoweb path: every link follows
// from them, so the same code serves under any namespace.
var (
	self = unsafe.CurrentRealm().PkgPath()
	hub  = strings.TrimPrefix(self, "gno.land")
)

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
		"Every gnome sells at its sale's fixed price, to the first who buys it; the nine earned gnomes are minted free once the chain proves the feat.\n\n")
	if !mintOpen {
		b.WriteString("Sales are paused.\n\n")
	}
	if !earnedOpen {
		b.WriteString("Earned gnomes are paused.\n\n")
	}
	if closeAt != 0 {
		verb := "closes"
		if genesisClosed() {
			verb = "closed"
		}
		b.WriteString("The genesis sale " + verb + " on " + dateOf(closeAt) + ".\n\n")
	}
	b.WriteString("## Sale\n\n| series | gnomes | opens | common / rare / epic / legendary | found a player |\n|---|---|---|---|---|\n")
	for _, s := range sales {
		c := catalogue[seriesNamed(s.series)]
		b.WriteString("| " + s.series + " | " + itoa(c.first) + "–" + itoa(c.last) + " | " + dateOf(s.start) + " | " +
			wholeGNOT(s.prices[0]) + " / " + wholeGNOT(s.prices[1]) + " / " + wholeGNOT(s.prices[2]) + " / " + gnot(s.prices[3]) + " | " +
			itoa(soldIn(c.first, c.last)) + " of " + itoa(c.last-c.first+1) + " |\n")
	}
	return b.String()
}

func renderGnome(tid string, g gnome) string {
	var b strings.Builder
	name := markdownEscape(g.name)
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
		b.WriteString("Equipped: [" + markdownEscape(g.name) + "](" + hub + ":" + v.(string) + ")\n\n")
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

// markdownEscape writes s as Markdown text: every ASCII punctuation mark
// backslashed, which CommonMark reads as the mark itself, so a name can
// never close a link's brackets, open an image or a tag, nor start an
// entity, wherever it goes (a title, an alt text, a link's text).
func markdownEscape(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= '!' && c <= '/' || c >= ':' && c <= '@' || c >= '[' && c <= '`' || c >= '{' && c <= '~' {
			b.WriteByte('\\')
		}
		b.WriteByte(c)
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
