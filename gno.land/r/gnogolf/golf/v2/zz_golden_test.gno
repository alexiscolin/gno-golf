package golf

import (
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"strings"
	"testing"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/urequire/v0"
)

// The golden tests pin exact outputs: a change that only makes the code
// cheaper must leave every one of these byte for byte as it was. A change to
// them is a change to the game, and says so by failing here.

func v(x, y float64) physics.Vec2 { return physics.Vec2{X: x, Y: y} }

func lane(zones []physics.Zone, walls ...[]physics.Wall) *physics.Field {
	return &physics.Field{
		Walls:    build.Walls(append([][]physics.Wall{build.Box(v(0, 0), v(40, 10))}, walls...)...),
		Zones:    zones,
		Friction: 0.86,
		Radius:   0.5,
		Bounce:   0.85,
	}
}

// the fixtures: one of each thing a stroke can meet
func goldHoles() map[string]*course.Simple {
	sea := []physics.Vec2{v(1, 3), v(39, 3), v(39, 7), v(1, 7)}
	return map[string]*course.Simple{
		"timed": {W: 40, H: 10, Title: "Timed", Tee: v(3, 5), Pin: v(37, 5), Substeps: 22, CupRadius: 1.2,
			Course: lane(nil, build.Timed(build.Bar(v(20, 0.5), v(20, 9.5), 0.5, 'T', "tram"), 12, 5, 0))},
		"slope": {W: 40, H: 10, Title: "Slope", Tee: v(3, 5), Pin: v(37, 5), Substeps: 24, CupRadius: 1.2,
			Course: lane([]physics.Zone{{Kind: physics.Slope, Min: v(12, 0), Max: v(24, 10), Vec: v(-0.25, 0), Skin: "slope"}})},
		"sea": {W: 40, H: 10, Title: "Sea", Tee: v(3, 5), Pin: v(37, 5), Substeps: 22, CupRadius: 1.2, World: "island",
			Course: lane([]physics.Zone{{Kind: physics.Hazard, Min: v(0, 0), Max: v(40, 10), Vec: v(3, 5), Skin: "sea", Poly: sea, Outside: true}})},
		"tunnel": {W: 40, H: 10, Title: "Tunnel", Tee: v(3, 5), Pin: v(37, 5), Substeps: 22, CupRadius: 1.2,
			Course: lane([]physics.Zone{{Kind: physics.Tunnel, Min: v(14, 3), Max: v(17, 7), Vec: v(30, 5), Skin: "tunnel", Round: true}},
				build.Bar(v(22, 0), v(22, 10), 0.6, '#', "hedge"))},
		"pulse": {W: 40, H: 10, Title: "Pulse", Tee: v(3, 5), Pin: v(37, 5), Substeps: 22, CupRadius: 1.2,
			Pulses: []course.Pulse{{Every: 2, On: 1, Walls: build.Bar(v(20, 3), v(20, 7), 0.5, '=', "gate door")}},
			Course: lane(nil, build.Bar(v(20, 0), v(20, 3), 0.5, '|', "gate"), build.Bar(v(20, 7), v(20, 10), 0.5, '|', "gate"))},
		"storm": {W: 40, H: 10, Title: "Storm", Tee: v(3, 5), Pin: v(37, 5), Substeps: 22, CupRadius: 1.2, World: "island",
			Course: lane(nil)},
	}
}

var goldShots = "0,6;15,4.5,3;-30,8,7;170,2"

func sum(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:8])
}

// the period of a kind of weather for a hole: the first at or before now
func periodOf(id, world string, h *course.Simple, kind string) int64 {
	for p := Period(); p > Period()-2000; p-- {
		if course.ForecastFor(id, world, h, p).Kind == kind {
			return p
		}
	}
	panic("no " + kind + " period")
}

// golden: fixture -> sha256 prefix of its SimulateRoundAt (weather period
// chosen per fixture), its Forecast, and its HoleState (State until
// 2026-09-30).
//
// Deploy v1: the fixtures were realm holes under golf's namespace, which
// are no longer the course's (the course is data): State says
// "official":false where these hashes were taken with true. The State column
// is checked with that one flag put back, so every other byte is pinned as
// it was. Final fixes: holes are only data now, so each fixture is kept as
// data under its old id (goldAt): the id seeds the weather, and every hash
// stayed as it was.
// 2026-09-25, hub fixes: the JSON shapes changed (a "version" field, the exact
// "rest", "official" in State, no "by"), not the replays: with those fields
// taken out, every SimulateRoundAt and State output is byte for byte as it was
// (integer jnum included). The forecast column did not move.
// 2026-09-26, physics rework (rolling resistance, contact impulses, ballistic
// flight, Holmes's cup, the new Launch): the replay column moved, on all six;
// the forecast and State columns did not.
// 2026-09-26, work and rebound: counting every zone look in Shot.Work moved
// nothing; a passive piece playing at most 0.75 (MaxBounce), and only a
// bumper kicking, moved the replay column of the four whose lane's 0.85
// walls are met (pulse, slope, storm, timed); sea and tunnel did not move.
// 2026-09-26, a hazard sends the ball back where the stroke was played
// from, not to its Vec: the sea's replay moved (its later strokes).
// 2026-09-27, each shot's "work" in the Simulate* answers: the replay column
// moved on all six; with "work" taken out it hashes as it did (pulse
// deb2fa81ccd4573d, sea d841bb88749cafa5, slope ee9475088019c6cd, storm
// 384620ca83b7330d, timed 3d16130d4e52c06b, tunnel ff92e949423cf8b8). The
// forecast and State columns did not move.
// 2026-09-28, the cup's and the ball's radii in State ("cupR", "ballR"): the
// State column moved on all six; with them taken out it hashes as it did.
// The replay and forecast columns did not move.
// 2026-09-28, the board's work in State ("work": newWork's walls, pieces
// and pulse set-up, what the client's save split reads): the State column
// moved on all six, nothing else in it did. The replay and forecast columns
// did not move (nor with the physics' roll-on rule in one helper, rollsOn).
// 2026-09-30, State removed (only its tests read it; the client reads
// HoleState, which is State without "plays" and the rounds): the third
// column hashes HoleState instead, and moved on all six for that alone. The
// new hashes are the ones the code before the removal gave for HoleState.
// The replay and forecast columns did not move.
var golden = map[string][3]string{
	"pulse":  {"2df4849397343b5c", "076ac3e7c0d705a9", "e80fe259799b6bb7"},
	"sea":    {"9cc043701ff301c4", "c3224daa821020f4", "e73fad3555ef963b"},
	"slope":  {"0983305ba509f74d", "0757d6c38ca9a9ef", "cdf79e14c4936c42"},
	"storm":  {"51af6518629e6a99", "217b2a005fc76324", "70fda29e98eedd34"},
	"timed":  {"d32d1dc343013582", "c3224daa821020f4", "82144ad536460597"},
	"tunnel": {"325ffde22c9b1a13", "c3224daa821020f4", "8746d7b3047b3df4"},
}

