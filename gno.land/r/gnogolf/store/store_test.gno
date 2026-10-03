package store

import (
	"math"
	"strconv"
	"strings"
	"testing"
	"time"

	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

var (
	boss  = testutils.TestAddress("boss")
	heir  = testutils.TestAddress("heir")
	rando = testutils.TestAddress("rando")
	rules = strings.TrimSuffix(self, "store") + "golf/v2"
	next  = strings.TrimSuffix(self, "store") + "golf/v3"
)

// each test starts from the deploy: the owner set, v2 the writer, nothing proposed
func fresh() {
	owner, pending, writer, proposed, at = boss, "", rules, "", 0
	for _, n := range standard {
		colls[n].Set("probe", "x") // (a tree in use: cleared below)
		colls[n].Remove("probe")
	}
}

// (testing.SetRealm acts on the frame that calls it: called in each test's own body)
func skip(seconds int64) { testing.SkipHeights(seconds/5 + 1) }

func TestTheFirstWriterIsTheRulesBesideStore(t *testing.T) {
	uassert.Equal(t, "gno.land/r/gnogolf/store", self)
	uassert.Equal(t, "gno.land/r/gnogolf/golf/v2", writer)
}

func TestOnlyTheWriterWrites(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(boss)) // (the owner too: the rules write, nobody else)
	urequire.AbortsContains(t, cur, "only gno.land/r/gnogolf/golf/v2", func() { Set(cross(cur), "bests", "k", "v") })
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/attacker/golf"))
	urequire.AbortsContains(t, cur, "only gno.land/r/gnogolf/golf/v2", func() { Set(cross(cur), "bests", "k", "v") })
	urequire.AbortsContains(t, cur, "only", func() { Batch(cross(cur), []string{"set", "bests", "k", "v"}) })
	urequire.AbortsContains(t, cur, "only", func() { Remove(cross(cur), "bests", "k") })
	urequire.AbortsContains(t, cur, "only", func() { Make(cross(cur), "extra") })

	testing.SetRealm(testing.NewCodeRealm(rules))
	Set(cross(cur), "bests", "k", "v")
	v, ok := Get("bests", "k")
	uassert.True(t, ok)
	uassert.Equal(t, "v", v)
	uassert.True(t, Remove(cross(cur), "bests", "k"))
	uassert.False(t, Has("bests", "k"))
}

func TestBatchAndItsBounds(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewCodeRealm(rules))
	Batch(cross(cur), []string{"set", "boards", "a", "1", "set", "boards", "b", "2", "del", "boards", "a", ""})
	uassert.False(t, Has("boards", "a"))
	v, _ := Get("boards", "b")
	uassert.Equal(t, "2", v)
	urequire.AbortsContains(t, cur, "four strings", func() { Batch(cross(cur), []string{"set", "boards", "a"}) })
	urequire.AbortsContains(t, cur, "set or del", func() { Batch(cross(cur), []string{"put", "boards", "a", "1"}) })
	urequire.AbortsContains(t, cur, "no collection", func() { Set(cross(cur), "nope", "a", "1") })
	urequire.AbortsContains(t, cur, "256 bytes", func() { Set(cross(cur), "boards", strings.Repeat("k", 257), "1") })
	urequire.AbortsContains(t, cur, "64 KiB", func() { Set(cross(cur), "boards", "k", strings.Repeat("v", 64<<10+1)) })
	big := []string{}
	for i := 0; i < 65; i++ {
		big = append(big, "set", "boards", strconv.Itoa(i), "x")
	}
	urequire.AbortsContains(t, cur, "64 ops", func() { Batch(cross(cur), big) })
	Make(cross(cur), "extra")
	Set(cross(cur), "extra", "k", "v")
	urequire.AbortsContains(t, cur, "not taken", func() { Make(cross(cur), "extra") })
	Remove(cross(cur), "boards", "b")
}

