package physics

import (
	"math"
	"testing"
)

// The laws of the model, one test each: rolling, hills, contacts, flight.

// flat is an open green of the course's usual Friction.
func flat() *Field { return &Field{Friction: 0.87, Radius: 0.5} }

// A ball on the flat stops after v²/2a, in v/a substeps, a the green's
// rolling deceleration Crr·G: the half-kicks make it exact whenever v is a
// whole number of a, and never off by more than a/8.
func TestRollingStopsAtVSquaredOverTwoA(t *testing.T) {
	a := Rolling(0.87, 1) * G
	if math.Abs(a-0.224) > 1e-12 {
		t.Fatalf("the usual green's deceleration is %v, want 0.224", a)
	}
	for _, v := range []float64{0.5, 1, 2.3, 3, 4.6, 6} {
		s := flat().Step(V(0, 0), V(v, 0), 200)
		want := v * v / (2 * a)
		if d := s.Rest().X; math.Abs(d-want) > a/8+1e-9 {
			t.Errorf("speed %v: rolled %v, v²/2a is %v", v, d, want)
		}
		if n := len(s.Path) - 1; math.Abs(float64(n)-v/a) > 1 {
			t.Errorf("speed %v: rolled %d substeps, v/a is %v", v, n, v/a)
		}
	}
	// exact at a whole number of a
	s := flat().Step(V(0, 0), V(20*a, 0), 200)
	if want := 200 * a; math.Abs(s.Rest().X-want) > 1e-9 {
		t.Fatalf("20a rolled %v, want %v", s.Rest().X, want)
	}
}

// Sand holds harder than grass, ice less, and a surface of scale 0 holds the
// ball where it is.
func TestSurfacesAreRollingResistance(t *testing.T) {
	sand, grass, ice := Rolling(0.87, 0.5), Rolling(0.87, 1), Rolling(0.87, 1.18)
	if !(sand > grass && grass > ice && ice > 0) {
		t.Fatalf("Crr sand %v, grass %v, ice %v", sand, grass, ice)
	}
	if !math.IsInf(Rolling(0.87, 0), 1) {
		t.Fatal("a scale of 0 is an infinite Crr")
	}
	f := &Field{Zones: []Zone{{Kind: Surface, Min: V(-10, -10), Max: V(10, 10), Scale: 0}}, Friction: 0.87}
	if s := f.Step(V(0, 0), V(3, 0), 10); s.Rest() != V(0, 0) {
		t.Fatalf("a ball on a scale-0 surface moved to %v", s.Rest())
	}
}

// uphill is a wide field that is all one hill, rising toward +X.
func uphill(g, scale float64) *Field {
	return &Field{
		Zones: []Zone{
			{Kind: Surface, Min: V(-200, -200), Max: V(200, 200), Scale: scale},
			{Kind: Slope, Min: V(-200, -200), Max: V(200, 200), Vec: V(-g, 0)},
		},
		Friction: 0.87, Radius: 0.5,
	}
}

// A ball rolling up a hill slows down on every substep it climbs, head on or
// at a slant, on grass or ice: gravity and rolling resistance both take from
// it, and nothing gives.
func TestUphillAlwaysSlows(t *testing.T) {
	for _, scale := range []float64{1, 1.18} {
		for _, g := range []float64{0.12, 0.2, 0.3, 0.35} {
			f := uphill(g, scale)
			for _, deg := range []float64{0, 30, 60, 80, 85, 89} {
				for _, v := range []float64{0.4, 1.5, 3, 4.6} {
					s := f.Step(V(0, 0), FromPolar(deg*math.Pi/180, v), 60)
					for i := 2; i < len(s.Path); i++ {
						d0, d1 := s.Path[i-1].Sub(s.Path[i-2]), s.Path[i].Sub(s.Path[i-1])
						if d0.X <= 0 || d1.X <= 0 {
							break // over the top of its climb
						}
						if d1.Len() > d0.Len()+1e-12 {
							t.Fatalf("scale %v, hill %v, %v° off uphill at %v: substep %d went %v after %v", scale, g, deg, v, i, d1.Len(), d0.Len())
						}
					}
				}
			}
		}
	}
}

