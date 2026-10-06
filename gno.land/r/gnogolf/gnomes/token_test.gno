package gnomes

import (
	"strings"
	"testing"

	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

func TestTheTokenIsNamed(t *testing.T) {
	uassert.Equal(t, "Gnogolf Gnomes", Name())
	uassert.Equal(t, "GNOME", Symbol())
}

func TestTransfersGoThroughTheLedgersChecks(cur realm, t *testing.T) {
	fresh(t, cur)
	testing.SetRealm(asUser(alice, ugnot(priceOf(common()))))
	tid := Buy(cross(cur), itoa(common()))
	testing.SetRealm(asUser(bob, nil))
	urequire.AbortsContains(t, cur, "not token owner", func() { TransferFrom(cross(cur), alice, bob, tid) })

	testing.SetRealm(asUser(alice, nil))
	Approve(cross(cur), bob, tid)
	approved, _ := GetApproved(tid)
	uassert.Equal(t, bob, approved)
	testing.SetRealm(asUser(bob, nil))
	TransferFrom(cross(cur), alice, bob, tid)
	owner, _ := OwnerOf(tid)
	uassert.Equal(t, bob, owner)
	n, _ := BalanceOf(bob)
	uassert.Equal(t, int64(1), n)
}

// A realm the holder calls is not the holder: the teller acts as the
// immediate caller.
func TestARealmCannotMoveItsCallersGnomes(cur realm, t *testing.T) {
	fresh(t, cur)
	testing.SetRealm(asUser(alice, ugnot(priceOf(common()))))
	tid := Buy(cross(cur), itoa(common()))
	testing.SetOriginCaller(alice)
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/someone/drainer"))
	urequire.AbortsContains(t, cur, "not token owner", func() { TransferFrom(cross(cur), alice, bob, tid) })
}

// Burn is the holder's alone; it clears what the hook cannot (the locker's
// row, the equipped gnome), and a sold id stays sold: it is never sold again.
func TestABurnIsTheHoldersAndForGood(cur realm, t *testing.T) {
	fresh(t, cur)
	id := common()
	testing.SetRealm(asUser(alice, ugnot(priceOf(id))))
	tid := Buy(cross(cur), itoa(id))
	testing.SetRealm(asUser(alice, nil))
	Equip(cross(cur), tid)
	testing.SetRealm(asUser(bob, nil))
	urequire.AbortsContains(t, cur, "not your gnome", func() { Burn(cross(cur), tid) })
	urequire.AbortsContains(t, cur, "not your gnome", func() { Burn(cross(cur), "nope") })
	// an approved operator cannot burn: only the holder
	testing.SetRealm(asUser(alice, nil))
	SetApprovalForAll(cross(cur), bob, true)
	testing.SetRealm(asUser(bob, nil))
	urequire.AbortsContains(t, cur, "not your gnome", func() { Burn(cross(cur), tid) })

	testing.SetRealm(asUser(alice, nil))
	Burn(cross(cur), tid)
	uassert.Equal(t, int64(0), TotalSupply())
	uassert.Equal(t, "", Equipped(alice))
	uassert.False(t, equipped.Has(alice.String()))
	uassert.Equal(t, 0, countRows(GnomesOf(alice, 0)))
	uassert.True(t, isSold(id), "a sold id stays sold")
	testing.SetRealm(asUser(bob, ugnot(priceOf(id))))
	urequire.AbortsContains(t, cur, "already sold", func() { Buy(cross(cur), tid) })
	uassert.True(t, strings.Contains(Gnome(tid), `"owner":"","price":30000000,"sold":true`))
}

func TestTheRoyaltyIsFivePercentToTheOwner(cur realm, t *testing.T) {
	fresh(t, cur)
	testing.SetRealm(asUser(alice, ugnot(priceOf(common()))))
	tid := Buy(cross(cur), itoa(common()))
	to, amount, err := RoyaltyInfo(tid, 1_000_000)
	urequire.NoError(t, err)
	uassert.Equal(t, deployer, to)
	uassert.Equal(t, int64(50_000), amount)
	_, _, err = RoyaltyInfo(tid, -1)
	uassert.Error(t, err, "royalty/v0's shape: an error, not a panic")
}
