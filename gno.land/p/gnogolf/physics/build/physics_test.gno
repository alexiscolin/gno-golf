package build

import (
	"math"
	"testing"

	"gno.land/p/gnogolf/physics"
)

func box() *physics.Field {
	return &physics.Field{Walls: Box(physics.V(0, 0), physics.V(10, 10)), Friction: 0.8, Bounce: 0.9}
}

func TestBallStaysInTheBox(t *testing.T) {
	sh := box().Step(physics.V(5, 5), physics.FromPolar(0.3, 4), 16)
	if sh.Rest().X < 0 || sh.Rest().X > 10 || sh.Rest().Y < 0 || sh.Rest().Y > 10 {
		t.Fatalf("ball tunnelled out: %v", sh.Rest())
	}
	if sh.Bounces == 0 {
		t.Fatal("a 4-unit shot inside a 10-unit box must bounce")
	}
}

func TestShortWallIsNotAnInfiniteLine(t *testing.T) {
	f := &physics.Field{Walls: []physics.Wall{{Seg: physics.Segment{physics.V(5, 0), physics.V(5, 1)}}}, Friction: 1, Bounce: 0.9}
	sh := f.Step(physics.V(1, 5), physics.V(2, 0), 4)
	if sh.Bounces != 0 || sh.Rest().X < 5 {
		t.Fatalf("hit a wall that is not there: %v after %d bounces", sh.Rest(), sh.Bounces)
	}
}

func TestPostBouncesBack(t *testing.T) {
	f := &physics.Field{Posts: []physics.Post{{Circle: physics.Circle{C: physics.V(5, 5), R: 1}}}, Friction: 1, Bounce: 1}
	sh := f.Step(physics.V(1, 5), physics.V(1.5, 0), 6)
	if sh.Bounces == 0 {
		t.Fatal("a head-on shot at a post must bounce")
	}
	if sh.Rest().X > 4 {
		t.Fatalf("ball should have come back, stopped at %v", sh.Rest())
	}
}

func TestTunnelMovesTheBallAndKeepsItRolling(t *testing.T) {
	f := &physics.Field{
		Zones:    []physics.Zone{{Kind: physics.Tunnel, Min: physics.V(4, 4), Max: physics.V(6, 6), Vec: physics.V(20, 20)}},
		Friction: 1,
	}
	sh := f.Step(physics.V(1, 5), physics.V(2, 0), 4)
	if sh.Rest().X < 20 || sh.Rest().Y < 20 {
		t.Fatalf("ball did not come out of the tunnel: %v", sh.Rest())
	}
}

func TestHazardSendsTheBallBack(t *testing.T) {
	f := &physics.Field{
		Zones:    []physics.Zone{{Kind: physics.Hazard, Min: physics.V(4, 0), Max: physics.V(6, 10), Vec: physics.V(1, 1)}},
		Friction: 1,
	}
	sh := f.Step(physics.V(1, 5), physics.V(2, 0), 6)
	if sh.Rest() != (physics.V(1, 5)) {
		t.Fatalf("water should send the ball back to where it was played from, got %v", sh.Rest())
	}
}

func TestUphillSlopeSendsTheBallBack(t *testing.T) {
	f := &physics.Field{
		Zones:    []physics.Zone{{Kind: physics.Slope, Min: physics.V(2, 0), Max: physics.V(10, 10), Vec: physics.V(-0.8, 0)}},
		Friction: 0.95,
	}
	sh := f.Step(physics.V(1, 5), physics.V(1.5, 0), 20)
	if sh.Rest().X > 6 {
		t.Fatalf("a weak shot should not crest the hill, reached %v", sh.Rest())
	}
}

func TestBarStopsABallRollingAlongIt(t *testing.T) {
	// the case a bare Segment cannot catch: the ball is exactly collinear.
	f := &physics.Field{Walls: Bar(physics.V(10, 8), physics.V(22, 8), 0.6, 'X', "blade"), Friction: 1, Bounce: 0.5}
	sh := f.Step(physics.V(3, 8), physics.V(3, 0), 8)
	if sh.Bounces == 0 || sh.Rest().X > 10 {
		t.Fatalf("ball went through the bar: %v after %d bounces", sh.Rest(), sh.Bounces)
	}
}

// A round ball stops with its edge on the wall: its centre never gets closer
// than the radius, whether the wall is the box or a free-standing bar.
func TestRoundBallKeepsItsRadiusFromWalls(t *testing.T) {
	f := &physics.Field{
		Walls:    Walls(Box(physics.V(0, 0), physics.V(10, 10)), Bar(physics.V(6, 2), physics.V(6, 8), 0.8, 0, "")),
		Friction: 1, Bounce: 0.5, Radius: 0.5,
	}
	for _, sh := range []physics.Shot{
		f.Step(physics.V(3, 5), physics.V(2, 0), 3),  // at the bar, face on
		f.Step(physics.V(3, 5), physics.V(-2, 0), 3), // at the box
	} {
		for _, p := range sh.Path {
			if p.X < 0.5-1e-6 || (p.X > 6-0.4-0.5+1e-6 && p.X < 6+0.4+0.5-1e-6 && p.Y > 2 && p.Y < 8) {
				t.Fatalf("centre came within the radius of a wall: %v", p)
			}
		}
		if sh.Bounces == 0 {
			t.Fatal("the shot should have bounced")
		}
	}
	// a post grows by the radius too
	g := &physics.Field{Posts: []physics.Post{{Circle: physics.Circle{C: physics.V(5, 5), R: 1}}}, Friction: 1, Bounce: 1, Radius: 0.5}
	for _, p := range g.Step(physics.V(1, 5), physics.V(1, 0), 6).Path {
		if p.Sub(physics.V(5, 5)).Len() < 1.5-1e-6 {
			t.Fatalf("centre inside post+radius: %v", p)
		}
	}
}

// A fast ball does not jump over a narrow zone: a substep is walked in short
// moves, and the water in the middle of a 10-unit stride still catches it.
func TestRoundZoneHasNoCorners(t *testing.T) {
	z := physics.Zone{Min: physics.V(0, 0), Max: physics.V(10, 4), Round: true}
	if !z.Contains(physics.V(5, 2)) || z.Contains(physics.V(0.3, 0.3)) {
		t.Fatal("a round zone holds its centre and not its corners")
	}
}

