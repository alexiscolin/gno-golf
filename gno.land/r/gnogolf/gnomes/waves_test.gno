package gnomes

import (
	"testing"

	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
	"gno.land/r/gnogolf/store"
)

// noWave is a fresh collection with no wave yet: the genesis's close a
// year off (it sells only once one is set), the sale open.
func noWave(t *testing.T, rlm realm) {
	published(t, rlm)
	closeAt = now() + 365*24*3600
	mintOpen = true
}

func TestAWaveOpensItsIDsAtItsStart(cur realm, t *testing.T) {
	noWave(t, cur)
	a, b := nthOfTier(0, 0), nthOfTier(0, 100)
	testing.SetRealm(asUser(alice, nil))
	urequire.AbortsContains(t, cur, "only the owner", func() { AddWave(cross(cur), a, a+50, now(), 0) })
	testing.SetRealm(asUser(deployer, nil))
	AddWave(cross(cur), a, a+50, now()+3600, 0)

	testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
	urequire.AbortsContains(t, cur, "not on sale yet", func() { Buy(cross(cur), itoa(a)) })
	urequire.AbortsContains(t, cur, "not on sale", func() { Buy(cross(cur), itoa(b)) })
	skip(3600)
	testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
	Buy(cross(cur), itoa(a))
	testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
	urequire.AbortsContains(t, cur, "not on sale", func() { Buy(cross(cur), itoa(b)) }, "outside every wave")
}

func TestAWaveIsCheckedWhole(cur realm, t *testing.T) {
	noWave(t, cur)
	urequire.NoError(t, addWave(1, 100, now(), 0))
	for name, w := range map[string][4]int64{
		"an overlap":        {100, 200, now(), 0},
		"inside another":    {10, 20, now(), 0},
		"backwards":         {300, 200, now(), 0},
		"past the end":      {700, lastID() + 1, now(), 0},
		"from zero":         {0, 5, now(), 0},
		"a long window":     {300, 400, now(), maxHours + 1},
		"a negative window": {300, 400, now(), -1},
	} {
		uassert.Error(t, addWave(w[0], w[1], w[2], w[3]), name)
	}
	uassert.Equal(t, 1, len(waves))
}

// Storage griefing is the owner's alone, and bounded all the same.
func TestTheWavesAreBounded(cur realm, t *testing.T) {
	noWave(t, cur)
	for i := int64(1); i <= maxWaves; i++ {
		urequire.NoError(t, addWave(i, i, now(), 0))
	}
	uassert.ErrorContains(t, addWave(maxWaves+1, maxWaves+1, now(), 0), "waves")
}

// The player window: for its first hours a wave sells only to wallets with
// a record in store, a few each; then to anyone.
func TestThePlayerWindowIsForPlayers(cur realm, t *testing.T) {
	noWave(t, cur)
	urequire.NoError(t, addWave(1, genesisTotal(), now(), 48))
	testing.SetRealm(testing.NewCodeRealm(rules))
	store.Set(cross(cur), "totals", "pro "+alice.String(), "1")
	// a code realm set takes the -send envelope with it: name this realm
	// its payee again, as on chain, where it lands on the realm called
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/gnogolf/gnomes"))

	testing.SetRealm(asUser(bob, ugnot(tiers[0].price)))
	urequire.AbortsContains(t, cur, "players only", func() { Buy(cross(cur), itoa(nthOfTier(0, 0))) })

	for i := 0; i < int(playerCap[0]); i++ {
		testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
		Buy(cross(cur), itoa(nthOfTier(0, i)))
	}
	next := itoa(nthOfTier(0, int(playerCap[0])))
	testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
	urequire.AbortsContains(t, cur, "player window", func() { Buy(cross(cur), next) })

	skip(48 * 3600)
	testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
	Buy(cross(cur), next) // the window is over: the lifetime cap alone
	testing.SetRealm(asUser(bob, ugnot(tiers[0].price)))
	Buy(cross(cur), itoa(nthOfTier(0, int(playerCap[0])+1)))
}

// (store is not reset between tests: each address here is this test's own)
func TestARecordInEitherModeCounts(cur realm, t *testing.T) {
	assisted, pro, none := testutils.TestAddress("assisted"), testutils.TestAddress("pro"), testutils.TestAddress("none")
	uassert.False(t, hasRecord(assisted))
	testing.SetRealm(testing.NewCodeRealm(rules))
	store.Set(cross(cur), "totals", "assisted "+assisted.String(), "1")
	store.Set(cross(cur), "totals", "pro "+pro.String(), "1")
	uassert.True(t, hasRecord(assisted))
	uassert.True(t, hasRecord(pro))
	uassert.False(t, hasRecord(none))
}

// A wave keeps the prices it was published with: SetPrice moves the next
// waves, never one already announced, so nobody who bought early is
// undercut.
func TestAWaveKeepsItsPrices(cur realm, t *testing.T) {
	noWave(t, cur)
	first, second := nthOfTier(0, 0), nthOfTier(0, 300)
	urequire.NoError(t, addWave(first, first+99, now(), 0))

	testing.SetRealm(asUser(alice, nil))
	urequire.AbortsContains(t, cur, "only the owner", func() { SetPrice(cross(cur), "common", minPrice) })
	testing.SetRealm(asUser(deployer, nil))
	SetPrice(cross(cur), "common", 45_000_000)
	urequire.AbortsContains(t, cur, "between", func() { SetPrice(cross(cur), "common", minPrice-1) })
	urequire.AbortsContains(t, cur, "between", func() { SetPrice(cross(cur), "common", maxPrice+1) })
	urequire.AbortsContains(t, cur, "unknown tier", func() { SetPrice(cross(cur), "mythic", minPrice) })
	urequire.NoError(t, addWave(second, second+99, now(), 0))

	uassert.Equal(t, tiers[0].price, priceOf(first), "the first wave's price stands")
	uassert.Equal(t, int64(45_000_000), priceOf(second), "the next wave takes the new one")
	testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
	Buy(cross(cur), itoa(first))
	testing.SetRealm(asUser(alice, ugnot(45_000_000)))
	Buy(cross(cur), itoa(second))
}
