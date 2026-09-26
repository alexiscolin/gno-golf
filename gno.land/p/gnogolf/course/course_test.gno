package course

import (
	"math"
	"testing"

	"gno.land/p/gnogolf/physics"
)

func roll(speed float64) physics.Shot {
	// a straight roll past a pin at (10,5), constant speed, 6 substeps
	p := []physics.Vec2{}
	for i := 0; i < 8; i++ {
		p = append(p, physics.Vec2{X: 4 + float64(i)*speed, Y: 5.5})
	}
	return physics.Shot{Path: p}
}

func TestSlowBallDropsWhileCrossing(t *testing.T) {
	shot, holed := Sink(roll(1), physics.Vec2{X: 10, Y: 5.5}, 1.4, 0.5)
	if !holed {
		t.Fatal("a slow ball rolling over the cup must drop")
	}
	if last := shot.Rest(); last.X != 10 || last.Y != 5.5 {
		t.Fatalf("the path must end on the pin, got %v", last)
	}
	if len(shot.Path) > 8 { // it drops over the middle now, not at the rim
		t.Fatalf("the path must be cut at the cup, got %d points", len(shot.Path))
	}
}

func TestFastBallSkimsOver(t *testing.T) {
	if _, holed := Sink(roll(3), physics.Vec2{X: 10, Y: 5}, 1.4, 0.5); holed {
		t.Fatal("a ball faster than Capture allows must skim over")
	}
}

// Holmes's criterion: over the middle of a 1.2 cup a 0.5 ball drops up to
// (2·1.2 − 0.5)·sqrt(G/1) = 1.9 a substep; off the middle the chord is
// shorter, and a ball that crosses near the rim must be slower; a graze past
// about 1.17 never drops.
func TestTheCupCapturesByHolmes(t *testing.T) {
	if c := Capture(1.2, 0.5, 0); math.Abs(c-1.9) > 1e-12 {
		t.Fatalf("over the middle: %v, want 1.9", c)
	}
	want := func(b float64) float64 { return (2*math.Sqrt(1.44-b*b) - 0.5) * math.Sqrt(physics.G/1) }
	for _, b := range []float64{0.3, 0.6, 0.9, 1.1} {
		if c := Capture(1.2, 0.5, b); math.Abs(c-want(b)) > 1e-12 || !(c < Capture(1.2, 0.5, b-0.3)) {
			t.Fatalf("off by %v: %v, want %v, below the one nearer the middle", b, c, want(b))
		}
	}
	if Capture(1.2, 0.5, 1.18) != 0 || Capture(1.2, 0.5, 1.3) != 0 {
		t.Fatal("a graze does not drop")
	}
	pin := physics.Vec2{X: 10, Y: 5.5}
	for _, c := range []struct {
		speed, off float64
		drops      bool
	}{{1.85, 0, true}, {1.95, 0, false}, {1.5, 0.6, true}, {1.65, 0.6, false}, {0.4, 1.1, true}, {0.5, 1.1, false}} {
		shot := roll(c.speed)
		for i := range shot.Path {
			shot.Path[i].Y += c.off
			shot.Path[i].X += 10 - 4 - 2*c.speed - c.speed/2 // the pin halfway along a step
		}
		if _, holed := Sink(shot, pin, 1.2, 0.5); holed != c.drops {
			t.Errorf("at %v, %v off the middle: holed %v", c.speed, c.off, holed)
		}
	}
}

func TestBallInTheAirFliesOverTheCup(t *testing.T) {
	shot := roll(1)
	shot.Air = []bool{false, false, false, false, true, true, true, false}
	if _, holed := Sink(shot, physics.Vec2{X: 9, Y: 5.5}, 1.4, 0.5); holed {
		t.Fatal("a ball flying over the cup must not drop into it")
	}
	shot.Air = make([]bool, len(shot.Path))
	if sunk, holed := Sink(shot, physics.Vec2{X: 9, Y: 5.5}, 1.4, 0.5); !holed || len(sunk.Air) != len(sunk.Path) {
		t.Fatal("the same roll on the ground drops, and keeps its air flags in step")
	}
}

// A gate that shuts on a resting ball pushes it out instead of trapping it.
func TestPieceAppearingOnTheBallPushesItOut(t *testing.T) {
	bar := physics.Bar(physics.Vec2{X: 10, Y: 2}, physics.Vec2{X: 10, Y: 8}, 0.8, 0, "")
	b := physics.UnstickIn(physics.Vec2{X: 10.1, Y: 5}, bar, nil, 0.5, nil)
	if b.X > 9.1 && b.X < 10.9 {
		t.Fatalf("still inside the bar at %v", b)
	}
}