func TestFastBallMeetsANarrowZone(t *testing.T) {
	f := &physics.Field{
		Walls:    Box(physics.V(0, 0), physics.V(40, 10)),
		Zones:    []physics.Zone{{Kind: physics.Hazard, Min: physics.V(6, 0), Max: physics.V(8, 10), Vec: physics.V(1, 5)}},
		Friction: 0.8,
	}
	sh := f.Step(physics.V(1, 5), physics.V(10, 0), 8)
	if r := sh.Rest(); r.X != 1 || r.Y != 5 {
		t.Fatalf("a 10-unit stride skipped a 2-unit hazard, ball at %v", r)
	}
}

// A ball that starts closer to a wall than its radius — in a corner — must
// bounce off it, not slide through it.
func TestBallInACornerStaysIn(t *testing.T) {
	f := &physics.Field{Walls: Box(physics.V(0, 0), physics.V(32, 16)), Friction: 0.8, Bounce: 0.9, Radius: 0.5}
	sh := f.Step(physics.V(0.9313, 0.9313), physics.FromPolar(225*math.Pi/180, 6), 16)
	for _, p := range sh.Path {
		if p.X < 0 || p.Y < 0 {
			t.Fatalf("the ball left the board at %v, path %v", p, sh.Path)
		}
	}
}

// Two lively bumpers facing each other cannot speed a ball up without end.
func TestBumpersCannotPumpForever(t *testing.T) {
	f := &physics.Field{
		Walls:    Box(physics.V(0, 0), physics.V(32, 16)),
		Posts:    []physics.Post{{Circle: physics.Circle{C: physics.V(9, 4), R: 1.4}, Bounce: 1.3}, {Circle: physics.Circle{C: physics.V(9, 12), R: 1.4}, Bounce: 1.3}},
		Friction: 0.95, Bounce: 1, Radius: 0.5,
	}
	sh := f.Step(physics.V(9, 7), physics.V(0, -8), 30)
	for i := 1; i < len(sh.Path); i++ {
		if d := sh.Path[i].Sub(sh.Path[i-1]).Len(); d > physics.SpeedCap+1e-6 {
			t.Fatalf("a substep of %v is faster than the cap", d)
		}
	}
}

// No passive piece ever gives a ball more speed than it had, head on or at a
// graze: only a bumper (a Bounce above 1) does.
func TestNoBounceAddsSpeed(t *testing.T) {
	for _, b := range []float64{0.5, 0.85, 1} {
		f := &physics.Field{
			Walls:    Box(physics.V(0, 0), physics.V(40, 20)),
			Posts:    []physics.Post{{Circle: physics.Circle{C: physics.V(20, 10), R: 1.2}, Bounce: b}},
			Friction: 1, Bounce: b, Radius: 0.5,
		}
		for _, a := range []float64{0, 0.2, 0.5, 1.2, 2.5, 3.1} {
			v0 := physics.FromPolar(a, 3)
			start := physics.V(20, 10).Sub(physics.FromPolar(a, 6)) // aimed at the bumper
			sh := f.Step(start, v0, 40)
			top := v0.Len() + 1e-6
			for i := 1; i < len(sh.Path); i++ {
				if d := sh.Path[i].Sub(sh.Path[i-1]).Len(); d > top {
					t.Fatalf("bounce %v, angle %v: a substep of %.3f is faster than the shot (%.3f)", b, a, d, top)
				}
			}
		}
	}
}

// A ball that stops inside the water is sent back now, not on the next stroke.
func TestBallThatStopsInWaterIsResolved(t *testing.T) {
	f := &physics.Field{
		Walls:    Box(physics.V(0, 0), physics.V(32, 16)),
		Zones:    []physics.Zone{{Kind: physics.Hazard, Min: physics.V(5, 0), Max: physics.V(30, 16), Vec: physics.V(1, 1)}},
		Friction: 0.5,
	}
	if r := f.Step(physics.V(2, 8), physics.V(4, 0), 30).Rest(); r != (physics.V(2, 8)) {
		t.Fatalf("resting in the water, the ball should be back where it was played from, not %v", r)
	}
}

// A ball in a stadium lane stays inside it: the rounded ends are walls too.
func TestStadiumHoldsTheBall(t *testing.T) {
	f := &physics.Field{Walls: Outline(Stadium(physics.V(0, 0), physics.V(30, 8), 6)...), Friction: 0.95, Bounce: 0.9, Radius: 0.5}
	for _, a := range []float64{0, 0.5, 2, 3, 4} {
		for _, p := range f.Step(physics.V(15, 4), physics.FromPolar(a, 6), 40).Path {
			if p.X < 0 || p.X > 30 || p.Y < 0 || p.Y > 8 {
				t.Fatalf("left the stadium at %v (angle %v)", p, a)
			}
		}
	}
}

// a lane with a hill, then a pond right behind its top
func hillAndPond() *physics.Field {
	return &physics.Field{
		Walls: Box(physics.V(0, 0), physics.V(60, 8)),
		Zones: []physics.Zone{
			{Kind: physics.Slope, Min: physics.V(5, 0), Max: physics.V(15, 8), Vec: physics.V(-0.2, 0)},
			{Kind: physics.Hazard, Min: physics.V(15.5, 0), Max: physics.V(19, 8), Vec: physics.V(1, 4)},
		},
		Friction: 0.86, Radius: 0.5, Bounce: 0.85,
	}
}

func TestFastBallFliesOverThePondBehindAHill(t *testing.T) {
	sh := hillAndPond().Step(physics.V(2, 4), physics.V(6, 0), 30)
	if sh.Rest().X < 19 {
		t.Fatalf("a fast ball over the top should fly the pond, rested at %v", sh.Rest())
	}
	flew := false
	for i, a := range sh.Air {
		if a {
			flew = true
			if x := sh.Path[i].X; x < 14 {
				t.Fatalf("in the air before the top of the hill, at %v", sh.Path[i])
			}
		}
	}
	if !flew || len(sh.Air) != len(sh.Path) || sh.Air[len(sh.Air)-1] {
		t.Fatalf("air flags wrong: %v", sh.Air)
	}
}

