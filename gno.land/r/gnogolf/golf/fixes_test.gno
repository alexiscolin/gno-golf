package golf

import (
	"math"
	"strconv"
	"strings"
	"testing"
	"time"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/ufmt/v0"
	"gno.land/p/nt/urequire/v0"
	"gno.land/r/sys/names"
)

// Tests for the hub's gas cap, storage, sorted boards, paged reads and period rules.

// setContext changes the test chain's context in place, keeping the rest.
func setContext(f func(ctx *testing.Context)) {
	ctx := testing.GetContext()
	f(&ctx)
	testing.SetContext(ctx)
}

// B3: the integer jnum prints the bytes of "%.3f", ties, signs and giants
// included.
func TestJnumIsPercentThreeF(t *testing.T) {
	vals := []float64{0, math.Copysign(0, -1), -0.0004, -0.0005, 0.0005, 0.0015, 0.0025, 1.0005, 2.675, -2.675,
		0.1, 0.2, 0.3, 1e-9, -1e-9, 999.9995, 12345.6785, 1e11, 1.5e12, -3e15, 4503599627370497, 8.000000000000002}
	x := uint64(88172645463325252)
	for i := 0; i < 3000; i++ {
		x ^= x << 13
		x ^= x >> 7
		x ^= x << 17
		// board-sized numbers, some on a 1e-4 grid (ties at the 4th decimal)
		v := float64(x%20000000)/1e5 - 100
		if i%3 == 0 {
			v = math.Round(v*1e4) / 1e4
		}
		vals = append(vals, v)
	}
	for _, v := range vals {
		if got, want := jnum(v), ufmt.Sprintf("%.3f", v); got != want {
			t.Errorf("jnum(%v) = %s, want %s", v, got, want)
		}
	}
	uassert.Equal(t, "0", jnum(math.NaN()))
	uassert.Equal(t, "0", jnum(math.Inf(-1)))
}

// B3, B5: State lists rounds without paths; Round replays the last stroke's
// path; a round stores its shots, not its path; Reset frees the round.
func TestRoundsStoreShotsNotPaths(cur realm, t *testing.T) {
	id := register(cur, "nopaths")
	testing.SetRealm(testing.NewUserRealm(player))
	PlayRoundAt(cross(cur), id, "10,2;-20,3", Period())
	st := State(id)
	uassert.False(t, strings.Contains(st[strings.Index(st, `"rounds"`):], `"path"`), "no path in State's rounds")
	uassert.True(t, strings.Contains(st, `"shots":"10.0000,2.0000,0;-20.0000,3.0000,0"`), st)
	// the path Round gives is the last stroke's, from where it started
	want := SimulateFrom(id, roundOf(mustHole(id), player).fx, roundOf(mustHole(id), player).fy, "-20,3", 1, Period())
	got := Round(id, player)
	uassert.Equal(t, want[strings.Index(want, `"path"`):strings.Index(want, `,"rest"`)], got[strings.Index(got, `"path"`):len(got)-1])

	testing.SetRealm(testing.NewUserRealm(player))
	Reset(cross(cur), id)
	uassert.Equal(t, "null", Round(id, player), "Reset drops the round")
}

// heavy is a flat hole behind a thousand small walls: a lot of work a stroke.
type heavy struct{ flat }

var heavyField = func() *physics.Field {
	ws := physics.Box(physics.Vec2{X: 0, Y: 0}, physics.Vec2{X: 32, Y: 16})
	for i := 0; i < 1000; i++ {
		x := 25 + float64(i%20)*0.3
		y := 1 + float64(i/20)*0.25
		ws = append(ws, physics.Wall{Seg: physics.Segment{A: physics.Vec2{X: x, Y: y}, B: physics.Vec2{X: x + 0.2, Y: y}}})
	}
	return &physics.Field{Walls: ws, Friction: 0.8, Bounce: 0.9}
}()

func (h *heavy) Field() *physics.Field { return heavyField }
func (h *heavy) Preview(ball physics.Vec2, angle, power float64) (physics.Shot, bool) {
	return heavyField.Step(ball, physics.FromPolar(angle, power), 14), false
}
func (h *heavy) Play(ball physics.Vec2, angle, power float64) (physics.Shot, bool) {
	return h.Preview(ball, angle, power)
}

