package golf

import (
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"testing"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
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
var golden = map[string][3]string{
	"pulse":  {"9719d14aa64e381c", "076ac3e7c0d705a9", "9e3c8794bb1d1d11"},
	"sea":    {"12b5a8cdb090a87b", "c3224daa821020f4", "f56f3dd4a17ea7ed"},
	"slope":  {"87e7f3740220c88a", "105d3fc181182b05", "75dfd3431a6bffc3"},
	"storm":  {"01699172e9684456", "e6d6becaf3a225c0", "998fdc1a5358c897"},
	"timed":  {"e6df7a73dd8d8b0f", "c3224daa821020f4", "0063bad2dad04acc"},
	"tunnel": {"4dfa30294af9fc9b", "c3224daa821020f4", "df901e669ef4d8e6"},
}

func TestGoldenReplays(cur realm, t *testing.T) {
	for name, h := range goldHoles() {
		id := "gno.land/r/gnogolf/gold_" + name
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
			sum(forecastJSON(weatherOf(mustHole(id), p))),
			sum(State(id)),
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
		register(cur, "a"+strconv.Itoa(i)) // under gno.land/r/test/, which sorts after gnogolf
	}
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/gnogolf/zz"))
	Register(cross(cur), &flat{})
	l := listed()
	if len(l) != maxListed {
		t.Fatalf("the list is capped at %d, got %d", maxListed, len(l))
	}
	found := false
	for _, e := range l {
		if e.id == "gno.land/r/gnogolf/zz" {
			found = true
		}
	}
	if !found {
		t.Fatal("an official hole is always on the list")
	}
}

func TestTheTopIsTen(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/gnogolf/top"))
	Register(cross(cur), &flat{})
	for i := 0; i < topSize+3; i++ {
		p := address("g1top" + strconv.Itoa(i) + "000000000000000000000000000000000")
		testing.SetRealm(testing.NewUserRealm(p))
		PlayRound(cross(cur), "gno.land/r/gnogolf/top", "0,5;0,5;0,5;0,5")
	}
	if len(top) > topSize {
		t.Fatalf("the top keeps %d, got %d", topSize, len(top))
	}
}
