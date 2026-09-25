package golf

import (
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"strings"
	"testing"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/urequire/v0"
)

// The golden tests pin exact outputs: a change that only makes the code
// cheaper must leave every one of these byte for byte as it was. A change to
// them is a change to the game, and says so by failing here.

func v(x, y float64) physics.Vec2 { return physics.Vec2{X: x, Y: y} }

func lane(zones []physics.Zone, walls ...[]physics.Wall) *physics.Field {
	return &physics.Field{
		Walls:    physics.Walls(append([][]physics.Wall{physics.Box(v(0, 0), v(40, 10))}, walls...)...),
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
			Course: lane(nil, physics.Timed(physics.Bar(v(20, 0.5), v(20, 9.5), 0.5, 'T', "tram"), 12, 5, 0))},
		"slope": {W: 40, H: 10, Title: "Slope", Tee: v(3, 5), Pin: v(37, 5), Substeps: 24, CupRadius: 1.2,
			Course: lane([]physics.Zone{{Kind: physics.Slope, Min: v(12, 0), Max: v(24, 10), Vec: v(-0.25, 0), Skin: "slope"}})},
		"sea": {W: 40, H: 10, Title: "Sea", Tee: v(3, 5), Pin: v(37, 5), Substeps: 22, CupRadius: 1.2, World: "island",
			Course: lane([]physics.Zone{{Kind: physics.Hazard, Min: v(0, 0), Max: v(40, 10), Vec: v(3, 5), Skin: "sea", Poly: sea, Outside: true}})},
		"tunnel": {W: 40, H: 10, Title: "Tunnel", Tee: v(3, 5), Pin: v(37, 5), Substeps: 22, CupRadius: 1.2,
			Course: lane([]physics.Zone{{Kind: physics.Tunnel, Min: v(14, 3), Max: v(17, 7), Vec: v(30, 5), Skin: "tunnel", Round: true}},
				physics.Bar(v(22, 0), v(22, 10), 0.6, '#', "hedge"))},
		"pulse": {W: 40, H: 10, Title: "Pulse", Tee: v(3, 5), Pin: v(37, 5), Substeps: 22, CupRadius: 1.2,
			Pulses: []course.Pulse{{Every: 2, On: 1, Walls: physics.Bar(v(20, 3), v(20, 7), 0.5, '=', "gate door")}},
			Course: lane(nil, physics.Bar(v(20, 0), v(20, 3), 0.5, '|', "gate"), physics.Bar(v(20, 7), v(20, 10), 0.5, '|', "gate"))},
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
func periodOf(id, world string, h course.Hole, kind string) int64 {
	for p := Period(); p > Period()-2000; p-- {
		if course.ForecastFor(id, world, h, p).Kind == kind {
			return p
		}
	}
	panic("no " + kind + " period")
}

// golden: fixture -> sha256 prefix of its SimulateRoundAt (weather period
// chosen per fixture), its Forecast, and its State.
//
// Deploy v1: the fixtures stay realm holes under golf's namespace, which the
// owner now has to Expect, and which are no longer the course's (the course
// is data): State says "official":false where these hashes were taken with
// true. The State column is checked with that one flag put back, so every
// other byte is pinned as it was.
// 2026-09-25, hub fixes: the JSON shapes changed (a "version" field, the exact
// "rest", "official" in State, no "by"), not the replays: with those fields
// taken out, every SimulateRoundAt and State output is byte for byte as it was
// (integer jnum included). The forecast column did not move.
var golden = map[string][3]string{
	"pulse":  {"678f136eb4ef0257", "076ac3e7c0d705a9", "4e9da97515c48b33"},
	"sea":    {"4ce93b61be350770", "c3224daa821020f4", "807b1e8fc908df52"},
	"slope":  {"1ae52dd6618cad52", "0757d6c38ca9a9ef", "0f53bd2e587932b7"},
	"storm":  {"27839a2f650ea264", "217b2a005fc76324", "cd0874fd52e8179f"},
	"timed":  {"932f9c494b5c025f", "c3224daa821020f4", "e4dbc97ea48d1ede"},
	"tunnel": {"2b8666eb09290dde", "c3224daa821020f4", "335763617c2e9b50"},
}

func TestGoldenReplays(cur realm, t *testing.T) {
	for name, h := range goldHoles() {
		id := "gno.land/r/gnogolf/gold_" + name
		setOwner(deployer)
		testing.SetRealm(testing.NewUserRealm(deployer))
		Expect(cross(cur), id)
		testing.SetRealm(testing.NewCodeRealm(id))
		Register(cross(cur), h)
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
			sum(SimulateRoundAt(id, goldShots, p)),
			sum(forecastJSON("", weatherOf(mustHole(id), h, p))),
			sum(strings.Replace(State(id), `"official":false`, `"official":true`, 1)),
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

// long is a hostile hole: its path is far longer than any honest one.
type long struct{ flat }

func (h *long) Play(ball physics.Vec2, angle, power float64) (physics.Shot, bool) {
	sh := physics.Shot{}
	for i := 0; i <= maxPath; i++ {
		sh.Path = append(sh.Path, ball)
		sh.Air = append(sh.Air, false)
	}
	return sh, false
}

func TestAnOversizedPathIsRefused(cur realm, t *testing.T) {
	id := "gno.land/r/test/long"
	testing.SetRealm(testing.NewCodeRealm(id))
	Register(cross(cur), &long{})
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "oversized path", func() { Launch(cross(cur), id, 0, 1) })
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
		PlayRound(cross(cur), id, "0,0.001;0,1")
	}
	lb := Leaderboard("assisted")
	if n := strings.Count(lb, `"player"`); n != topSize {
		t.Fatalf("the top shows %d, got %d: %s", topSize, n, lb)
	}
}
