package gnomes

import "chain"

// The collection's owner, the deployer, set at init: its only role, and its
// treasury (mints and the royalty go to the owner). Every check is on the
// immediate caller (cur.Previous().Address()), never the signer, so a realm
// the owner calls cannot act in their name. The role passes by Transfer then
// Accept, as golf's does. There is no Renounce: the owner is where the money
// goes, and a sale paying nobody is not a state worth reaching.
var (
	owner   address // "" holds no power (the tests' setUp(""))
	pending address // the address a Transfer offered the role to, "" if none
)

// testDeployer owns the collection under `gno test` (chain "dev"), which
// deploys with no signer: testutils.TestAddress("deployer"), the tests'.
const testDeployer = address("g1v3jhqmr009jhyh6lta047h6lta047h6lur0t0x")

// ownerAtDeploy is the owner init sets: the deployer. A deploy with no
// signer happens under `gno test` alone; anywhere else it is refused.
func ownerAtDeploy(deployer address, chainID string) address {
	if deployer != "" {
		return deployer
	}
	if chainID != "dev" {
		panic("gnomes: no owner: gnomes must be deployed by an account")
	}
	return testDeployer
}

// Owner is the collection's owner.
func Owner() address { return owner }

// Pending is the address a Transfer offered the role to, "" if none.
func Pending() address { return pending }

func isOwner(caller address) bool { return owner != "" && caller == owner }

// assertOwner panics unless the caller of the crossing function whose cur
// is rlm is the owner.
func assertOwner(_ int, rlm realm) {
	if !isOwner(rlm.Previous().Address()) {
		panic(errNotOwner)
	}
}

// Transfer offers the role to another address, which takes it with Accept.
// Offering it to the owner themselves cancels an offer.
func Transfer(cur realm, to address) {
	assertOwner(0, cur)
	if !to.IsValid() {
		panic("gnomes: not an address: " + to.String())
	}
	if to == owner {
		pending = ""
		chain.Emit("OwnershipOfferCancelled", "owner", owner.String())
		return
	}
	pending = to
	chain.Emit("OwnershipOffered", "owner", owner.String(), "to", to.String())
}

// Accept takes the role a Transfer offered the caller, and the royalty with it.
func Accept(cur realm) {
	caller := cur.Previous().Address()
	if owner == "" || pending == "" || caller != pending {
		panic("gnomes: no transfer of the collection is offered to you")
	}
	from := owner
	owner, pending = caller, ""
	if err := royaltyLedger.SetDefaultRoyalty(owner, royaltyBps); err != nil {
		panic(err)
	}
	chain.Emit("OwnershipTransfer", "from", from.String(), "to", owner.String())
}
