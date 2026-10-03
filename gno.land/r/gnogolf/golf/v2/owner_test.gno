package golf

import (
	"strings"
	"testing"

	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

var (
	deployer = testutils.TestAddress("deployer")
	heir     = testutils.TestAddress("heir")
)

// `gno test` runs init with no signer, so the owner starts "": each test sets
// the one it plays with.
func setOwner(a address) { owner, pending = a, "" }

func TestTheNamespaceIsGolfsOwn(t *testing.T) {
	uassert.Equal(t, "gno.land/r/gnogolf/golf/v2", self)
	uassert.Equal(t, "/r/gnogolf/golf/v2", hub)
	uassert.Equal(t, "gno.land/r/gnogolf/", officialPrefix)
}

func TestAnEmptyOwnerHoldsNoPower(cur realm, t *testing.T) {
	setOwner("")
	testing.SetRealm(testing.NewUserRealm(""))
	urequire.AbortsContains(t, cur, "only the owner", func() { Transfer(cross(cur), heir) })
	urequire.AbortsContains(t, cur, "only the owner", func() { Renounce(cross(cur)) })
	urequire.AbortsContains(t, cur, "no transfer", func() { Accept(cross(cur)) })
}

func TestTheOwnerHandsOverInTwoSteps(cur realm, t *testing.T) {
	setOwner(deployer)
	testing.SetRealm(testing.NewUserRealm(heir))
	urequire.AbortsContains(t, cur, "only the owner", func() { Transfer(cross(cur), heir) })

	testing.SetRealm(testing.NewUserRealm(deployer))
	urequire.AbortsContains(t, cur, "not an address", func() { Transfer(cross(cur), "g1nope") })
	Transfer(cross(cur), heir)
	uassert.Equal(t, deployer, Owner())
	uassert.Equal(t, heir, Pending())

	// nobody but the one offered takes it
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "no transfer", func() { Accept(cross(cur)) })

	testing.SetRealm(testing.NewUserRealm(heir))
	Accept(cross(cur))
	uassert.Equal(t, heir, Owner())
	uassert.Equal(t, address(""), Pending())

	// the old owner has nothing left
	testing.SetRealm(testing.NewUserRealm(deployer))
	urequire.AbortsContains(t, cur, "only the owner", func() { Renounce(cross(cur)) })
}

func TestTransferToTheOwnerCancels(cur realm, t *testing.T) {
	setOwner(deployer)
	testing.SetRealm(testing.NewUserRealm(deployer))
	Transfer(cross(cur), heir)
	testing.SetRealm(testing.NewUserRealm(deployer))
	Transfer(cross(cur), deployer)
	uassert.Equal(t, address(""), Pending())
	testing.SetRealm(testing.NewUserRealm(heir))
	urequire.AbortsContains(t, cur, "no transfer", func() { Accept(cross(cur)) })
}

func TestRenounceIsForGood(cur realm, t *testing.T) {
	setOwner(deployer)
	testing.SetRealm(testing.NewUserRealm(deployer))
	Transfer(cross(cur), heir)
	testing.SetRealm(testing.NewUserRealm(deployer))
	Renounce(cross(cur))
	uassert.Equal(t, address(""), Owner())
	uassert.Equal(t, address(""), Pending())
	// the offer went with it, and no transfer is possible any more
	testing.SetRealm(testing.NewUserRealm(heir))
	urequire.AbortsContains(t, cur, "no transfer", func() { Accept(cross(cur)) })
	testing.SetRealm(testing.NewUserRealm(deployer))
	urequire.AbortsContains(t, cur, "only the owner", func() { Transfer(cross(cur), heir) })
}

// The owner is the immediate caller: a realm the owner calls into cannot
// act in their name, even with the owner as the transaction's signer.
func TestARealmTheOwnerCallsIsNotTheOwner(cur realm, t *testing.T) {
	setOwner(deployer)
	testing.SetOriginCaller(deployer)
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/test/phish"))
	urequire.AbortsContains(t, cur, "only the owner", func() { Transfer(cross(cur), heir) })
	urequire.AbortsContains(t, cur, "only the owner", func() { Renounce(cross(cur)) })
	testing.SetOriginCaller("")
}

