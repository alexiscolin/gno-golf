package gnomes

import (
	"strings"
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

// The audit's M1: a start in milliseconds (or any far one) was taken, and a
// wave is never changed: its start then held every genesis close after it,
// thousands of years off. A wave starts from a day back to a year ahead, in
// unix seconds, so the close is never held hostage, and the window's end
// cannot overflow.
func TestAWaveStartsWithinADayBackAndAYearAhead(cur realm, t *testing.T) {
	noWave(t, cur)
	testing.SetRealm(asUser(deployer, nil))
	urequire.AbortsContains(t, cur, "gnomes: a wave starts from a day before now to a year after (unix seconds)",
		func() { AddWave(cross(cur), 105, 208, now()*1000, 0) }, "milliseconds")
	SetCloseAt(cross(cur), now()+3600) // the close is the owner's still
	for name, w := range map[string][2]int64{
		"a day and a second back":  {now() - maxWaveBehind - 1, 0},
		"a year and a second on":   {now() + maxWaveAhead + 1, 0},
		"negative":                 {-1, 0},
		"its window overflows":     {1<<63 - 3600, maxHours},
		"the far end of int64":     {1<<63 - 1, 0},
		"the far end, backwards":   {-1 << 63, 0},
	} {
		uassert.ErrorContains(t, addWave(1, 104, w[0], w[1]), "a wave starts from", name)
	}
	uassert.Equal(t, 0, len(waves))
	closeAt = now() + 2*maxWaveAhead
	urequire.NoError(t, addWave(1, 104, now()-maxWaveBehind, maxHours), "a day back")
	urequire.NoError(t, addWave(105, 208, now()+maxWaveAhead, maxHours), "a year on")
}

// A wave yet to open, which nothing could have sold, can be withdrawn: the
// owner's way back from a wrong start or range. Its ids are free for another
// wave, and the close it held is free to come forward. A wave under way
// never is: a buyer may have counted on it.
func TestAWaveYetToOpenCanBeCancelled(cur realm, t *testing.T) {
	noWave(t, cur)
	soon, later := now()+3600, now()+30*24*3600
	urequire.NoError(t, addWave(1, 104, now(), 0))
	urequire.NoError(t, addWave(105, 208, later, 0))
	urequire.NoError(t, addWave(209, 310, soon, 0))
	testing.SetRealm(asUser(alice, nil))
	urequire.AbortsContains(t, cur, "only the owner", func() { CancelWave(cross(cur), 105) })
	testing.SetRealm(asUser(deployer, nil))
	urequire.AbortsContains(t, cur, "gnomes: no wave starts at id 106", func() { CancelWave(cross(cur), 106) })
	urequire.AbortsContains(t, cur, "gnomes: ids 1 to 104 are on sale since "+dateOf(waves[0].start)+": a wave is withdrawn only before it opens",
		func() { CancelWave(cross(cur), 1) })
	urequire.AbortsContains(t, cur, "a genesis wave starts on", func() { SetCloseAt(cross(cur), now()+7*24*3600) })

	CancelWave(cross(cur), 105)
	uassert.Equal(t, 2, len(waves))
	uassert.Equal(t, -1, waveAt(105))
	uassert.Equal(t, int64(209), waves[1].first, "the waves after it follow on")
	SetCloseAt(cross(cur), now()+7*24*3600) // held by it no more
	urequire.NoError(t, addWave(105, 150, now(), 0), "its ids free again")
	testing.SetRealm(asUser(alice, ugnot(priceOf(105))))
	Buy(cross(cur), "105")

	skip(3600)
	testing.SetRealm(asUser(deployer, nil))
	urequire.AbortsContains(t, cur, "a wave is withdrawn only before it opens", func() { CancelWave(cross(cur), 209) }, "opened since")
}

// A wave's player window is counted under its first id, not its place in
// the list: withdrawing a wave before it never hands a buyer a fresh window.
func TestAWindowSurvivesAWaveCancelledBeforeIt(cur realm, t *testing.T) {
	noWave(t, cur)
	urequire.NoError(t, addWave(105, 208, now()+24*3600, 0))
	urequire.NoError(t, addWave(1, 104, now(), 48))
	testing.SetRealm(testing.NewCodeRealm(rules))
	store.Set(cross(cur), "totals", "pro "+alice.String(), "1")
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/gnogolf/gnomes"))
	for i := 0; i < int(playerCap[0]); i++ {
		testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
		Buy(cross(cur), itoa(nthOfTier(0, i)))
	}
	testing.SetRealm(asUser(deployer, nil))
	CancelWave(cross(cur), 105)
	next := itoa(nthOfTier(0, int(playerCap[0])))
	testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
	urequire.AbortsContains(t, cur, "the player window takes 3 common a wallet", func() { Buy(cross(cur), next) })
	uassert.True(t, strings.Contains(CanBuy(alice, next), `"window":{"until":`+itoa(waves[0].playersUntil)+`,"left":{"common":0,`), CanBuy(alice, next))
}
