package gnomes

import (
	"strconv"
	"strings"
	"testing"

	"gno.land/p/nt/bptree/v0"
	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

// fakeRows is store's reads over trees of the test's own: under gno test
// golf has no owner, so no slot can be published through it. The rows are
// written by hand in golf/v2's formats (slotKey, encodeEntry, bestOf,
// copiesOf).
type fakeRows struct {
	c      map[string]*bptree.BPTree
	writer string
}

func newFake() *fakeRows { return &fakeRows{c: map[string]*bptree.BPTree{}, writer: rules} }

func (f *fakeRows) tree(name string) *bptree.BPTree {
	if f.c[name] == nil {
		f.c[name] = bptree.NewBPTree32()
	}
	return f.c[name]
}
func (f *fakeRows) set(name, key, value string) { f.tree(name).Set(key, value) }
func (f *fakeRows) Get(name, key string) (string, bool) {
	v := f.tree(name).Get(key)
	if v == nil {
		return "", false
	}
	return v.(string), true
}
func (f *fakeRows) Has(name, key string) bool { return f.tree(name).Has(key) }
func (f *fakeRows) Writer() string            { return f.writer }
func (f *fakeRows) Page(name, start, end string, limit int) string {
	var sb strings.Builder
	n := 0
	f.tree(name).Iterate(start, end, func(k string, v any) bool {
		s := v.(string)
		sb.WriteString(strconv.Itoa(len(k)) + ":" + k + strconv.Itoa(len(s)) + ":" + s)
		n++
		return n >= limit
	})
	return sb.String()
}

// entry is a hole's row as golf/v2's encodeEntry writes it: format "1", then
// 23 fields, each its length, ":" and itself; id, name, par first.
func entry(id string, par int) string {
	f := func(s string) string { return strconv.Itoa(len(s)) + ":" + s }
	s := "1:1" + f(id) + f("Hole") + f(strconv.Itoa(par))
	for i := 3; i < 23; i++ {
		s += "0:"
	}
	return s
}

// hole publishes slot n of a world at version 1, with its par: golf/v2's
// slotKey and holes rows. It returns the version id.
func hole(f *fakeRows, world string, n, par int) string {
	id := world + "/" + strconv.Itoa(n) + "/v1"
	pad := strconv.Itoa(n)
	for len(pad) < 3 {
		pad = "0" + pad
	}
	f.set("slots", strconv.Itoa(worldRank(world))+world+"/"+pad, id)
	f.set("holes", id, entry(id, par))
	return id
}

// best is a player's best on a version in a mode, as bestOf writes it.
func best(f *fakeRows, id, mode, player string, strokes int) {
	f.set("bests", id+" "+mode+" "+player, strconv.Itoa(strokes)+" 120 7 0.5,40")
}

// copied marks that best as a copy (golf/v2 copiesOf): kept, never ranked.
func copied(f *fakeRows, id, mode, player string) { f.set("copies", id+" "+mode+" "+player, "1") }

// cupHoles publishes n holes of a world, par 3 each; returns their version ids.
func cupHoles(f *fakeRows, world string, n int) []string {
	var ids []string
	for i := 1; i <= n; i++ {
		ids = append(ids, hole(f, world, i, 3))
	}
	return ids
}

// withRows is fresh with a fake store: the test's own rows.
func withRows(t *testing.T, rlm realm) *fakeRows {
	fresh(t, rlm)
	f := newFake()
	rows = f
	return f
}

func TestTheRowsReadAsGolfWritesThem(cur realm, t *testing.T) {
	f := withRows(t, cur)
	id := hole(f, "garden", 7, 3)
	uassert.Equal(t, 3, parOf(id))
	got := pageRows(f.Page("slots", "0garden/", "0garden0", 300))
	uassert.Equal(t, 1, len(got))
	uassert.Equal(t, "0garden/007", got[0][0])
	uassert.Equal(t, id, got[0][1])
	a := alice.String()
	uassert.Equal(t, 0, lowerBest(id, a), "no best")
	best(f, id, "assisted", a, 4)
	best(f, id, "pro", a, 2)
	uassert.Equal(t, 2, lowerBest(id, a), "the lower of the two modes")
	copied(f, id, "pro", a)
	uassert.Equal(t, 4, lowerBest(id, a), "a copy does not count")
	copied(f, id, "assisted", a)
	uassert.Equal(t, 0, lowerBest(id, a))
}

// A row not in the format the proof was built against refuses: a later
// format can refuse a mint, never prove a false one.
func TestARowNotAsGolfWritesItRefuses(cur realm, t *testing.T) {
	f := withRows(t, cur)
	f.set("holes", "garden/1/v1", "1:2"+"11:garden/1/v1") // format "2"
	urequire.PanicsContains(t, cur, errEntry, func() { parOf("garden/1/v1") })
	urequire.PanicsContains(t, cur, errEntry, func() { parOf("garden/9/v1") })
	for _, bad := range []string{"", "x 1", "1234 1", "12", " 1", "1a 1", "0 1"} {
		urequire.PanicsContains(t, cur, errBest, func() { strokesOf(bad) }, bad)
	}
	uassert.Equal(t, 7, strokesOf("7 120 3 0,1"))
	uassert.Equal(t, 120, strokesOf("120 9 3 0,1"))
	urequire.PanicsContains(t, cur, "store page", func() { pageRows("3:abc9:x") })
}

func TestEachKindIsProvenAndRefusedOneShort(cur realm, t *testing.T) {
	a := alice.String()
	for _, c := range []struct {
		kind, world string
		strokes     int // per hole
	}{
		{"wizard", "garden", 5}, {"viking", "garden", 3},
		{"pirate", "island", 5}, {"diver", "island", 3},
		{"baker", "town", 5}, {"mayor", "town", 3},
		{"miner", "mines", 9},
	} {
		f := withRows(t, cur)
		ids := cupHoles(f, c.world, 18)
		for _, id := range ids[1:] {
			best(f, id, "assisted", a, c.strokes)
		}
		ok, got, _ := prove(c.kind, a)
		uassert.False(t, ok, c.kind+": one hole short")
		uassert.Equal(t, 1, len(got.missing))
		uassert.Equal(t, c.world+"/1", got.missing[0])
		best(f, ids[0], "pro", a, c.strokes)
		ok, _, _ = prove(c.kind, a)
		uassert.True(t, ok, c.kind)
	}
}

func TestParMeansTheSumAtOrUnder(cur realm, t *testing.T) {
	a := alice.String()
	f := withRows(t, cur)
	ids := cupHoles(f, "garden", 18)
	for _, id := range ids {
		best(f, id, "assisted", a, 3)
	}
	ok, c, _ := prove("viking", a)
	uassert.True(t, ok)
	uassert.Equal(t, 54, c.par)
	best(f, ids[4], "assisted", a, 4) // one stroke over
	ok, c, _ = prove("viking", a)
	uassert.False(t, ok)
	uassert.Equal(t, 55, c.strokes)
	best(f, ids[5], "pro", a, 2) // and one under elsewhere: even again
	ok, _, _ = prove("viking", a)
	uassert.True(t, ok)
}

func TestGoldenIsFiveAcesAnywhere(cur realm, t *testing.T) {
	a := alice.String()
	f := withRows(t, cur)
	for i, w := range worlds {
		id := hole(f, w, 1, 3)
		if i < 4 {
			best(f, id, "pro", a, 1)
		}
	}
	ok, _, _ := prove("golden", a)
	uassert.False(t, ok, "four aces")
	best(f, hole(f, "mines", 2, 5), "assisted", a, 1)
	ok, _, _ = prove("golden", a)
	uassert.True(t, ok)
}

func TestKingIsVikingOnTheFourClassicCups(cur realm, t *testing.T) {
	a := alice.String()
	f := withRows(t, cur)
	for _, w := range []string{"garden", "island", "town", "mountain"} {
		for _, id := range cupHoles(f, w, 18) {
			best(f, id, "assisted", a, 3)
		}
	}
	ok, _, _ := prove("king", a)
	uassert.True(t, ok)
	cupHoles(f, "mines", 18) // the mines are not the King's
	ok, _, _ = prove("king", a)
	uassert.True(t, ok)
	best(f, "mountain/18/v1", "assisted", a, 4)
	ok, _, _ = prove("king", a)
	uassert.False(t, ok)
}

func TestWhatDoesNotCount(cur realm, t *testing.T) {
	a := alice.String()
	f := withRows(t, cur)
	ids := cupHoles(f, "garden", 18)
	for _, id := range ids {
		best(f, id, "assisted", a, 3)
	}
	// a best on an archived version only: the slot now points at v2
	f.set("slots", "0garden/001", "garden/1/v2")
	f.set("holes", "garden/1/v2", entry("garden/1/v2", 3))
	ok, _, _ := prove("wizard", a)
	uassert.False(t, ok, "archived")
	best(f, "garden/1/v2", "assisted", a, 3)
	ok, _, _ = prove("wizard", a)
	uassert.True(t, ok)
	// a resent ghost: the bests row is there, with a copies row
	copied(f, ids[3], "assisted", a)
	ok, c, _ := prove("wizard", a)
	uassert.False(t, ok, "a copy proves nothing")
	uassert.Equal(t, "garden/4", c.missing[0])
	// a cup with no slot on chain proves nothing
	ok, _, _ = prove("miner", a)
	uassert.False(t, ok)
}

func TestNewRulesProveNothing(cur realm, t *testing.T) {
	f := withRows(t, cur)
	f.writer = "gno.land/r/gnogolf/golf/v3"
	ok, _, why := prove("wizard", alice.String())
	uassert.False(t, ok)
	uassert.Equal(t, errRules, why)
	uassert.True(t, strings.Contains(Proof("wizard", alice), `"reason":"rules changed"`))
}

func TestProofSaysWhatAMintWouldFind(cur realm, t *testing.T) {
	a := alice.String()
	f := withRows(t, cur)
	ids := cupHoles(f, "garden", 18)
	for _, id := range ids[2:] {
		best(f, id, "assisted", a, 3)
	}
	uassert.Equal(t,
		`{"version":1,"kind":"viking","player":"`+a+`","ok":false,"minted":"","holes":18,"finished":16,"strokes":48,"par":54,"missing":["garden/1","garden/2"]}`,
		Proof("viking", alice))
	urequire.PanicsContains(t, cur, errKind, func() { Proof("dragon", alice) })
}

func TestAProvenKindIsMintedFreeOnce(cur realm, t *testing.T) {
	f := withRows(t, cur)
	a := alice.String()
	for _, id := range cupHoles(f, "garden", 18) {
		best(f, id, "assisted", a, 3)
	}
	testing.SetRealm(asUser(alice, ugnot(1)))
	urequire.AbortsContains(t, cur, "free", func() { MintEarned(cross(cur), "wizard") })
	testing.SetRealm(asUser(alice, nil))
	urequire.AbortsContains(t, cur, "not proven: miner", func() { MintEarned(cross(cur), "miner") })
	urequire.AbortsContains(t, cur, "no such earned gnome", func() { MintEarned(cross(cur), "dragon") })
	uassert.Equal(t, "1000001", MintEarned(cross(cur), "wizard"))
	uassert.Equal(t, "1000002", MintEarned(cross(cur), "viking"))
	urequire.AbortsContains(t, cur, "already minted", func() { MintEarned(cross(cur), "wizard") })

	uassert.True(t, strings.Contains(Proof("wizard", alice), `"minted":"1000001"`))
	uassert.Equal(t,
		`{"version":1,"id":"1000001","series":"earned","name":"The Wizard","tier":"earned","traits":"`+earnedTraits(1)+`","owner":"`+a+`","price":0,"sold":true,"closed":false}`,
		Gnome("1000001"))
	uassert.Equal(t, int64(2), TotalSupply())

	// a relay is refused, as for every call the chain would trust OriginSend on
	testing.SetOriginCaller(alice)
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/attacker/relay"))
	urequire.AbortsContains(t, cur, "directly", func() { MintEarned(cross(cur), "golden") })
}

// Earned gnomes sell nothing, so the switch over sales does not close them.
func TestThePauseDoesNotCloseTheEarnedMint(cur realm, t *testing.T) {
	f := withRows(t, cur)
	for _, id := range cupHoles(f, "mines", 18) {
		best(f, id, "pro", alice.String(), 9)
	}
	mintOpen = false
	testing.SetRealm(asUser(alice, nil))
	uassert.Equal(t, "1000001", MintEarned(cross(cur), "miner"))
}

func TestNewRulesRefuseTheMint(cur realm, t *testing.T) {
	f := withRows(t, cur)
	f.writer = "gno.land/r/gnogolf/golf/v3"
	testing.SetRealm(asUser(alice, nil))
	urequire.AbortsContains(t, cur, "rules changed", func() { MintEarned(cross(cur), "wizard") })
}

func TestAnEarnedGnomeIsBoundToItsPlayer(cur realm, t *testing.T) {
	f := withRows(t, cur)
	for _, id := range cupHoles(f, "mines", 18) {
		best(f, id, "pro", alice.String(), 9)
	}
	testing.SetRealm(asUser(alice, nil))
	id := MintEarned(cross(cur), "miner")
	Equip(cross(cur), id)
	uassert.Equal(t, `{"version":1,"player":"`+alice.String()+`","id":"`+id+`","name":"The Miner","tier":"earned","traits":"`+earnedTraits(9)+`"}`, Equipped(alice))
	urequire.AbortsContains(t, cur, "bound to its player", func() { Approve(cross(cur), bob, id) })
	// (the hook's panic aborts the transfer, and on chain the whole call with
	// the ledger's write; the harness does not revert what a recovered call
	// wrote, as golf's z_worst_shot notes, so the state is not checked here)
	urequire.AbortsContains(t, cur, "bound to its player", func() { TransferFrom(cross(cur), alice, bob, id) })

}

// An operator approved for all still cannot move an earned gnome.
func TestAnOperatorCannotMoveAnEarnedGnome(cur realm, t *testing.T) {
	f := withRows(t, cur)
	for _, id := range cupHoles(f, "mines", 18) {
		best(f, id, "pro", alice.String(), 9)
	}
	testing.SetRealm(asUser(alice, nil))
	id := MintEarned(cross(cur), "miner")
	SetApprovalForAll(cross(cur), bob, true)
	testing.SetRealm(asUser(bob, nil))
	urequire.AbortsContains(t, cur, "bound to its player", func() { TransferFrom(cross(cur), alice, bob, id) })
}

func TestABurnedKindIsMintedAgainUnderANewID(cur realm, t *testing.T) {
	f := withRows(t, cur)
	for _, id := range cupHoles(f, "mines", 18) {
		best(f, id, "pro", alice.String(), 9)
	}
	testing.SetRealm(asUser(alice, nil))
	id := MintEarned(cross(cur), "miner")
	Equip(cross(cur), id)
	Burn(cross(cur), id)
	uassert.Equal(t, "", Equipped(alice))
	uassert.Equal(t, int64(0), TotalSupply())
	uassert.Equal(t, `{"version":1,"id":""}`, Gnome(id), "a burned earned gnome is gone")
	uassert.Equal(t, "1000002", MintEarned(cross(cur), "miner"), "ids are never reused")
}

// The nine kinds' traits are the designer's codec's, byte for byte (format
// 1: tier 0 earned, the kind, every other field plain); selfcheck.ts holds
// them to web/lib/gnomes/codec.ts.
func TestEarnedTraitsAreTheCodecs(t *testing.T) {
	uassert.Equal(t, "01000001000000ffff00ffff00ff00000000ff00ff00ff00ff00ff00ff", earnedTraits(1))
	uassert.Equal(t, "01000009000000ffff00ffff00ff00000000ff00ff00ff00ff00ff00ff", earnedTraits(9))
	uassert.Equal(t, 9, len(earnedKinds))
	uassert.Equal(t, len(earnedKinds), len(earnedNames))
}

// Earned ids start above every id a catalogue can reach (64 series of 1,000
// rows end at 64,000), so a later series never meets them.
func TestEarnedIDsAreAboveEveryCatalogue(t *testing.T) {
	uassert.True(t, firstEarned > maxSeries*maxSeriesRows)
	uassert.Equal(t, int64(1_000_001), int64(firstEarned))
}
