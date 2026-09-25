package course

import (
	"math"

	"gno.land/p/gnogolf/physics"
)

// Fit moves a hole so its walls sit margin inside the board, and sizes the
// board to them: a client draws the green over the board only, so a wall on
// or past its edge cuts the green off in a straight line. Everything is
// shifted by the same (dx, dy) — tee, pin, walls, posts, zones (min, max,
// poly, and the Vec of those whose Vec is a point: Tunnel, Hazard, Loop; a
// Slope's Vec is a push and stays), and the pulses' pieces — and W, H become
// the walls' extent plus a margin each side. A zone that covered the whole
// old board (the sea round a lane with no rails) covers the new one; a
// rectangle that runs past the new board is cut at its edge.
//
// Call it once, where the hole is declared:
//
//	var me = course.Fit(&course.Simple{…}, 1.5)
func Fit(h *Simple, margin float64) *Simple {
	f := h.Course
	if f == nil {
		return h
	}
	oldW, oldH := float64(h.W), float64(h.H)
	if h.W <= 0 || h.H <= 0 {
		oldW, oldH = BoardW, BoardH
	}

	// the extent to keep inside: every wall end and post, fixed or pulsed
	lo := physics.Vec2{X: math.Inf(1), Y: math.Inf(1)}
	hi := physics.Vec2{X: math.Inf(-1), Y: math.Inf(-1)}
	grow := func(p physics.Vec2, r float64) {
		lo.X, lo.Y = math.Min(lo.X, p.X-r), math.Min(lo.Y, p.Y-r)
		hi.X, hi.Y = math.Max(hi.X, p.X+r), math.Max(hi.Y, p.Y+r)
	}
	walls := func(ws []physics.Wall) {
		for _, w := range ws {
			grow(w.Seg.A, 0)
			grow(w.Seg.B, 0)
		}
	}
	posts := func(ps []physics.Post) {
		for _, p := range ps {
			grow(p.C, p.R)
		}
	}
	walls(f.Walls)
	posts(f.Posts)
	for _, p := range h.Pulses {
		walls(p.Walls)
		posts(p.Posts)
	}
	grow(h.Tee, 0)
	grow(h.Pin, 0)
	if math.IsInf(lo.X, 1) {
		return h
	}

	d := physics.Vec2{X: margin - lo.X, Y: margin - lo.Y}
	newW := int(math.Ceil(hi.X - lo.X + 2*margin))
	newH := int(math.Ceil(hi.Y - lo.Y + 2*margin))

	moveWalls := func(ws []physics.Wall) {
		for i := range ws {
			ws[i].Seg.A = ws[i].Seg.A.Add(d)
			ws[i].Seg.B = ws[i].Seg.B.Add(d)
		}
	}
	movePosts := func(ps []physics.Post) {
		for i := range ps {
			ps[i].C = ps[i].C.Add(d)
		}
	}
	moveZones := func(zs []physics.Zone) {
		for i := range zs {
			z := &zs[i]
			whole := z.Min.X <= 0 && z.Min.Y <= 0 && z.Max.X >= oldW && z.Max.Y >= oldH
			if whole {
				z.Min, z.Max = physics.Vec2{}, physics.Vec2{X: float64(newW), Y: float64(newH)}
			} else {
				z.Min, z.Max = z.Min.Add(d), z.Max.Add(d)
				// a band across the board (a bank, a crevasse) is cut at its
				// edges: past them is no ground. A Round or Poly zone keeps its
				// box, which is its shape.
				if !z.Round && len(z.Poly) == 0 {
					z.Min.X, z.Min.Y = math.Max(z.Min.X, 0), math.Max(z.Min.Y, 0)
					z.Max.X, z.Max.Y = math.Min(z.Max.X, float64(newW)), math.Min(z.Max.Y, float64(newH))
				}
			}
			// a copy: two zones may share one outline, and each moves once
			z.Poly = append([]physics.Vec2(nil), z.Poly...)
			for j := range z.Poly {
				z.Poly[j] = z.Poly[j].Add(d)
			}
			if z.Kind == physics.Tunnel || z.Kind == physics.Hazard || z.Kind == physics.Loop {
				z.Vec = z.Vec.Add(d)
			}
		}
	}
	moveWalls(f.Walls)
	movePosts(f.Posts)
	moveZones(f.Zones)
	for i := range h.Pulses {
		moveWalls(h.Pulses[i].Walls)
		movePosts(h.Pulses[i].Posts)
		moveZones(h.Pulses[i].Zones)
	}
	h.Tee, h.Pin = h.Tee.Add(d), h.Pin.Add(d)
	h.W, h.H = newW, newH
	physics.Prepare(f) // the walls are where they stay
	return h
}
