// Package build is the toolkit a hole's source is written with: the walls of
// a box, a bar, an outline, and the curves (arcs, stadiums, keyholes, park
// lanes) an outline follows. A hole's walls are plain physics.Wall values,
// so nothing on chain needs it: golf plays a hole from its data (course.Encode),
// and this package is for authoring holes and for tests.
package build

import (
	"math"

	"gno.land/p/gnogolf/physics"
)

// Box returns the four walls of a rectangle, the usual outer edge of a hole.
func Box(min, max physics.Vec2) []physics.Wall {
	tl, tr := physics.Vec2{X: min.X, Y: min.Y}, physics.Vec2{X: max.X, Y: min.Y}
	br, bl := physics.Vec2{X: max.X, Y: max.Y}, physics.Vec2{X: min.X, Y: max.Y}
	return []physics.Wall{
		{Seg: physics.Segment{A: tl, B: tr}},
		{Seg: physics.Segment{A: tr, B: br}},
		{Seg: physics.Segment{A: br, B: bl}},
		{Seg: physics.Segment{A: bl, B: tl}},
	}
}

// Bar returns the four walls of a barrier of the given thickness from a to b.
//
// Free-standing obstacles need it. With Radius 0 the ball is a point, and a
// point travelling exactly along a zero-width segment never crosses it — it
// slides straight through a blade or a bar it is perfectly aligned with. An
// outer wall is safe as a bare physics.Segment because the ball is always on
// one side of it; anything the ball can meet head-on is built with Bar.
func Bar(a, b physics.Vec2, thickness float64, mark rune, skin string) []physics.Wall {
	d := b.Sub(a)
	l := d.Len()
	if l == 0 {
		return nil
	}
	n := physics.Vec2{X: -d.Y / l, Y: d.X / l}.Scale(thickness / 2)
	e := d.Scale(thickness / 2 / l) // extend the caps so corners meet cleanly
	a, b = a.Sub(e), b.Add(e)

	corners := []physics.Vec2{a.Add(n), b.Add(n), b.Sub(n), a.Sub(n)}
	out := make([]physics.Wall, 4)
	for i := range corners {
		out[i] = physics.Wall{
			Seg:  physics.Segment{A: corners[i], B: corners[(i+1)%4]},
			Mark: mark,
			Skin: skin,
		}
	}
	return out
}

// Walls joins groups of walls; a hole is usually a box plus a few bars.
func Walls(groups ...[]physics.Wall) []physics.Wall {
	out := []physics.Wall{}
	for _, g := range groups {
		out = append(out, g...)
	}
	return out
}

// Timed gives walls a timing: see physics.Wall.Every.
func Timed(ws []physics.Wall, every, on, phase int) []physics.Wall {
	for i := range ws {
		ws[i].Every, ws[i].On, ws[i].Phase = every, on, phase
	}
	return ws
}

// Soft gives walls their own bounce: a hay bale or a pile of logs that takes
// the pace off a ball instead of sending it back.
func Soft(ws []physics.Wall, bounce float64) []physics.Wall {
	for i := range ws {
		ws[i].Bounce = bounce
	}
	return ws
}

// Skinned gives walls a look: a lane's edge built as a boardwalk's rail or a
// pier's side instead of the plain kerb.
func Skinned(ws []physics.Wall, skin string) []physics.Wall {
	for i := range ws {
		ws[i].Skin = skin
	}
	return ws
}

// Outline returns the walls of a closed polygon through the points, in order:
// the outer edge of a hole that is not a rectangle — an L, a funnel, a
// diagonal. Whatever it leaves out of the board is ground the ball never
// reaches, and a renderer draws it as such.
func Outline(points ...physics.Vec2) []physics.Wall {
	out := make([]physics.Wall, 0, len(points))
	for i := range points {
		out = append(out, physics.Wall{Seg: physics.Segment{A: points[i], B: points[(i+1)%len(points)]}})
	}
	return out
}

// Polyline returns the walls of an open line through the points: a curved
// hedge, a ring of a maze with its gap left open.
func Polyline(points ...physics.Vec2) []physics.Wall {
	out := make([]physics.Wall, 0, len(points))
	for i := 0; i+1 < len(points); i++ {
		out = append(out, physics.Wall{Seg: physics.Segment{A: points[i], B: points[i+1]}})
	}
	return out
}

// Arc returns n+1 points on a circle around c of radius r, from angle a0 to a1
// (radians), for an Outline: a curved bank is a polygon with enough sides.
// Each side is a wall, so n is a gas budget — 6 to 10 reads as a curve.
func Arc(c physics.Vec2, r, a0, a1 float64, n int) []physics.Vec2 {
	out := make([]physics.Vec2, 0, n+1)
	for i := 0; i <= n; i++ {
		a := a0 + (a1-a0)*float64(i)/float64(n)
		out = append(out, c.Add(physics.FromPolar(a, r)))
	}
	return out
}