// A ball at rest on a hill rolls down it when the hill pulls harder than its
// rolling resistance holds (tan θ above Crr), and does not move at all when
// it does not: no creeping.
func TestAHillSteeperThanItsFrictionRollsTheBallBack(t *testing.T) {
	a := Rolling(0.87, 1) * G // 0.224
	for _, c := range []struct {
		g     float64
		rolls bool
	}{{0.2, false}, {0.21, false}, {0.23, true}, {0.3, true}} {
		s := uphill(c.g, 1).Step(V(0, 0), Vec2{}, 20)
		moved := s.Rest().X < 0
		if moved != c.rolls {
			t.Errorf("hill %v (friction %v): rest at %v", c.g, a, s.Rest())
		}
		if !c.rolls && s.Rest() != V(0, 0) {
			t.Errorf("hill %v: a ball it cannot move crept to %v", c.g, s.Rest())
		}
		// one rolling up it stops, then comes back down, or stays
		up := uphill(c.g, 1).Step(V(0, 0), V(2, 0), 40)
		if back := up.Rest().X < s.Path[0].X+1; back != c.rolls {
			top := 0.0
			for _, p := range up.Path {
				top = math.Max(top, p.X)
			}
			if c.rolls {
				t.Errorf("hill %v: a ball that climbed to %v stopped up there, at %v", c.g, top, up.Rest())
			} else if up.Rest().X < top-1e-9 {
				t.Errorf("hill %v: a ball that climbed to %v slid back to %v", c.g, top, up.Rest())
			}
		}
	}
}

// Two hills over the same ground are one hill: the first listed. The ball
// is pushed by its Vec only, not by the two added up.
func TestOverlappingHillsAreTheFirst(t *testing.T) {
	one := uphill(0.3, 1)
	two := uphill(0.3, 1)
	two.Zones = append(two.Zones, Zone{Kind: Slope, Min: V(-200, -200), Max: V(200, 200), Vec: V(-0.3, 0)})
	a, b := one.Step(V(0, 0), V(3, 0), 40), two.Step(V(0, 0), V(3, 0), 40)
	if len(a.Path) != len(b.Path) || a.Rest() != b.Rest() {
		t.Fatalf("a second hill under the first changed the shot: %v, %v", a.Rest(), b.Rest())
	}
}

// The contact impulse: the speed into the surface comes back times the
// restitution (an energy ratio of e²), the speed along it loses µ times the
// normal impulse.
func TestRestitutionAndCoulomb(t *testing.T) {
	n := V(-1, 0) // a wall at the ball's right, facing it
	for _, e := range []float64{0, 0.5, 0.85} {
		for _, deg := range []float64{0, 20, 45, 70} {
			in := FromPolar(deg*math.Pi/180, 3)
			out, impact := contact(in, n, e)
			vn, vt := in.X, in.Y
			if !impact {
				t.Fatalf("e %v, %v°: a 3-per-substep hit is an impact", e, deg)
			}
			if got := -out.X / vn; math.Abs(got-e) > 1e-12 {
				t.Errorf("e %v, %v°: the normal speed came back times %v", e, deg, got)
			}
			if ratio := (out.X * out.X) / (vn * vn); math.Abs(ratio-e*e) > 1e-12 {
				t.Errorf("e %v, %v°: normal energy ratio %v, want %v", e, deg, ratio, e*e)
			}
			// Coulomb: the tangential impulse is µ(1+e)|vn|, clamped at 2/7 vt
			want := math.Min(WallFriction*(1+e)*vn, TangentMass*math.Abs(vt))
			if got := math.Abs(vt) - math.Abs(out.Y); math.Abs(got-want) > 1e-12 {
				t.Errorf("e %v, %v°: the speed along lost %v, want %v", e, deg, got, want)
			}
			if out.Y*vt < 0 {
				t.Errorf("e %v, %v°: friction reversed the ball along the wall", e, deg)
			}
		}
	}
	// passive pieces are held to MaxBounce; a resting contact does not bounce
	if out, _ := contact(V(2, 0), n, 1); math.Abs(out.X+2*MaxBounce) > 1e-12 {
		t.Fatalf("a Bounce of 1 played %v, want MaxBounce", -out.X/2)
	}
	if out, impact := contact(V(RestSpeed/2, 0.5), n, 0.85); impact || out.X != 0 {
		t.Fatalf("a resting contact bounced: %v, impact %v", out, impact)
	}
	if out, _ := contact(V(-1, 0), n, 0.85); out != V(-1, 0) {
		t.Fatalf("a ball moving away was touched: %v", out)
	}
}