// B4: a commit is bounded by its work, not a count of shots: past the budget
// it is refused before the shot that would overrun it, with the number that
// fit, and the preview refuses it the same way. A light hole takes all 12.
func TestACommitIsBoundedByWork(cur realm, t *testing.T) {
	id := "gno.land/r/test/heavy"
	testing.SetRealm(testing.NewCodeRealm(id))
	Register(cross(cur), &heavy{})
	shots := strings.Repeat("180,0.2;", 8)
	uassert.PanicsContains(t, cur, "commit the first 6, then the rest", func() { SimulateRound(id, shots) })
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "commit the first 6, then the rest", func() { PlayRound(cross(cur), id, shots) })
	testing.SetRealm(testing.NewUserRealm(player))
	Reset(cross(cur), id) // a test does not revert what the aborted commit did; a transaction does
	testing.SetRealm(testing.NewUserRealm(player))
	PlayRound(cross(cur), id, strings.Repeat("180,0.2;", 6))
	testing.SetRealm(testing.NewUserRealm(player))
	PlayRound(cross(cur), id, strings.Repeat("180,0.2;", 2)) // the rest, in the next commit
	uassert.Equal(t, 8, roundOf(mustHole(id), player).strokes)

	light := register(cur, "light")
	uassert.True(t, strings.Contains(SimulateRound(light, strings.TrimSuffix(strings.Repeat("180,0.2;", maxShots), ";")), `"strokes":12`), "a light hole takes a full commit")
}

// B6: SimulateFrom from the exact ball a stroke left is the next stroke as
// PlayRoundAt plays it — on a timed hole too, where the stroke number
// matters, and in the weather of the period given.
func TestSimulateFromIsTheNextStroke(cur realm, t *testing.T) {
	id := "gno.land/r/test/timedfrom"
	testing.SetRealm(testing.NewCodeRealm(id))
	Register(cross(cur), &timed{})
	shots := []string{"0,3", "0,3", "10,2"}
	sim := SimulateRound(id, shots[0])
	testing.SetRealm(testing.NewUserRealm(player))
	PlayRoundAt(cross(cur), id, shots[0], Period())
	for i := 1; i < len(shots); i++ {
		r := roundOf(mustHole(id), player)
		uassert.True(t, strings.Contains(sim, `"rest":`+jexact(r.ball())+"}"), "the rest a preview gives is the ball: "+sim)
		sim = SimulateFrom(id, r.bx, r.by, shots[i], i, Period())
		testing.SetRealm(testing.NewUserRealm(player))
		PlayRoundAt(cross(cur), id, shots[i], Period())
	}
	r := roundOf(mustHole(id), player)
	uassert.True(t, strings.Contains(sim, `"rest":`+jexact(r.ball())+"}"), sim)
	// the stroke number is the timed hole's: stroke 1 meets the gate, 0 does not
	open, shut := SimulateFrom(id, 2, 8, "0,9", 0, Period()), SimulateFrom(id, 2, 8, "0,9", 1, Period())
	uassert.NotEqual(t, open, shut)
	uassert.True(t, strings.HasPrefix(open, `{"version":1,"holed":false,"bounces":0,"path":[`), open)
	uassert.True(t, strings.Contains(open, `,"cause":"`), "with its cause")

	// the period is the weather's
	wid := "gno.land/r/test/windyfrom"
	testing.SetRealm(testing.NewCodeRealm(wid))
	Register(cross(cur), &course.Simple{
		World: "island", Title: "Windy", Tee: physics.V(2, 8), Pin: physics.V(40, 8), Substeps: 20, CupRadius: 1,
		Course: &physics.Field{Walls: physics.Box(physics.V(0, 0), physics.V(44, 16)), Friction: 0.9, Radius: 0.5},
	})
	calm, blown := int64(-1), int64(-1)
	for p := Period(); p > Period()-400 && (calm < 0 || blown < 0); p-- {
		k := course.ForecastFor(wid, "island", mustHole(wid).h, p).Kind
		if k == course.Clear && calm < 0 {
			calm = p
		}
		if k == course.Wind && blown < 0 {
			blown = p
		}
	}
	uassert.NotEqual(t, SimulateFrom(wid, 2, 8, "0,4", 0, calm), SimulateFrom(wid, 2, 8, "0,4", 0, blown))
	uassert.Equal(t, SimulateRoundAt(wid, "0,4", blown)[strings.Index(SimulateRoundAt(wid, "0,4", blown), `"path"`):],
		SimulateFrom(wid, 2, 8, "0,4", 0, blown)[strings.Index(SimulateFrom(wid, 2, 8, "0,4", 0, blown), `"path"`):])
	uassert.PanicsContains(t, cur, "has not come yet", func() { SimulateFrom(wid, 2, 8, "0,4", 0, Period()+1) })
	uassert.PanicsContains(t, cur, "a stroke is", func() { SimulateFrom(wid, 2, 8, "0,4", 60, Period()) })
	uassert.PanicsContains(t, cur, "on the board", func() { SimulateFrom(wid, math.NaN(), 8, "0,4", 0, Period()) })
}

