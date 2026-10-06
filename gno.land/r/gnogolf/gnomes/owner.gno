package gnomes

import (
	"chain"
	"chain/banker"
	"strings"

	"gno.land/p/gnogolf/weblink"
)

// The collection's owner, the deployer, set at init: its only role. Every
// check is on the immediate caller (cur.Previous().Address()), never the
// signer, so a realm the owner calls cannot act in their name. The role
// passes by Transfer then Accept, as golf's does. Whether the role may be
// renounced is not decided: there is no Renounce.
var (
	owner   address // "" holds no power (the tests' setUp(""))
	pending address // the address a Transfer offered the role to, "" if none
)

// The treasury is where the money goes, an address apart from the owner's
// key: every sale, the royalty and Sweep's strays. It
// is the deployer at deploy. The owner moves it in two steps: SetTreasury
// offers it, and the new address takes it with AcceptTreasury, signed from
// that address itself, so a mistyped one never receives a sale. A gnokey
// multisig or a hardware wallet's address can hold it (ADR-007).
var (
	treasury        address
	pendingTreasury address // the address SetTreasury offered it to, "" if none
)

// siteURL is the game's site, where a gnome's page is (<site>g/<id>/) for
// TokenMetadata's external_url: "" until the owner sets it. The image is the
// on-chain SVG, so nothing a wallet shows depends on it.
var siteURL string

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

// Treasury is where the money goes.
func Treasury() address { return treasury }

// PendingTreasury is the address SetTreasury offered the treasury to, "" if
// none.
func PendingTreasury() address { return pendingTreasury }

// SiteURL is the game's site, "" until the owner sets it.
func SiteURL() string { return siteURL }

func isOwner(caller address) bool { return owner != "" && caller == owner }

// assertOwner panics unless the caller of the crossing function whose cur
// is rlm is the owner.
func assertOwner(_ int, rlm realm) {
	if !isOwner(rlm.Previous().Address()) {
		panic(errNotOwner)
	}
}

// Transfer offers the role to another address, which takes it with Accept.
// Offering it to the owner themselves cancels an offer. The treasury stays
// where it is.
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

// Accept takes the role a Transfer offered the caller.
func Accept(cur realm) {
	caller := cur.Previous().Address()
	if owner == "" || pending == "" || caller != pending {
		panic("gnomes: no transfer of the collection is offered to you")
	}
	from := owner
	owner, pending = caller, ""
	chain.Emit("OwnershipTransfer", "from", from.String(), "to", owner.String())
}

// SetTreasury offers the treasury to another address, which takes it with
// AcceptTreasury; until then the money goes where it went. Offering it to
// the treasury in place cancels an offer. Not the realm's own address: a
// treasury there would leave each sale in the realm. Owner only.
func SetTreasury(cur realm, to address) {
	assertOwner(0, cur)
	if !to.IsValid() {
		panic("gnomes: not an address: " + to.String())
	}
	if to == cur.Address() {
		panic("gnomes: the treasury is not the realm's own address")
	}
	if to == treasury {
		pendingTreasury = ""
		chain.Emit("TreasuryOfferCancelled", "treasury", treasury.String())
		return
	}
	pendingTreasury = to
	chain.Emit("TreasuryOffered", "treasury", treasury.String(), "to", to.String())
}

// AcceptTreasury takes the treasury SetTreasury offered the caller, and the
// royalty with it: a transaction signed from that address, which proves it
// is an account someone holds. A realm cannot take it.
func AcceptTreasury(cur realm) {
	caller := cur.Previous().Address()
	if pendingTreasury == "" || caller != pendingTreasury || !cur.Previous().IsUserCall() {
		panic("gnomes: no treasury is offered to you")
	}
	from := treasury
	treasury, pendingTreasury = caller, ""
	if err := royaltyLedger.SetDefaultRoyalty(treasury, royaltyBps); err != nil {
		panic(err)
	}
	chain.Emit("TreasurySet", "from", from.String(), "to", treasury.String())
}

// SetSiteURL moves the game's site, which a gnome's external_url names.
// Only the owner can. url is https://, at most 100 of letters, digits and
// "-._~/:%", with no query or fragment (golf's play link rule,
// p/gnogolf/weblink), and ends with "/".
func SetSiteURL(cur realm, url string) {
	assertOwner(0, cur)
	if !weblink.Valid(url) || !strings.HasSuffix(url, "/") {
		panic("gnomes: a site link is https:// and up to 100 of a-z, A-Z, 0-9 and -._~/:%, ending with /")
	}
	siteURL = url
	chain.Emit("SiteSet", "url", url)
}

// Sweep sends the treasury whatever ugnot the realm holds: coins sent to it
// by a plain transfer, which no call keeps (a sale's go on in its own call).
// Owner only.
func Sweep(cur realm) {
	assertOwner(0, cur)
	held := banker.NewReadonlyBanker().GetCoin(cur.Address(), payDenom)
	if held <= 0 {
		return
	}
	banker.NewBanker(banker.BankerTypeRealmSend, cur).
		SendCoins(cur.Address(), treasury, chain.NewCoins(chain.NewCoin(payDenom, held)))
	chain.Emit("Swept", "amount", itoa(held), "to", treasury.String())
}
