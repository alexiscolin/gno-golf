package physics

import "math"

// offset is what Step needs of a wall: its two offset lines (the lines a
// ball's centre meets, one per side), their normals, the wall's own start,
// normal and length, its bounce and timing, and the box a move must reach
// for the wall to matter at all.
type offset struct {
	plus, minus      Segment
	pn, mn           Vec2 // plus.Normal(), minus.Normal()
	a, n             Vec2
	length, bounce   float64
	every, on, phase int
	lo, hi           Vec2
}

// boxPad grows every broad-phase box: more than the half skin a ball may sit
// inside a wall's radius (Step's near test), and far more than rounding.
const boxPad = 1e-6

// lines works out a wall's offset lines for a ball of radius r. It is exactly
// the arithmetic of Normal and Toward (twice) — the same bits — with each
// square root taken once: 3 instead of 8.
func lines(s Segment, r float64, o *offset) {
	d := s.B.Sub(s.A)
	l := d.Len()
	o.a, o.length = s.A, l
	if l == 0 {
		o.plus, o.minus, o.n, o.pn, o.mn = s, s, Vec2{}, Vec2{}, Vec2{}
	} else {
		n := Vec2{-d.Y / l, d.X / l}
		toward := func(p Vec2) Segment {
			m := n
			if p.Sub(s.A).Dot(m) < 0 {
				m = m.Scale(-1)
			}
			e, off := d.Scale(r/l), m.Scale(r)
			return Segment{A: s.A.Sub(e).Add(off), B: s.B.Add(e).Add(off)}
		}
		o.n = n
		o.plus, o.minus = toward(s.A.Add(n)), toward(s.A.Sub(n))
		o.pn, o.mn = o.plus.Normal(), o.minus.Normal()
	}
	o.lo, o.hi = o.plus.A, o.plus.A
	for _, p := range []Vec2{o.plus.B, o.minus.A, o.minus.B} {
		if p.X < o.lo.X {
			o.lo.X = p.X
		} else if p.X > o.hi.X {
			o.hi.X = p.X
		}
		if p.Y < o.lo.Y {
			o.lo.Y = p.Y
		} else if p.Y > o.hi.Y {
			o.hi.Y = p.Y
		}
	}
	o.lo, o.hi = o.lo.Sub(Vec2{boxPad, boxPad}), o.hi.Add(Vec2{boxPad, boxPad})
}

// stride is the floats per wall in Field.prep: the wall's own ends (to know
// the entry is still that wall's), then plus, minus, pn, mn, n, length, lo, hi.
const stride = 23

// Prepare works out the field's wall offsets once, for every shot to reuse:
// a hole calls it (course.Fit does) after its walls are where they stay.
// Walls that change afterwards are only a cost: Step checks each entry
// against its wall and works out any that no longer match.
func Prepare(f *Field) {
	p := make([]float64, 1, 1+stride*len(f.Walls))
	p[0] = f.Radius
	var o offset
	for j := range f.Walls {
		s := f.Walls[j].Seg
		lines(s, f.Radius, &o)
		p = append(p, s.A.X, s.A.Y, s.B.X, s.B.Y,
			o.plus.A.X, o.plus.A.Y, o.plus.B.X, o.plus.B.Y,
			o.minus.A.X, o.minus.A.Y, o.minus.B.X, o.minus.B.Y,
			o.pn.X, o.pn.Y, o.mn.X, o.mn.Y, o.n.X, o.n.Y, o.length,
			o.lo.X, o.lo.Y, o.hi.X, o.hi.Y)
	}
	f.prep = p
}

