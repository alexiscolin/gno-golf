package golf

import (
	"chain"
	"chain/runtime"
	"chain/runtime/unsafe"
	"strings"

	"gno.land/p/nt/avl/v0"
)

// The course's owner: whoever deployed golf, captured once at init. It is the
// only party golf itself gives a power to (Publish, Expect, and handing the
// role on), and every check of it is by the
// immediate caller (cur.Previous().Address()), never by the transaction's
// signer, so a realm the owner calls cannot act in their name.
//
// The role passes in two steps (Transfer, then Accept by the recipient), and
// Renounce gives it up for good: the course is then frozen, with no owner
// and nobody who can become one.
var (
	owner   address // "" once renounced
	pending address // the address a Transfer offered the role to, "" if none
)

// self is golf's own pkgpath, and hub its gnoweb path: every link golf prints
// and the range of its course holes follow from it, so the same code serves
// under any namespace.
var (
	self           = unsafe.CurrentRealm().PkgPath()
	hub            = strings.TrimPrefix(self, "gno.land")
	officialPrefix = self[:strings.LastIndex(self, "/")+1] // the namespace's realms, as "…/"
)

func init() {
	owner = unsafe.OriginCaller()
	// A deploy always has a signer. `gno test` runs init with none (chain
	// "dev"): there the owner stays "", which holds no power, and the tests
	// set it themselves.
	if owner == "" && runtime.ChainID() != "dev" {
		panic("golf: no owner: golf must be deployed by an account")
	}
}

// Owner is the course's owner, "" once renounced.
func Owner() address { return owner }

// Pending is the address a Transfer offered the role to, "" if none.
func Pending() address { return pending }

// isOwner is the one owner check: a live role, held by the caller.
func isOwner(caller address) bool { return owner != "" && caller == owner }

// Transfer offers the role to another address, which takes it with Accept.
// Offering it to the owner themselves cancels an offer.
func Transfer(cur realm, to address) {
	if !isOwner(cur.Previous().Address()) {
		panic("golf: only the owner can transfer the course")
	}
	if !to.IsValid() {
		panic("golf: not an address: " + to.String())
	}
	if to == owner {
		pending = ""
		chain.Emit("owner_transfer_cancelled", "owner", owner.String())
		return
	}
	pending = to
	chain.Emit("owner_transfer_offered", "owner", owner.String(), "to", to.String())
}

// Accept takes the role a Transfer offered the caller.
func Accept(cur realm) {
	caller := cur.Previous().Address()
	if owner == "" || pending == "" || caller != pending {
		panic("golf: no transfer of the course is offered to you")
	}
	from := owner
	owner, pending = caller, ""
	expected = avl.NewTree() // the old owner's leave goes with them
	chain.Emit("owner_changed", "from", from.String(), "to", owner.String())
}

// Expect lets one realm under golf's own namespace register a hole, once:
// nobody else's realm there is taken for the course's (see Register). Such a
// hole is a community hole like any other; the course is the owner's data.
func Expect(cur realm, pkgpath string) {
	if !isOwner(cur.Previous().Address()) {
		panic("golf: only the owner can expect a realm under the course's namespace")
	}
	if !strings.HasPrefix(pkgpath, officialPrefix) || pkgpath == self {
		panic("golf: only a realm under " + officialPrefix + " needs expecting: " + pkgpath)
	}
	if find(pkgpath) != nil {
		panic("golf: already registered: " + pkgpath)
	}
	expected.Set(pkgpath, true)
	chain.Emit("hole_expected", "id", pkgpath)
}

// Renounce gives the role up for good: no owner, no offer, and none possible.
func Renounce(cur realm) {
	if !isOwner(cur.Previous().Address()) {
		panic("golf: only the owner can renounce the course")
	}
	from := owner
	owner, pending = "", ""
	expected = avl.NewTree()
	chain.Emit("owner_renounced", "from", from.String())
}
