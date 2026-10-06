package gnomes

import (
	"strings"
	"testing"

	"gno.land/p/nt/uassert/v0"
)

func has(t *testing.T, page, want string) {
	t.Helper()
	uassert.True(t, strings.Contains(page, want), "wants "+want+" in:\n"+page)
}

func TestThePagesGnowebShows(cur realm, t *testing.T) {
	fresh(t, cur)
	home := Render("")
	has(t, home, "# Gnogolf Gnomes")
	has(t, home, "| 1 | 1–720 | "+dateOf(waves[0].start)+" | 36 / 72 / 336 / 1296 GNOT | 0 of 720 |")

	g := Render("104")
	has(t, g, "# Gnome 104")
	has(t, g, "![Gnome 104](data:image/svg+xml;base64,")
	has(t, g, "legendary")
	has(t, g, "Unsold")

	has(t, Render("viking"), "Garden Cup at par or under")
	has(t, Render("nope"), "Not found")
	has(t, Render("0"), "Not found")

	testing.SetRealm(asUser(alice, ugnot(priceOf(1))))
	Buy(cross(cur), "1")
	Equip(cross(cur), "1")
	p := Render(alice.String())
	uassert.Equal(t, "/r/gnogolf/gnomes", hub)
	has(t, p, "Equipped: [Gnome 1](/r/gnogolf/gnomes:1)")
	has(t, p, "[#1](/r/gnogolf/gnomes:1)")
	has(t, Render("1"), "Owner: "+alice.String())
	has(t, Render(""), "| 1 | 1–720 | "+dateOf(waves[0].start)+" | 36 / 72 / 336 / 1296 GNOT | 1 of 720 |")
}

func TestTheHomeSaysTheClose(cur realm, t *testing.T) {
	fresh(t, cur)
	testing.SetRealm(asUser(deployer, nil))
	SetCloseAt(cross(cur), now()+30*24*3600)
	home := Render("")
	has(t, home, "to the first who buys it")
	has(t, home, "The genesis sale closes on "+dateOf(closeAt))
}

func TestGNOTIsWrittenPlainly(t *testing.T) {
	uassert.Equal(t, "30 GNOT", gnot(30_000_000))
	uassert.Equal(t, "815.85 GNOT", gnot(815_850_000))
	uassert.Equal(t, "0.000001 GNOT", gnot(1))
}