// offsets is every wall's offset for this shot: from Prepare where it still
// matches the wall, worked out otherwise (a stroke's extra walls, a field
// never prepared).
func (f *Field) offsets() []offset {
	offs := make([]offset, len(f.Walls))
	p := f.prep
	if len(p) == 0 || p[0] != f.Radius {
		p = nil
	}
	for j := range f.Walls {
		w := &f.Walls[j]
		o := &offs[j]
		if k := 1 + j*stride; k+stride <= len(p) && p[k] == w.Seg.A.X && p[k+1] == w.Seg.A.Y && p[k+2] == w.Seg.B.X && p[k+3] == w.Seg.B.Y {
			o.plus = Segment{Vec2{p[k+4], p[k+5]}, Vec2{p[k+6], p[k+7]}}
			o.minus = Segment{Vec2{p[k+8], p[k+9]}, Vec2{p[k+10], p[k+11]}}
			o.pn, o.mn, o.n = Vec2{p[k+12], p[k+13]}, Vec2{p[k+14], p[k+15]}, Vec2{p[k+16], p[k+17]}
			o.a, o.length = w.Seg.A, p[k+18]
			o.lo, o.hi = Vec2{p[k+19], p[k+20]}, Vec2{p[k+21], p[k+22]}
		} else {
			lines(w.Seg, f.Radius, o)
		}
		o.bounce = orDefault(w.Bounce, f.Bounce)
		o.every, o.on, o.phase = w.Every, w.On, w.Phase
	}
	return offs
}

// timedBars is where each timed bar starts in f.Walls: four timed walls in a
// row with one timing that close on themselves, as Timed(Bar(…)) makes them.
func (f *Field) timedBars() []int {
	var out []int
	ws := f.Walls
	for j := 0; j+3 < len(ws); j++ {
		a := &ws[j]
		if a.Every <= 0 {
			continue
		}
		closed := true
		for k := 0; k < 4; k++ {
			w, next := &ws[j+k], &ws[j+(k+1)%4]
			if w.Every != a.Every || w.On != a.On || w.Phase != a.Phase || w.Seg.B != next.Seg.A {
				closed = false
				break
			}
		}
		if closed {
			out = append(out, j)
			j += 3
		}
	}
	return out
}

// Unstick moves a ball out of a piece that appeared on top of it — a gate
// shutting, a sail turning, a mole popping up where the ball rests, a tram
// arriving on a rolling ball (Step, for timed bars). Walls come
// in bars of four (physics.Bar): a ball inside one leaves through the nearest
// side. A ball merely closer to a wall than its radius is pushed off it.
func Unstick(ball Vec2, walls []Wall, posts []Post, r float64) Vec2 {
	for i := 0; i+3 < len(walls); i += 4 {
		q := walls[i : i+4]
		c := q[0].Seg.A.Add(q[1].Seg.A).Add(q[2].Seg.A).Add(q[3].Seg.A).Scale(0.25)
		inside := true
		for _, w := range q {
			if side(w.Seg, ball) != side(w.Seg, c) {
				inside = false
			}
		}
		best, bestD := Vec2{}, math.Inf(1)
		for _, w := range q {
			p := w.Seg.Closest(ball)
			if d := p.Sub(ball).Len(); d < bestD {
				best, bestD = p, d
			}
		}
		if inside || bestD < r {
			out := best.Sub(c)
			if !inside {
				out = ball.Sub(best)
			}
			if l := out.Len(); l > 0 {
				ball = best.Add(out.Scale((r + 0.02) / l))
			}
		}
	}
	for _, p := range posts {
		d := ball.Sub(p.C)
		if l := d.Len(); l < p.R+r {
			if l == 0 {
				d, l = Vec2{X: 1}, 1
			}
			ball = p.C.Add(d.Scale((p.R + r + 0.02) / l))
		}
	}
	return ball
}

func side(s Segment, p Vec2) bool {
	return s.B.Sub(s.A).X*(p.Y-s.A.Y)-s.B.Sub(s.A).Y*(p.X-s.A.X) > 0
}

// Closest is the point of the segment nearest p.
func (s Segment) Closest(p Vec2) Vec2 {
	d := s.B.Sub(s.A)
	l := d.Dot(d)
	if l == 0 {
		return s.A
	}
	t := p.Sub(s.A).Dot(d) / l
	if t < 0 {
		t = 0
	} else if t > 1 {
		t = 1
	}
	return s.A.Add(d.Scale(t))
}