// A bumper (Bounce above 1) kicks the ball back faster than it came, at most
// MaxKick times, and never past SpeedCap; two facing bumpers cannot pump a
// ball without end.
func TestABumperKicksWithinBounds(t *testing.T) {
	n := V(-1, 0)
	if out, _ := contact(V(2, 0), n, 1.25); math.Abs(out.X+2.5) > 1e-12 {
		t.Fatalf("a 1.25 bumper sent back %v, want 2.5", -out.X)
	}
	if out, _ := contact(V(2, 0), n, 3); math.Abs(out.X+2*MaxKick) > 1e-12 {
		t.Fatalf("a bumper past MaxKick sent back %v, want %v", -out.X, 2*MaxKick)
	}
	f := &Field{
		Walls:    Box(V(0, 0), V(40, 20)),
		Posts:    []Post{{Circle: Circle{C: V(20, 10), R: 1.2}, Bounce: 1.3}},
		Friction: 0.87, Bounce: 0.85, Radius: 0.5,
	}
	s := f.Step(V(14, 10), V(3, 0), 40)
	kicked := false
	for i := 1; i < len(s.Path); i++ {
		d := s.Path[i].Sub(s.Path[i-1]).Len()
		if d > 3+1e-9 {
			kicked = true
		}
		if d > SpeedCap+1e-9 {
			t.Fatalf("substep %d went %v, past SpeedCap", i, d)
		}
	}
	if !kicked {
		t.Fatal("the bumper did not kick the ball back faster")
	}
}

// A ball pressed into a rail by a hill slides along it: a resting contact,
// with no bounce counted and no jitter off it.
func TestAHillPressesTheBallAlongARail(t *testing.T) {
	f := &Field{
		Walls:    []Wall{{Seg: Segment{V(-100, 5), V(100, 5)}}},
		Zones:    []Zone{{Kind: Slope, Min: V(-100, -10), Max: V(100, 10), Vec: V(0.2, 0.3)}},
		Friction: 0.87, Bounce: 0.85, Radius: 0.5,
	}
	s := f.Step(V(0, 4.5-1e-6), V(1, 0), 30)
	if s.Bounces != 0 {
		t.Fatalf("a ball pressed on the rail counted %d bounces", s.Bounces)
	}
	for i, p := range s.Path {
		if p.Y > 4.5+1e-6 || (i > 0 && p.Y < 4.5-0.01) {
			t.Fatalf("the ball left the rail, at %v", p)
		}
	}
	if s.Rest().X <= 1 {
		t.Fatalf("it did not slide on down the rail, stopped at %v", s.Rest())
	}
}

// A move that hits spends the rest of itself from the contact: a ball fired
// at a wall ends the substep as far back from it as it would have gone past.
func TestAMoveGoesOnFromItsContact(t *testing.T) {
	f := &Field{Walls: []Wall{{Seg: Segment{V(10, -50), V(10, 50)}}}, Friction: 0.87, Bounce: 1, Radius: 0.5}
	s := f.Step(V(8.5, 0), V(1.4, 0), 1)
	// 0.112 of rolling resistance first, then 1 to the wall (at 9.5), then
	// the 0.285 left, back at MaxBounce of the speed
	v := 1.4 - Rolling(0.87, 1)*G/2
	want := 9.5 - (v-1)*MaxBounce
	if got := s.Path[1].X; math.Abs(got-want) > 1e-5 {
		t.Fatalf("the ball ended the substep at %v, want %v", got, want)
	}
}

// steep is a hill that rises toward +X up to its crest at x=20, of the given
// steepness, in a lane with no walls near it.
func steep(g float64, zones ...Zone) *Field {
	return &Field{
		Zones:    append([]Zone{{Kind: Slope, Min: V(10, -20), Max: V(20, 20), Vec: V(-g, 0)}}, zones...),
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
		s := steep(g).Step(V(9, 0), V(v0, 0), 60)
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
		sin := g / G
		tan := sin / math.Sqrt(1-sin*sin)
		land := 20 + 2*v*v*tan/G
		pond := func(x0, x1 float64) bool {
			w := steep(g, Zone{Kind: Hazard, Min: V(x0, -20), Max: V(x1, 20), Vec: V(0, 30)})
			return w.Step(V(9, 0), V(v0, 0), 60).Rest() == V(0, 30)
		}
		if !pond(land-v/2-MaxMove, land+v/2+MaxMove) {
			t.Errorf("hill %v: water across the landing (%v) did not catch it", g, land)
		}
		if pond(20.5, land-v/2-MaxMove) {
			t.Errorf("hill %v: water short of the landing (%v) caught it in the air", g, land)
		}
	}
}

