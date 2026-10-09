package gnomes

import (
	"strings"
	"testing"

	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

// The published genesis keeps the config's promise: ids 1 to 720 in order,
// each tier as many rows as its genesis supply, a name and traits on each.
func TestTheGenesisKeepsTheConfigsPromise(cur realm, t *testing.T) {
	fresh(t, cur)
	var count [len(tiers)]int64
	for id := int64(1); id <= genesisTotal(); id++ {
		g, ok := gnomeAt(id)
		urequire.True(t, ok, "row "+itoa(id))
		uassert.Equal(t, id, g.id)
		uassert.Equal(t, genesisName, g.series)
		uassert.NotEmpty(t, g.name, "a name, row "+itoa(id))
		uassert.NotEmpty(t, g.traits, "traits, row "+itoa(id))
		count[g.tier]++
	}
	for i, tr := range tiers {
		uassert.Equal(t, genesisSupply[i], count[i], tr.name)
	}
	uassert.Equal(t, genesisTotal(), lastID())
	_, ok := gnomeAt(0)
	uassert.False(t, ok)
	_, ok = gnomeAt(lastID() + 1)
	uassert.False(t, ok)
}

func TestTheFirstSeriesIsTheGenesisAsConfigured(cur realm, t *testing.T) {
	setUp(0, cur, deployer)
	uassert.ErrorContains(t, addSeries("winter", placeholderGenesis()), "genesis first")
	short := [len(tiers)]int64{504, 144, 65, 6}
	uassert.ErrorContains(t, addSeries(genesisName, placeholderRows(1, short)), "legendary")
	urequire.NoError(t, addSeries(genesisName, placeholderGenesis()))
}

// A drop is data: a later series, of any size, continues the ids, and its
// gnomes sell, in a wave of their own, like the genesis's.
func TestALaterDropContinuesTheIDs(cur realm, t *testing.T) {
	fresh(t, cur)
	drop := placeholderRows(721, [len(tiers)]int64{3, 2, 0, 1})
	testing.SetRealm(asUser(alice, nil))
	urequire.AbortsContains(t, cur, "only the owner", func() { AddSeries(cross(cur), "winter-2027", drop) })
	testing.SetRealm(asUser(deployer, nil))
	AddSeries(cross(cur), "winter-2027", drop)

	uassert.Equal(t, int64(726), lastID())
	g := mustGnome(721)
	uassert.Equal(t, "winter-2027", g.series)
	uassert.Equal(t, 0, g.tier, "the drop's first row is common")
	uassert.Equal(t, topTier, mustGnome(726).tier, "its last is legendary")

	testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
	urequire.AbortsContains(t, cur, "not on sale", func() { Buy(cross(cur), "721") })
	testing.SetRealm(asUser(deployer, nil))
	AddWave(cross(cur), 721, 726, now(), 0)
	testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
	uassert.Equal(t, "721", Buy(cross(cur), "721"))
}

func TestASeriesIsRefusedWhole(cur realm, t *testing.T) {
	fresh(t, cur)
	for name, c := range map[string][2]string{
		"empty":          {"spring", ""},
		"a gap":          {"spring", "722|common|A|v0.a"},
		"a known tier":   {"spring", "721|mythic|A|v0.a"},
		"a name":         {"spring", "721|common||v0.a"},
		"traits":         {"spring", "721|common|A|"},
		"the shape":      {"spring", "721|common|A"},
		"once":           {genesisName, "721|common|A|v0.a"},
		"a slug":         {"Spring Drop", "721|common|A|v0.a"},
		"no gap after":   {"spring", "721|common|A|v0.a\n723|common|B|v0.b"},
		"a leading 0":    {"spring", "0721|common|A|v0.a"},
		"a control":      {"spring", "721|common|A\x01|v0.a"},
		"a long name":    {"spring", "721|common|" + strings.Repeat("a", maxGnomeName+1) + "|v0.a"},
		"long traits":    {"spring", "721|common|A|" + strings.Repeat("a", maxTraits+1)},
		"a trailing \\n": {"spring", "721|common|A|v0.a\n"},
	} {
		uassert.Error(t, addSeries(c[0], c[1]), name)
	}
	uassert.Equal(t, genesisTotal(), lastID(), "nothing was added")
}

// Storage griefing: only the owner publishes, and a series is bounded.
func TestASeriesIsBounded(cur realm, t *testing.T) {
	fresh(t, cur)
	big := placeholderRows(721, [len(tiers)]int64{maxSeriesRows + 1})
	uassert.ErrorContains(t, addSeries("big", big), "at most")

	for i := len(catalogue); i < maxSeries; i++ {
		id := lastID() + 1
		urequire.NoError(t, addSeries("drop-"+itoa(id), itoa(id)+"|common|A|v0.a"))
	}
	id := lastID() + 1
	uassert.ErrorContains(t, addSeries("one-too-many", itoa(id)+"|common|A|v0.a"), "series")
}