func TestSlowBallOverTheTopLandsInThePond(t *testing.T) {
	sh := hillAndPond().Step(physics.V(2, 4), physics.V(3.6, 0), 30)
	// too slow at the top to take off: it rolls over it into the water
	if sh.Rest() != (physics.V(2, 4)) {
		t.Fatalf("it should drown and go back, rested at %v; path %v", sh.Rest(), sh.Path)
	}
}

func TestLoopWantsTheRightSpeedAndTheMouth(t *testing.T) {
	f := &physics.Field{
		// the loop's base across the lane, its mouth in front of it
		Walls:    Walls(Box(physics.V(0, 0), physics.V(40, 6)), Box(physics.V(12, 0), physics.V(16, 6))),
		Zones:    []physics.Zone{{Kind: physics.Loop, Min: physics.V(10, 1), Max: physics.V(11.5, 3), Vec: physics.V(17, 4.5), Scale: 2}},
		Friction: 0.9,
		Radius:   0.5,
	}
	round := f.Step(physics.V(6, 2), physics.V(2.6, 0), 20)
	if round.Rest().X <= 16 {
		t.Fatalf("the right speed goes round and on, stopped at %v", round.Rest())
	}
	slow := f.Step(physics.V(8, 2), physics.V(1.2, 0), 20)
	if slow.Rest().X >= 10 {
		t.Fatalf("a slow ball falls back out of the mouth, stopped at %v", slow.Rest())
	}
	// a loop is a closed tube, with no top to fly off: a fast ball goes round too
	if fast := f.Step(physics.V(8, 2), physics.V(3.6, 0), 20); fast.Rest().X <= 16 {
		t.Fatalf("a fast ball goes round the tube, stopped at %v", fast.Rest())
	}
	slant := f.Step(physics.V(8, 1.2), physics.FromPolar(0.6, 2.6), 20) // about 34° off straight
	if slant.Rest().X >= 10 || slant.Rest().X < 7 {
		t.Fatalf("a ball coming in slanted falls off the side and is put down in front, at %v", slant.Rest())
	}
	wide := f.Step(physics.V(6, 4.5), physics.V(2.6, 0), 20)
	if wide.Rest().X >= 12 {
		t.Fatalf("a ball that misses the mouth meets the loop's base, got to %v", wide.Rest())
	}
}

func TestASlowBallRollsBackDownAHill(t *testing.T) {
	f := &physics.Field{
		Walls:    Box(physics.V(0, 0), physics.V(40, 6)),
		Zones:    []physics.Zone{{Kind: physics.Slope, Min: physics.V(10, 0), Max: physics.V(20, 6), Vec: physics.V(-0.25, 0)}},
		Friction: 0.86,
		Radius:   0.5,
	}
	sh := f.Step(physics.V(6, 3), physics.V(2, 0), 40)
	top := 0.0
	for _, p := range sh.Path {
		if p.X > top {
			top = p.X
		}
	}
	if top <= 10 || top >= 20 {
		t.Fatalf("it should climb part of the way, got to %v", top)
	}
	if sh.Rest().X >= 10 {
		t.Fatalf("too slow for the hill, it rolls back down, stopped at %v", sh.Rest())
	}
}

func TestATimedWallIsOnlyThereSometimes(t *testing.T) {
	gate := func(phase int) *physics.Field {
		return &physics.Field{
			Walls:    Walls(Box(physics.V(0, 0), physics.V(40, 6)), Timed(Bar(physics.V(10, 0), physics.V(10, 6), 0.4, '|', "sail"), 10, 5, phase)),
			Friction: 0.9,
			Radius:   0.5,
		}
	}
	// the ball reaches x=10 in its third substep: shut then, it bounces; open, it passes
	if sh := gate(0).Step(physics.V(4, 3), physics.V(2.5, 0), 20); sh.Rest().X > 10 {
		t.Fatalf("the wall is there when it reaches it: should bounce, got %v", sh.Rest())
	}
	if sh := gate(5).Step(physics.V(4, 3), physics.V(2.5, 0), 20); sh.Rest().X < 10 {
		t.Fatalf("the wall is away when it reaches it: should pass, got %v", sh.Rest())
	}
}

func TestOffTheLaneIsTheSea(t *testing.T) {
	lane := Lane(4, 3, physics.V(4, 5), physics.V(16, 7), physics.V(28, 5))
	tee := physics.V(4, 5)
	f := &physics.Field{
		Walls:    Box(physics.V(0, 0), physics.V(32, 12)), // only the board's edge, as a net
		Zones:    []physics.Zone{{Kind: physics.Hazard, Min: physics.V(0, 0), Max: physics.V(32, 12), Vec: tee, Poly: lane, Outside: true}},
		Friction: 0.88,
		Radius:   0.5,
	}
	if f.Zones[0].Contains(physics.V(16, 7)) || !f.Zones[0].Contains(physics.V(16, 1)) {
		t.Fatal("the lane is dry and beside it is the sea")
	}
	off := f.Step(tee, physics.FromPolar(1.2, 3), 20) // straight off the side
	if off.Rest() != tee {
		t.Fatalf("off the edge is back to the tee, got %v", off.Rest())
	}
	along := f.Step(tee, physics.FromPolar(0.16, 1.2), 20) // gently along the lane
	if along.Rest() == tee {
		t.Fatal("a soft shot down the lane stays on it")
	}
}

func TestWindDoesNotHideTheHillUnderIt(t *testing.T) {
	f := &physics.Field{
		Walls: Box(physics.V(0, 0), physics.V(40, 6)),
		Zones: []physics.Zone{
			{Kind: physics.Slope, Min: physics.V(0, 0), Max: physics.V(40, 6), Vec: physics.V(0.02, 0), Skin: "wind", Air: true, Capped: true},
			{Kind: physics.Slope, Min: physics.V(10, 0), Max: physics.V(20, 6), Vec: physics.V(-0.25, 0)},
		},
		Friction: 0.86,
		Radius:   0.5,
	}
	if sh := f.Step(physics.V(6, 3), physics.V(2, 0), 40); sh.Rest().X >= 10 {
		t.Fatalf("too slow for the hill even with the wind behind it: it rolls back, stopped at %v", sh.Rest())
	}
}

