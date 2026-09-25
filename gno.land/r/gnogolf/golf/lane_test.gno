package golf

import (
	"encoding/hex"
	"math"
	"strings"
	"testing"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

// courseHoleData is a course hole decoded from its data, by its realm path.
func courseHoleData(t *testing.T, realm string) *course.Simple {
	for _, d := range courseData {
		if d[1] != realm {
			continue
		}
		raw, _ := hex.DecodeString(d[3])
		h, err := course.DecodeChecked(string(raw))
		if err != nil {
			t.Fatal(err.Error())
		}
		return h
	}
	t.Fatal("no course hole " + realm)
	return nil
}

// inLane is whether p is on the board and inside the hole's outline: an odd
// number of its untimed walls between p and far away.
func inLane(h *course.Simple, p physics.Vec2) bool {
	w, hh := h.Board()
	if !(p.X >= 0 && p.X <= float64(w) && p.Y >= 0 && p.Y <= float64(hh)) {
		return false
	}
	far, in := p.Add(physics.V(1e4, 37)), false
	for _, wl := range h.Course.Walls {
		if wl.Every <= 0 && wl.Seg.Crosses(p, far) {
			in = !in
		}
	}
	return in
}

// Shots that used to leave the lane through an acute corner's tip: the gap
// between the square caps of its two walls (final physics review, bug 1).
func TestNoShotLeavesThroughATip(t *testing.T) {
	for _, c := range []struct {
		realm        string
		ball         physics.Vec2
		angle, power float64
		stroke, tick int
	}{
		{"gno.land/r/gnogolf/mountain12", physics.V(23.5, 10.874), -math.Pi / 2, 5, 0, 0},
		{"gno.land/r/gnogolf/mountain11", physics.V(5.0468656881583138, 4.8619634298512899), 4.2902542084598672, 10, 3, 3244},
		{"gno.land/r/gnogolf/mountain11", physics.V(10.075645511557594, 10.216407718359527), math.Atan2(-0.77983834799872387, -5.9491051554826822), 10, 0, 0},
		{"gno.land/r/gnogolf/hole14", physics.V(78.13288187063759, 6.4068465215645212), math.Atan2(5.6139472497413729, -2.117450419046754), 10, 0, 0},
		{"gno.land/r/gnogolf/island2", physics.V(12.563197975886325, 14.411833159542672), math.Atan2(1.0057185110012956, 1.4928262714158458), 3, 0, 0},
	} {
		h := courseHoleData(t, c.realm)
		shot, _ := h.PreviewWith(c.ball, c.angle, c.power, c.stroke, c.tick, nil)
		if r := shot.Rest(); !inLane(h, r) {
			t.Errorf("%s: the shot from %v leaves the lane, to %v", c.realm, c.ball, r)
		}
	}
}

// Moves that used to cut through a free wall end from afar, diagonally in at
// its missing end face (bug 2): one substep on the hole's walls.
func TestNoMoveCutsAFreeEnd(t *testing.T) {
	for _, c := range []struct {
		realm      string
		wall       int
		start, vel physics.Vec2
	}{
		{"gno.land/r/gnogolf/hole19", 10, physics.V(20.735917329350194, 6.266094659622437), physics.V(2.8697625314531665, -0.41768769800834776)},
		{"gno.land/r/gnogolf/island5", 0, physics.V(2.9248971286259056, 18.368270191175334), physics.V(-1.796609423050054, -2.276443406063008)},
		{"gno.land/r/gnogolf/island7", 20, physics.V(14.924897128625906, 11.705455115153418), physics.V(-2.7258901591104294, -3.4539141333369767)},
		{"gno.land/r/gnogolf/island9", 4, physics.V(50.133477457895225, 6.555171723174372), physics.V(2.8697625314531665, -0.41768769800834776)},
	} {
		h := courseHoleData(t, c.realm)
		f := *h.Course
		f.Zones = nil
		s := f.Step(c.start, c.vel, 1)
		if f.Walls[c.wall].Seg.Crosses(c.start, s.Rest()) {
			t.Errorf("%s: the move from %v cuts through wall %d, to %v", c.realm, c.start, c.wall, s.Rest())
		}
	}
}

// A piece that comes back between strokes pushes a resting ball out, never
// across one of the hole's own walls (bug 3): mountain9's bars alternate
// every stroke, and hole2's mole pops up by an inner corner.
func TestAPieceNeverPushesTheBallThroughAWall(t *testing.T) {
	for _, c := range []struct {
		realm  string
		ball   physics.Vec2
		stroke int
		angle  float64
	}{
		{"gno.land/r/gnogolf/mountain9", physics.V(41.999366005765964, 4.0059792230650704), 1, 270 * math.Pi / 180},
		{"gno.land/r/gnogolf/hole2", physics.V(27.3, 5.8), 1, 0},
		{"gno.land/r/gnogolf/hole2", physics.V(27.3, 5.8), 1, math.Pi},
	} {
		h := courseHoleData(t, c.realm)
		shot, _ := h.PreviewWith(c.ball, c.angle, 4, c.stroke, 0, nil)
		for _, w := range h.Course.Walls {
			if w.Every <= 0 && w.Seg.Crosses(c.ball, shot.Path[0]) {
				t.Errorf("%s: the ball at %v is pushed across a wall, to %v", c.realm, c.ball, shot.Path[0])
			}
		}
		if r := shot.Rest(); !inLane(h, r) {
			t.Errorf("%s: the shot from %v leaves the lane, to %v", c.realm, c.ball, r)
		}
	}
}

// A ball that comes to rest off the board is brought back to where the shot
// started, and the stroke counts: played, previewed and replayed alike. A
// hole with no walls lets every long shot out.
func TestABallOffTheBoardComesBack(cur realm, t *testing.T) {
	leaky := flatHole("Leaky")
	leaky.Course.Walls, leaky.Course.Friction = nil, 0.97
	id := mine(cur, "leaky", leaky)
	testing.SetRealm(testing.NewUserRealm(player))
	Launch(cross(cur), id, 0, 10)
	Launch(cross(cur), id, 0, 10)
	r := roundIn(id, player)
	tee := leaky.Tee
	if r.ball() != tee || r.strokes != 2 {
		t.Fatalf("after two leaks the ball is at %v after %d strokes", r.ball(), r.strokes)
	}
	want := `"rest":` + jexact(tee) + "}"
	if sim := SimulateRound(id, r.shots); !strings.Contains(sim, want) || !strings.Contains(sim, `"strokes":2`) {
		t.Fatalf("the replay differs: %s", sim)
	}
	if rd := Round(id, player); !strings.Contains(rd, `,[2.000,8.000]],"air"`) || !strings.Contains(rd, `,"cause":"`) {
		t.Fatalf("the last shot is not drawn coming back: %s", rd)
	}
}
