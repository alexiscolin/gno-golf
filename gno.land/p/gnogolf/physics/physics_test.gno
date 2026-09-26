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
	sh := f.Step(Vec2{1, 5}, Vec2{1.5, 0}, 6)
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

// No passive piece ever gives a ball more speed than it had, head on or at a
// graze: only a bumper (a Bounce above 1) does.
func TestNoBounceAddsSpeed(t *testing.T) {
	for _, b := range []float64{0.5, 0.85, 1} {
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
		Walls: Box(Vec2{0, 0}, Vec2{60, 8}),
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
	sh := hillAndPond().Step(Vec2{2, 4}, Vec2{3.6, 0}, 30)
	// too slow at the top to take off: it rolls over it into the water
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
	// a loop is a closed tube, with no top to fly off: a fast ball goes round too
	if fast := f.Step(Vec2{8, 2}, Vec2{3.6, 0}, 20); fast.Rest().X <= 16 {
		t.Fatalf("a fast ball goes round the tube, stopped at %v", fast.Rest())
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
			{Kind: Slope, Min: Vec2{0, 0}, Max: Vec2{40, 6}, Vec: Vec2{0.02, 0}, Skin: "wind", Air: true, Capped: true},
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
			Zones:    []Zone{{Kind: Slope, Min: Vec2{0, 0}, Max: Vec2{40, 40}, Vec: Vec2{0, 0.3}, Skin: "wind", Every: 100, On: on, Air: true, Capped: true}},
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
		Zones:    []Zone{{Kind: Slope, Min: Vec2{10, 0}, Max: Vec2{40, 6}, Vec: Vec2{0.3, 0}}},
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
	wind := Zone{Kind: Slope, Min: Vec2{0, 0}, Max: Vec2{100, 100}, Vec: Vec2{0.15, 0}, Skin: "wind", Air: true, Capped: true}
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
			{Kind: Slope, Min: Vec2{0, 0}, Max: Vec2{30, 12}, Vec: Vec2{0.1, 0.05}, Skin: "wind", Every: 6, On: 3, Air: true, Capped: true},
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

// A ball pushed into a wall by a steep slope stops, instead of jittering
// against it for every substep it may roll on.
func TestAPinnedBallStops(t *testing.T) {
	f := &Field{
		Walls:    Box(Vec2{0, 0}, Vec2{40, 6}),
		Zones:    []Zone{{Kind: Slope, Min: Vec2{0, 0}, Max: Vec2{40, 6}, Vec: Vec2{0.2, 0}}},
		Friction: 0.86,
		Radius:   0.5,
	}
	sh := f.Step(Vec2{36, 3}, Vec2{0.5, 0}, 20)
	if len(sh.Path) > 20+MaxRollOn/2 {
		t.Fatalf("a pinned ball should stop early, got %d points", len(sh.Path))
	}
	if sh.Rest().X < 38 {
		t.Fatalf("it rests against the downhill wall, at %v", sh.Rest())
	}
}

// A timed hill (a seesaw) pulls while it is there: a ball that stops on it
// rolls back down as on any hill, within the stroke.
func TestATimedHillPullsWhileItIsThere(t *testing.T) {
	see := Zone{Kind: Slope, Min: V(10, 0), Max: V(40, 10), Vec: V(0.3, 0), Every: 1000, On: 1000}
	f := &Field{Walls: Box(V(0, 0), V(60, 10)), Zones: []Zone{see}, Friction: 0.87, Radius: 0.5}
	s := f.Step(V(30, 5), V(-1.5, 0), 30)
	if s.Rest().X < 35 {
		t.Fatalf("the ball stopped against the tilt at %v", s.Rest())
	}
}

// Leaving the sand mid-substep, the ball is on grass for the rest of it:
// calm plays like fog (a whole-board Surface of scale 1).
func TestCalmPlaysLikeFog(t *testing.T) {
	sand := Zone{Kind: Surface, Min: V(5, 0), Max: V(8, 10), Scale: 0.6, Skin: "sand"}
	fog := Zone{Kind: Surface, Min: V(0, 0), Max: V(60, 10), Scale: 1, Skin: "fog"}
	calm := &Field{Walls: Box(V(0, 0), V(60, 10)), Zones: []Zone{sand}, Friction: 0.86, Radius: 0.5}
	foggy := &Field{Walls: Box(V(0, 0), V(60, 10)), Zones: []Zone{fog, sand}, Friction: 0.86, Radius: 0.5}
	for _, v := range []float64{2, 4, 6} {
		if a, b := calm.Step(V(2, 5), V(v, 0), 30), foggy.Step(V(2, 5), V(v, 0), 30); a.Rest() != b.Rest() {
			t.Fatalf("speed %v: calm rests at %v, fog at %v", v, a.Rest(), b.Rest())
		}
	}
}

// A free wall end is a round cap: a ball close to the wall's line past its
// end, but not yet touching the end, still meets it on the way.
func TestAFreeWallEndCannotBeCut(t *testing.T) {
	f := &Field{Walls: []Wall{{Seg: Segment{V(10, 0), V(10, 5)}}}, Friction: 1, Bounce: 0.8, Radius: 0.5}
	s := f.Step(V(9.6, 5.35), V(0.5, -1), 1)
	if p := s.Path[1]; s.Bounces == 0 || (p.X > 10 && p.Y < 5) {
		t.Fatalf("the ball cut through the wall's end: %d bounces, at %v", s.Bounces, p)
	}
}

// A ball at rest under a timed hazard meets it, whenever in its period the
// stroke happened to end.
func TestABallAtRestUnderATimedHazardMeetsIt(t *testing.T) {
	ice := Zone{Kind: Hazard, Min: V(20, 0), Max: V(30, 10), Vec: V(3, 5), Every: 12, On: 4, Phase: 5}
	f := &Field{Walls: Box(V(0, 0), V(60, 10)), Zones: []Zone{ice}, Friction: 0.86, Radius: 0.5}
	for tick := 0; tick < 12; tick++ {
		if s := WithTick(f, tick).Step(V(24, 5), Vec2{}, 1); s.Rest() != V(3, 5) {
			t.Fatalf("tick %d: a ball at rest under the ice stayed at %v", tick, s.Rest())
		}
	}
}

// A timed bar that comes back on the ball pushes it out: a wall never stands
// on the ball.
func TestATimedBarArrivingOnTheBallPushesItOut(t *testing.T) {
	// away on substep 0 only: the ball rolls into its track, and it arrives
	tram := Timed(Bar(V(22, 1), V(22, 9), 3, '#', "tram"), 100, 99, 99)
	f := &Field{Walls: Walls(Box(V(0, 0), V(60, 10)), tram), Friction: 0.86, Radius: 0.5}
	s := f.Step(V(20.8, 5), V(1.5, 0), 30)
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
		v := FromPolar(float64(i)*0.37, 0.01+float64(i%97)*0.29)
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
	mk := func() *Field {
		return &Field{Walls: Walls(Box(V(0, 0), V(40, 12)), Bar(V(14, 2), V(20, 9), 0.8, '#', ""), Polyline(V(28, 1), V(31, 6), V(27, 10))),
			Posts: []Post{{Circle: Circle{C: V(24, 6), R: 0.7}}}, Friction: 0.86, Radius: 0.5, Bounce: 0.85}
	}
	plain, prep := mk(), mk()
	Prepare(prep)
	prep.Walls[5].Seg.A = V(15, 3) // moved after Prepare: worked out afresh
	plain.Walls[5].Seg.A = V(15, 3)
	for a := 0.0; a < 6.28; a += 0.3 {
		x, y := plain.Step(V(4, 6), FromPolar(a, 5), 30), prep.Step(V(4, 6), FromPolar(a, 5), 30)
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
func flew(sh Shot) bool {
	for _, a := range sh.Air {
		if a {
			return true
		}
	}
	return false
}

// A ramp (uphill toward +X, its crest at x=20) in the middle of a wide lane.
func ramp() *Field {
	return &Field{
		Walls:    Box(V(0, 0), V(60, 30)),
		Zones:    []Zone{{Kind: Slope, Min: V(16, 10), Max: V(20, 20), Vec: V(-0.3, 0)}},
		Friction: 0.87,
		Radius:   0.5,
	}
}

// Only the crest launches: a ball up the ramp head-on flies off its top, one
// that leaves by a side — crossing it on a slant, or turning off it — rolls.
func TestOnlyTheCrestLaunches(t *testing.T) {
	f := ramp()
	if !flew(f.Step(V(12, 15), V(5, 0), 30)) {
		t.Fatalf("a fast ball up the ramp head-on should fly off its crest")
	}
	// up and across: out through the side (y=20) while still climbing
	if sh := f.Step(V(15, 16), V(2, 3), 30); flew(sh) {
		t.Fatalf("a ball leaving the ramp by its side took off")
	}
	// fast, but mostly across: its speed up the ramp is under JumpSpeed
	if sh := f.Step(V(17, 8), V(1.2, 5), 30); flew(sh) {
		t.Fatalf("a ball crossing the ramp on a slant took off")
	}
}

// A ball that clipped the ramp near its crest has not ridden it: no jump.
func TestAClippedRampDoesNotLaunch(t *testing.T) {
	f := ramp()
	if sh := f.Step(V(18.8, 9.4), V(3, 2), 30); flew(sh) {
		t.Fatalf("a ball that only clipped the ramp's top corner took off")
	}
}

// Head-on, the flight grows with the speed up the ramp.
func TestFlightGrowsWithSpeed(t *testing.T) {
	far := func(v float64) float64 {
		sh := ramp().Step(V(12, 15), V(v, 0), 30)
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

// A ball coming along a wall's line from well past its end meets the end
// cap, however far the move before it started: it never slides on inside
// the wall.
func TestABallAlongAWallMeetsItsEnd(t *testing.T) {
	f := &Field{Walls: []Wall{{Seg: Segment{V(10, 5), V(20, 5)}}}, Friction: 1, Bounce: 0.8, Radius: 0.5}
	s := f.Step(V(9.03, 5.03), V(1.1, 0), 3)
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
	bar := Bar(V(22, 3), V(22, 12), 0.8, '#', "")
	got := UnstickIn(V(22.3, 9.8), bar, nil, 0.5, nil)
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
	tram := Timed(Bar(V(20, 1.5), V(20, 18.5), 2.4, '#', "tram"), 24, 5, 0)
	f := &Field{Walls: Walls(Box(V(0, 0), V(40, 20)), tram), Friction: 0.87, Radius: 0.5}
	s := f.Step(V(20, 0.6), V(0.01, 0), 2)
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
func crossed(ws []Wall, path []Vec2) int {
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
		tip := V(20, 10)
		a := tip.Add(FromPolar(math.Pi/2-half, 8)) // the wedge points up (-Y), solid below
		b := tip.Add(FromPolar(math.Pi/2+half, 8))
		ws := []Wall{{Seg: Segment{a, tip}}, {Seg: Segment{tip, b}}}
		f := &Field{Walls: ws, Friction: 0.87, Bounce: 0.8, Radius: 0.5}
		Prepare(f)
		for off := -0.6; off <= 0.6; off += 0.05 {
			for _, dist := range []float64{1.6, 1.874, 2.3, 3.1} {
				for _, speed := range []float64{1.8, 3, 4.2, 6} {
					s := f.Step(tip.Add(V(off, -dist)), V(0, speed), 3)
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
	ws := []Wall{{Seg: Segment{V(0, 0), V(5, 0)}}}
	f := &Field{Walls: ws, Friction: 0.9, Bounce: 0.8, Radius: 0.5}
	Prepare(f)
	s := f.Step(V(6.8450752494799332, 1.1982058770330597), V(-2.5462835171612519, -1.387962625661413), 1)
	if crossed(ws, s.Path) >= 0 || s.Bounces == 0 {
		t.Fatalf("cut through the wall's end to %v, %d bounces", s.Rest(), s.Bounces)
	}
}

// A piece that comes back on a ball never pushes it across a wall that
// stays: not out of a bar, not off a post.
func TestUnstickInNeverCrossesAStayingWall(t *testing.T) {
	rail := []Wall{{Seg: Segment{V(0, 5), V(10, 5)}}}
	post := []Post{{Circle: Circle{C: V(5, 4.6), R: 0.5}}}
	ball := V(5, 4.9)
	if got := UnstickIn(ball, nil, post, 0.5, nil); !rail[0].Seg.Crosses(ball, got) {
		t.Fatalf("with nothing staying, the post pushes the ball to %v, over the rail", got)
	}
	if got := UnstickIn(ball, nil, post, 0.5, rail); got != ball {
		t.Fatalf("the post pushed the ball across the rail, to %v", got)
	}
	// a bar whose nearest side is across the rail: the ball leaves by another
	bar := Bar(V(2, 4.8), V(8, 4.8), 0.8, 0, "")
	got := UnstickIn(ball, bar, nil, 0.5, rail)
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
	down := V(1, 1)
	f := &Field{
		Walls:    Box(V(0, 0), V(96, 96)),
		Zones:    []Zone{{Kind: Surface, Min: V(0, 0), Max: V(96, 96), Scale: 8}, {Kind: Slope, Min: V(0, 0), Max: V(96, 96), Vec: down}},
		Friction: 0.9, Radius: 0.5,
	}
	s := f.Step(V(3, 3), V(7, 7), 30)
	for i := 1; i < len(s.Path); i++ {
		if d := s.Path[i].Sub(s.Path[i-1]).Len(); d > SpeedCap+down.Len()+1e-9 {
			t.Fatalf("substep %d went %v", i, d)
		}
	}
}