// Too slow for the crest's curve (v² at most G·CrestRadius up the hill), a
// ball rolls over the top instead of flying.
func TestASlowBallRollsOverTheCrest(t *testing.T) {
	s := steep(0.3).Step(V(9, 0), V(3.4, 0), 60)
	if s.Rest().X <= 20 {
		t.Fatalf("it should make the top, stopped at %v", s.Rest())
	}
	if flew(s) {
		t.Fatalf("a ball too slow for the crest flew: %v", s.Air)
	}
}

// A ball still in the air when its substeps run out keeps flying, and lands.
func TestAFlightOutlivesTheStroke(t *testing.T) {
	s := steep(0.5).Step(V(9, 0), V(4.6, 0), 4)
	if !flew(s) || s.Air[len(s.Air)-1] {
		t.Fatalf("air flags %v", s.Air)
	}
	if s.Rest().X < 24 {
		t.Fatalf("the flight was cut short, at %v", s.Rest())
	}
}

// A timed wall of a single segment that comes up across a moving ball is
// never crossed: the ball, already within its radius, is stopped by it.
func TestATimedSegmentIsNeverCrossed(t *testing.T) {
	for phase := 0; phase < 6; phase++ {
		w := Wall{Seg: Segment{V(10, -5), V(10, 5)}, Every: 6, On: 3, Phase: phase}
		f := &Field{Walls: []Wall{w}, Friction: 0.87, Bounce: 0.85, Radius: 0.5}
		for _, x := range []float64{9.6, 9.8, 10, 10.2} {
			for _, v := range []float64{-2, -0.5, 0.5, 2} {
				s := f.Step(V(x, 0), V(v, 0), 10)
				for i := 1; i < len(s.Path); i++ {
					a, b := s.Path[i-1], s.Path[i]
					if (a.X-10)*(b.X-10) < 0 && there(i-1, 6, 3, phase) && there(i, 6, 3, phase) {
						t.Fatalf("phase %d, from %v at %v: crossed the standing wall, %v to %v", phase, x, v, a, b)
					}
				}
			}
		}
	}
}

// A stroke costs at most MaxWork (and one step past it): a hostile field of
// bumper walls across the whole board, the steepest hill and polygons under
// every move, which rolled on for ever, ends there, and says so in its Work.
// A course stroke is far from it.
func TestAStrokeCostsAtMostMaxWork(t *testing.T) {
	var ws []Wall
	for i := 0; i < 160; i++ {
		x := float64(i) * 96 / 160
		ws = append(ws, Wall{Seg: Segment{A: V(x, 0), B: V(96-x, 96)}, Bounce: 1.5})
	}
	zs := []Zone{{Kind: Slope, Min: V(0, 0), Max: V(96, 96), Vec: V(0.67, 0.67)}}
	for i := 0; i < 31; i++ {
		z := Zone{Kind: Surface, Min: V(0, 0), Max: V(96, 96), Scale: 8}
		if i < 8 {
			for k := 0; k < 64; k++ {
				z.Poly = append(z.Poly, V(48, 48).Add(FromPolar(float64(k)*2*math.Pi/64, 40+float64(i))))
			}
		}
		zs = append(zs, z)
	}
	f := &Field{Walls: ws, Zones: zs, Friction: 0.99, Bounce: 1.5, Radius: 0.5}
	Prepare(f)
	s := f.Step(V(20, 20), V(-3, 3), 60)
	if s.Work <= MaxWork || s.Work > MaxWork+MaxWorkStep {
		t.Fatalf("the hostile stroke cost %d, want just past %d", s.Work, MaxWork)
	}
	if n := len(s.Path); n > 60+MaxRollOn+2 {
		t.Fatalf("%d path points", n)
	}
	if c := flat().Step(V(0, 0), V(4.44, 0), 30); c.Work > MaxWork/50 {
		t.Fatalf("a full stroke on the flat cost %d", c.Work)
	}
}
