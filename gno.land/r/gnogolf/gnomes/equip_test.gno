package gnomes

import (
	"strings"
	"testing"

	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

func equippedJSON(player address, id int64) string {
	g := mustGnome(id)
	return `{"version":1,"player":"` + player.String() + `","id":"` + itoa(id) + `","name":"` + g.name +
		`","tier":"` + tiers[g.tier].name + `","traits":"` + g.traits + `"}`
}

func TestEquipWearsAGnomeTheCallerOwns(cur realm, t *testing.T) {
	fresh(t, cur)
	uassert.Equal(t, "", Equipped(alice))

	id := common()
	testing.SetRealm(asUser(alice, ugnot(priceOf(id))))
	tid := Buy(cross(cur), itoa(id))
	testing.SetRealm(asUser(alice, nil))
	Equip(cross(cur), tid)
	uassert.Equal(t, equippedJSON(alice, id), Equipped(alice))

	testing.SetRealm(asUser(bob, nil))
	urequire.AbortsContains(t, cur, "not your gnome", func() { Equip(cross(cur), tid) })
	urequire.AbortsContains(t, cur, "not your gnome", func() { Equip(cross(cur), "nope") })

	testing.SetRealm(asUser(alice, nil))
	Equip(cross(cur), "") // takes it off
	uassert.Equal(t, "", Equipped(alice))
}

func TestAGnomeSoldIsNoLongerWorn(cur realm, t *testing.T) {
	fresh(t, cur)
	id := common()
	testing.SetRealm(asUser(alice, ugnot(priceOf(id))))
	tid := Buy(cross(cur), itoa(id))
	testing.SetRealm(asUser(alice, nil))
	Equip(cross(cur), tid)
	TransferFrom(cross(cur), alice, bob, tid)

	uassert.Equal(t, "", Equipped(alice), "the seller no longer wears it")
	uassert.False(t, equipped.Has(alice.String()), "nor keeps a row for it")
	uassert.Equal(t, "", Equipped(bob), "the buyer has not put it on")
	testing.SetRealm(asUser(bob, nil))
	Equip(cross(cur), tid)
	uassert.Equal(t, equippedJSON(bob, id), Equipped(bob))
}

// A board page asks for its players at once: repeats and junk are skipped,
// and the list is bounded.
func TestEquippedManyAnswersABoardPage(cur realm, t *testing.T) {
	fresh(t, cur)
	id := common()
	testing.SetRealm(asUser(alice, ugnot(priceOf(id))))
	tid := Buy(cross(cur), itoa(id))
	testing.SetRealm(asUser(alice, nil))
	Equip(cross(cur), tid)

	row := strings.Replace(equippedJSON(alice, id), `{"version":1,`, "{", 1)
	uassert.Equal(t, `{"version":1,"rows":[`+row+`]}`,
		EquippedMany(alice.String()+","+bob.String()+",junk,"+alice.String()))
	uassert.Equal(t, `{"version":1,"rows":[]}`, EquippedMany(""))

	// past the first 50 players (repeats and junk count, so the walk stays
	// short), the rest are not read
	many := ""
	for i := 0; i < maxPlayers; i++ {
		many += testutils.TestAddress("p"+itoa(int64(i))).String() + ","
	}
	uassert.Equal(t, `{"version":1,"rows":[]}`, EquippedMany(many+alice.String()))
	uassert.Equal(t, `{"version":1,"rows":[`+row+`]}`, EquippedMany(alice.String()+","+many))
}
