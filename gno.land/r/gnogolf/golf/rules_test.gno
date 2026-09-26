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
)

// The rules of a round, a commit and the reads.

// setContext changes the test chain's context in place, keeping the rest,
// and returns what puts it back: defer it.
func setContext(f func(ctx *testing.Context)) func() {
	was := testing.GetContext()
	ctx := was
	f(&ctx)
	testing.SetContext(ctx)
	return func() { testing.SetContext(was) }
}

// The integer jnum prints the bytes of "%.3f", ties, signs and giants
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

// State lists rounds without paths; Round replays the last stroke's
// path; a round stores its shots, not its path; Reset frees the round.
func TestRoundsStoreShotsNotPaths(cur realm, t *testing.T) {
	id := register(cur, "nopaths")
	testing.SetRealm(testing.NewUserRealm(player))
	PlayRoundAt(cross(cur), id, "10,2;-20,3", Period())
	st := State(id)
	uassert.False(t, strings.Contains(st[strings.Index(st, `"rounds"`):], `"path"`), "no path in State's rounds")
	uassert.True(t, strings.Contains(st, `"shots":"10.0000,2.0000,0;-20.0000,3.0000,0"`), st)
	// the path Round gives is the last stroke's, from where it started
	want := SimulateFrom(id, roundIn(id, player).fx, roundIn(id, player).fy, "-20,3", 1, Period())
	got := Round(id, player)
	uassert.Equal(t, want[strings.Index(want, `"path"`):strings.Index(want, `,"rest"`)], got[strings.Index(got, `"path"`):len(got)-1])

	testing.SetRealm(testing.NewUserRealm(player))
	Reset(cross(cur), id)
	uassert.Equal(t, "null", Round(id, player), "Reset drops the round")
}

// A commit is bounded by its work, not a count of shots: past the budget
// it is refused before the shot that would overrun it, with the number that
// fit, and the preview refuses it the same way. A light hole takes all 12.
func TestACommitIsBoundedByWork(cur realm, t *testing.T) {
	id := dryMine(cur, "heavy", limitsHole(), course.Clear) // the forecast counts: in the dry
	shots := strings.Repeat(heavyShot+";", 12)
	uassert.PanicsContains(t, cur, "commit the first "+strconv.Itoa(heavyFit)+", then the rest", func() { SimulateRound(id, shots) })
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "commit the first "+strconv.Itoa(heavyFit)+", then the rest", func() { PlayRound(cross(cur), id, shots) })
	testing.SetRealm(testing.NewUserRealm(player))
	Reset(cross(cur), id) // a test does not revert what the aborted commit did; a transaction does
	for left := 12; left > 0; left -= heavyFit { // the rest, in the next commits
		n := heavyFit
		if left < n {
			n = left
		}
		testing.SetRealm(testing.NewUserRealm(player))
		PlayRound(cross(cur), id, strings.Repeat(heavyShot+";", n))
	}
	uassert.Equal(t, 12, roundIn(id, player).strokes)

	light := register(cur, "light")
	uassert.True(t, strings.Contains(SimulateRound(light, strings.TrimSuffix(strings.Repeat("180,0.2;", maxShots), ";")), `"strokes":12`), "a light hole takes a full commit")
}