func TestTickMovesTheTimedWalls(t *testing.T) {
	// a gate across the lane that stands for 4 substeps in 8
	f := &physics.Field{
		Walls:    Walls(Box(physics.V(0, 0), physics.V(30, 6)), Timed(Bar(physics.V(10, 0), physics.V(10, 6), 0.5, '=', "gate"), 8, 4, 0)),
		Friction: 0.95,
		Radius:   0.5,
	}
	past := 0
	for tick := 0; tick < 8; tick++ {
		if physics.WithTick(f, tick).Step(physics.V(2, 3), physics.V(3, 0), 20).Rest().X > 10 {
			past++
		}
	}
	if past == 0 || past == 8 {
		t.Fatalf("the gate's timing should matter: %d of 8 ticks got past", past)
	}
	if physics.WithTick(f, 8).Step(physics.V(2, 3), physics.V(3, 0), 20).Rest() != physics.WithTick(f, 0).Step(physics.V(2, 3), physics.V(3, 0), 20).Rest() {
		t.Fatal("a whole turn later is the same")
	}
}

func TestTheReleaseTickShiftsTimedWalls(t *testing.T) {
	f := &physics.Field{
		Walls:    Walls(Box(physics.V(0, 0), physics.V(40, 6)), Timed(Bar(physics.V(10, 0), physics.V(10, 6), 0.4, '|', "tram"), 10, 5, 0)),
		Friction: 0.9,
		Radius:   0.5,
	}
	if sh := f.Step(physics.V(4, 3), physics.V(2.5, 0), 20); sh.Rest().X > 10 {
		t.Fatalf("let go at tick 0 the tram is there: should bounce, got %v", sh.Rest())
	}
	f.Tick = 5
	if sh := f.Step(physics.V(4, 3), physics.V(2.5, 0), 20); sh.Rest().X < 10 {
		t.Fatalf("let go at tick 5 the tram has gone by: should pass, got %v", sh.Rest())
	}
}

func TestATimedGustOnlyBlowsInItsWindow(t *testing.T) {
	gust := func(on int) *physics.Field {
		return &physics.Field{
			Walls:    Box(physics.V(0, 0), physics.V(40, 40)),
			Zones:    []physics.Zone{{Kind: physics.Slope, Min: physics.V(0, 0), Max: physics.V(40, 40), Vec: physics.V(0, 0.3), Skin: "wind", Every: 100, On: on, Air: true, Capped: true}},
			Friction: 0.9,
			Radius:   0.5,
		}
	}
	calm, blown := gust(0).Step(physics.V(5, 5), physics.V(2, 0), 20), gust(100).Step(physics.V(5, 5), physics.V(2, 0), 20)
	if math.Abs(calm.Rest().Y-5) > 1e-9 || blown.Rest().Y <= 6 {
		t.Fatalf("a gust off blows nothing (%v), a gust on pushes (%v)", calm.Rest(), blown.Rest())
	}
}

func TestABallLeftOnASlopeRollsDown(t *testing.T) {
	f := &physics.Field{
		Walls:    Box(physics.V(0, 0), physics.V(60, 6)),
		Zones:    []physics.Zone{{Kind: physics.Slope, Min: physics.V(10, 0), Max: physics.V(40, 6), Vec: physics.V(0.3, 0)}},
		Friction: 0.86,
		Radius:   0.5,
	}
	// a tiny tap on the slope, with far too few substeps to get down it
	sh := f.Step(physics.V(12, 3), physics.V(0.3, 0), 3)
	if sh.Rest().X < 40 {
		t.Fatalf("a ball on a slope rolls on past its substeps until it is off it, stopped at %v", sh.Rest())
	}
}

// A ball that takes off over a crest during the stroke's last substep flies
// on, as one that took off before it does: it never stops in mid-air at the lip.
func TestABallTakingOffOnTheLastSubstepFliesOn(t *testing.T) {
	f := &physics.Field{Walls: Box(physics.V(0, 0), physics.V(90, 20)),
		Zones:    []physics.Zone{{Kind: physics.Slope, Min: physics.V(10, 0), Max: physics.V(12, 20), Vec: physics.V(-0.3, 0)}},
		Friction: 0.87, Radius: 0.5}
	sh := f.Step(physics.V(5.5, 10), physics.V(4, 0), 2)
	if !flew(sh) || sh.Rest().X < 20 {
		t.Fatalf("a ball over the crest on the last substep stopped at %v, air %v", sh.Rest(), sh.Air)
	}
}

// On flat grass, with nothing but friction, a ball only ever slows down.
func TestFlatGrassNeverSpeedsUp(t *testing.T) {
	f := &physics.Field{Friction: 0.86, Radius: 0.5}
	for _, v := range []float64{0.3, 1, 2.5, 5} {
		sh := f.Step(physics.V(50, 50), physics.FromPolar(0.7, v), 60)
		last := v + 1e-9
		for i := 1; i < len(sh.Path); i++ {
			d := sh.Path[i].Sub(sh.Path[i-1]).Len()
			if d > last+1e-9 {
				t.Fatalf("speed %v: substep %d went %.4f after %.4f", v, i, d, last)
			}
			last = d
		}
	}
}

// A ball at rest, or barely moving, in a corner or a notch narrower than
// itself never gains energy there.
func TestABallInAWedgeNeverGains(t *testing.T) {
	wedge := []physics.Wall{
		{Seg: physics.Segment{physics.V(0, 0), physics.V(10, 0.6)}},
		{Seg: physics.Segment{physics.V(0, 1.2), physics.V(10, 0.6)}},
		{Seg: physics.Segment{physics.V(0, 0), physics.V(0, 1.2)}},
	}
	fields := []*physics.Field{
		{Walls: Box(physics.V(0, 0), physics.V(10, 10)), Friction: 0.86, Bounce: 0.9, Radius: 0.5},
		{Walls: wedge, Friction: 0.86, Bounce: 0.9, Radius: 0.5},
	}
	starts := []physics.Vec2{{0.5, 0.5}, {7, 0.6}}
	for fi, f := range fields {
		for _, v := range []float64{0, 0.05, 0.5, 1.5} {
			v0 := physics.FromPolar(0.1+math.Pi*float64(1-fi), v) // into the corner / down the notch
			if fi == 1 {
				v0 = physics.V(v, 0)
			}
			sh := f.Step(starts[fi], v0, 40)
			for i := 1; i < len(sh.Path); i++ {
				if d := sh.Path[i].Sub(sh.Path[i-1]).Len(); d > v+1e-9 {
					t.Fatalf("field %d, speed %v: substep %d moved %.4f", fi, v, i, d)
				}
			}
		}
	}
}

