package physics

import (
	"math"
	"testing"
)

func box() *Field {
	return &Field{Walls: Box(Vec2{0, 0}, Vec2{10, 10}), Friction: 0.8, Bounce: 0.9}
}

func TestBallStaysInTheBox(t *testing.T) {
	sh := box().Step(Vec2{5, 5}, FromPolar(0.3, 4), 16)
	if sh.Rest().X < 0 || sh.Rest().X > 10 || sh.Rest().Y < 0 || sh.Rest().Y > 10 {
		t.Fatalf("ball tunnelled out: %v", sh.Rest())
	}
	if sh.Bounces == 0 {
		t.Fatal("a 4-unit shot inside a 10-unit box must bounce")
	}
}

func TestShortWallIsNotAnInfiniteLine(t *testing.T) {
	f := &Field{Walls: []Wall{{Seg: Segment{Vec2{5, 0}, Vec2{5, 1}}}}, Friction: 1, Bounce: 0.9}
	sh := f.Step(Vec2{1, 5}, Vec2{2, 0}, 4)
	if sh.Bounces != 0 || sh.Rest().X < 5 {
		t.Fatalf("hit a wall that is not there: %v after %d bounces", sh.Rest(), sh.Bounces)
	}
}

func TestPostBouncesBack(t *testing.T) {
	f := &Field{Posts: []Post{{Circle: Circle{C: Vec2{5, 5}, R: 1}}}, Friction: 1, Bounce: 1}
	sh := f.Step(Vec2{1, 5}, Vec2{1, 0}, 6)
	if sh.Bounces == 0 {
		t.Fatal("a head-on shot at a post must bounce")
	}
	if sh.Rest().X > 4 {
		t.Fatalf("ball should have come back, stopped at %v", sh.Rest())
	}
}

func TestTunnelMovesTheBallAndKeepsItRolling(t *testing.T) {
	f := &Field{
		Zones:    []Zone{{Kind: Tunnel, Min: Vec2{4, 4}, Max: Vec2{6, 6}, Vec: Vec2{20, 20}}},
		Friction: 1,
	}
	sh := f.Step(Vec2{1, 5}, Vec2{2, 0}, 4)
	if sh.Rest().X < 20 || sh.Rest().Y < 20 {
		t.Fatalf("ball did not come out of the tunnel: %v", sh.Rest())
	}
}

func TestHazardStopsTheBallAtItsTarget(t *testing.T) {
	tee := Vec2{1, 1}
	f := &Field{
		Zones:    []Zone{{Kind: Hazard, Min: Vec2{4, 0}, Max: Vec2{6, 10}, Vec: tee}},
		Friction: 1,
	}
	sh := f.Step(Vec2{1, 5}, Vec2{2, 0}, 6)
	if sh.Rest() != tee {
		t.Fatalf("water should send the ball back to %v, got %v", tee, sh.Rest())
	}
}

func TestUphillSlopeSendsTheBallBack(t *testing.T) {
	f := &Field{
		Zones:    []Zone{{Kind: Slope, Min: Vec2{2, 0}, Max: Vec2{10, 10}, Vec: Vec2{-0.8, 0}}},
		Friction: 0.95,
	}
	sh := f.Step(Vec2{1, 5}, Vec2{1.5, 0}, 20)
	if sh.Rest().X > 6 {
		t.Fatalf("a weak shot should not crest the hill, reached %v", sh.Rest())
	}
}

func TestBarStopsABallRollingAlongIt(t *testing.T) {
	// the case a bare Segment cannot catch: the ball is exactly collinear.
	f := &Field{Walls: Bar(Vec2{10, 8}, Vec2{22, 8}, 0.6, 'X', "blade"), Friction: 1, Bounce: 0.5}
	sh := f.Step(Vec2{3, 8}, Vec2{3, 0}, 8)
	if sh.Bounces == 0 || sh.Rest().X > 10 {
		t.Fatalf("ball went through the bar: %v after %d bounces", sh.Rest(), sh.Bounces)
	}
}