// SimulateFrom from the exact ball a stroke left is the next stroke as
// PlayRoundAt plays it — on a timed hole too, where the stroke number
// matters, and in the weather of the period given.
func TestSimulateFromIsTheNextStroke(cur realm, t *testing.T) {
	id := mine(cur, "timedfrom", timedHole())
	shots := []string{"0,3", "0,3", "10,2"}
	sim := SimulateRound(id, shots[0])
	testing.SetRealm(testing.NewUserRealm(player))
	PlayRoundAt(cross(cur), id, shots[0], Period())
	for i := 1; i < len(shots); i++ {
		r := roundIn(id, player)
		uassert.True(t, strings.Contains(sim, `"rest":`+jexact(r.ball())+"}"), "the rest a preview gives is the ball: "+sim)
		sim = SimulateFrom(id, r.bx, r.by, shots[i], i, Period())
		testing.SetRealm(testing.NewUserRealm(player))
		PlayRoundAt(cross(cur), id, shots[i], Period())
	}
	r := roundIn(id, player)
	uassert.True(t, strings.Contains(sim, `"rest":`+jexact(r.ball())+"}"), sim)
	// the stroke number is the timed hole's: stroke 1 meets the gate, 0 does not
	open, shut := SimulateFrom(id, 2, 8, "0,10", 0, Period()), SimulateFrom(id, 2, 8, "0,10", 1, Period())
	uassert.NotEqual(t, open, shut)
	uassert.True(t, strings.HasPrefix(open, `{"version":1,"holed":false,"bounces":0,"path":[`), open)
	uassert.True(t, strings.Contains(open, `,"cause":"`), "with its cause")

	// the period is the weather's
	wid := mine(cur, "windyfrom", &course.Simple{
		W: 44, H: 16, World: "island", Title: "Windy", Tee: physics.V(2, 8), Pin: physics.V(40, 8), Substeps: 20, CupRadius: 1,
		Course: &physics.Field{Walls: physics.Box(physics.V(0, 0), physics.V(44, 16)), Friction: 0.9, Radius: 0.5},
	})
	calm, blown := int64(-1), int64(-1)
	for p := Period(); p > Period()-400 && (calm < 0 || blown < 0); p-- {
		k := course.ForecastFor(wid, "island", mustHole(wid).hole(), p).Kind
		if k == course.Clear && calm < 0 {
			calm = p
		}
		if k == course.Wind && blown < 0 {
			blown = p
		}
	}
	uassert.NotEqual(t, SimulateFrom(wid, 2, 8, "0,4", 0, calm), SimulateFrom(wid, 2, 8, "0,4", 0, blown))
	uassert.Equal(t, simAt(wid, "0,4", blown)[strings.Index(simAt(wid, "0,4", blown), `"path"`):],
		SimulateFrom(wid, 2, 8, "0,4", 0, blown)[strings.Index(SimulateFrom(wid, 2, 8, "0,4", 0, blown), `"path"`):])
	uassert.PanicsContains(t, cur, "has not come yet", func() { SimulateFrom(wid, 2, 8, "0,4", 0, Period()+1) })
	uassert.PanicsContains(t, cur, "a stroke is", func() { SimulateFrom(wid, 2, 8, "0,4", 60, Period()) })
	uassert.PanicsContains(t, cur, "on the board", func() { SimulateFrom(wid, math.NaN(), 8, "0,4", 0, Period()) })
}

// The power is quantized before it is checked, so a record always
// replays; the angle is recorded as played, even at -360.
func TestWhatPassesIsWhatReplays(cur realm, t *testing.T) {
	id := register(cur, "quantized")
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "a shot is", func() { PlayRound(cross(cur), id, "0,0.00004") })
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "a shot is", func() { Launch(cross(cur), id, 0, 0.00004) })
	uassert.PanicsContains(t, cur, "a shot is", func() { Simulate(id, 2, 8, 0, 0.00004) })

	testing.SetRealm(testing.NewUserRealm(player))
	PlayRound(cross(cur), id, "-359.99996,3")
	r := roundIn(id, player)
	uassert.Equal(t, "-0.0000,3.0000,0", r.shots)
	// the record replays to the same ball
	uassert.True(t, strings.Contains(SimulateRound(id, r.shots), `"rest":`+jexact(r.ball())+"}"))
}