// goldAt keeps h as data under id, listed as its realm hole was: the world
// "garden" when it names none (data always names one), and no order of its
// own.
func goldAt(id string, h *course.Simple) {
	if h.World == "" {
		h.World = "garden"
	}
	community.Set(id, encodeEntry(newEntry(id, cleanName(h.Title), h.Par(), h.World, 1<<20)))
	holeData.Set(id, course.Encode(h))
}

func TestGoldenReplays(cur realm, t *testing.T) {
	for name, h := range goldHoles() {
		id := "gno.land/r/gnogolf/gold_" + name
		goldAt(id, h)
		kind := course.Clear
		if name == "storm" {
			kind = "storm"
		}
		if name == "slope" {
			kind = "rain"
		}
		world := h.World
		if world == "" {
			world = "garden"
		}
		p := periodOf(id, world, h, kind)
		// the period's offset from now, not its number, is what repeats
		got := [3]string{
			sum(simAt(id, goldShots, p)),
			sum(forecastJSON("", weatherOf(mustHole(id), h, p))),
			sum(strings.Replace(HoleState(id), `"official":false`, `"official":true`, 1)),
		}
		want, ok := golden[name]
		if !ok {
			t.Logf("golden %q: {%q, %q, %q} (period %d)", name, got[0], got[1], got[2], p)
			continue
		}
		if got != want {
			t.Errorf("%s changed: got %v, want %v", name, got, want)
		}
	}
}

func TestARoundHasAStrokeLimit(cur realm, t *testing.T) {
	id := register(cur, "limit")
	for i := 0; i < maxRoundStrokes; i++ {
		testing.SetRealm(testing.NewUserRealm(player))
		Launch(cross(cur), id, 180, 0.5)
	}
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "stroke limit", func() { Launch(cross(cur), id, 180, 0.5) })
}

func TestTheTickIsClamped(t *testing.T) {
	if _, _, k := parseShot("0,5,99999"); k != maxTick {
		t.Errorf("a huge tick clamps to %d, got %d", maxTick, k)
	}
	if _, _, k := parseShot("0,5,-3"); k != 0 {
		t.Errorf("a negative tick clamps to 0, got %d", k)
	}
	if _, _, k := parseShot("0,5"); k != 0 {
		t.Errorf("no tick is tick 0, got %d", k)
	}
}

func TestAFuturePeriodIsRefused(cur realm, t *testing.T) {
	id := register(cur, "ahead")
	defer func() {
		if recover() == nil {
			t.Fatal("the weather to come is not given out")
		}
	}()
	Weather(id, Period()+1) // a query: no realm crossing, a plain panic
}

func TestOfficialHolesAreListedFirst(cur realm, t *testing.T) {
	for i := 0; i < maxListed+2; i++ {
		register(cur, "a"+strconv.Itoa(i))
	}
	id := courseHole(cur, 999) // the last slot of the garden
	l := listed()
	if len(l) != maxListed {
		t.Fatalf("the list is capped at %d, got %d", maxListed, len(l))
	}
	found := false
	for _, e := range l {
		if e.id == id {
			found = true
		}
	}
	if !found {
		t.Fatal("an official hole is always on the list")
	}
}

func TestTheTopIsTen(cur realm, t *testing.T) {
	id := courseHole(cur, 998)
	for i := 0; i < topSize+3; i++ {
		p := testutils.TestAddress("top" + strconv.Itoa(i))
		giveName(cur, p, "top"+strconv.Itoa(i))
		testing.SetRealm(testing.NewUserRealm(p))
		PlayRound(cross(cur), id, "0,0.01;0,1")
	}
	lb := Leaderboard("assisted")
	if n := strings.Count(lb, `"player"`); n != topSize {
		t.Fatalf("the top shows %d, got %d: %s", topSize, n, lb)
	}
}