func TestReflectFlipsTheNormalComponent(t *testing.T) {
	got := Reflect(Vec2{1, -1}, Vec2{0, 1})
	if math.Abs(got.X-1) > 1e-9 || math.Abs(got.Y-1) > 1e-9 {
		t.Fatalf("want {1 1}, got %v", got)
	}
}

// A round ball stops with its edge on the wall: its centre never gets closer
// than the radius, whether the wall is the box or a free-standing bar.
func TestRoundBallKeepsItsRadiusFromWalls(t *testing.T) {
	f := &Field{
		Walls:    Walls(Box(Vec2{0, 0}, Vec2{10, 10}), Bar(Vec2{6, 2}, Vec2{6, 8}, 0.8, 0, "")),
		Friction: 1, Bounce: 0.5, Radius: 0.5,
	}
	for _, sh := range []Shot{
		f.Step(Vec2{3, 5}, Vec2{2, 0}, 3),  // at the bar, face on
		f.Step(Vec2{3, 5}, Vec2{-2, 0}, 3), // at the box
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
	g := &Field{Posts: []Post{{Circle: Circle{C: Vec2{5, 5}, R: 1}}}, Friction: 1, Bounce: 1, Radius: 0.5}
	for _, p := range g.Step(Vec2{1, 5}, Vec2{1, 0}, 6).Path {
		if p.Sub(Vec2{5, 5}).Len() < 1.5-1e-6 {
			t.Fatalf("centre inside post+radius: %v", p)
		}
	}
}

// A fast ball does not jump over a narrow zone: a substep is walked in short
// moves, and the water in the middle of a 10-unit stride still catches it.
func TestRoundZoneHasNoCorners(t *testing.T) {
	z := Zone{Min: Vec2{0, 0}, Max: Vec2{10, 4}, Round: true}
	if !z.Contains(Vec2{5, 2}) || z.Contains(Vec2{0.3, 0.3}) {
		t.Fatal("a round zone holds its centre and not its corners")
	}
}

func TestFastBallMeetsANarrowZone(t *testing.T) {
	f := &Field{
		Walls:    Box(Vec2{0, 0}, Vec2{40, 10}),
		Zones:    []Zone{{Kind: Hazard, Min: Vec2{6, 0}, Max: Vec2{8, 10}, Vec: Vec2{1, 5}}},
		Friction: 0.8,
	}
	sh := f.Step(Vec2{1, 5}, Vec2{10, 0}, 8)
	if r := sh.Rest(); r.X != 1 || r.Y != 5 {
		t.Fatalf("a 10-unit stride skipped a 2-unit hazard, ball at %v", r)
	}
}

// A ball that starts closer to a wall than its radius — in a corner — must
// bounce off it, not slide through it.
func TestBallInACornerStaysIn(t *testing.T) {
	f := &Field{Walls: Box(Vec2{0, 0}, Vec2{32, 16}), Friction: 0.8, Bounce: 0.9, Radius: 0.5}
	sh := f.Step(Vec2{0.9313, 0.9313}, FromPolar(225*math.Pi/180, 6), 16)
	for _, p := range sh.Path {
		if p.X < 0 || p.Y < 0 {
			t.Fatalf("the ball left the board at %v, path %v", p, sh.Path)
		}
	}
}

// Two lively bumpers facing each other cannot speed a ball up without end.
func TestBumpersCannotPumpForever(t *testing.T) {
	f := &Field{
		Walls:    Box(Vec2{0, 0}, Vec2{32, 16}),
		Posts:    []Post{{Circle: Circle{C: Vec2{9, 4}, R: 1.4}, Bounce: 1.3}, {Circle: Circle{C: Vec2{9, 12}, R: 1.4}, Bounce: 1.3}},
		Friction: 0.95, Bounce: 1, Radius: 0.5,
	}
	sh := f.Step(Vec2{9, 7}, Vec2{0, -8}, 30)
	for i := 1; i < len(sh.Path); i++ {
		if d := sh.Path[i].Sub(sh.Path[i-1]).Len(); d > SpeedCap+1e-6 {
			t.Fatalf("a substep of %v is faster than the cap", d)
		}
	}
}

// No bounce ever gives a ball more speed than it had: not a wall, not the
// liveliest bumper, head on or at a graze.
func TestNoBounceAddsSpeed(t *testing.T) {
	for _, b := range []float64{0.5, 0.85, 1, 1.15, 1.3} {
		f := &Field{
			Walls:    Box(Vec2{0, 0}, Vec2{40, 20}),
			Posts:    []Post{{Circle: Circle{C: Vec2{20, 10}, R: 1.2}, Bounce: b}},
			Friction: 1, Bounce: b, Radius: 0.5,
		}
		for _, a := range []float64{0, 0.2, 0.5, 1.2, 2.5, 3.1} {
			v0 := FromPolar(a, 3)
			start := Vec2{20, 10}.Sub(FromPolar(a, 6)) // aimed at the bumper
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
	f := &Field{
		Walls:    Box(Vec2{0, 0}, Vec2{32, 16}),
		Zones:    []Zone{{Kind: Hazard, Min: Vec2{5, 0}, Max: Vec2{30, 16}, Vec: Vec2{1, 1}}},
		Friction: 0.5,
	}
	if r := f.Step(Vec2{2, 8}, Vec2{4, 0}, 30).Rest(); r.X != 1 || r.Y != 1 {
		t.Fatalf("resting in the water, the ball should be back at the hazard's target, not %v", r)
	}
}

// A ball in a stadium lane stays inside it: the rounded ends are walls too.
func TestStadiumHoldsTheBall(t *testing.T) {
	f := &Field{Walls: Outline(Stadium(Vec2{0, 0}, Vec2{30, 8}, 6)...), Friction: 0.95, Bounce: 0.9, Radius: 0.5}
	for _, a := range []float64{0, 0.5, 2, 3, 4} {
		for _, p := range f.Step(Vec2{15, 4}, FromPolar(a, 6), 40).Path {
			if p.X < 0 || p.X > 30 || p.Y < 0 || p.Y > 8 {
				t.Fatalf("left the stadium at %v (angle %v)", p, a)
			}
		}
	}
}

// a lane with a hill, then a pond right behind its top
func hillAndPond() *Field {
	return &Field{
		Walls: Box(Vec2{0, 0}, Vec2{40, 8}),
		Zones: []Zone{
			{Kind: Slope, Min: Vec2{5, 0}, Max: Vec2{15, 8}, Vec: Vec2{-0.2, 0}},
			{Kind: Hazard, Min: Vec2{15.5, 0}, Max: Vec2{19, 8}, Vec: Vec2{1, 4}},
		},
		Friction: 0.86, Radius: 0.5, Bounce: 0.85,
	}
}

func TestFastBallFliesOverThePondBehindAHill(t *testing.T) {
	sh := hillAndPond().Step(Vec2{2, 4}, Vec2{6, 0}, 30)
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
	sh := hillAndPond().Step(Vec2{2, 4}, Vec2{4.2, 0}, 30)
	// it may hop off the top, but not far enough to clear the water
	if sh.Rest() != (Vec2{1, 4}) {
		t.Fatalf("it should drown and go back, rested at %v; path %v", sh.Rest(), sh.Path)
	}
}

func TestLoopWantsTheRightSpeedAndTheMouth(t *testing.T) {
	f := &Field{
		// the loop's base across the lane, its mouth in front of it
		Walls:    Walls(Box(Vec2{0, 0}, Vec2{40, 6}), Box(Vec2{12, 0}, Vec2{16, 6})),
		Zones:    []Zone{{Kind: Loop, Min: Vec2{10, 1}, Max: Vec2{11.5, 3}, Vec: Vec2{17, 4.5}, Scale: 2}},
		Friction: 0.9,
		Radius:   0.5,
	}
	round := f.Step(Vec2{6, 2}, Vec2{2.6, 0}, 20)
	if round.Rest().X <= 16 {
		t.Fatalf("the right speed goes round and on, stopped at %v", round.Rest())
	}
	slow := f.Step(Vec2{8, 2}, Vec2{1.2, 0}, 20)
	if slow.Rest().X >= 10 {
		t.Fatalf("a slow ball falls back out of the mouth, stopped at %v", slow.Rest())
	}
	fast := f.Step(Vec2{8, 2}, Vec2{3.6, 0}, 20)
	if fast.Rest().X >= 10 || fast.Rest().X < 7 {
		t.Fatalf("a ball too fast flies off and is put down in front, at %v", fast.Rest())
	}
	slant := f.Step(Vec2{8, 1.2}, FromPolar(0.6, 2.6), 20) // about 34° off straight
	if slant.Rest().X >= 10 || slant.Rest().X < 7 {
		t.Fatalf("a ball coming in slanted falls off the side and is put down in front, at %v", slant.Rest())
	}
	wide := f.Step(Vec2{6, 4.5}, Vec2{2.6, 0}, 20)
	if wide.Rest().X >= 12 {
		t.Fatalf("a ball that misses the mouth meets the loop's base, got to %v", wide.Rest())
	}
}

func TestASlowBallRollsBackDownAHill(t *testing.T) {
	f := &Field{
		Walls:    Box(Vec2{0, 0}, Vec2{40, 6}),
		Zones:    []Zone{{Kind: Slope, Min: Vec2{10, 0}, Max: Vec2{20, 6}, Vec: Vec2{-0.25, 0}}},
		Friction: 0.86,
		Radius:   0.5,
	}
	sh := f.Step(Vec2{6, 3}, Vec2{2, 0}, 40)
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
	gate := func(phase int) *Field {
		return &Field{
			Walls:    Walls(Box(Vec2{0, 0}, Vec2{40, 6}), Timed(Bar(Vec2{10, 0}, Vec2{10, 6}, 0.4, '|', "sail"), 10, 5, phase)),
			Friction: 0.9,
			Radius:   0.5,
		}
	}
	// the ball reaches x=10 in its third substep: shut then, it bounces; open, it passes
	if sh := gate(0).Step(Vec2{4, 3}, Vec2{2.5, 0}, 20); sh.Rest().X > 10 {
		t.Fatalf("the wall is there when it reaches it: should bounce, got %v", sh.Rest())
	}
	if sh := gate(5).Step(Vec2{4, 3}, Vec2{2.5, 0}, 20); sh.Rest().X < 10 {
		t.Fatalf("the wall is away when it reaches it: should pass, got %v", sh.Rest())
	}
}

func TestOffTheLaneIsTheSea(t *testing.T) {
	lane := Lane(4, 3, Vec2{4, 5}, Vec2{16, 7}, Vec2{28, 5})
	tee := Vec2{4, 5}
	f := &Field{
		Walls:    Box(Vec2{0, 0}, Vec2{32, 12}), // only the board's edge, as a net
		Zones:    []Zone{{Kind: Hazard, Min: Vec2{0, 0}, Max: Vec2{32, 12}, Vec: tee, Poly: lane, Outside: true}},
		Friction: 0.88,
		Radius:   0.5,
	}
	if f.Zones[0].Contains(Vec2{16, 7}) || !f.Zones[0].Contains(Vec2{16, 1}) {
		t.Fatal("the lane is dry and beside it is the sea")
	}
	off := f.Step(tee, FromPolar(1.2, 3), 20) // straight off the side
	if off.Rest() != tee {
		t.Fatalf("off the edge is back to the tee, got %v", off.Rest())
	}
	along := f.Step(tee, FromPolar(0.16, 1.2), 20) // gently along the lane
	if along.Rest() == tee {
		t.Fatal("a soft shot down the lane stays on it")
	}
}

func TestWindDoesNotHideTheHillUnderIt(t *testing.T) {
	f := &Field{
		Walls: Box(Vec2{0, 0}, Vec2{40, 6}),
		Zones: []Zone{
			{Kind: Slope, Min: Vec2{0, 0}, Max: Vec2{40, 6}, Vec: Vec2{0.02, 0}, Skin: "wind"},
			{Kind: Slope, Min: Vec2{10, 0}, Max: Vec2{20, 6}, Vec: Vec2{-0.25, 0}},
		},
		Friction: 0.86,
		Radius:   0.5,
	}
	if sh := f.Step(Vec2{6, 3}, Vec2{2, 0}, 40); sh.Rest().X >= 10 {
		t.Fatalf("too slow for the hill even with the wind behind it: it rolls back, stopped at %v", sh.Rest())
	}
}

func TestTickMovesTheTimedWalls(t *testing.T) {
	// a gate across the lane that stands for 4 substeps in 8
	f := &Field{
		Walls:    Walls(Box(Vec2{0, 0}, Vec2{30, 6}), Timed(Bar(Vec2{10, 0}, Vec2{10, 6}, 0.5, '=', "gate"), 8, 4, 0)),
		Friction: 0.95,
		Radius:   0.5,
	}
	past := 0
	for tick := 0; tick < 8; tick++ {
		if WithTick(f, tick).Step(Vec2{2, 3}, Vec2{3, 0}, 20).Rest().X > 10 {
			past++
		}
	}
	if past == 0 || past == 8 {
		t.Fatalf("the gate's timing should matter: %d of 8 ticks got past", past)
	}
	if WithTick(f, 8).Step(Vec2{2, 3}, Vec2{3, 0}, 20).Rest() != WithTick(f, 0).Step(Vec2{2, 3}, Vec2{3, 0}, 20).Rest() {
		t.Fatal("a whole turn later is the same")
	}
}

func TestTheReleaseTickShiftsTimedWalls(t *testing.T) {
	f := &Field{
		Walls:    Walls(Box(Vec2{0, 0}, Vec2{40, 6}), Timed(Bar(Vec2{10, 0}, Vec2{10, 6}, 0.4, '|', "tram"), 10, 5, 0)),
		Friction: 0.9,
		Radius:   0.5,
	}
	if sh := f.Step(Vec2{4, 3}, Vec2{2.5, 0}, 20); sh.Rest().X > 10 {
		t.Fatalf("let go at tick 0 the tram is there: should bounce, got %v", sh.Rest())
	}
	f.Tick = 5
	if sh := f.Step(Vec2{4, 3}, Vec2{2.5, 0}, 20); sh.Rest().X < 10 {
		t.Fatalf("let go at tick 5 the tram has gone by: should pass, got %v", sh.Rest())
	}
}

func TestATimedGustOnlyBlowsInItsWindow(t *testing.T) {
	gust := func(on int) *Field {
		return &Field{
			Walls:    Box(Vec2{0, 0}, Vec2{40, 40}),
			Zones:    []Zone{{Kind: Slope, Min: Vec2{0, 0}, Max: Vec2{40, 40}, Vec: Vec2{0, 0.3}, Skin: "wind", Every: 100, On: on}},
			Friction: 0.9,
			Radius:   0.5,
		}
	}
	calm, blown := gust(0).Step(Vec2{5, 5}, Vec2{2, 0}, 20), gust(100).Step(Vec2{5, 5}, Vec2{2, 0}, 20)
	if math.Abs(calm.Rest().Y-5) > 1e-9 || blown.Rest().Y <= 6 {
		t.Fatalf("a gust off blows nothing (%v), a gust on pushes (%v)", calm.Rest(), blown.Rest())
	}
}

func TestABallLeftOnASlopeRollsDown(t *testing.T) {
	f := &Field{
		Walls:    Box(Vec2{0, 0}, Vec2{60, 6}),
		Zones:    []Zone{{Kind: Slope, Min: Vec2{10, 0}, Max: Vec2{40, 6}, Vec: Vec2{0.2, 0}}},
		Friction: 0.86,
		Radius:   0.5,
	}
	// a tiny tap on the slope, with far too few substeps to get down it
	sh := f.Step(Vec2{12, 3}, Vec2{0.3, 0}, 3)
	if sh.Rest().X < 40 {
		t.Fatalf("a ball on a slope rolls on past its substeps until it is off it, stopped at %v", sh.Rest())
	}
}

// On flat grass, with nothing but friction, a ball only ever slows down.
func TestFlatGrassNeverSpeedsUp(t *testing.T) {
	f := &Field{Friction: 0.86, Radius: 0.5}
	for _, v := range []float64{0.3, 1, 2.5, 5} {
		sh := f.Step(Vec2{50, 50}, FromPolar(0.7, v), 60)
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
	wedge := []Wall{
		{Seg: Segment{Vec2{0, 0}, Vec2{10, 0.6}}},
		{Seg: Segment{Vec2{0, 1.2}, Vec2{10, 0.6}}},
		{Seg: Segment{Vec2{0, 0}, Vec2{0, 1.2}}},
	}
	fields := []*Field{
		{Walls: Box(Vec2{0, 0}, Vec2{10, 10}), Friction: 0.86, Bounce: 0.9, Radius: 0.5},
		{Walls: wedge, Friction: 0.86, Bounce: 0.9, Radius: 0.5},
	}
	starts := []Vec2{{0.5, 0.5}, {7, 0.6}}
	for fi, f := range fields {
		for _, v := range []float64{0, 0.05, 0.5, 1.5} {
			v0 := FromPolar(0.1+math.Pi*float64(1-fi), v) // into the corner / down the notch
			if fi == 1 {
				v0 = Vec2{v, 0}
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
	wind := Zone{Kind: Slope, Min: Vec2{0, 0}, Max: Vec2{100, 100}, Vec: Vec2{0.15, 0}, Skin: "wind"}
	ice := Zone{Kind: Surface, Min: Vec2{0, 0}, Max: Vec2{100, 100}, Scale: 1.12, Skin: "ice"}
	f := &Field{Zones: []Zone{ice, wind}, Friction: 0.86, Radius: 0.5}
	if sh := f.Step(Vec2{50, 50}, Vec2{}, 40); sh.Rest() != (Vec2{50, 50}) {
		t.Fatalf("the wind moved a ball at rest to %v", sh.Rest())
	}
	for _, a := range []float64{0, 0.5, 1.6, 3} {
		v := 1.0
		sh := f.Step(Vec2{50, 50}, FromPolar(a, v), 60)
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
	f := &Field{
		Walls: Box(Vec2{0, 0}, Vec2{30, 12}),
		Posts: []Post{{Circle: Circle{C: Vec2{15, 6}, R: 1}, Bounce: 0.6}},
		Zones: []Zone{
			{Kind: Slope, Min: Vec2{0, 0}, Max: Vec2{30, 12}, Vec: Vec2{0.1, 0.05}, Skin: "wind", Every: 6, On: 3},
			{Kind: Slope, Min: Vec2{20, 0}, Max: Vec2{26, 12}, Vec: Vec2{-0.2, 0}},
			{Kind: Surface, Min: Vec2{0, 0}, Max: Vec2{10, 12}, Scale: 1.12, Skin: "ice"},
		},
		Friction: 0.86, Bounce: 0.85, Radius: 0.5, Tick: 7,
	}
	a, b := f.Step(Vec2{3, 3}, FromPolar(0.4, 3), 40), f.Step(Vec2{3, 3}, FromPolar(0.4, 3), 40)
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
