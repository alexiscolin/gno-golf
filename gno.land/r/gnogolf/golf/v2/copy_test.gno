package golf

import (
	"strings"
	"testing"

	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

// copyHole is a fresh version of one course slot, for these tests alone (a
// slot each would leave the other tests' lists less room).
func copyHole(cur realm, title string) string { return publish(cur, cupHole("garden", 93, title)) }

// holeRank is a player's place on a hole's board, 0 off it.
func holeRank(id string, p address) string { return jfield(HoleRank(id, "assisted", p), "rank") }

// A record of the board sent again, nearly (each shot within copyAngle and
// copyPower): kept as the player's round and ghost, never ranked, not even by a
// later finish; their own better round ranks them, counted once.
func TestACopyIsKeptNotRanked(cur realm, t *testing.T) {
	id := copyHole(cur, "Copied")
	a, b, c := testutils.TestAddress("cpa"), testutils.TestAddress("cpb"), testutils.TestAddress("cpc")
	giveName(cur, a, "cpa")
	giveName(cur, b, "cpb")
	giveName(cur, c, "cpc")
	replayAs(cur, a, id, "0.37,0.01;0.41,0.01;0.29,1")
	urequire.Equal(t, 3, BestOf(id, "assisted", a))
	urequire.Equal(t, "1", holeRank(id, a))

	replayAs(cur, b, id, "0.40,0.02;0.38,0.01;0.31,1.01") // nudged, within the tolerance
	uassert.Equal(t, 3, BestOf(id, "assisted", b), "kept: their round")
	uassert.False(t, strings.Contains(Ghost(id, "assisted", b), "null"), "and their ghost")
	uassert.Equal(t, "0", holeRank(id, b), "not on the board")
	holes, _, _ := standingOf("assisted", b)
	uassert.Equal(t, 0, holes, "nor in the course standings")

	replayAs(cur, b, id, "0.40,0.02;0.38,0.01;0.31,1") // the copy sent again, a worse one
	uassert.Equal(t, "0", holeRank(id, b), "another copy ranks no more")
	replayAs(cur, b, id, "0.40,0.02;0.38,0.01;0.30,0.01;0.31,1") // a round of their own, worse than the copy
	uassert.Equal(t, 4, BestOf(id, "assisted", b), "their own replaces the copy, better or not")
	uassert.NotEqual(t, "0", holeRank(id, b), "and ranks")

	replayAs(cur, c, id, "0.50,0.01;0.52,0.01;0.20,1") // 0.13° off and more: a round of their own
	uassert.NotEqual(t, "0", holeRank(id, c), "another's own round ranks")

	replayAs(cur, b, id, "0.9,1") // their own, better
	uassert.Equal(t, 1, BestOf(id, "assisted", b))
	uassert.Equal(t, "1", holeRank(id, b), "ranked on their own round")
	holes, _, _ = standingOf("assisted", b)
	uassert.Equal(t, 1, holes, "counted once")
}

// Two players keying, or a short round, send alike by nature: not copies.
func TestKeyedOrShortRoundsAreNoCopies(cur realm, t *testing.T) {
	id := copyHole(cur, "Keyed")
	a, b := testutils.TestAddress("kya"), testutils.TestAddress("kyb")
	giveName(cur, a, "kya")
	giveName(cur, b, "kyb")
	replayAs(cur, a, id, "0,0.01;0,0.01;0,1") // whole degrees: keyed
	replayAs(cur, b, id, "0,0.01;0,0.01;0,1")
	uassert.NotEqual(t, "0", holeRank(id, b), "the same keyed round: ranked (a tie, in the same block here: by address)")
	c := testutils.TestAddress("kyc")
	giveName(cur, c, "kyc")
	id2 := copyHole(cur, "Short")
	replayAs(cur, a, id2, "0.37,1")
	replayAs(cur, c, id2, "0.37,1")
	uassert.NotEqual(t, "0", holeRank(id2, c), "one shot: ranked")
}

// A copy never takes the place of a best of the player's own.
func TestACopyNeverReplacesAnOwnBest(cur realm, t *testing.T) {
	id := copyHole(cur, "Own best")
	a, b := testutils.TestAddress("rpa"), testutils.TestAddress("rpb")
	giveName(cur, a, "rpa")
	giveName(cur, b, "rpb")
	replayAs(cur, b, id, "0.6,0.01;0.62,0.01;0.64,0.01;0.66,1") // their own, 4
	replayAs(cur, a, id, "0.37,0.01;0.41,0.01;0.29,1")         // 3
	replayAs(cur, b, id, "0.37,0.01;0.41,0.01;0.29,1")         // a's, sent again
	uassert.Equal(t, 4, BestOf(id, "assisted", b), "their own best stays")
	uassert.Equal(t, "2", holeRank(id, b), "and so does its place")
}

// A copy is a copy whatever its ticks (they change nothing on a hole with no
// timed piece), in the other mode (the same physics), and across 0°.
func TestACopyIsCaughtInEitherModeAndAnyTick(cur realm, t *testing.T) {
	id := copyHole(cur, "Either")
	a, b, c, d := testutils.TestAddress("ema"), testutils.TestAddress("emb"), testutils.TestAddress("emc"), testutils.TestAddress("emd")
	for i, p := range []address{a, b, c, d} {
		giveName(cur, p, "em"+string(rune('a'+i)))
	}
	replayAs(cur, a, id, "359.99,0.01;0.41,0.01;0.29,1")
	replayAs(cur, b, id, "359.99,0.01,7;0.41,0.01,900;0.29,1") // ticks changed
	uassert.Equal(t, "0", holeRank(id, b), "another tick: still a copy")
	testing.SetRealm(testing.NewUserRealm(c))
	PlayRoundPro(cross(cur), id, "359.99,0.01;0.41,0.01;0.29,1", Period()) // the assisted record, sent as pro
	uassert.Equal(t, "0", jfield(HoleRank(id, "pro", c), "rank"), "the other mode: still a copy")
	uassert.Equal(t, 3, BestOf(id, "pro", c), "kept")
	replayAs(cur, d, id, "-0.02,0.01;0.42,0.02;0.3,1") // 0.03° off across 0°
	uassert.Equal(t, "0", holeRank(id, d), "across 0°: still a copy")
	testing.SetRealm(testing.NewUserRealm(a))
	PlayRoundPro(cross(cur), id, "359.99,0.01;0.41,0.01;0.29,1", Period()) // their own, in the other mode
	uassert.Equal(t, "1", jfield(HoleRank(id, "pro", a), "rank"), "one's own round, in the other mode: ranked")
}