// Path joins groups of points into one outline: a straight bit, an Arc, a
// straight bit… Pts makes a group of single points.
func Path(parts ...[]physics.Vec2) []physics.Vec2 {
	out := []physics.Vec2{}
	for _, p := range parts {
		out = append(out, p...)
	}
	return out
}

// Pts makes a group of single points for Path.
func Pts(ps ...physics.Vec2) []physics.Vec2 { return ps }

// Stadium is the outline of a lane with both ends rounded, from min to max
// (wider than it is tall): the classic mini-golf lane. n is the number of
// walls per rounded end.
func Stadium(min, max physics.Vec2, n int) []physics.Vec2 {
	r := (max.Y - min.Y) / 2
	cy := min.Y + r
	return Path(
		Arc(physics.Vec2{X: min.X + r, Y: cy}, r, math.Pi/2, 3*math.Pi/2, n),
		Arc(physics.Vec2{X: max.X - r, Y: cy}, r, -math.Pi/2, math.Pi/2, n),
	)
}

// Keyhole is a lane of the given width, rounded at its start (x0), running
// into a round green of radius R around c: the lane's axis is c.Y. It is the
// shape of a cup on a platform — the ball has to come down the lane to it.
func Keyhole(x0, width float64, c physics.Vec2, R float64, n int) []physics.Vec2 {
	h := width / 2
	a := math.Asin(h / R)
	return Path(
		Arc(physics.Vec2{X: x0 + h, Y: c.Y}, h, math.Pi/2, 3*math.Pi/2, n),
		Arc(c, R, -(math.Pi-a), math.Pi-a, 2*n),
	)
}

// Lane is the outline of a park lane: a ribbon of the given width that flows
// through pts along a smooth curve (Catmull-Rom), with a round pad at each end
// — the tee's and the cup's — a little wider than the lane. n is the number of
// walls per stretch between two points on each side, so a lane through k
// points costs about 2n(k-1) + 16 walls: n is a gas budget, 3 to 5 reads as a
// curve. A bend tighter than half the width folds the inner side on itself:
// keep the points far enough apart for the turns they make.
func Lane(width float64, n int, pts ...physics.Vec2) []physics.Vec2 {
	h, R := width/2, width*0.8
	at := func(i int) physics.Vec2 {
		if i < 0 {
			i = 0
		}
		if i >= len(pts) {
			i = len(pts) - 1
		}
		return pts[i]
	}
	// the centreline, sampled
	var mid []physics.Vec2
	for i := 0; i+1 < len(pts); i++ {
		p0, p1, p2, p3 := at(i-1), at(i), at(i+1), at(i+2)
		for k := 0; k < n; k++ {
			t := float64(k) / float64(n)
			t2, t3 := t*t, t*t*t
			mid = append(mid, p0.Scale(-0.5*t3+t2-0.5*t).
				Add(p1.Scale(1.5*t3-2.5*t2+1)).
				Add(p2.Scale(-1.5*t3+2*t2+0.5*t)).
				Add(p3.Scale(0.5*t3-0.5*t2)))
		}
	}
	mid = append(mid, pts[len(pts)-1])
	dirAt := func(i int) physics.Vec2 {
		j, k := i-1, i+1
		if j < 0 {
			j = 0
		}
		if k > len(mid)-1 {
			k = len(mid) - 1
		}
		a, b := mid[j], mid[k]
		d := b.Sub(a)
		return d.Scale(1 / d.Len())
	}
	first, last := mid[0], mid[len(mid)-1]
	clear := func(p physics.Vec2) bool { return p.Sub(first).Len() >= R && p.Sub(last).Len() >= R }
	var left, right []physics.Vec2
	for i, c := range mid {
		d := dirAt(i)
		nl := physics.Vec2{X: -d.Y, Y: d.X}.Scale(h)
		if l := c.Add(nl); clear(l) {
			left = append(left, l)
		}
		if r := c.Sub(nl); clear(r) {
			right = append(right, r)
		}
	}
	d0, d1 := dirAt(0), dirAt(len(mid)-1)
	a0, a1 := math.Atan2(d0.Y, d0.X), math.Atan2(d1.Y, d1.X)
	cut := math.Asin(h / R)
	out := Arc(first, R, a0+cut, a0+2*math.Pi-cut, 8) // round the tee's pad
	out = append(out, right...)                       // down the right side
	out = append(out, Arc(last, R, a1+math.Pi+cut, a1+3*math.Pi-cut, 8)...)
	for i := len(left) - 1; i >= 0; i-- { // and back up the left
		out = append(out, left[i])
	}
	return out
}
