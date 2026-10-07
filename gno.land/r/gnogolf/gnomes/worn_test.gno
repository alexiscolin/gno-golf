package gnomes

import (
	"strings"
	"testing"

	"gno.land/p/nt/grc721/v0"
	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
)

// Wearing is free (ADR-007): every player wears their best gnome, the
// highest tier they hold then its lowest id, unless they put another on for
// everyone with Equip. Worn says which, in one cheap read: the holder's
// rows sort best first, so it reads one row.

func wornJSON(player address, id int64, put bool) string {
	g, _ := tokenAt(id)
	return `{"version":1,"player":"` + player.String() + `","id":"` + itoa(id) + `","name":"` + g.name +
		`","tier":"` + tierName(g.tier) + `","traits":"` + g.traits + `","equipped":` + boolString(put) + `}`
}

func boolString(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

func TestAPlayerWearsTheirBestGnome(cur realm, t *testing.T) {
	fresh(t, cur)
	uassert.Equal(t, "", Worn(alice), "none held: none worn")

	c2, c1, r, e := nthOfTier(0, 1), common(), nthOfTier(1, 0), nthOfTier(2, 0)
	mintTo(alice, mustGnome(c2))
	uassert.Equal(t, wornJSON(alice, c2, false), Worn(alice))
	mintTo(alice, mustGnome(c1))
	uassert.Equal(t, wornJSON(alice, c1, false), Worn(alice), "the lowest id of a tier")
	mintTo(alice, mustGnome(r))
	uassert.Equal(t, wornJSON(alice, r, false), Worn(alice), "a Rare over the Commons")
	mintTo(alice, mustGnome(e))
	uassert.Equal(t, wornJSON(alice, e, false), Worn(alice), "an Epic over a Rare")
	mintTo(alice, mustGnome(legend()))
	uassert.Equal(t, wornJSON(alice, legend(), false), Worn(alice), "the Legendary over all")

	// the locker's pages come best first too: the team's own order
	p := GnomesOf(alice, 0)
	order := []int64{legend(), e, r, c1, c2}
	at := -1
	for _, id := range order {
		i := strings.Index(p, `{"id":"`+itoa(id)+`"`)
		uassert.True(t, i > at, "GnomesOf best first: "+itoa(id))
		at = i
	}
	got, _ := TokenOfOwnerByIndex(alice, 0)
	uassert.Equal(t, itoa(legend()), got)
}

func TestEquipShowsAnotherGnomeToEveryone(cur realm, t *testing.T) {
	fresh(t, cur)
	c, r := common(), nthOfTier(1, 0)
	mintTo(alice, mustGnome(c))
	mintTo(alice, mustGnome(r))
	testing.SetRealm(asUser(alice, nil))
	Equip(cross(cur), itoa(c))
	uassert.Equal(t, wornJSON(alice, c, true), Worn(alice), "the one put on, not the best")

	TransferFrom(cross(cur), alice, bob, itoa(c))
	uassert.Equal(t, wornJSON(alice, r, false), Worn(alice), "sold on: back to the best held")
	uassert.Equal(t, wornJSON(bob, c, false), Worn(bob), "the buyer wears his best")

	Equip(cross(cur), "")
	uassert.Equal(t, wornJSON(alice, r, false), Worn(alice))
}

func TestAnEarnedGnomeIsWornLast(cur realm, t *testing.T) {
	fresh(t, cur)
	c := common()
	mintTo(alice, mustGnome(c))
	k := mintEarnedFor(alice, 1)
	uassert.Equal(t, wornJSON(alice, c, false), Worn(alice), "a bought gnome over an earned one")
	testing.SetRealm(asUser(alice, nil))
	Burn(cross(cur), itoa(c))
	uassert.Equal(t, "", Equipped(alice))
	uassert.Equal(t, wornJSON(alice, k, false), Worn(alice), "the earned one when it is all")
}

func TestWornManyAnswersABoardPage(cur realm, t *testing.T) {
	fresh(t, cur)
	mintTo(alice, mustGnome(common()))
	mintTo(bob, mustGnome(nthOfTier(1, 0)))
	row := func(p address, id int64) string { return "{" + strings.TrimPrefix(wornJSON(p, id, false), `{"version":1,`) }
	nobody := testutils.TestAddress("nobody")
	got := WornMany(alice.String() + ",nope," + bob.String() + "," + alice.String() + "," + nobody.String())
	uassert.Equal(t, `{"version":1,"rows":[`+row(alice, common())+","+row(bob, nthOfTier(1, 0))+"]}", got, "those who hold one, once each, in order")
	uassert.Equal(t, `{"version":1,"rows":[]}`, WornMany(""))

	// past the first 50 players (repeats and junk count, so the walk stays
	// short), the rest are not read
	many := ""
	for i := 0; i < maxPlayers; i++ {
		many += testutils.TestAddress("p"+itoa(int64(i))).String() + ","
	}
	uassert.Equal(t, `{"version":1,"rows":[]}`, WornMany(many+alice.String()))
	uassert.Equal(t, `{"version":1,"rows":[`+row(alice, common())+`]}`, WornMany(alice.String()+","+many))
}

// mintEarnedFor gives who earned kind k (1 to 9) as MintEarned does once proven.
func mintEarnedFor(who address, k int) int64 {
	id := nextEarned
	nextEarned++
	earned.Set(who.String()+" "+earnedKinds[k-1], itoa(id))
	kindOf.Set(itoa(id), earnedKinds[k-1])
	if err := ledger.Mint(who, grc721.TokenID(itoa(id))); err != nil {
		panic(err)
	}
	return id
}
