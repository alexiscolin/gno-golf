package golf

import (
	"chain"
	"chain/runtime"
	"chain/runtime/unsafe"
	"strings"
)

// The course's owner: whoever deployed golf, captured once at init. It is the
// only party golf itself gives a power to (Publish, the play link, the
// successor, and handing the role on), and every check of it is by the
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

// playURL is the 3D client: every page links to it. The owner can move it
// (SetPlayURL), since a site can be renamed or lost.
var playURL = "https://gno-golf.netlify.app/"

// successor is the realm that took this course over, "" until the owner
// names it, once (SetSuccessor).
var successor string

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

// Successor is the realm that took this course over, "" if none.
func Successor() string { return successor }

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
		chain.Emit(EventOwnershipOfferCancelled, "owner", owner.String())
		return
	}
	pending = to
	chain.Emit(EventOwnershipOffered, "owner", owner.String(), "to", to.String())
}

// Accept takes the role a Transfer offered the caller.
func Accept(cur realm) {
	caller := cur.Previous().Address()
	if owner == "" || pending == "" || caller != pending {
		panic("golf: no transfer of the course is offered to you")
	}
	from := owner
	owner, pending = caller, ""
	chain.Emit(EventOwnershipTransfer, "from", from.String(), "to", owner.String())
}

// Renounce gives the role up for good: no owner, no offer, and none possible.
func Renounce(cur realm) {
	if !isOwner(cur.Previous().Address()) {
		panic("golf: only the owner can renounce the course")
	}
	from := owner
	owner, pending = "", ""
	chain.Emit(EventOwnershipRenounced, "from", from.String())
}

// maxURL bounds the play link.
const maxURL = 100

// SetPlayURL moves the link every page gives to the 3D client. Only the
// owner can. url is https://, at most 100 characters of letters, digits and
// "-._~/:%", and takes no query or fragment of its own: a hole's link adds
// "?cup=…&hole=…" to it.
func SetPlayURL(cur realm, url string) {
	if !isOwner(cur.Previous().Address()) {
		panic("golf: only the owner can move the play link")
	}
	if !validURL(url) {
		panic("golf: a play link is https:// and up to 100 of a-z, A-Z, 0-9 and -._~/:%")
	}
	playURL = url
	chain.Emit(EventPlayURLSet, "url", url)
}

func validURL(u string) bool {
	if len(u) > maxURL || !strings.HasPrefix(u, "https://") || len(u) == len("https://") {
		return false
	}
	for i := 0; i < len(u); i++ {
		c := u[i]
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || strings.IndexByte("-._~/:%", c) >= 0) {
			return false
		}
	}
	return true
}

// SetSuccessor names the realm that takes this course over, once and for
// good: a pkgpath under gno.land/r/, not golf itself, whose segments are
// names ("", "." and ".." are not). Only the owner can. It moves nothing and
// blocks nothing: the pages say where the course went, and Holes gives it,
// while every play and record here goes on as before.
//
// golf cannot tell cheaply whether the realm exists, and does not try: the
// call is permanent, so check the path (deployed, and the right one) before
// sending it.
func SetSuccessor(cur realm, pkgpath string) {
	if !isOwner(cur.Previous().Address()) {
		panic("golf: only the owner can name a successor")
	}
	if successor != "" {
		panic("golf: the successor is already " + successor)
	}
	if !validPkgPath(pkgpath) || pkgpath == self {
		panic("golf: a successor is a realm's pkgpath, gno.land/r/ and up to 100 of a-z, 0-9 and _-/.")
	}
	successor = pkgpath
	chain.Emit(EventSuccessorSet, "successor", pkgpath)
}

func validPkgPath(p string) bool {
	if len(p) > maxURL || !strings.HasPrefix(p, "gno.land/r/") {
		return false
	}
	for _, seg := range strings.Split(p[len("gno.land/r/"):], "/") {
		if seg == "" || seg == "." || seg == ".." {
			return false
		}
	}
	for i := 0; i < len(p); i++ {
		c := p[i]
		if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || strings.IndexByte("_-/.", c) >= 0) {
			return false
		}
	}
	return true
}

// The events golf emits, and their attributes. A hole is always "hole", a
// player "player".
const (
	EventHolePublished           = "HolePublished"           // hole, slot, sha, by, official ("true"/"false")
	EventHoleRetired             = "HoleRetired"             // hole, next
	EventShot                    = "Shot"                    // hole, player, strokes, mode, shot ("angle,power,tick" as recorded)
	EventHoled                   = "Holed"                   // hole, player, strokes, mode, shots (the round's)
	EventRoundReset              = "RoundReset"              // hole, player
	EventOwnershipOffered        = "OwnershipOffered"        // owner, to
	EventOwnershipOfferCancelled = "OwnershipOfferCancelled" // owner
	EventOwnershipTransfer       = "OwnershipTransfer"       // from, to
	EventOwnershipRenounced      = "OwnershipRenounced"      // from
	EventPlayURLSet              = "PlayURLSet"              // url
	EventSuccessorSet            = "SuccessorSet"            // successor
)