func TestPagesIndexAndPlaces(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewCodeRealm(rules))
	for _, k := range []string{"c", "a", "e", "b", "d"} {
		Set(cross(cur), "ranks", k, "v "+k+"\n\"quoted\"")
	}
	uassert.Equal(t, 5, Size("ranks"))
	uassert.Equal(t, 0, Index("ranks", "a"))
	uassert.Equal(t, 2, Index("ranks", "c"))
	uassert.Equal(t, 3, Index("ranks", "cc"), "a key not there: its place")
	k, v := At("ranks", 1)
	uassert.Equal(t, "b", k)
	uassert.Equal(t, "v b\n\"quoted\"", v)
	uassert.Equal(t, `1:b12:v b
"quoted"1:c12:v c
"quoted"1:d12:v d
"quoted"`, Page("ranks", "b", "e", 10), "b, c, d (e excluded), each its length, then itself: newlines and quotes as they are")
	uassert.Equal(t, `1:a12:v a
"quoted"1:b12:v b
"quoted"`, Page("ranks", "", "", 2), "the limit")
	uassert.True(t, strings.HasPrefix(PageBack("ranks", "", "", 1), "1:e"), "back: from the end")
	urequire.PanicsContains(t, cur, "1 to 300", func() { Page("ranks", "", "", 301) })
	uassert.True(t, strings.HasPrefix(PageAt("ranks", 2, 2), "1:c12:"), "by offset: the third key on")
	uassert.True(t, strings.Contains(PageAt("ranks", 2, 2), "1:d12:") && !strings.Contains(PageAt("ranks", 2, 2), "1:e12:"), "two keys")
	uassert.Equal(t, "", PageAt("ranks", 9, 2), "past the end: nothing")
	uassert.Equal(t, "", PageAt("ranks", math.MaxInt, 2), "nor wrapped round to the seed")
	k, _ = At("ranks", math.MaxInt)
	uassert.Equal(t, "", k)
	for _, k := range []string{"a", "b", "c", "d", "e"} {
		Remove(cross(cur), "ranks", k)
	}
}

func TestNewRulesTakeOverThreeDaysLaterOnTheirOwn(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(rando))
	urequire.AbortsContains(t, cur, "only the owner", func() { Propose(cross(cur), next) })
	testing.SetRealm(testing.NewUserRealm(boss))
	urequire.AbortsContains(t, cur, "the rules are a realm", func() { Propose(cross(cur), "gno.land/p/x") })
	urequire.AbortsContains(t, cur, "the rules are a realm", func() { Propose(cross(cur), self) })
	Propose(cross(cur), next)
	p, when := Proposed()
	uassert.Equal(t, next, p)
	uassert.Equal(t, int64(0), when, "not counting until its code is on chain")
	skip(DELAY)
	uassert.Equal(t, rules, Writer(), "the delay with no code: nothing changes")
	testing.SetRealm(testing.NewUserRealm(rando))
	urequire.AbortsContains(t, cur, "only the proposed rules", func() { Ready(cross(cur)) })
	testing.SetRealm(testing.NewCodeRealm(rules))
	urequire.AbortsContains(t, cur, "only the proposed rules", func() { Ready(cross(cur)) })
	testing.SetRealm(testing.NewCodeRealm(next))
	Ready(cross(cur))
	testing.SetRealm(testing.NewCodeRealm(next))
	urequire.AbortsContains(t, cur, "once", func() { Ready(cross(cur)) })
	p, when = Proposed()
	uassert.Equal(t, next, p)
	uassert.Equal(t, time.Now().Unix()+DELAY, when, "the delay from its Ready")
	uassert.Equal(t, rules, Writer(), "the old rules write on meanwhile")
	testing.SetRealm(testing.NewCodeRealm(rules))
	Set(cross(cur), "meta", "k", "old")
	testing.SetRealm(testing.NewCodeRealm(next))
	urequire.AbortsContains(t, cur, "only gno.land/r/gnogolf/golf/v2", func() { Set(cross(cur), "meta", "k", "new") })

	skip(DELAY)
	uassert.Equal(t, next, Writer(), "the delay on: the new rules, nobody sending anything")
	p, _ = Proposed()
	uassert.Equal(t, "", p)
	testing.SetRealm(testing.NewCodeRealm(rules))
	urequire.AbortsContains(t, cur, "only gno.land/r/gnogolf/golf/v3", func() { Set(cross(cur), "meta", "k", "old") })
	testing.SetRealm(testing.NewCodeRealm(next))
	Set(cross(cur), "meta", "k", "new")
	v, _ := Get("meta", "k")
	uassert.Equal(t, "new", v, "the data kept: the new rules read on from it")
	uassert.Equal(t, next, writer, "made the writer at its first write")
	Remove(cross(cur), "meta", "k")
}

