package gnomes

import (
	"strings"
	"testing"

	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

// The money goes to the treasury, an address apart from the owner's key:
// the deployer at deploy, moved in two steps, the new treasury accepting
// from its own address, so a typo never sends a sale to a dead address.

var vault = testutils.TestAddress("vault")

func TestTheTreasuryIsTheDeployerAtDeploy(cur realm, t *testing.T) {
	fresh(t, cur)
	uassert.Equal(t, deployer, Treasury())
	uassert.Equal(t, address(""), PendingTreasury())
	uassert.True(t, strings.Contains(Collection(), `"treasury":"`+deployer.String()+`","pendingTreasury":""`))
}

func TestTheTreasuryMovesInTwoSteps(cur realm, t *testing.T) {
	fresh(t, cur)
	testing.SetRealm(asUser(alice, nil))
	urequire.AbortsContains(t, cur, "only the owner", func() { SetTreasury(cross(cur), vault) })

	testing.SetRealm(asUser(deployer, nil))
	urequire.AbortsContains(t, cur, "not an address", func() { SetTreasury(cross(cur), "g1nope") })
	urequire.AbortsContains(t, cur, "not the realm", func() { SetTreasury(cross(cur), selfAddr) })
	SetTreasury(cross(cur), vault)
	uassert.Equal(t, deployer, Treasury(), "nothing moves before the accept")
	uassert.Equal(t, vault, PendingTreasury())

	// a sale before the accept still pays the treasury in place
	before := balance(deployer)
	testing.SetRealm(asUser(alice, ugnot(priceOf(1))))
	Buy(cross(cur), "1")
	uassert.Equal(t, before+priceOf(1), balance(deployer))

	// nobody but the address offered accepts
	testing.SetRealm(asUser(bob, nil))
	urequire.AbortsContains(t, cur, "no treasury", func() { AcceptTreasury(cross(cur)) })
	testing.SetRealm(asUser(deployer, nil))
	urequire.AbortsContains(t, cur, "no treasury", func() { AcceptTreasury(cross(cur)) })

	testing.SetRealm(asUser(vault, nil))
	AcceptTreasury(cross(cur))
	uassert.Equal(t, vault, Treasury())
	uassert.Equal(t, address(""), PendingTreasury())

	// every payment goes there now: a sale, the royalty
	before = balance(vault)
	testing.SetRealm(asUser(alice, ugnot(priceOf(2))))
	tid := Buy(cross(cur), "2")
	uassert.Equal(t, before+priceOf(2), balance(vault))
	to, _, _ := RoyaltyInfo(tid, 100)
	uassert.Equal(t, vault, to, "the royalty follows the treasury")
}

// The accept is a signature from the treasury's own key: a realm that calls
// with the vault as its origin is not the vault.
func TestARealmCannotAcceptForTheTreasury(cur realm, t *testing.T) {
	fresh(t, cur)
	testing.SetRealm(asUser(deployer, nil))
	SetTreasury(cross(cur), vault)
	testing.SetOriginCaller(vault)
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/someone/proxy"))
	urequire.AbortsContains(t, cur, "no treasury", func() { AcceptTreasury(cross(cur)) })
}

func TestAnOfferToTheTreasuryInPlaceCancels(cur realm, t *testing.T) {
	fresh(t, cur)
	testing.SetRealm(asUser(deployer, nil))
	SetTreasury(cross(cur), vault)
	SetTreasury(cross(cur), deployer)
	uassert.Equal(t, address(""), PendingTreasury())
	testing.SetRealm(asUser(vault, nil))
	urequire.AbortsContains(t, cur, "no treasury", func() { AcceptTreasury(cross(cur)) })
}

// The owner's role and the treasury are apart: handing the role on moves
// no money, and the new owner moves the treasury in the same two steps.
func TestAnOwnerHandoverLeavesTheTreasury(cur realm, t *testing.T) {
	fresh(t, cur)
	testing.SetRealm(asUser(deployer, nil))
	Transfer(cross(cur), alice)
	testing.SetRealm(asUser(alice, nil))
	Accept(cross(cur))
	uassert.Equal(t, deployer, Treasury())
	to, _, _ := RoyaltyInfo("1", 100)
	uassert.Equal(t, deployer, to)
	SetTreasury(cross(cur), vault)
	testing.SetRealm(asUser(vault, nil))
	AcceptTreasury(cross(cur))
	uassert.Equal(t, vault, Treasury())
}

// Coins someone sent with a call that keeps none go to the treasury too, when
// the owner sweeps them: the realm keeps nothing.
func TestTheSweepPaysTheTreasury(cur realm, t *testing.T) {
	fresh(t, cur)
	testing.SetRealm(asUser(deployer, nil))
	SetTreasury(cross(cur), vault)
	testing.SetRealm(asUser(vault, nil))
	AcceptTreasury(cross(cur))

	testing.IssueCoins(selfAddr, ugnot(7)) // a stray -send
	before, held := balance(vault), balance(selfAddr)
	testing.SetRealm(asUser(alice, nil))
	urequire.AbortsContains(t, cur, "only the owner", func() { Sweep(cross(cur)) })
	testing.SetRealm(asUser(deployer, nil))
	Sweep(cross(cur))
	uassert.Equal(t, before+held, balance(vault))
	uassert.Equal(t, int64(0), balance(selfAddr))
	Sweep(cross(cur)) // nothing left: nothing sent
}
