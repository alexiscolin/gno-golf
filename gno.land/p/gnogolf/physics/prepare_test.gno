package physics

import (
	"math"
	"testing"
)

// samePrep fails unless PrepareWith, given the walls' own Lengths, leaves the
// prep Prepare does, bit for bit.
func samePrep(t *testing.T, what string, f *Field) {
	Prepare(f)
	want := Prepared(f)
	lens := make([]float64, 0, 3*len(f.Walls))
	for _, w := range f.Walls {
		l, lp, lm := Lengths(w.Seg, f.Radius)
		lens = append(lens, l, lp, lm)
	}
	f.prep = nil
	PrepareWith(f, lens)
	got := Prepared(f)
	if len(got) != len(want) {
		t.Fatalf("%s: %d prep floats, want %d", what, len(got), len(want))
	}
	for i := range want {
		if math.Float64bits(got[i]) != math.Float64bits(want[i]) {
			t.Fatalf("%s: prep[%d] (wall %d) is %v, want %v", what, i, (i-1)/stride, got[i], want[i])
		}
	}
}

func TestPrepareWithIsPrepare(t *testing.T) {
	s := uint64(20260925)
	unit := func() float64 {
		s = s*6364136223846793005 + 1442695040888963407
		return float64(s>>11) / (1 << 53)
	}
	// the edge cases: zero length, axis-aligned, -0, a hair long
	nz := math.Copysign(0, -1)
	odd := []Wall{
		{Seg: Segment{V(3, 3), V(3, 3)}},
		{Seg: Segment{V(0, 0), V(10, 0)}},
		{Seg: Segment{V(0, 0), V(0, 10)}},
		{Seg: Segment{V(nz, nz), V(nz, 5)}},
		{Seg: Segment{V(5, nz), V(nz, nz)}},
		{Seg: Segment{V(1, 1), V(1+1e-9, 1)}},
		{Seg: Segment{V(90.25, 47.5), V(1.5, 1.5)}},
	}
	for _, r := range []float64{0, 0.5, 1e-3} {
		ws := append([]Wall{}, odd...)
		n := 1000
		if r == 0.5 {
			n = 10000
		}
		for i := 0; i < n; i++ {
			a := V(unit()*100-2, unit()*50-2)
			b := V(unit()*100-2, unit()*50-2)
			if i%10 == 0 { // on the grid, as most walls are
				a, b = V(math.Floor(a.X), math.Floor(a.Y)), V(math.Floor(a.X), math.Floor(b.Y))
			}
			ws = append(ws, Wall{Seg: Segment{a, b}})
		}
		samePrep(t, "random walls", &Field{Walls: ws, Radius: r})
	}
}

// A wrong number of lengths is not trusted: it prepares from scratch.
func TestPrepareWithTheWrongCountIsPrepare(t *testing.T) {
	f := &Field{Walls: Box(V(0, 0), V(10, 5)), Radius: 0.5}
	Prepare(f)
	want := Prepared(f)
	f.prep = nil
	PrepareWith(f, []float64{1, 2})
	got := Prepared(f)
	for i := range want {
		if math.Float64bits(got[i]) != math.Float64bits(want[i]) {
			t.Fatalf("prep[%d] is %v, want %v", i, got[i], want[i])
		}
	}
}

// The tripwire for course's GG1 data: every field of a Field by position. A
// field added here stops this from building until course.Encode, Decode and
// Diff store it (the other types' tripwire is in course). Cap is not data:
// golf sets it for one stroke.
var _ = Field{nil, nil, nil, 0, 0, 0, 0, 0, nil}