func TestPulseZoneComesAndGoes(t *testing.T) {
	h := &Simple{
		Tee: physics.V(2, 5), Pin: physics.V(40, 5), Substeps: 20, CupRadius: 1,
		Course: &physics.Field{Walls: physics.Box(physics.V(0, 0), physics.V(40, 10)), Friction: 0.9, Radius: 0.5},
		Pulses: []Pulse{{Every: 2, On: 1, Zones: []physics.Zone{
			{Kind: physics.Surface, Min: physics.V(4, 0), Max: physics.V(12, 10), Scale: 0.4, Skin: "puddle"},
		}}},
		Order: 1.5,
	}
	wet, _ := h.PreviewAt(h.Tee, 0, 6, 0)
	dry, _ := h.PreviewAt(h.Tee, 0, 6, 1)
	if wet.Rest().X >= dry.Rest().X {
		t.Fatalf("the puddle should slow the ball: wet %v, dry %v", wet.Rest(), dry.Rest())
	}
	if WorldOf(h) != "garden" {
		t.Fatal("no world is the garden")
	}
	if OrderOf(h, 9) != 1.5 || OrderOf(&Simple{}, 9) != 9 {
		t.Fatal("order is the hole's own, or the fallback")
	}
}

func TestWeatherIsLaidUnderTheCourse(t *testing.T) {
	h := &Simple{
		W: 40, H: 10, Tee: physics.V(2, 5), Pin: physics.V(38, 5), Substeps: 20, CupRadius: 1,
		Course: &physics.Field{Walls: physics.Box(physics.V(0, 0), physics.V(40, 10)), Friction: 0.9, Radius: 0.5},
	}
	all := func(k physics.ZoneKind, skin string, scale float64, v physics.Vec2) []physics.Zone {
		return []physics.Zone{{Kind: k, Min: physics.V(0, 0), Max: physics.V(40, 10), Scale: scale, Vec: v, Skin: skin}}
	}
	calm, _ := h.PreviewWith(h.Tee, 0, 5, 0, 0, nil)
	head, _ := h.PreviewWith(h.Tee, 0, 5, 0, 0, all(physics.Slope, Wind, 0, physics.V(-0.1, 0)))
	snow, _ := h.PreviewWith(h.Tee, 0, 5, 0, 0, all(physics.Surface, Snow, SnowScale, physics.Vec2{}))
	rain, _ := h.PreviewWith(h.Tee, 0, 5, 0, 0, all(physics.Surface, Rain, RainScale, physics.Vec2{}))
	if head.Rest().X >= calm.Rest().X || snow.Rest().X >= calm.Rest().X || rain.Rest().X <= calm.Rest().X {
		t.Fatalf("head wind and snow shorten a shot, rain lengthens it: calm %v, wind %v, snow %v, rain %v", calm.Rest(), head.Rest(), snow.Rest(), rain.Rest())
	}
	// the forecast is a function of (hole, period), and rain leaves puddles on the lane only
	a, b := ForecastFor("x", "island", h, 42), ForecastFor("x", "island", h, 42)
	if a.Kind != b.Kind || len(a.Zones) != len(b.Zones) {
		t.Fatal("the same period is the same weather")
	}
	_, wet := WeatherFor(Rain, h, 7)
	puddles := 0
	for _, z := range wet {
		if z.Skin == "puddle" {
			puddles++
			c := z.Min.Add(z.Max).Scale(0.5)
			if c.X < 0 || c.X > 40 || c.Sub(h.Tee).Len() < 2 || c.Sub(h.Pin).Len() < 2 {
				t.Fatalf("a puddle off the lane or by the tee or cup: %v", c)
			}
		}
	}
	if puddles < 2 || puddles > 4 {
		t.Fatalf("%d puddles, want 2 to 4", puddles)
	}
	wind, _ := WeatherFor(Wind, h, 9)
	if wind.Len() < WindMin-1e-9 || wind.Len() > WindMax+1e-9 {
		t.Fatalf("wind %v out of %v..%v", wind.Len(), WindMin, WindMax)
	}
}

// fickle answers once as a hole should, then otherwise.
type fickle struct {
	*Simple
	calls int
}

func (f *fickle) Par() int {
	f.calls++
	if f.calls > 1 {
		return -7
	}
	return 5
}

func (f *fickle) Position() float64 {
	f.calls++
	if f.calls > 1 {
		return -1
	}
	return 4
}

func (f *fickle) WorldName() string {
	f.calls++
	if f.calls > 1 {
		return ""
	}
	return "town"
}

// ParOf, OrderOf and WorldOf ask a hole once, and check what it said.
func TestTheHelpersAskTheHoleOnce(t *testing.T) {
	f := &fickle{Simple: &Simple{}}
	if p := ParOf(f); p != 5 || f.calls != 1 {
		t.Fatalf("ParOf gave %d after %d calls", p, f.calls)
	}
	f.calls = 0
	if o := OrderOf(f, 9); o != 4 || f.calls != 1 {
		t.Fatalf("OrderOf gave %v after %d calls", o, f.calls)
	}
	f.calls = 0
	if w := WorldOf(f); w != "town" || f.calls != 1 {
		t.Fatalf("WorldOf gave %q after %d calls", w, f.calls)
	}
}