// Retiring a hole takes its players out of the standings a batch at a
// time; a player not yet reached who improves on the archived hole is
// counted right; a standing with no hole left stays, at 0, unranked.
func TestRetireDrainsInBatches(cur realm, t *testing.T) {
	old := courseHole(cur, 41)
	e := mustHole(old)
	ps := []address{testutils.TestAddress("dra"), testutils.TestAddress("drb"), testutils.TestAddress("drc")}
	for _, p := range ps {
		testing.SetRealm(testing.NewUserRealm(p))
		PlayRoundAt(cross(cur), old, "0,0.001;0,1", Period()) // 2 strokes
	}
	for _, p := range ps {
		uassert.Equal(t, 1, totals[assisted].Get(p.String()).(*row).holes)
	}
	// archive it by hand, then drain one player
	e.next, e.out = "garden/41/v9", &draining{}
	archiving = append(archiving, old)
	drain(1)
	first, rest := e.out.from[assisted], 0
	for _, p := range ps {
		if totals[assisted].Get(p.String()).(*row).holes > 0 {
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
	uassert.True(t, counts(e, assisted, late.String(), 2))
	testing.SetRealm(testing.NewUserRealm(late))
	Reset(cross(cur), old)
	testing.SetRealm(testing.NewUserRealm(late))
	PlayRoundAt(cross(cur), old, "0,1", Period()) // 1 stroke: drains the rest as a finish
	for _, p := range ps {
		r := totals[assisted].Get(p.String()).(*row)
		uassert.True(t, r.holes == 0 && r.strokes == 0, "no hole left, a standing of 0: "+p.String())
		uassert.False(t, ranks[assisted].Has(rankKey(r)), "and no rank")
	}
	uassert.True(t, e.out.done[assisted] && e.out.done[pro])
	uassert.False(t, counts(e, assisted, late.String(), 1), "archived and drained: counts no more")
	uassert.Equal(t, 1, e.bests(assisted).Get(late.String()).(int), "the record is kept")
}

// A player whose only course hole is replaced leaves the top ten: no
// 0-hole rows.
func TestNoZeroHoleRows(cur realm, t *testing.T) {
	solo := testutils.TestAddress("solo")
	giveName(cur, solo, "solo")
	old := publish(cur, cupHole("island", 48, "Solo"))
	testing.SetRealm(testing.NewUserRealm(solo))
	PlayRoundAt(cross(cur), old, "0,1", Period())
	uassert.True(t, strings.Contains(Leaderboard("assisted"), solo.String()))
	of := ranks[assisted].Size()
	again := publish(cur, cupHole("island", 48, "Solo again")) // the same island slot
	lb := Leaderboard("assisted")
	uassert.False(t, strings.Contains(lb, solo.String()), lb)
	uassert.False(t, strings.Contains(lb, `"holes":0`), lb)
	// the ranking key is kept aside, not freed (whoever drained would be
	// refunded its deposit), and nothing ranked counts it
	r := totals[assisted].Get(solo.String()).(*row)
	uassert.True(t, idle[assisted].Has(rankKey(r)), "the key is kept aside")
	uassert.Equal(t, of-1, ranks[assisted].Size())
	uassert.True(t, strings.Contains(Rank("assisted", solo), `"rank":0,"of":`+strconv.Itoa(of-1)+`,"holes":0`), Rank("assisted", solo))
	testing.SetRealm(testing.NewUserRealm(solo))
	PlayRoundAt(cross(cur), again, "0,1", Period())
	uassert.False(t, idle[assisted].Has(rankKey(&row{player: solo.String()})), "and back in the ranking at the next hole")
	uassert.Equal(t, of, ranks[assisted].Size())
	uassert.True(t, strings.Contains(Render(old), "> Archived: [Solo again](/r/gnogolf/golf:island/48/v2)"), "an archived hole says what took its place")
}

// Every best, standing and round can be read out a page at a time.
func TestPagedReads(cur realm, t *testing.T) {
	id := courseHole(cur, 51)
	var ps []string
	for i := 0; i < 3; i++ {
		p := testutils.TestAddress("pg" + strconv.Itoa(i))
		ps = append(ps, p.String())
		testing.SetRealm(testing.NewUserRealm(p))
		PlayRoundAt(cross(cur), id, "0,1", Period())
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
	uassert.True(t, strings.Contains(Rounds(id, "", 100), `"shots":"0.0000,1.0000,0"`))
	all := Players("assisted", "", 100)
	for _, p := range ps {
		uassert.True(t, strings.Contains(all, `"player":"`+p+`","holes":`), all)
	}
}

// A round in progress is held to its weather on every stroke: once that
// weather and the next are over, it must be Reset.
func TestAStaleRoundMustBeReset(cur realm, t *testing.T) {
	id := register(cur, "stale")
	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), id, 0, 1)
	now := testing.GetContext().Time
	defer setContext(func(c *testing.Context) { c.Time = now.Add(2 * PeriodSeconds * time.Second) })()
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "is over: Reset", func() { Launch(cross(cur), id, 0, 1) })
	testing.SetRealm(testing.NewUserRealm(player))
	Reset(cross(cur), id)
	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), id, 0, 1)
}

// iceCage is 160 bumper walls round a board of ice: a tap stays put, a
// full shot bounces on until its work runs out.
func iceCage() *course.Simple {
	var walls []physics.Wall
	for len(walls) < course.MaxWalls {
		for _, w := range physics.Box(physics.V(10, 10), physics.V(30, 30)) {
			w.Bounce, w.Skin = 1.5, "bumper"
			walls = append(walls, w)
		}
	}
	var zones []physics.Zone
	for i := 0; i < course.MaxZones-8; i++ {
		zones = append(zones, physics.Zone{Kind: physics.Surface, Min: physics.V(0, 0), Max: physics.V(96, 96), Scale: 8, Skin: "ice"})
	}
	return &course.Simple{W: 96, H: 96, World: "garden", Title: "Ice cage", Strokes: 5,
		Tee: physics.V(20, 20), Pin: physics.V(93, 3), Substeps: course.MaxSubsteps, CupRadius: 1,
		Course: &physics.Field{Walls: walls, Zones: zones, Friction: 0.99, Bounce: 1.5, Radius: 0.5}}
}