func TestCancelAndPauseAndRenounce(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(boss))
	urequire.AbortsContains(t, cur, "no new rules", func() { Cancel(cross(cur)) })
	Propose(cross(cur), next)
	testing.SetRealm(testing.NewCodeRealm(next))
	Ready(cross(cur))
	testing.SetRealm(testing.NewUserRealm(boss))
	Cancel(cross(cur))
	skip(DELAY)
	uassert.Equal(t, rules, Writer(), "cancelled: the rules stay")

	// paused: no writes at once, the reads go on, and any proposal gone
	Propose(cross(cur), next)
	testing.SetRealm(testing.NewCodeRealm(next))
	Ready(cross(cur))
	testing.SetRealm(testing.NewUserRealm(boss))
	Pause(cross(cur))
	uassert.Equal(t, "", Writer())
	testing.SetRealm(testing.NewCodeRealm(rules))
	urequire.AbortsContains(t, cur, "paused", func() { Set(cross(cur), "meta", "k", "v") })
	skip(DELAY)
	uassert.Equal(t, "", Writer(), "the proposal dropped with the pause")
	uassert.True(t, strings.Contains(Render(""), "Paused"))
	testing.SetRealm(testing.NewUserRealm(boss))
	urequire.AbortsContains(t, cur, "name new rules before giving the role up", func() { Renounce(cross(cur)) })
	testing.SetRealm(testing.NewUserRealm(rando))
	urequire.AbortsContains(t, cur, "only the owner", func() { Resume(cross(cur)) })
	testing.SetRealm(testing.NewUserRealm(boss))
	Resume(cross(cur))
	uassert.Equal(t, rules, Writer(), "resumed at once: the same rules")
	testing.SetRealm(testing.NewCodeRealm(rules))
	Set(cross(cur), "meta", "k", "v")
	Remove(cross(cur), "meta", "k")
	testing.SetRealm(testing.NewUserRealm(boss))
	urequire.AbortsContains(t, cur, "not paused", func() { Resume(cross(cur)) })
	Pause(cross(cur))

	testing.SetRealm(testing.NewUserRealm(boss))
	Propose(cross(cur), next)
	testing.SetRealm(testing.NewCodeRealm(next))
	Ready(cross(cur))
	testing.SetRealm(testing.NewUserRealm(boss))
	skip(DELAY)
	uassert.Equal(t, next, Writer())

	// renounced: nobody can change the writer, nor pause it, ever again; a
	// proposal in force stays, one not yet is dropped
	Propose(cross(cur), rules)
	testing.SetRealm(testing.NewCodeRealm(rules))
	Ready(cross(cur))
	testing.SetRealm(testing.NewUserRealm(boss))
	Renounce(cross(cur))
	uassert.Equal(t, next, writer, "the matured one became the writer")
	skip(DELAY)
	uassert.Equal(t, next, Writer(), "the one not in force was dropped")
	urequire.AbortsContains(t, cur, "only the owner", func() { Propose(cross(cur), rules) })
	urequire.AbortsContains(t, cur, "only the owner", func() { Pause(cross(cur)) })
	uassert.True(t, strings.Contains(Render(""), "Nobody"))
}

func TestTheRoleChangesHandsInTwoSteps(cur realm, t *testing.T) {
	fresh()
	testing.SetRealm(testing.NewUserRealm(boss))
	urequire.AbortsContains(t, cur, "not an address", func() { Transfer(cross(cur), "g1nope") })
	Transfer(cross(cur), heir)
	testing.SetRealm(testing.NewUserRealm(rando))
	urequire.AbortsContains(t, cur, "no transfer", func() { Accept(cross(cur)) })
	testing.SetRealm(testing.NewUserRealm(heir))
	Accept(cross(cur))
	uassert.Equal(t, heir, Owner())
	testing.SetRealm(testing.NewUserRealm(boss))
	urequire.AbortsContains(t, cur, "only the owner", func() { Pause(cross(cur)) })
}

func TestRenderSaysTheRulesAndWhatIsProposed(cur realm, t *testing.T) {
	fresh()
	uassert.True(t, strings.Contains(Render(""), "/r/gnogolf/golf/v2"))
	testing.SetRealm(testing.NewUserRealm(boss))
	Propose(cross(cur), next)
	uassert.True(t, strings.Contains(Render(""), "New rules proposed:** "+next+", not on chain yet"))
	testing.SetRealm(testing.NewCodeRealm(next))
	Ready(cross(cur))
	uassert.True(t, strings.Contains(Render(""), "New rules proposed:** ["+next+"]"))
}
