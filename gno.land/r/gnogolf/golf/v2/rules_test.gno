package golf

import (
	"math"
	"strconv"
	"strings"
	"testing"
	"time"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
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

// A round stores its shots, not its path; Round replays the last stroke's
// path; Reset frees the round.
func TestRoundsStoreShotsNotPaths(cur realm, t *testing.T) {
	id := register(cur, "nopaths")
	testing.SetRealm(testing.NewUserRealm(player))
	PlayRoundAt(cross(cur), id, "10,2;-20,3", Period())
	got := Round(id, player)
	uassert.True(t, strings.Contains(got, `"shots":"10.0000,2.0000,0;-20.0000,3.0000,0"`), got)
	// the path Round gives is the last stroke's, from where it started
	want := SimulateFrom(id, roundIn(id, player).fx, roundIn(id, player).fy, "-20,3", 1, Period())
	uassert.Equal(t, want[strings.Index(want, `"path"`):strings.Index(want, `,"work"`)], got[strings.Index(got, `"path"`):len(got)-1])

	testing.SetRealm(testing.NewUserRealm(player))
	Reset(cross(cur), id)
	uassert.Equal(t, "null", Round(id, player), "Reset drops the round")
}

// A commit is bounded by its work, not a count of shots: past the budget
// it is refused before the shot that would overrun it, with the number that
// fit, and the preview refuses it the same way. A light hole takes all 12.
func TestACommitIsBoundedByWork(cur realm, t *testing.T) {
	id := dryMine(cur, "heavy", heavyHole(), course.Clear) // the forecast counts: in the dry
	shots := strings.Repeat(heavyShot+";", 12)
	uassert.PanicsContains(t, cur, "commit the first "+strconv.Itoa(heavyFit)+", then the rest", func() { SimulateRound(id, shots) })
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "commit the first "+strconv.Itoa(heavyFit)+", then the rest", func() { PlayRound(cross(cur), id, shots) })
	testing.SetRealm(testing.NewUserRealm(player))
	Reset(cross(cur), id) // a test does not revert what the aborted commit did; a transaction does
	// the twelve in commits of one fewer: from where the ball lies, the
	// shots run into more of the hole than from the tee
	for left := 12; left > 0; left -= heavyFit - 1 {
		n := heavyFit - 1
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
		Course: &physics.Field{Walls: build.Box(physics.V(0, 0), physics.V(44, 16)), Friction: 0.9, Radius: 0.5},
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
	uassert.PanicsContains(t, cur, "a shot is", func() { SimulateFrom(id, 2, 8, "0,0.00004", 0, Period()) })

	// finer than the game's steps: refused (it rounds to no step of 0.01)
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "steps of 0.01", func() { PlayRound(cross(cur), id, "12.345,3") })
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "steps of 0.01", func() { Launch(cross(cur), id, 12, 3.005) })
	uassert.PanicsContains(t, cur, "steps of 0.01", func() { SimulateFrom(id, 2, 8, "0,3.0001", 0, Period()) })

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
		PlayRoundAt(cross(cur), old, "0,0.01;0,1", Period()) // 2 strokes
	}
	for _, p := range ps {
		uassert.Equal(t, 1, rowFor(assisted, p.String()).holes)
	}
	// archive it by hand, then drain one player
	e.next, e.out = "garden/41/v9", &draining{}
	saveEntry(e) // (kept in store: a version read back is decoded afresh)
	setArchiving(append(archiving(), old))
	drain(1)
	e = mustHole(old) // (as store has it now)
	first, rest := e.out.from[assisted], 0
	for _, p := range ps {
		if rowFor(assisted, p.String()).holes > 0 {
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
		r := rowFor(assisted, p.String())
		uassert.True(t, r.holes == 0 && r.strokes == 0 && r.par == 0, "no hole left, a standing of 0: "+p.String())
		uassert.False(t, ranks[assisted].Has(rankKey(r)), "and no rank")
	}
	e = mustHole(old)
	uassert.True(t, e.out.done[assisted] && e.out.done[pro])
	uassert.False(t, counts(e, assisted, late.String(), 1), "archived and drained: counts no more")
	uassert.Equal(t, 1, bestStrokes(get(e.bests(assisted), late.String())), "the record is kept")
	uassert.True(t, ghostHoles(old, "assisted", late), "and its ghost replays on the archived version")
}