// nan is a hostile hole whose ball ends nowhere.
type nan struct{ flat }

func (h *nan) Play(ball physics.Vec2, angle, power float64) (physics.Shot, bool) {
	return physics.Shot{Path: []physics.Vec2{ball, {X: math.NaN(), Y: 1}}, Air: []bool{false, false}}, false
}

// C1: the power is quantized before it is checked, so a record always
// replays; the angle is recorded as played, even at -360; a ball off the
// board is refused.
func TestWhatPassesIsWhatReplays(cur realm, t *testing.T) {
	id := register(cur, "quantized")
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "a shot is", func() { PlayRound(cross(cur), id, "0,0.00004") })
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "a shot is", func() { Launch(cross(cur), id, 0, 0.00004) })
	uassert.PanicsContains(t, cur, "a shot is", func() { Simulate(id, 2, 8, 0, 0.00004) })

	testing.SetRealm(testing.NewUserRealm(player))
	PlayRound(cross(cur), id, "-359.99996,3")
	r := roundOf(mustHole(id), player)
	uassert.Equal(t, "-0.0000,3.0000,0", r.shots)
	// the record replays to the same ball
	uassert.True(t, strings.Contains(SimulateRound(id, r.shots), `"rest":`+jexact(r.ball())+"}"))

	bad := "gno.land/r/test/nan"
	testing.SetRealm(testing.NewCodeRealm(bad))
	Register(cross(cur), &nan{})
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "off the board", func() { Launch(cross(cur), bad, 0, 1) })
}

// C2: retiring a hole takes its players out of the standings a batch at a
// time; a player not yet reached who improves on the archived hole is
// counted right; a standing with no hole left is removed.
func TestRetireDrainsInBatches(cur realm, t *testing.T) {
	old := courseHole(cur, "drain41")
	e := mustHole(old)
	ps := []address{testutils.TestAddress("dra"), testutils.TestAddress("drb"), testutils.TestAddress("drc")}
	for _, p := range ps {
		testing.SetRealm(testing.NewUserRealm(p))
		PlayRoundAt(cross(cur), old, "0,0.001;0,4", Period()) // 2 strokes
	}
	for _, p := range ps {
		uassert.Equal(t, 1, totals[assisted].Get(p.String()).(*row).holes)
	}
	// archive it by hand, then drain one player
	e.next, e.out = "gno.land/r/gnogolf/elsewhere", &draining{}
	archiving = append(archiving, old)
	drain(1)
	first, rest := e.out.from[assisted], 0
	for _, p := range ps {
		if totals[assisted].Get(p.String()) != nil {
			rest++
		}
	}
	uassert.Equal(t, 2, rest, "one player out, two to go")
	// a player not reached yet improves on the archived hole: still counted,
	// so the drain can take the new best out
	var late address
	for _, p := range ps {
		if p.String() >= first {
			late = p
			break
		}
	}
	uassert.True(t, counts(e, assisted, late.String()))
	testing.SetRealm(testing.NewUserRealm(late))
	Reset(cross(cur), old)
	testing.SetRealm(testing.NewUserRealm(late))
	PlayRoundAt(cross(cur), old, "0,4", Period()) // 1 stroke: drains the rest as a finish
	for _, p := range ps {
		uassert.True(t, totals[assisted].Get(p.String()) == nil, "no hole left, no standing: "+p.String())
	}
	uassert.True(t, e.out.done[assisted] && e.out.done[pro])
	uassert.False(t, counts(e, assisted, late.String()), "archived and drained: counts no more")
	uassert.Equal(t, 1, e.bests[assisted].Get(late.String()).(int), "the record is kept")
}

// C2, C5: a player whose only course hole is replaced leaves the top ten:
// no 0-hole rows.
func TestNoZeroHoleRows(cur realm, t *testing.T) {
	solo := testutils.TestAddress("solo")
	giveName(cur, solo, "solo")
	old := "gno.land/r/gnogolf/solo_old8"
	testing.SetRealm(testing.NewCodeRealm(old))
	Register(cross(cur), &islet{})
	testing.SetRealm(testing.NewUserRealm(solo))
	PlayRoundAt(cross(cur), old, "0,4", Period())
	uassert.True(t, strings.Contains(Leaderboard("assisted"), solo.String()))
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/gnogolf/solo_new8"))
	Register(cross(cur), &islet{}) // the same island slot
	lb := Leaderboard("assisted")
	uassert.False(t, strings.Contains(lb, solo.String()), lb)
	uassert.False(t, strings.Contains(lb, `"holes":0`), lb)
	uassert.True(t, strings.Contains(Render(""), "| archived | [Flat](/r/gnogolf/golf:"+old+")"), "an archived hole has no number")
}

