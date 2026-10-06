package gnomes

import (
	"testing"

	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

// The deployer owns the collection. Only `gno test` (chain "dev") deploys
// with no signer: the owner is then the tests' deployer, so that a filetest
// can publish; anywhere else that deploy is refused.
func TestTheDeployerOwns(cur realm, t *testing.T) {
	uassert.Equal(t, alice, ownerAtDeploy(alice, "gnoland1"))
	uassert.Equal(t, alice, ownerAtDeploy(alice, "dev"))
	uassert.Equal(t, deployer, ownerAtDeploy("", "dev"))
	urequire.PanicsContains(t, cur, "deployed by an account", func() { ownerAtDeploy("", "gnoland1") })
}

func TestTheOwnerHandsOverInTwoSteps(cur realm, t *testing.T) {
	fresh(t, cur)
	testing.SetRealm(asUser(alice, nil))
	urequire.AbortsContains(t, cur, "only the owner", func() { Transfer(cross(cur), alice) })

	testing.SetRealm(asUser(deployer, nil))
	urequire.AbortsContains(t, cur, "not an address", func() { Transfer(cross(cur), "g1nope") })
	Transfer(cross(cur), alice)
	uassert.Equal(t, deployer, Owner())
	uassert.Equal(t, alice, Pending())

	testing.SetRealm(asUser(bob, nil))
	urequire.AbortsContains(t, cur, "no transfer", func() { Accept(cross(cur)) })

	testing.SetRealm(asUser(alice, nil))
	Accept(cross(cur))
	uassert.Equal(t, alice, Owner())
	uassert.Equal(t, address(""), Pending())

	// the old owner has nothing left, and the next mint pays the new one
	testing.SetRealm(asUser(deployer, nil))
	urequire.AbortsContains(t, cur, "only the owner", func() { SetMintOpen(cross(cur), false) })
	before := balance(alice)
	id := common()
	testing.SetRealm(asUser(bob, ugnot(priceOf(id))))
	tid := Buy(cross(cur), itoa(id))
	uassert.Equal(t, before+priceOf(id), balance(alice))
	to, _, _ := RoyaltyInfo(tid, 100)
	uassert.Equal(t, alice, to, "the royalty follows the owner")
}

func TestTransferToTheOwnerCancels(cur realm, t *testing.T) {
	fresh(t, cur)
	testing.SetRealm(asUser(deployer, nil))
	Transfer(cross(cur), alice)
	Transfer(cross(cur), deployer)
	uassert.Equal(t, address(""), Pending())
	testing.SetRealm(asUser(alice, nil))
	urequire.AbortsContains(t, cur, "no transfer", func() { Accept(cross(cur)) })
}

// A realm the owner calls is not the owner: every check is on the immediate
// caller.
func TestARealmTheOwnerCallsIsNotTheOwner(cur realm, t *testing.T) {
	fresh(t, cur)
	testing.SetOriginCaller(deployer)
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/someone/proxy"))
	urequire.AbortsContains(t, cur, "only the owner", func() { SetMintOpen(cross(cur), false) })
	urequire.AbortsContains(t, cur, "only the owner", func() { Transfer(cross(cur), alice) })
}