// The weather's wind bends a ball but never speeds it up: a ball at rest stays
// put, and a tailwind on ice cannot beat the shot.
func TestWindNeverSpeedsTheBallUp(t *testing.T) {
	wind := physics.Zone{Kind: physics.Slope, Min: physics.V(0, 0), Max: physics.V(100, 100), Vec: physics.V(0.15, 0), Skin: "wind", Air: true, Capped: true}
	ice := physics.Zone{Kind: physics.Surface, Min: physics.V(0, 0), Max: physics.V(100, 100), Scale: 1.12, Skin: "ice"}
	f := &physics.Field{Zones: []physics.Zone{ice, wind}, Friction: 0.86, Radius: 0.5}
	if sh := f.Step(physics.V(50, 50), physics.Vec2{}, 40); sh.Rest() != (physics.V(50, 50)) {
		t.Fatalf("the wind moved a ball at rest to %v", sh.Rest())
	}
	for _, a := range []float64{0, 0.5, 1.6, 3} {
		v := 1.0
		sh := f.Step(physics.V(50, 50), physics.FromPolar(a, v), 60)
		for i := 1; i < len(sh.Path); i++ {
			if d := sh.Path[i].Sub(sh.Path[i-1]).Len(); d > v+1e-9 {
				t.Fatalf("angle %v: substep %d moved %.4f, the shot was %v", a, i, d, v)
			}
		}
		if len(sh.Path) > 60 {
			t.Fatalf("angle %v: the wind kept the ball rolling past its substeps", a)
		}
	}
}

// The same shot on the same field is the same path, point for point.
func TestReplaysAreDeterministic(t *testing.T) {
	f := &physics.Field{
		Walls: Box(physics.V(0, 0), physics.V(30, 12)),
		Posts: []physics.Post{{Circle: physics.Circle{C: physics.V(15, 6), R: 1}, Bounce: 0.6}},
		Zones: []physics.Zone{
			{Kind: physics.Slope, Min: physics.V(0, 0), Max: physics.V(30, 12), Vec: physics.V(0.1, 0.05), Skin: "wind", Every: 6, On: 3, Air: true, Capped: true},
			{Kind: physics.Slope, Min: physics.V(20, 0), Max: physics.V(26, 12), Vec: physics.V(-0.2, 0)},
			{Kind: physics.Surface, Min: physics.V(0, 0), Max: physics.V(10, 12), Scale: 1.12, Skin: "ice"},
		},
		Friction: 0.86, Bounce: 0.85, Radius: 0.5, Tick: 7,
	}
	a, b := f.Step(physics.V(3, 3), physics.FromPolar(0.4, 3), 40), f.Step(physics.V(3, 3), physics.FromPolar(0.4, 3), 40)
	if len(a.Path) != len(b.Path) || string(a.Cause) != string(b.Cause) || a.Bounces != b.Bounces {
		t.Fatalf("two runs differ: %d/%d points, causes %q / %q", len(a.Path), len(b.Path), a.Cause, b.Cause)
	}
	for i := range a.Path {
		if a.Path[i] != b.Path[i] {
			t.Fatalf("point %d differs: %v / %v", i, a.Path[i], b.Path[i])
		}
	}
	if len(a.Cause) != len(a.Path) {
		t.Fatalf("%d causes for %d points", len(a.Cause), len(a.Path))
	}
}

// A ball pushed into a wall by a steep slope stops, instead of jittering
// against it for every substep it may roll on.
func TestAPinnedBallStops(t *testing.T) {
	f := &physics.Field{
		Walls:    Box(physics.V(0, 0), physics.V(40, 6)),
		Zones:    []physics.Zone{{Kind: physics.Slope, Min: physics.V(0, 0), Max: physics.V(40, 6), Vec: physics.V(0.2, 0)}},
		Friction: 0.86,
		Radius:   0.5,
	}
	sh := f.Step(physics.V(36, 3), physics.V(0.5, 0), 20)
	if len(sh.Path) > 20+physics.MaxRollOn/2 {
		t.Fatalf("a pinned ball should stop early, got %d points", len(sh.Path))
	}
	if sh.Rest().X < 38 {
		t.Fatalf("it rests against the downhill wall, at %v", sh.Rest())
	}
}

// A timed hill (a seesaw) pulls while it is there: a ball that stops on it
// rolls back down as on any hill, within the stroke.
func TestATimedHillPullsWhileItIsThere(t *testing.T) {
	see := physics.Zone{Kind: physics.Slope, Min: physics.V(10, 0), Max: physics.V(40, 10), Vec: physics.V(0.3, 0), Every: 1000, On: 1000}
	f := &physics.Field{Walls: Box(physics.V(0, 0), physics.V(60, 10)), Zones: []physics.Zone{see}, Friction: 0.87, Radius: 0.5}
	s := f.Step(physics.V(30, 5), physics.V(-1.5, 0), 30)
	if s.Rest().X < 35 {
		t.Fatalf("the ball stopped against the tilt at %v", s.Rest())
	}
}

// Leaving the sand mid-substep, the ball is on grass for the rest of it:
// calm plays like fog (a whole-board Surface of scale 1).
func TestCalmPlaysLikeFog(t *testing.T) {
	sand := physics.Zone{Kind: physics.Surface, Min: physics.V(5, 0), Max: physics.V(8, 10), Scale: 0.6, Skin: "sand"}
	fog := physics.Zone{Kind: physics.Surface, Min: physics.V(0, 0), Max: physics.V(60, 10), Scale: 1, Skin: "fog"}
	calm := &physics.Field{Walls: Box(physics.V(0, 0), physics.V(60, 10)), Zones: []physics.Zone{sand}, Friction: 0.86, Radius: 0.5}
	foggy := &physics.Field{Walls: Box(physics.V(0, 0), physics.V(60, 10)), Zones: []physics.Zone{fog, sand}, Friction: 0.86, Radius: 0.5}
	for _, v := range []float64{2, 4, 6} {
		if a, b := calm.Step(physics.V(2, 5), physics.V(v, 0), 30), foggy.Step(physics.V(2, 5), physics.V(v, 0), 30); a.Rest() != b.Rest() {
			t.Fatalf("speed %v: calm rests at %v, fog at %v", v, a.Rest(), b.Rest())
		}
	}
}