// C4: a hole under r/gnogolf/ is the course's only where the chain enforces
// namespaces, or on the two local dev chains.
func TestOfficialNeedsNamespaces(cur realm, t *testing.T) {
	was := testing.GetContext().ChainID
	uassert.True(t, official("gno.land/r/gnogolf/hole1"), "on "+was)
	uassert.False(t, official("gno.land/r/alice/hole1"))

	setContext(func(c *testing.Context) { c.ChainID = "pearl-1" })
	uassert.False(t, names.IsEnabled())
	uassert.False(t, official("gno.land/r/gnogolf/hole1"), "no enforcement, nothing official")
	id := "gno.land/r/gnogolf/squat5"
	testing.SetRealm(testing.NewCodeRealm(id))
	Register(cross(cur), &islet{})
	uassert.False(t, mustHole(id).official)
	uassert.False(t, slots.Has("island/1") && slots.Get("island/1").(string) == id, "no slot taken")
	uassert.True(t, strings.Contains(Holes(), `"id":"`+id+`","name":"Flat","official":false`))

	testing.SetRealm(testing.NewUserRealm(address("g1skl80cuz8zq3lul9pgz5pc35l2pfzgxgfpsqkx"))) // r/sys/names' admin
	names.Enable(cross(cur))
	uassert.True(t, official("gno.land/r/gnogolf/hole1"), "enforced: official")
	setContext(func(c *testing.Context) { c.ChainID = was })
}

// C4: the hub page says who can change what.
func TestTheHubSaysWhoHoldsPower(cur realm, t *testing.T) {
	register(cur, "hubtext")
	hub := Render("")
	uassert.True(t, strings.Contains(hub, "One party does hold a real power: whoever may publish under `r/gnogolf/`"), hub)
	uassert.False(t, strings.Contains(hub, "not for us either"))
	uassert.False(t, strings.Contains(hub, "most played: "), "no most played at 0 plays")
}

// C5: Holes has no "by" field any more; State neither.
func TestNoByField(cur realm, t *testing.T) {
	id := register(cur, "noby")
	uassert.False(t, strings.Contains(Holes(), `"by":`))
	uassert.False(t, strings.Contains(State(id), `"by":`))
}

// C6: every best, standing and round can be read out a page at a time.
func TestPagedReads(cur realm, t *testing.T) {
	id := courseHole(cur, "paged51")
	var ps []string
	for i := 0; i < 3; i++ {
		p := testutils.TestAddress("pg" + strconv.Itoa(i))
		ps = append(ps, p.String())
		testing.SetRealm(testing.NewUserRealm(p))
		PlayRoundAt(cross(cur), id, "0,4", Period())
	}
	one := Records(id, "assisted", "", 2)
	uassert.True(t, strings.HasPrefix(one, `{"version":1,"hole":"`+id+`","mode":"assisted","rows":[`), one)
	uassert.Equal(t, 2, strings.Count(one, `"player"`))
	next := one[strings.Index(one, `"next":"`)+8 : len(one)-2]
	two := Records(id, "assisted", next, 2)
	uassert.Equal(t, 1, strings.Count(two, `"player"`))
	uassert.True(t, strings.HasSuffix(two, `"next":""}`), two)
	for _, p := range ps {
		uassert.Equal(t, 1, strings.Count(one+two, `"player":"`+p), "each player once")
	}
	uassert.True(t, strings.Contains(Rounds(id, "", 100), `"shots":"0.0000,4.0000,0"`))
	all := Players("assisted", "", 100)
	for _, p := range ps {
		uassert.True(t, strings.Contains(all, `"player":"`+p+`","holes":`), all)
	}
}

// C7: a round in progress is held to its weather on every stroke: once that
// weather and the next are over, it must be Reset.
func TestAStaleRoundMustBeReset(cur realm, t *testing.T) {
	id := register(cur, "stale")
	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), id, 0, 1)
	now := testing.GetContext().Time
	setContext(func(c *testing.Context) { c.Time = now.Add(2 * PeriodSeconds * time.Second) })
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "is over: Reset", func() { Launch(cross(cur), id, 0, 1) })
	testing.SetRealm(testing.NewUserRealm(player))
	Reset(cross(cur), id)
	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), id, 0, 1)
	setContext(func(c *testing.Context) { c.Time = now })
}