// A player whose only course hole is replaced leaves the top ten: no
// 0-hole rows.
func TestNoZeroHoleRows(cur realm, t *testing.T) {
	solo := testutils.TestAddress("solo")
	giveName(cur, solo, "solo")
	old := publish(cur, cupHole("island", 48, "Solo"))
	testing.SetRealm(testing.NewUserRealm(solo))
	PlayRoundAt(cross(cur), old, "0,1", Period())
	uassert.True(t, rankOf("assisted", solo) > 0, "ranked")
	of := ranks[assisted].Size()
	again := publish(cur, cupHole("island", 48, "Solo again")) // the same island slot
	lb := Leaderboard("assisted")
	uassert.False(t, strings.Contains(lb, solo.String()), lb)
	uassert.False(t, strings.Contains(lb, `"holes":0`), lb)
	// the ranking key is kept aside, not freed (whoever drained would be
	// refunded its deposit), and nothing ranked counts it
	r := rowFor(assisted, solo.String())
	kept := rankKey(r)
	uassert.True(t, idle[assisted].Has(kept), "the key is kept aside")
	uassert.Equal(t, of-1, ranks[assisted].Size())
	uassert.True(t, strings.Contains(Rank("assisted", solo), `"rank":0,"of":`+strconv.Itoa(of-1)+`,"holes":0`), Rank("assisted", solo))
	testing.SetRealm(testing.NewUserRealm(solo))
	PlayRoundAt(cross(cur), again, "0,1", Period())
	uassert.False(t, idle[assisted].Has(kept), "and back in the ranking at the next hole")
	uassert.Equal(t, of, ranks[assisted].Size())
	uassert.True(t, strings.Contains(Render(old), "> Archived: [Solo again](/r/gnogolf/golf/v2:island/48/v2)"), "an archived hole says what took its place")
}

// Every best and standing can be read out a page at a time; a round under
// way, by its player.
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
	uassert.Equal(t, 2, strings.Count(one, `,"height":`), "each best with its tie-break")
	next := one[strings.Index(one, `"next":"`)+8 : len(one)-2]
	two := Records(id, "assisted", next, 2)
	uassert.Equal(t, 1, strings.Count(two, `"player"`))
	uassert.True(t, strings.HasSuffix(two, `"next":""}`), two)
	for _, p := range ps {
		uassert.Equal(t, 1, strings.Count(one+two, `"player":"`+p), "each player once")
	}
	// the three are holed, so not kept: a round under way is
	testing.SetRealm(testing.NewUserRealm(player))
	PlayRoundAt(cross(cur), id, "180,0.2", Period())
	uassert.True(t, strings.HasPrefix(Round(id, player), `{"version":1,"player":"`+player.String()+`","ball":`), Round(id, player))
	uassert.Equal(t, "null", Round(id, address(ps[0])))
	all := Players("assisted", "", 100)
	for _, p := range ps {
		uassert.True(t, strings.Contains(all, `"player":"`+p+`","holes":`), all)
	}
	uassert.Equal(t, strings.Count(all, `"player"`), strings.Count(all, `,"height":`), "each standing with its tie-break")
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