// A free wall end is a round cap: a ball close to the wall's line past its
// end, but not yet touching the end, still meets it on the way.
func TestAFreeWallEndCannotBeCut(t *testing.T) {
	f := &physics.Field{Walls: []physics.Wall{{Seg: physics.Segment{physics.V(10, 0), physics.V(10, 5)}}}, Friction: 1, Bounce: 0.8, Radius: 0.5}
	s := f.Step(physics.V(9.6, 5.35), physics.V(0.5, -1), 1)
	if p := s.Path[1]; s.Bounces == 0 || (p.X > 10 && p.Y < 5) {
		t.Fatalf("the ball cut through the wall's end: %d bounces, at %v", s.Bounces, p)
	}
}

// A ball at rest under a timed hazard meets it, whenever in its period the
// stroke happened to end.
func TestABallAtRestUnderATimedHazardMeetsIt(t *testing.T) {
	ice := physics.Zone{Kind: physics.Hazard, Min: physics.V(20, 0), Max: physics.V(30, 10), Vec: physics.V(3, 5), Every: 12, On: 4, Phase: 5}
	f := &physics.Field{Walls: Box(physics.V(0, 0), physics.V(60, 10)), Zones: []physics.Zone{ice}, Friction: 0.86, Radius: 0.5}
	for tick := 0; tick < 12; tick++ {
		if s := physics.WithTick(f, tick).Step(physics.V(24, 5), physics.Vec2{}, 1); s.Rest() != physics.V(24, 5) || len(s.Path) != 2 {
			t.Fatalf("tick %d: a ball at rest under the ice was not caught: %v", tick, s.Path)
		}
	}
}

// A timed bar that comes back on the ball pushes it out: a wall never stands
// on the ball.
func TestATimedBarArrivingOnTheBallPushesItOut(t *testing.T) {
	// away on substep 0 only: the ball rolls into its track, and it arrives
	tram := Timed(Bar(physics.V(22, 1), physics.V(22, 9), 3, '#', "tram"), 100, 99, 99)
	f := &physics.Field{Walls: Walls(Box(physics.V(0, 0), physics.V(60, 10)), tram), Friction: 0.86, Radius: 0.5}
	s := f.Step(physics.V(20.8, 5), physics.V(1.5, 0), 30)
	if x := s.Rest().X; x > 20.5-0.5 && x < 23.5+0.5 {
		t.Fatalf("the ball rests inside the tram, at %v", s.Rest())
	}
}

// LenCmp is the comparison Len would give, on either side of the line and on it.
func TestLenCmpIsLen(t *testing.T) {
	cmp := func(a, b float64) int {
		if a < b {
			return -1
		}
		if a > b {
			return 1
		}
		return 0
	}
	for i := 0; i < 2000; i++ {
		v := physics.FromPolar(float64(i)*0.37, 0.01+float64(i%97)*0.29)
		for _, r := range []float64{v.Len(), v.Len() * (1 + 1e-15), v.Len() * (1 - 1e-15), v.Len() + 1e-9, 1.3, 0} {
			if got, want := v.LenCmp(r), cmp(v.Len(), r); got != want {
				t.Fatalf("%v against %v: %d, Len says %d", v, r, got, want)
			}
		}
	}
}

// Prepare is only a cache: a prepared field plays every shot bit for bit as
// the same field unprepared, and a wall moved after it still counts.
func TestPrepareChangesNothing(t *testing.T) {
	mk := func() *physics.Field {
		return &physics.Field{Walls: Walls(Box(physics.V(0, 0), physics.V(40, 12)), Bar(physics.V(14, 2), physics.V(20, 9), 0.8, '#', ""), Polyline(physics.V(28, 1), physics.V(31, 6), physics.V(27, 10))),
			Posts: []physics.Post{{Circle: physics.Circle{C: physics.V(24, 6), R: 0.7}}}, Friction: 0.86, Radius: 0.5, Bounce: 0.85}
	}
	plain, prep := mk(), mk()
	physics.Prepare(prep)
	prep.Walls[5].Seg.A = physics.V(15, 3) // moved after Prepare: worked out afresh
	plain.Walls[5].Seg.A = physics.V(15, 3)
	for a := 0.0; a < 6.28; a += 0.3 {
		x, y := plain.Step(physics.V(4, 6), physics.FromPolar(a, 5), 30), prep.Step(physics.V(4, 6), physics.FromPolar(a, 5), 30)
		if len(x.Path) != len(y.Path) || x.Bounces != y.Bounces || string(x.Cause) != string(y.Cause) {
			t.Fatalf("angle %v: prepared shot differs", a)
		}
		for i := range x.Path {
			if x.Path[i] != y.Path[i] {
				t.Fatalf("angle %v: point %d %v vs %v", a, i, x.Path[i], y.Path[i])
			}
		}
	}
}

// flew reports whether any path point of the shot is in the air.
func flew(sh physics.Shot) bool {
	for _, a := range sh.Air {
		if a {
			return true
		}
	}
	return false
}

// A ramp (uphill toward +X, its crest at x=20) in the middle of a wide lane.
func ramp() *physics.Field {
	return &physics.Field{
		Walls:    Box(physics.V(0, 0), physics.V(60, 30)),
		Zones:    []physics.Zone{{Kind: physics.Slope, Min: physics.V(16, 10), Max: physics.V(20, 20), Vec: physics.V(-0.3, 0)}},
		Friction: 0.87,
		Radius:   0.5,
	}
}

