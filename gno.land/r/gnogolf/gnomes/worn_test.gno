package gnomes

import (
	"strings"
	"testing"

	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

// The gnome others see a player wear: the one they equipped, while they own
// it, else their best (Legendary, Epic, Rare, Common, then an earned one;
// the lowest id first among equals), else none. One read, no transaction.

func wornJSON(player address, id int64, equipped bool) string {
	g, _ := tokenAt(id)
	e := "false"
	if equipped {
		e = "true"
	}
	return `{"version":1,"player":"` + player.String() + `","id":"` + itoa(id) + `","name":"` + g.name +
		`","tier":"` + tierName(g.tier) + `","traits":"` + g.traits + `","equipped":` + e + `}`
}

func TestWornIsTheBestOwnedGnome(cur realm, t *testing.T) {
	fresh(t, cur)
	uassert.Equal(t, "", Worn(alice), "owns none")

	common, rare, epic := nthOfTier(0, 3), nthOfTier(1, 5), nthOfTier(2, 0)
	mintTo(alice, mustGnome(common))
	uassert.Equal(t, wornJSON(alice, common, false), Worn(alice))
	mintTo(alice, mustGnome(epic))
	mintTo(alice, mustGnome(rare))
	uassert.Equal(t, wornJSON(alice, epic, false), Worn(alice), "an Epic over a Rare and a Common")
	mintTo(alice, mustGnome(legend()))
	uassert.Equal(t, wornJSON(alice, legend(), false), Worn(alice), "a Legendary over all")
}

func TestAmongEqualsTheLowestIDIsWorn(cur realm, t *testing.T) {
	fresh(t, cur)
	a, b := nthOfTier(1, 7), nthOfTier(1, 2) // two Rares, b's id the lower
	mintTo(alice, mustGnome(a))
	mintTo(alice, mustGnome(b))
	uassert.Equal(t, wornJSON(alice, b, false), Worn(alice))
	uassert.True(t, b < a)
}

// An earned gnome is worn when it is all a player has, below any sold one.
func TestAnEarnedGnomeIsWornBelowTheSoldOnes(cur realm, t *testing.T) {
	f := withRows(t, cur)
	for _, id := range cupHoles(f, "garden", 18) {
		best(f, id, "assisted", alice.String(), 3)
	}
	testing.SetRealm(asUser(alice, nil))
	tid := MintEarned(cross(cur), "wizard")
	uassert.Equal(t, wornJSON(alice, parseID(tid), false), Worn(alice))
	mintTo(alice, mustGnome(common()))
	uassert.Equal(t, wornJSON(alice, common(), false), Worn(alice))
}

// The equipped gnome wins while it is owned; sold or burned, the best
// owned is worn again.
func TestTheEquippedGnomeIsWornWhileOwned(cur realm, t *testing.T) {
	fresh(t, cur)
	c, l := common(), legend()
	mintTo(alice, mustGnome(c))
	mintTo(alice, mustGnome(l))
	testing.SetRealm(asUser(alice, nil))
	Equip(cross(cur), itoa(c))
	uassert.Equal(t, wornJSON(alice, c, true), Worn(alice), "chosen over the best")

	TransferFrom(cross(cur), alice, bob, itoa(c))
	uassert.Equal(t, wornJSON(alice, l, false), Worn(alice), "sold: the best again")
	uassert.Equal(t, wornJSON(bob, c, false), Worn(bob), "the buyer wears it as their best")

	testing.SetRealm(asUser(alice, nil))
	Burn(cross(cur), itoa(l))
	uassert.Equal(t, "", Worn(alice), "burned: none left")
}

// The index follows every mint, transfer and burn.
func TestTheBestIndexFollowsTheLedger(cur realm, t *testing.T) {
	fresh(t, cur)
	l := legend()
	mintTo(alice, mustGnome(l))
	uassert.True(t, byBest.Has(bestKey(alice, mustGnome(l))))
	testing.SetRealm(asUser(alice, nil))
	TransferFrom(cross(cur), alice, bob, itoa(l))
	uassert.False(t, byBest.Has(bestKey(alice, mustGnome(l))))
	uassert.True(t, byBest.Has(bestKey(bob, mustGnome(l))))
	testing.SetRealm(asUser(bob, nil))
	Burn(cross(cur), itoa(l))
	uassert.False(t, byBest.Has(bestKey(bob, mustGnome(l))))
}

// A board page asks for its players at once, as EquippedMany does: the
// first 50 of a list, repeats and junk skipped, those who wear one.
func TestWornManyAnswersABoardPage(cur realm, t *testing.T) {
	fresh(t, cur)
	mintTo(alice, mustGnome(common()))
	row := strings.Replace(wornJSON(alice, common(), false), `{"version":1,`, "{", 1)
	uassert.Equal(t, `{"version":1,"rows":[`+row+`]}`, WornMany(alice.String()+",junk,"+bob.String()+","+alice.String()))
	many := ""
	for i := 0; i < maxPlayers; i++ {
		many += testutils.TestAddress("p"+itoa(int64(i))).String() + ","
	}
	uassert.Equal(t, `{"version":1,"rows":[]}`, WornMany(many+alice.String()))
}

// Cheap whatever a player holds: one row of the index, not a walk.
func TestWornReadsOneRow(cur realm, t *testing.T) {
	fresh(t, cur)
	for id := int64(1); id <= 205; id++ {
		mintTo(alice, mustGnome(id))
	}
	urequire.True(t, strings.Contains(Worn(alice), `"id":"104"`), "the first Legendary")
}