// iceCage is 36 bumper walls (40 in v1, whose commit kept nothing in store) round a board of ice, which 8 flat 64-point
// polygons cover (every step tests them): a tap stays put, a full shot
// bounces on until its work runs out.
func iceCage() *course.Simple {
	var walls []physics.Wall
	for len(walls) < 36 {
		for _, w := range build.Box(physics.V(10, 10), physics.V(30, 30)) {
			w.Bounce, w.Skin = 1.5, "bumper"
			walls = append(walls, w)
		}
	}
	var zones []physics.Zone
	for i := 0; i < course.MaxZones-8; i++ {
		zones = append(zones, physics.Zone{Kind: physics.Surface, Min: physics.V(0, 0), Max: physics.V(96, 96), Scale: 8, Skin: "ice"})
	}
	for i := 0; i < 8; i++ {
		z := physics.Zone{Kind: physics.Slope, Min: physics.V(0, 0), Max: physics.V(96, 96), Skin: "slope"}
		for k := 0; k < course.MaxPoly; k++ {
			z.Poly = append(z.Poly, physics.V(48, 48).Add(physics.FromPolar(float64(k)*2*math.Pi/course.MaxPoly, 40+float64(i))))
		}
		zones = append(zones, z)
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

// A hole's dearest weather is bounded at publish: a hole where, every puddle
// try testing all its walls and polygon edges, a commit's first shot would
// have less than minShotWork is refused; with one wall fewer it is taken,
// and in the rain or a storm its first shot has that room: a tap plays, and a
// full shot that would bounce on past it is refused before anything is kept.
func TestTheDearestWeatherIsBoundedAtPublish(cur realm, t *testing.T) {
	n := 0 // the most walls golf takes on corner
	for n < course.MaxWalls && worstGas(corner(n+1, "garden"), len(course.Encode(corner(n+1, "garden")))) <= workBudget {
		n++
	}
	t.Logf("corner takes %d walls: its dearest forecast %d, its worst commit %d", n, course.WorstForecastWork(corner(n, "garden")), worstGas(corner(n, "garden"), len(course.Encode(corner(n, "garden")))))
	uassert.True(t, n > 0 && n < course.MaxWalls, "the bound bites")
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, errTooStormy, func() { PublishMine(cross(cur), "corner", hexOf(corner(n+1, "garden")), "") })
	for _, c := range []struct{ world, kind string }{{"garden", course.Rain}, {"island", course.Storm}} {
		id := dryMine(cur, "corner"+c.world, corner(n, c.world), c.kind)
		e := mustHole(id)
		h := e.hole()
		fc := weatherOf(e, h, Period())
		w := newWork(h, fc.Zones)
		w.fixed = fixedGas(e, fc)
		w.next(h)
		uassert.True(t, w.cap >= minShotWork, "the first shot's room in "+c.kind)
		testing.SetRealm(testing.NewUserRealm(player))
		urequire.AbortsContains(t, cur, errShotTooHeavy, func() { Launch(cross(cur), id, 30, 10) })
		testing.SetRealm(testing.NewUserRealm(player))
		uassert.True(t, strings.HasPrefix(Launch(cross(cur), id, 30, 0.01), "Stroke 1 "), "a tap plays in "+c.kind)
		uassert.True(t, strings.Contains(Render(id+"/"+player.String()), "Weather now"), "its page renders")
		uassert.True(t, strings.Contains(SimulateCommit(dryMine(cur, "corner"+c.world, corner(n, c.world), course.Clear), 5, 5, 0, "30,10", Period()), `"strokes":1`), "in the dry the full shot plays")
	}
}

// corner is a hole whose puddle tries all test every piece: walls bumper
// walls (at most 160), in a box round the tee at a corner of a 96×96 board,
// and 4 thin hazard polygons along its far edge (256 edges).
func corner(walls int, world string) *course.Simple {
	var ws []physics.Wall
	for len(ws) < walls {
		ws = append(ws, build.Box(physics.V(3, 3), physics.V(7, 7))...)
	}
	ws = ws[:walls]
	for i := range ws {
		ws[i].Bounce, ws[i].Skin = 1.5, "bumper"
	}
	var zones []physics.Zone
	for i := 0; i < 4; i++ {
		z := physics.Zone{Kind: physics.Hazard, Min: physics.V(0, 0), Max: physics.V(96, 96), Vec: physics.V(5, 5)}
		for k := 0; k < course.MaxPoly; k++ {
			z.Poly = append(z.Poly, physics.V(float64(k)*1.5+float64(i)*0.1, 95.9+float64(k%2)*0.1))
		}
		zones = append(zones, z)
	}
	return &course.Simple{W: 96, H: 96, World: world, Title: "Corner", Strokes: 5,
		Tee: physics.V(5, 5), Pin: physics.V(93, 3), Substeps: course.MaxSubsteps, CupRadius: 1,
		Course: &physics.Field{Walls: ws, Zones: zones, Friction: 0.99, Bounce: 1.5, Radius: 0.5}}
}

// heavyShot is a shot of which heavyFit fit in one commit on heavyHole.
const (
	heavyShot = "30,10"
	heavyFit  = 7
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
	// a record is checked in its own weather however old: SimulateRoundIn,
	// the same replay, the weather to come still refused
	uassert.Equal(t, SimulateRoundAt(id, "0,1", Period()-1), SimulateRoundIn(id, "0,1", Period()-1))
	uassert.True(t, strings.Contains(SimulateRoundIn(id, "0,1", stale-1000), `"strokes":1`))
	uassert.PanicsContains(t, cur, "has not come yet", func() { SimulateRoundIn(id, "0,1", Period()+1) })
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
	saveEntry(e) // (kept in store: a version read back is decoded afresh)
	setArchiving(append(archiving(), old))
	id := register(cur, "nodrain")
	testing.SetRealm(testing.NewUserRealm(stranger))
	PlayRoundAt(cross(cur), id, holeShot, Period())
	e = mustHole(old) // (as store has it now)
	uassert.True(t, e.out.from[assisted] == "" && !e.out.done[assisted], "a community finish drains nothing")
	testing.SetRealm(testing.NewUserRealm(stranger))
	PlayRoundAt(cross(cur), courseHole(cur, 84), "0,1", Period())
	e = mustHole(old)
	uassert.True(t, e.out.from[assisted] != "" && !e.out.done[assisted], "a course finish drains finishBatch")
	uassert.Equal(t, 1, len(archiving()))
	testing.SetRealm(testing.NewUserRealm(stranger))
	uassert.Equal(t, 0, Drain(cross(cur), drainMax))
	for _, p := range ps {
		holes, strokes, par := standingOf("assisted", p)
		uassert.True(t, holes == 0 && strokes == 0 && par == 0 && rowFor(assisted, p.String()) != nil, "kept at 0: "+p.String())
	}
}

// The hole's record is its board's top: a best made before a name takes it at
// Claim, and a tie goes to the first to make it, on the record, the board, the
// hole's page and the course ranking alike, whatever the addresses: a copy of
// a best's public shots ranks after it.
func TestTheFirstThereKeepsTheTop(cur realm, t *testing.T) {
	id := courseHole(cur, 92)
	early, late := testutils.TestAddress("tfearly"), testutils.TestAddress("tflate")
	copier := testutils.TestAddress("tfcopy")
	for i := 0; copier.String() > early.String(); i++ { // one that sorts first
		urequire.True(t, i < 100, "no address sorts first")
		copier = testutils.TestAddress(string(rune('a'+i%26)) + strconv.Itoa(i) + "tfcopy")
	}
	replayAs(cur, early, id, "0,1") // unnamed: no record, no board
	testing.SkipHeights(1)
	giveName(cur, late, "tflate")
	replayAs(cur, late, id, "0,0.01;0,1")
	uassert.True(t, mustHole(id).best == 2 && mustHole(id).bestBy == late)
	giveName(cur, early, "tfearly")
	testing.SetRealm(testing.NewUserRealm(early))
	Claim(cross(cur))
	uassert.True(t, mustHole(id).best == 1 && mustHole(id).bestBy == early, "claimed: the board's top holds the record")

	testing.SkipHeights(1)
	giveName(cur, copier, "tfcopy")
	replayAs(cur, copier, id, "0,1")
	uassert.True(t, mustHole(id).bestBy == early, "a tie leaves the record")
	lb := HoleLeaderboard(id, "", 0, 10)
	uassert.True(t, strings.Index(lb, early.String()) < strings.Index(lb, copier.String()), lb)
	uassert.True(t, strings.Contains(HoleRank(id, "", copier), `"rank":2,`), HoleRank(id, "", copier))
	page := Render(id)
	uassert.True(t, strings.Contains(page, "| 1 | [@tfearly]") && strings.Contains(page, "| 2 | [@tfcopy]"), page)
	uassert.True(t, ghostHoles(id, "assisted", copier), "the best still replays")
	all := CourseLeaderboard("", 0, 100)
	uassert.True(t, strings.Index(all, early.String()) < strings.Index(all, copier.String()), all)
}

// The wear is marked where the round's ball rests: one that leaves a hole
// with no walls is back where it was played from, and so is its mark.
func TestWearIsWhereTheBallRests(cur realm, t *testing.T) {
	h := flatHole("Open")
	h.Course.Walls = nil
	id := mine(cur, "open", h)
	p := testutils.TestAddress("wearer")
	testing.SetRealm(testing.NewUserRealm(p))
	PlayRoundAt(cross(cur), id, "180,10", Period())
	r := roundIn(id, p)
	uassert.True(t, r.bx == 2 && r.by == 8, "back on the tee")
	uassert.Equal(t, 1, mustHole(id).wearGrid()[course.WearIndexOn(physics.V(2, 8), 32, 16)])
	uassert.Equal(t, 1, sumWear(mustHole(id)))
}

// A text board's key says which way a slope takes the ball (moving air
// pushes it), each way of a mark once.
func TestLegendSlopeWay(t *testing.T) {
	f := &physics.Field{Zones: []physics.Zone{
		{Kind: physics.Slope, Vec: physics.V(0, 0.1), Mark: '^', Skin: "hill"},
		{Kind: physics.Slope, Vec: physics.V(0, 0.2), Mark: '^', Skin: "hill"},
		{Kind: physics.Slope, Vec: physics.V(-0.1, 0), Mark: '^', Skin: "hill"},
		{Kind: physics.Slope, Vec: physics.V(0.1, 0), Mark: '~', Skin: "draft", Air: true},
	}}
	s, _ := legend(f)
	urequire.Equal(t, " · `^` hill (slope), falls toward 90° · `^` hill (slope), falls toward 180° · `~` draft (slope), pushes toward 0°", s)
}

// parHole is a Crystal Mines hole of par par: cupHole's box, holed by "0,1"
// from the tee, a stroke more for each "0,0.01" before it.
func parHole(cur realm, order, par int) string {
	h := cupHole("mines", order, "Par "+strconv.Itoa(par))
	h.Strokes = par
	return publish(cur, h)
}

// strokesOf is shots that hole a parHole in n strokes.
func strokesOf(n int) string { return strings.Repeat("0,0.01;", n-1) + "0,1" }

// rankOf is a player's place in a mode's course ranking, 0 if none.
func rankOf(mode string, p address) int {
	n, _ := strconv.Atoi(jfield(Rank(mode, p), "rank"))
	return n
}

// The course ranks by holes, then by the score against par: a hole at par
// counts the same on a par 5 as on a par 2, so two players level there rank
// by who got there first, whatever their strokes and addresses.
func TestAHoleAtParCountsTheSameWhateverItsPar(cur realm, t *testing.T) {
	five, two := parHole(cur, 1, 5), parHole(cur, 2, 2)
	first, then := testutils.TestAddress("vpfirst"), testutils.TestAddress("vpthen")
	for i := 0; then.String() > first.String(); i++ { // the later sorts first
		urequire.True(t, i < 100, "no address sorts first")
		then = testutils.TestAddress(string(rune('a'+i%26)) + strconv.Itoa(i) + "vpthen")
	}
	giveName(cur, first, "vpfirst")
	giveName(cur, then, "vpthen")
	replayAs(cur, first, five, strokesOf(5))
	testing.SkipHeights(1)
	replayAs(cur, then, two, strokesOf(2))
	uassert.True(t, strings.HasSuffix(Rank("assisted", first), `,"holes":1,"strokes":5,"par":5}`), Rank("assisted", first))
	uassert.True(t, strings.HasSuffix(Rank("assisted", then), `,"holes":1,"strokes":2,"par":2}`), Rank("assisted", then))
	a, b := rankOf("assisted", first), rankOf("assisted", then)
	uassert.True(t, a > 0 && a < b, "level at par: the first there first, "+Rank("assisted", first)+Rank("assisted", then))
	all := CourseLeaderboard("assisted", 0, 100)
	uassert.True(t, strings.Contains(all, `{"player":"`+first.String()+`","name":"vpfirst","holes":1,"strokes":5,"par":5}`), all)
}

// More holes beat a better score against par; among as many holes, the
// better score ranks first, and an improvement moves the strokes, not the par.
func TestMoreHolesBeatABetterScore(cur realm, t *testing.T) {
	x, y := parHole(cur, 3, 3), parHole(cur, 4, 3)
	many, good := testutils.TestAddress("vpmany"), testutils.TestAddress("vpgood")
	giveName(cur, many, "vpmany")
	giveName(cur, good, "vpgood")
	replayAs(cur, good, x, strokesOf(1)) // one hole, -2
	// two holes, +2 each: +4
	for _, id := range []string{x, y} {
		replayAs(cur, many, id, strokesOf(5))
	}
	uassert.True(t, rankOf("pro", many) == 0, "an assisted standing only")
	uassert.True(t, rankOf("assisted", many) < rankOf("assisted", good), "two holes at +4 before one at -2")
	replayAs(cur, many, x, strokesOf(2)) // -1 on x: +1 in all
	holes, strokes, par := standingOf("assisted", many)
	uassert.True(t, holes == 2 && strokes == 7 && par == 6, "an improvement moves the strokes only")
	// the best score among as many holes ranks first
	other := testutils.TestAddress("vpother")
	giveName(cur, other, "vpother")
	replayAs(cur, other, x, strokesOf(3))
	replayAs(cur, other, y, strokesOf(3)) // level par in two
	uassert.True(t, rankOf("assisted", other) < rankOf("assisted", many), "even before +1")
}

// An archived hole leaves a standing with its own par: its strokes and par
// come out, and what is left ranks by the holes still current.
func TestTheDrainTakesAnArchivedHolesParOut(cur realm, t *testing.T) {
	five, two := parHole(cur, 5, 5), parHole(cur, 6, 2)
	p := testutils.TestAddress("vpdrain")
	giveName(cur, p, "vpdrain")
	replayAs(cur, p, five, strokesOf(4)) // -1
	replayAs(cur, p, two, strokesOf(3))  // +1
	holes, strokes, par := standingOf("assisted", p)
	uassert.True(t, holes == 2 && strokes == 7 && par == 7, "level par in two")
	was := rankKey(rowFor(assisted, p.String()))
	h := cupHole("mines", 5, "Par 5 again")
	h.Strokes = 5
	publish(cur, h) // archives five
	drain(drainMax) // and any archived before it
	holes, strokes, par = standingOf("assisted", p)
	uassert.True(t, holes == 1 && strokes == 3 && par == 2, "+1 on the par 2 alone")
	r := rowFor(assisted, p.String())
	uassert.True(t, ranks[assisted].Has(rankKey(r)) && !ranks[assisted].Has(was), "ranked by what is left, once")
}

// A tie on holes and score goes to whoever got there first: the standing
// that last moved earlier, a worse or level replay moving nothing; in the
// same block, the lower address.
func TestATieGoesToWhoGotThereFirst(cur realm, t *testing.T) {
	x, y := parHole(cur, 7, 3), parHole(cur, 8, 3)
	a, b := testutils.TestAddress("tiea"), testutils.TestAddress("tieb")
	giveName(cur, a, "tiea")
	giveName(cur, b, "tieb")
	replayAs(cur, a, x, strokesOf(3))
	testing.SkipHeights(1)
	replayAs(cur, b, x, strokesOf(3))
	uassert.True(t, rankOf("assisted", a) < rankOf("assisted", b), "level at E on one hole: the first there")
	testing.SkipHeights(1)
	replayAs(cur, a, x, strokesOf(4)) // worse
	replayAs(cur, a, x, strokesOf(3)) // level with their own best
	uassert.True(t, rankOf("assisted", a) < rankOf("assisted", b), "a replay that improves nothing moves nothing")
	testing.SkipHeights(1)
	replayAs(cur, b, y, strokesOf(3))
	testing.SkipHeights(1)
	replayAs(cur, a, y, strokesOf(3))
	uassert.True(t, rankOf("assisted", b) < rankOf("assisted", a), "b reached two holes at E first")
	// in one block, the address
	c, d := testutils.TestAddress("tiec"), testutils.TestAddress("tied")
	if d.String() < c.String() {
		c, d = d, c
	}
	giveName(cur, c, "tiec")
	giveName(cur, d, "tied")
	testing.SkipHeights(1)
	replayAs(cur, d, x, strokesOf(3))
	replayAs(cur, c, x, strokesOf(3))
	uassert.True(t, rankOf("assisted", c) < rankOf("assisted", d), "the same block: the lower address")
}