// Only the crest launches: a ball up the ramp head-on flies off its top, one
// that leaves by a side — crossing it on a slant, or turning off it — rolls.
func TestOnlyTheCrestLaunches(t *testing.T) {
	f := ramp()
	if !flew(f.Step(physics.V(12, 15), physics.V(5, 0), 30)) {
		t.Fatalf("a fast ball up the ramp head-on should fly off its crest")
	}
	// up and across: out through the side (y=20) while still climbing
	if sh := f.Step(physics.V(15, 16), physics.V(2, 3), 30); flew(sh) {
		t.Fatalf("a ball leaving the ramp by its side took off")
	}
	// fast, but mostly across: its speed up the ramp is under JumpSpeed
	if sh := f.Step(physics.V(17, 8), physics.V(1.2, 5), 30); flew(sh) {
		t.Fatalf("a ball crossing the ramp on a slant took off")
	}
}

// A ball that clipped the ramp near its crest has not ridden it: no jump.
func TestAClippedRampDoesNotLaunch(t *testing.T) {
	f := ramp()
	if sh := f.Step(physics.V(18.8, 9.4), physics.V(3, 2), 30); flew(sh) {
		t.Fatalf("a ball that only clipped the ramp's top corner took off")
	}
}

// Head-on, the flight grows with the speed up the ramp.
func TestFlightGrowsWithSpeed(t *testing.T) {
	far := func(v float64) float64 {
		sh := ramp().Step(physics.V(12, 15), physics.V(v, 0), 30)
		for i, a := range sh.Air {
			if a {
				k := i
				for k < len(sh.Air) && sh.Air[k] {
					k++
				}
				return sh.Path[k].X - sh.Path[i-1].X
			}
		}
		return 0
	}
	if slow, fast := far(4.5), far(6); !(slow > 0 && fast > slow) {
		t.Fatalf("faster should fly further: %v then %v", slow, fast)
	}
}

// steep is a hill that rises toward +X up to its crest at x=20, of the given
// steepness, in a lane with no walls near it.
func steep(g float64, zones ...physics.Zone) *physics.Field {
	return &physics.Field{
		Zones:    append([]physics.Zone{{Kind: physics.Slope, Min: physics.V(10, -20), Max: physics.V(20, 20), Vec: physics.V(-g, 0)}}, zones...),
		Friction: 0.87, Radius: 0.5,
	}
}

// Off the crest, a ball flies the ballistic range: taking off at v up the
// hill at a grade θ, it rises at v·tan θ and comes down 2·v·tan θ / G later,
// 2·v²·tan θ / G on. Water across where it lands catches it; water it flies
// over does not.
func TestTheFlightIsBallistic(t *testing.T) {
	for _, g := range []float64{0.3, 0.4, 0.5} {
		const v0 = 4.6
		s := steep(g).Step(physics.V(9, 0), physics.V(v0, 0), 60)
		k := -1
		for i, a := range s.Air {
			if a {
				k = i
				break
			}
		}
		if k < 0 || !s.Air[k+1] {
			t.Fatalf("hill %v: no flight of two substeps: %v", g, s.Air)
		}
		v := s.Path[k+1].Sub(s.Path[k]).X // in the air: its speed, unchanged
		sin := g / physics.G
		tan := sin / math.Sqrt(1-sin*sin)
		land := 20 + 2*v*v*tan/physics.G
		pond := func(x0, x1 float64) bool {
			w := steep(g, physics.Zone{Kind: physics.Hazard, Min: physics.V(x0, -20), Max: physics.V(x1, 20), Vec: physics.V(0, 30)})
			return w.Step(physics.V(9, 0), physics.V(v0, 0), 60).Rest() == physics.V(9, 0) // back where it was played from
		}
		if !pond(land-v/2-physics.MaxMove, land+v/2+physics.MaxMove) {
			t.Errorf("hill %v: water across the landing (%v) did not catch it", g, land)
		}
		if pond(20.5, land-v/2-physics.MaxMove) {
			t.Errorf("hill %v: water short of the landing (%v) caught it in the air", g, land)
		}
	}
}

// Too slow for the crest's curve (v² at most G·CrestRadius up the hill), a
// ball rolls over the top instead of flying.
func TestASlowBallRollsOverTheCrest(t *testing.T) {
	s := steep(0.3).Step(physics.V(9, 0), physics.V(3.4, 0), 60)
	if s.Rest().X <= 20 {
		t.Fatalf("it should make the top, stopped at %v", s.Rest())
	}
	if flew(s) {
		t.Fatalf("a ball too slow for the crest flew: %v", s.Air)
	}
}

// A ball still in the air when its substeps run out keeps flying, and lands.
func TestAFlightOutlivesTheStroke(t *testing.T) {
	s := steep(0.5).Step(physics.V(9, 0), physics.V(4.6, 0), 4)
	if !flew(s) || s.Air[len(s.Air)-1] {
		t.Fatalf("air flags %v", s.Air)
	}
	if s.Rest().X < 24 {
		t.Fatalf("the flight was cut short, at %v", s.Rest())
	}
}

// A ball coming along a wall's line from well past its end meets the end
// cap, however far the move before it started: it never slides on inside
// the wall.
func TestABallAlongAWallMeetsItsEnd(t *testing.T) {
	f := &physics.Field{Walls: []physics.Wall{{Seg: physics.Segment{physics.V(10, 5), physics.V(20, 5)}}}, Friction: 1, Bounce: 0.8, Radius: 0.5}
	s := f.Step(physics.V(9.03, 5.03), physics.V(1.1, 0), 3)
	for _, p := range s.Path {
		if p.X >= 10 && p.X <= 20 && math.Abs(p.Y-5) < 0.5-1e-3 {
			t.Fatalf("the ball is inside the wall, at %v (%d bounces)", p, s.Bounces)
		}
	}
	if s.Bounces == 0 {
		t.Fatal("the ball never met the wall's end")
	}
}

// A ball inside a long, thin bar leaves straight out of its nearest side,
// clear of it, not slid along it.
func TestUnstickLeavesStraightOutOfTheNearestSide(t *testing.T) {
	bar := Bar(physics.V(22, 3), physics.V(22, 12), 0.8, '#', "")
	got := physics.UnstickIn(physics.V(22.3, 9.8), bar, nil, 0.5, nil)
	if math.Abs(got.Y-9.8) > 1e-9 {
		t.Fatalf("pushed along the bar, to %v", got)
	}
	for _, w := range bar {
		if d := w.Seg.Closest(got).Sub(got).Len(); d < 0.5 {
			t.Fatalf("still %v from a side, at %v", d, got)
		}
	}
}