// The owner moves the play link, to an https:// link a page can print, and
// nobody else can; once renounced, nobody.
func TestTheOwnerMovesThePlayLink(cur realm, t *testing.T) {
	was := playURL
	setOwner(deployer)
	testing.SetRealm(testing.NewUserRealm(heir))
	urequire.AbortsContains(t, cur, "only the owner", func() { SetPlayURL(cross(cur), "https://example.org/") })
	for _, bad := range []string{"http://example.org/", "https://", "https://x.org/?a=1", "https://x.org/#top", "https://x.org/a b",
		"https://x.org/)[x](y", "javascript:alert(1)", "https://" + strings.Repeat("x", 100)} {
		testing.SetRealm(testing.NewUserRealm(deployer))
		urequire.AbortsContains(t, cur, "a play link is https://", func() { SetPlayURL(cross(cur), bad) })
	}
	testing.SetRealm(testing.NewUserRealm(deployer))
	SetPlayURL(cross(cur), "https://golf.example.org/play/")
	uassert.True(t, strings.Contains(Render(""), "(https://golf.example.org/play/)"), "the hub links it")
	uassert.True(t, strings.Contains(Holes(), `"play":"https://golf.example.org/play/"`))
	testing.SetRealm(testing.NewUserRealm(deployer))
	SetPlayURL(cross(cur), was)
	setOwner("")
	testing.SetRealm(testing.NewUserRealm(deployer))
	urequire.AbortsContains(t, cur, "only the owner", func() { SetPlayURL(cross(cur), "https://example.org/") })
	setOwner(deployer)
}

// A successor is named once, by the owner, and only adds a banner and a
// field: every write goes on as before.
func TestTheSuccessorIsSetOnce(cur realm, t *testing.T) {
	id := courseHole(cur, 75)
	setOwner(deployer)
	testing.SetRealm(testing.NewUserRealm(heir))
	urequire.AbortsContains(t, cur, "only the owner", func() { SetSuccessor(cross(cur), "gno.land/r/gnogolf/golf2") })
	for _, bad := range []string{"", "gno.land/p/gnogolf/golf2", "gno.land/r/", "gno.land/r/x/", self, "gno.land/r/x/Golf", "gno.land/r/x)[a](b",
		"gno.land/r/x/../golf", "gno.land/r/./golf", "gno.land/r/x//golf", "gno.land/r/x/golf/", "gno.land/r/..", "gno.land/r//x"} {
		testing.SetRealm(testing.NewUserRealm(deployer))
		urequire.AbortsContains(t, cur, "a successor is", func() { SetSuccessor(cross(cur), bad) })
	}
	uassert.Equal(t, "", Successor())
	uassert.False(t, strings.Contains(Render(""), "This course has moved"))
	testing.SetRealm(testing.NewUserRealm(deployer))
	SetSuccessor(cross(cur), "gno.land/r/gnogolf/golf2")
	uassert.Equal(t, "gno.land/r/gnogolf/golf2", Successor())
	testing.SetRealm(testing.NewUserRealm(deployer))
	urequire.AbortsContains(t, cur, "already gno.land/r/gnogolf/golf2", func() { SetSuccessor(cross(cur), "gno.land/r/gnogolf/golf3") })
	uassert.True(t, strings.Contains(Holes(), `"successor":"gno.land/r/gnogolf/golf2","holes":[`))
	for _, page := range []string{"", id, "garden"} {
		uassert.True(t, strings.Contains(Render(page), "> [!NOTE] This course has moved\n> Its successor is [gno.land/r/gnogolf/golf2](/r/gnogolf/golf2)"), page)
	}
	// it blocks nothing: the course still plays, publishes and changes hands
	testing.SetRealm(testing.NewUserRealm(player))
	PlayRoundAt(cross(cur), id, "0,1", Period())
	uassert.True(t, BestOf(id, "assisted", player) > 0)
	uassert.Equal(t, "garden/76/v1", courseHole(cur, 76))
	successor = "" // for the other tests only: nothing in golf can
}
