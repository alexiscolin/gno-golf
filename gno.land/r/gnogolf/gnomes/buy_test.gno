package gnomes

import (
	"chain"
	"strings"
	"testing"

	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

func TestBuyPaysTheExactPriceToTheOwner(cur realm, t *testing.T) {
	fresh(t, cur)
	id := common()
	price := priceOf(id)
	before, held := balance(deployer), balance(selfAddr)
	testing.SetRealm(asUser(alice, ugnot(price)))
	got := Buy(cross(cur), itoa(id))

	uassert.Equal(t, itoa(id), got, "the token id is the catalogue id")
	owner, err := OwnerOf(itoa(id))
	urequire.NoError(t, err)
	uassert.Equal(t, alice, owner)
	uassert.Equal(t, mustGnome(id).traits, TraitsOf(itoa(id)), "the traits are kept per token")
	uassert.Equal(t, before+price, balance(deployer), "forwarded to the owner")
	uassert.Equal(t, held, balance(selfAddr), "the realm keeps nothing")
	uassert.Equal(t, int64(1), TotalSupply())
	uassert.Equal(t, int64(1), SoldOfTier(0))
}

func TestBuyTakesUpToFiveAtTheirSum(cur realm, t *testing.T) {
	fresh(t, cur)
	a, b, c := nthOfTier(0, 0), nthOfTier(1, 0), nthOfTier(2, 0)
	sum := priceOf(a) + priceOf(b) + priceOf(c)
	ids := itoa(a) + "," + itoa(b) + "," + itoa(c)
	testing.SetRealm(asUser(alice, ugnot(sum-1)))
	urequire.AbortsContains(t, cur, "wrong payment", func() { Buy(cross(cur), ids) })
	testing.SetRealm(asUser(alice, ugnot(sum)))
	uassert.Equal(t, ids, Buy(cross(cur), ids))
	n, _ := BalanceOf(alice)
	uassert.Equal(t, int64(3), n)
}

// Every malformed list is refused before any payment is looked at.
func TestBuyReadsItsIDsStrictly(cur realm, t *testing.T) {
	fresh(t, cur)
	a, b := itoa(nthOfTier(0, 0)), itoa(nthOfTier(0, 1))
	six := strings.Repeat(a+",", 5) + a
	for name, ids := range map[string]string{
		"none":         "",
		"a blank":      a + ",",
		"a repeat":     a + "," + a,
		"six":          six,
		"a space":      a + ", " + b,
		"a leading 0":  "0" + a,
		"a sign":       "+" + a,
		"zero":         "0",
		"past the end": itoa(lastID() + 1),
		"huge":         "99999999999999999999",
		"a word":       "gnome",
	} {
		testing.SetRealm(asUser(alice, ugnot(priceOf(common()))))
		urequire.AbortsContains(t, cur, "gnomes: ", func() { Buy(cross(cur), ids) }, name)
	}
	uassert.Equal(t, int64(0), TotalSupply())
}

func TestBuyRefusesAnyOtherPayment(cur realm, t *testing.T) {
	fresh(t, cur)
	price := priceOf(common())
	for name, sent := range map[string]chain.Coins{
		"nothing": nil,
		"short":   ugnot(price - 1),
		"over":    ugnot(price + 1),
		"denom":   chain.Coins{{"uatom", price}},
		"two":     chain.Coins{{"uatom", 1}, {"ugnot", price}},
	} {
		testing.SetRealm(asUser(alice, sent))
		urequire.AbortsContains(t, cur, "wrong payment", func() { Buy(cross(cur), itoa(common())) }, name)
	}
	uassert.Equal(t, int64(0), TotalSupply())
}

func TestAGnomeSellsOnce(cur realm, t *testing.T) {
	fresh(t, cur)
	id := itoa(common())
	testing.SetRealm(asUser(alice, ugnot(priceOf(common()))))
	Buy(cross(cur), id)
	testing.SetRealm(asUser(bob, ugnot(priceOf(common()))))
	urequire.AbortsContains(t, cur, "already sold", func() { Buy(cross(cur), id) })
}

// A Legendary sells as any gnome does: by Buy, at its tier's fixed price
// (777 GNOT), to the first buyer; one a wallet.
func TestALegendaryIsBoughtLikeAnyGnome(cur realm, t *testing.T) {
	fresh(t, cur)
	a, b := legend(), nthOfTier(legendaryTier, 1)
	price := priceOf(a)
	uassert.Equal(t, int64(777_000_000), price)
	before := balance(deployer)
	testing.SetRealm(asUser(alice, ugnot(price-1)))
	urequire.AbortsContains(t, cur, "wrong payment", func() { Buy(cross(cur), itoa(a)) })
	testing.SetRealm(asUser(alice, ugnot(price)))
	uassert.Equal(t, itoa(a), Buy(cross(cur), itoa(a)))
	uassert.Equal(t, before+price, balance(deployer), "to the treasury in the same call")

	testing.SetRealm(asUser(bob, ugnot(price)))
	urequire.AbortsContains(t, cur, "already sold", func() { Buy(cross(cur), itoa(a)) })
	testing.SetRealm(asUser(alice, ugnot(price)))
	urequire.AbortsContains(t, cur, "cap is 1 legendary", func() { Buy(cross(cur), itoa(b)) })
	testing.SetRealm(asUser(bob, ugnot(price)))
	Buy(cross(cur), itoa(b)) // another wallet still can
	uassert.Equal(t, int64(2), SoldOfTier(legendaryTier))
}

// OriginSend is only the caller's money on a direct call: a realm or a run
// script in between could keep what it attached.
func TestBuyMustBeADirectUserCall(cur realm, t *testing.T) {
	fresh(t, cur)
	price := priceOf(common())
	testing.SetOriginCaller(alice)
	testing.SetOriginSend(ugnot(price))
	testing.IssueCoins(selfAddr, ugnot(price))
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/someone/relay"))
	urequire.AbortsContains(t, cur, "directly", func() { Buy(cross(cur), itoa(common())) })
}

func TestTheOwnerPausesTheSale(cur realm, t *testing.T) {
	fresh(t, cur)
	testing.SetRealm(asUser(alice, nil))
	urequire.AbortsContains(t, cur, "only the owner", func() { SetMintOpen(cross(cur), false) })
	testing.SetRealm(asUser(deployer, nil))
	SetMintOpen(cross(cur), false)
	uassert.False(t, MintOpen())
	testing.SetRealm(asUser(alice, ugnot(priceOf(common()))))
	urequire.AbortsContains(t, cur, "closed", func() { Buy(cross(cur), itoa(common())) })
	testing.SetRealm(asUser(deployer, nil))
	SetMintOpen(cross(cur), true)
	testing.SetRealm(asUser(alice, ugnot(priceOf(common()))))
	Buy(cross(cur), itoa(common()))
}

func TestSetUpStartsClosedAndEmpty(cur realm, t *testing.T) {
	setUp(0, cur, deployer)
	uassert.False(t, MintOpen())
	uassert.Equal(t, int64(0), lastID())
	uassert.Equal(t, 0, len(waves))
}

func TestAnEmptyOwnerHoldsNoPower(cur realm, t *testing.T) {
	setUp(0, cur, "")
	testing.SetRealm(asUser("", nil))
	urequire.AbortsContains(t, cur, "only the owner", func() { SetMintOpen(cross(cur), true) })
	urequire.AbortsContains(t, cur, "only the owner", func() { AddSeries(cross(cur), genesisName, placeholderGenesis()) })
	urequire.AbortsContains(t, cur, "only the owner", func() { AddWave(cross(cur), 1, 2, 0, 0) })
	urequire.AbortsContains(t, cur, "only the owner", func() { SetPrice(cross(cur), "common", minPrice) })
	urequire.AbortsContains(t, cur, "only the owner", func() { Sweep(cross(cur)) })
}

// The lifetime cap counts per tier, across calls and within one.
func TestAWalletBuysUpToItsLifetimeCap(cur realm, t *testing.T) {
	fresh(t, cur)
	price := priceOf(common())
	for i := 0; i < int(lifetimeCap[0]); i++ {
		testing.SetRealm(asUser(alice, ugnot(price)))
		Buy(cross(cur), itoa(nthOfTier(0, i)))
	}
	next := itoa(nthOfTier(0, int(lifetimeCap[0])))
	testing.SetRealm(asUser(alice, ugnot(price)))
	urequire.AbortsContains(t, cur, "cap", func() { Buy(cross(cur), next) })
	testing.SetRealm(asUser(alice, ugnot(priceOf(nthOfTier(1, 0)))))
	Buy(cross(cur), itoa(nthOfTier(1, 0))) // another tier still can
	testing.SetRealm(asUser(bob, ugnot(price)))
	Buy(cross(cur), next) // and another wallet

	// a batch over the cap is refused whole
	ids := ""
	for i := 0; i < int(lifetimeCap[2])+1; i++ {
		if i > 0 {
			ids += ","
		}
		ids += itoa(nthOfTier(2, i))
	}
	testing.SetRealm(asUser(bob, ugnot(priceOf(nthOfTier(2, 0))*(lifetimeCap[2]+1))))
	urequire.AbortsContains(t, cur, "cap", func() { Buy(cross(cur), ids) })
	uassert.Equal(t, int64(0), SoldOfTier(2))
}
