package course

import (
	"testing"

	"gno.land/p/gnogolf/physics"
)

func TestFitPutsTheWallsInsideTheBoard(t *testing.T) {
	h := Fit(&Simple{
		W: 20, H: 8,
		Tee: physics.V(2, 4), Pin: physics.V(18, 4),
		Course: &physics.Field{
			Walls: physics.Outline(physics.Stadium(physics.V(-1, -0.5), physics.V(21, 8), 4)...),
			Zones: []physics.Zone{
				{Kind: physics.Hazard, Min: physics.V(0, 0), Max: physics.V(20, 8), Vec: physics.V(2, 4), Skin: "sea"},
				{Kind: physics.Slope, Min: physics.V(5, 0), Max: physics.V(9, 8), Vec: physics.V(0.2, 0)},
			},
		},
	}, 1.5)
	for _, w := range h.Course.Walls {
		for _, p := range []physics.Vec2{w.Seg.A, w.Seg.B} {
			if p.X < 1.5-1e-9 || p.Y < 1.5-1e-9 || p.X > float64(h.W)-1.5+1e-9 || p.Y > float64(h.H)-1.5+1e-9 {
				t.Fatalf("wall end %v outside the %dx%d board's margin", p, h.W, h.H)
			}
		}
	}
	sea, slope := h.Course.Zones[0], h.Course.Zones[1]
	if sea.Min != physics.V(0, 0) || sea.Max != physics.V(float64(h.W), float64(h.H)) {
		t.Fatalf("the whole-board sea should cover the new board, got %v..%v", sea.Min, sea.Max)
	}
	if slope.Vec != physics.V(0.2, 0) {
		t.Fatalf("a slope's push must not move, got %v", slope.Vec)
	}
	if sea.Vec != h.Tee {
		t.Fatalf("the sea sends back to the tee, which moved with it: %v vs %v", sea.Vec, h.Tee)
	}
}
