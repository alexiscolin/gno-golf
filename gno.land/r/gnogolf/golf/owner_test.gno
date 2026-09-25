package golf

import (
	"strconv"
	"strings"
	"testing"

	"gno.land/p/nt/avl/v0"
	bptree "gno.land/p/nt/bptree/v0"
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
	uassert.Equal(t, "gno.land/r/gnogolf/golf", self)
	uassert.Equal(t, "/r/gnogolf/golf", hub)
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

// The B+ trees golf keeps its global indexes in read out as the AVL trees
// did: the same script of sets and removes on both leaves the same Iterate,
// IterateByOffset and page() output.
func TestTheIndexesReadAsAVL(t *testing.T) {
	s := uint64(7)
	rnd := func(n int) int {
		s = s*6364136223846793005 + 1442695040888963407
		return int((s >> 33) % uint64(n))
	}
	a, b := avl.NewTree(), bptree.NewBPTree32()
	for i := 0; i < 600; i++ {
		k := "g1" + strconv.Itoa(rnd(300))
		if rnd(4) == 0 {
			va, ra := a.Remove(k)
			vb, rb := b.Remove(k)
			if ra != rb || va != vb {
				t.Fatalf("remove %s: avl %v %v, bptree %v %v", k, va, ra, vb, rb)
			}
			continue
		}
		if ua, ub := a.Set(k, i), b.Set(k, i); ua != ub {
			t.Fatalf("set %s: avl updated %v, bptree %v", k, ua, ub)
		}
	}
	uassert.Equal(t, a.Size(), b.Size())
	dump := func(w walk, start, end string) string {
		var sb strings.Builder
		w(start, end, func(k string, v any) bool {
			sb.WriteString(k + "=" + strconv.Itoa(v.(int)) + ";")
			return false
		})
		return sb.String()
	}
	for _, r := range [][2]string{{"", ""}, {"g11", "g15"}, {"g150", ""}, {"", "g12"}, {"g19", "g19"}} {
		uassert.Equal(t, dump(avlWalk(a), r[0], r[1]), dump(bpWalk(b), r[0], r[1]), "Iterate "+r[0]+".."+r[1])
	}
	for _, o := range [][2]int{{0, 10}, {5, 100}, {a.Size() - 3, 10}, {a.Size(), 5}, {-2, 3}} {
		var x, y strings.Builder
		// the keys only: the two answer differently when the walk runs to its
		// end (avl false, bptree true), and golf never reads the answer
		a.IterateByOffset(o[0], o[1], func(k string, _ any) bool { x.WriteString(k + ";"); return false })
		b.IterateByOffset(o[0], o[1], func(k string, _ any) bool { y.WriteString(k + ";"); return false })
		uassert.Equal(t, x.String(), y.String(), "IterateByOffset "+strconv.Itoa(o[0]))
	}
	pages := func(w walk) string {
		out, after := "", ""
		for n := 0; n < 100; n++ {
			next := page(w, after, 7, func(i int, k string, _ any) { out += k + ";" })
			out += "|" + next
			if next == "" {
				break
			}
			after = next
		}
		return out
	}
	uassert.Equal(t, pages(avlWalk(a)), pages(bpWalk(b)))
}

func avlWalk(t *avl.Tree) walk {
	return func(start, end string, cb func(string, any) bool) bool { return t.Iterate(start, end, cb) }
}
