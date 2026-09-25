package town18

import (
	"testing"

	"gno.land/p/gnogolf/physics"
)

// A ball resting against the north rail inside a tram's end cap is pushed
// out along the rail when the tram comes, never through it. (20, 0.6) is
// where the hole is drawn, before Fit moved it by its margin.
func TestTheTramNeverPushesTheBallOffThePlaza(t *testing.T) {
	d := me.Tee.Sub(physics.V(3, 22))
	for tick := 0; tick < 24; tick++ {
		s, _ := me.PreviewWith(physics.V(20, 0.6).Add(d), 0, 0.3, 0, tick, nil)
		for _, p := range s.Path {
			if p.Y < d.Y {
				t.Fatalf("tick %d: the ball was pushed off the plaza, to %v", tick, p)
			}
		}
	}
}
