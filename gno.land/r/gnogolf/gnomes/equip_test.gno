package gnomes

import (
	"testing"

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