// A timed bar arriving on a ball against a rail pushes it out the other
// way, never through the rail and off the course.
func TestATimedBarNeverPushesTheBallThroughAWall(t *testing.T) {
	tram := Timed(Bar(physics.V(20, 1.5), physics.V(20, 18.5), 2.4, '#', "tram"), 24, 5, 0)
	f := &physics.Field{Walls: Walls(Box(physics.V(0, 0), physics.V(40, 20)), tram), Friction: 0.87, Radius: 0.5}
	s := f.Step(physics.V(20, 0.6), physics.V(0.01, 0), 2)
	for _, p := range s.Path {
		if p.Y < 0 {
			t.Fatalf("the ball was pushed off the course, to %v", p)
		}
	}
	if x := s.Rest().X; x > 18.8-0.5 && x < 21.2+0.5 {
		t.Fatalf("the ball rests inside the tram, at %v", s.Rest())
	}
}

// crossed is the first wall of ws a path steps across, or -1.
func crossed(ws []physics.Wall, path []physics.Vec2) int {
	for i := 1; i < len(path); i++ {
		for j, w := range ws {
			if w.Seg.Crosses(path[i-1], path[i]) {
				return j
			}
		}
	}
	return -1
}

// A ball aimed at the tip of an acute corner meets the tip: the square caps
// of the two walls left a gap in front of it, and a ball in the gap went
// through the solid.
func TestAnAcuteTipIsSolid(t *testing.T) {
	for _, deg := range []float64{45, 60, 63, 75, 85} {
		half := deg / 2 * math.Pi / 180
		tip := physics.V(20, 10)
		a := tip.Add(physics.FromPolar(math.Pi/2-half, 8)) // the wedge points up (-Y), solid below
		b := tip.Add(physics.FromPolar(math.Pi/2+half, 8))
		ws := []physics.Wall{{Seg: physics.Segment{a, tip}}, {Seg: physics.Segment{tip, b}}}
		f := &physics.Field{Walls: ws, Friction: 0.87, Bounce: 0.8, Radius: 0.5}
		physics.Prepare(f)
		for off := -0.6; off <= 0.6; off += 0.05 {
			for _, dist := range []float64{1.6, 1.874, 2.3, 3.1} {
				for _, speed := range []float64{1.8, 3, 4.2, 6} {
					s := f.Step(tip.Add(physics.V(off, -dist)), physics.V(0, speed), 3)
					if j := crossed(ws, s.Path); j >= 0 {
						t.Fatalf("%v° tip, offset %v, %v away, speed %v: through wall %d, rest %v", deg, off, dist, speed, j, s.Rest())
					}
				}
			}
		}
	}
}

// A ball coming diagonally at a free wall end from afar meets the end: the
// square cap had no end face to stop it.
func TestAFreeEndCannotBeCutFromAfar(t *testing.T) {
	ws := []physics.Wall{{Seg: physics.Segment{physics.V(0, 0), physics.V(5, 0)}}}
	f := &physics.Field{Walls: ws, Friction: 0.9, Bounce: 0.8, Radius: 0.5}
	physics.Prepare(f)
	s := f.Step(physics.V(6.8450752494799332, 1.1982058770330597), physics.V(-2.5462835171612519, -1.387962625661413), 1)
	if crossed(ws, s.Path) >= 0 || s.Bounces == 0 {
		t.Fatalf("cut through the wall's end to %v, %d bounces", s.Rest(), s.Bounces)
	}
}

// A piece that comes back on a ball never pushes it across a wall that
// stays: not out of a bar, not off a post.
func TestUnstickInNeverCrossesAStayingWall(t *testing.T) {
	rail := []physics.Wall{{Seg: physics.Segment{physics.V(0, 5), physics.V(10, 5)}}}
	post := []physics.Post{{Circle: physics.Circle{C: physics.V(5, 4.6), R: 0.5}}}
	ball := physics.V(5, 4.9)
	if got := physics.UnstickIn(ball, nil, post, 0.5, nil); !rail[0].Seg.Crosses(ball, got) {
		t.Fatalf("with nothing staying, the post pushes the ball to %v, over the rail", got)
	}
	if got := physics.UnstickIn(ball, nil, post, 0.5, rail); got != ball {
		t.Fatalf("the post pushed the ball across the rail, to %v", got)
	}
	// a bar whose nearest side is across the rail: the ball leaves by another
	bar := Bar(physics.V(2, 4.8), physics.V(8, 4.8), 0.8, 0, "")
	got := physics.UnstickIn(ball, bar, nil, 0.5, rail)
	if rail[0].Seg.Crosses(ball, got) {
		t.Fatalf("the bar pushed the ball across the rail, to %v", got)
	}
	for _, w := range bar {
		if w.Seg.Closest(got).Sub(got).Len() < 0.5 {
			t.Fatalf("the ball is still on the bar, at %v", got)
		}
	}
}

// A slope on ice would speed a ball up for ever: it is held to SpeedCap at
// every substep, not only at a bounce, so no substep takes more than a few
// moves.
func TestSpeedIsCappedEverySubstep(t *testing.T) {
	down := physics.V(1, 1)
	f := &physics.Field{
		Walls:    Box(physics.V(0, 0), physics.V(96, 96)),
		Zones:    []physics.Zone{{Kind: physics.Surface, Min: physics.V(0, 0), Max: physics.V(96, 96), Scale: 8}, {Kind: physics.Slope, Min: physics.V(0, 0), Max: physics.V(96, 96), Vec: down}},
		Friction: 0.9, Radius: 0.5,
	}
	s := f.Step(physics.V(3, 3), physics.V(7, 7), 30)
	for i := 1; i < len(s.Path); i++ {
		if d := s.Path[i].Sub(s.Path[i-1]).Len(); d > physics.SpeedCap+down.Len()+1e-9 {
			t.Fatalf("substep %d went %v", i, d)
		}
	}
}