// dryMine publishes h under the first slug of prefix whose weather now is
// kind, and returns its id.
func dryMine(cur realm, prefix string, h *course.Simple, kind string) string {
	for i := 0; ; i++ {
		slug := prefix + strconv.Itoa(i)
		if course.ForecastFor(testutils.TestAddress("au"+slug).String()+"/"+slug+"/v1", h.World, h, Period()).Kind == kind {
			return mine(cur, slug, h)
		}
	}
}

// A commit is held to its budget whatever its shots: eleven taps, then a
// full shot that would bounce on to MaxWork. The heaviest shot so far was a
// tap, so the old cut let it through, and the commit went past its budget;
// now the full shot is played with the room left as its cap, reaches it,
// and the commit is refused with the eleven that fit. Played first in the
// next commit, the full shot has the whole budget, and plays out.
func TestACommitNeverPassesItsBudget(cur realm, t *testing.T) {
	id := dryMine(cur, "cage", iceCage(), course.Clear)
	taps, full := strings.Repeat("0,0.01;", 11), "135,10"
	p := Period()
	uassert.PanicsContains(t, cur, "commit the first 11, then the rest", func() { SimulateRoundAt(id, taps+full, p) })
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "commit the first 11, then the rest", func() { PlayRoundAt(cross(cur), id, taps+full, p) })
	testing.SetRealm(testing.NewUserRealm(player))
	Reset(cross(cur), id) // a test does not revert what the aborted commit did; a transaction does
	testing.SetRealm(testing.NewUserRealm(player))
	PlayRoundAt(cross(cur), id, taps, p)
	testing.SetRealm(testing.NewUserRealm(player))
	PlayRoundAt(cross(cur), id, full, p)
	uassert.Equal(t, 12, roundIn(id, player).strokes)

	// the cap each shot was given: MaxWork on a fresh commit, what is left
	// after the taps, and nothing once the forecast alone takes it all
	e := mustHole(id)
	h := e.hole()
	fc := weatherOf(e, h, p)
	w := newWork(h, fc.Zones)
	w.fixed = fixedGas(e, fc)
	w.next(h)
	uassert.Equal(t, physics.MaxWork, w.cap)
	uassert.Equal(t, physics.MaxWork, h.Field().Cap)
	w.played, w.spent = 11, 800000000
	w.next(h)
	room := (workBudget-w.fixed-w.spent-workPerShot-w.walls*workPerWall)/workPerUnit - physics.MaxWorkStep
	uassert.Equal(t, int(room), w.cap)
	uassert.True(t, w.cap < physics.MaxWork/2, "the room left")
	w.fixed = workBudget
	uassert.PanicsContains(t, cur, "commit the first 11, then the rest", func() { w.next(h) })
}

// A Launch is held to the same budget: on a hole whose rain costs most of
// it (every puddle try testing 160 walls and every edge of 8 thin hazard
// polygons), the one shot has what is left, and one that reaches it is
// refused before anything is kept.
func TestALaunchNeverPassesItsBudget(cur realm, t *testing.T) {
	walls := physics.Box(physics.V(3, 3), physics.V(7, 7))
	for len(walls) < course.MaxWalls {
		walls = append(walls, physics.Box(physics.V(3, 3), physics.V(7, 7))...)
	}
	for i := range walls {
		walls[i].Bounce, walls[i].Skin = 1.5, "bumper"
	}
	var zones []physics.Zone
	for i := 0; i < course.MaxPolyTotal/course.MaxPoly; i++ {
		z := physics.Zone{Kind: physics.Hazard, Min: physics.V(0, 0), Max: physics.V(96, 96), Vec: physics.V(5, 5)}
		for k := 0; k < course.MaxPoly; k++ {
			z.Poly = append(z.Poly, physics.V(float64(k)*1.5+float64(i)*0.1, 95.9+float64(k%2)*0.1))
		}
		zones = append(zones, z)
	}
	h := &course.Simple{W: 96, H: 96, World: "garden", Title: "Corner", Strokes: 5,
		Tee: physics.V(5, 5), Pin: physics.V(93, 3), Substeps: course.MaxSubsteps, CupRadius: 1,
		Course: &physics.Field{Walls: walls, Zones: zones, Friction: 0.99, Bounce: 1.5, Radius: 0.5}}
	wet := dryMine(cur, "corner", h, course.Rain)
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "one shot on this hole could cost more than a transaction can replay", func() { Launch(cross(cur), wet, 30, 10) })
	uassert.True(t, strings.Contains(SimulateCommit(dryMine(cur, "corner", h, course.Clear), 5, 5, 0, "30,10", Period()), `"strokes":1`), "in the dry it plays")
}

// heavyShot is a shot of which heavyFit fit in one commit on limitsHole.
const (
	heavyShot = "30,10"
	heavyFit  = 5
)

// PlayRound goes on with a round in the round's own weather, across the
// turn of the period, as PlayRoundAt and Launch do (final bug hunt, 1).
func TestPlayRoundKeepsItsRoundsPeriod(cur realm, t *testing.T) {
	id := courseHole(cur, 81)
	p := testutils.TestAddress("turn")
	testing.SetRealm(testing.NewUserRealm(p))
	PlayRound(cross(cur), id, "90,0.5") // one stroke, not holed
	was := roundIn(id, p).period
	now := testing.GetContext().Time
	defer setContext(func(c *testing.Context) { c.Time = now.Add(PeriodSeconds * time.Second) })()
	testing.SetRealm(testing.NewUserRealm(p))
	PlayRound(cross(cur), id, "270,0.5")
	uassert.Equal(t, 2, roundIn(id, p).strokes)
	uassert.Equal(t, was, roundIn(id, p).period, "in the weather it started in")
}

// The previews refuse the stale periods the writes refuse (final bug hunt,
// 2); SimulateFrom still replays an old round's stroke.
func TestThePreviewsRefuseAStalePeriod(cur realm, t *testing.T) {
	id := courseHole(cur, 82)
	stale := Period() - 2
	uassert.PanicsContains(t, cur, "not the current weather", func() { SimulateRoundAt(id, "0,1", stale) })
	uassert.PanicsContains(t, cur, "not the current weather", func() { SimulateCommit(id, 2, 8, 0, "0,1", stale) })
	uassert.PanicsContains(t, cur, "is over: Reset", func() { SimulateCommit(id, 2, 8, 3, "0,1", stale) })
	uassert.PanicsContains(t, cur, "has not come yet", func() { SimulateCommit(id, 2, 8, 3, "0,1", Period()+1) })
	uassert.True(t, strings.Contains(SimulateCommit(id, 2, 8, 3, "0,1", Period()-1), `"strokes":4`))
	uassert.True(t, strings.Contains(SimulateRoundAt(id, "0,1", Period()-1), `"strokes":1`))
	uassert.True(t, strings.Contains(SimulateFrom(id, 2, 8, "0,1", 0, stale), `"holed":`))
}

// Versions answers for its own alias only, never with the caller's bytes
// (final bug hunt, 3).
func TestVersionsEchoesNothing(t *testing.T) {
	uassert.Equal(t, `{"version":1,"slot":"","versions":[]}`, Versions("g1\xff\"/x"))
}

// Only a finish on a course hole drains the course's archived holes, a few
// at a time; a standing it empties stays, at 0.
func TestOnlyCourseFinishesDrain(cur realm, t *testing.T) {
	drain(drainMax) // whatever the other tests left
	old := courseHole(cur, 83)
	e := mustHole(old)
	var ps []address
	for i := 0; i < finishBatch+1; i++ {
		p := testutils.TestAddress("od" + strconv.Itoa(i))
		ps = append(ps, p)
		testing.SetRealm(testing.NewUserRealm(p))
		PlayRoundAt(cross(cur), old, "0,1", Period())
	}
	e.next, e.out = "garden/83/v9", &draining{}
	archiving = append(archiving, old)
	id := register(cur, "nodrain")
	testing.SetRealm(testing.NewUserRealm(stranger))
	PlayRoundAt(cross(cur), id, holeShot, Period())
	uassert.True(t, e.out.from[assisted] == "" && !e.out.done[assisted], "a community finish drains nothing")
	testing.SetRealm(testing.NewUserRealm(stranger))
	PlayRoundAt(cross(cur), courseHole(cur, 84), "0,1", Period())
	uassert.True(t, e.out.from[assisted] != "" && !e.out.done[assisted], "a course finish drains finishBatch")
	uassert.Equal(t, 1, len(archiving))
	testing.SetRealm(testing.NewUserRealm(stranger))
	uassert.Equal(t, 0, Drain(cross(cur), drainMax))
	for _, p := range ps {
		holes, strokes := StandingOf("assisted", p)
		uassert.True(t, holes == 0 && strokes == 0 && totals[assisted].Get(p.String()) != nil, "kept at 0: "+p.String())
	}
}
