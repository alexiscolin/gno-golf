package course

import (
	"math"
	"strconv"

	"gno.land/p/gnogolf/physics"
)

// Diff is the first difference between two holes, field by field and float
// by float (by their bits, so -0 is not 0), the walls' prep included, or ""
// when there is none. A nil list and an empty one are the same list. The wear
// is not compared: it is the course's, not the hole's.
//
// It is how a decoded hole is proved the hole it was encoded from: Encode,
// Decode and Diff must name the same fields, and the tripwire in its test
// fails to build when a field is added to any of the types.
func Diff(a, b *Simple) string {
	c := &differ{}
	c.whole("W", a.W, b.W)
	c.whole("H", a.H, b.H)
	c.str("Title", a.Title, b.Title)
	c.whole("Strokes", a.Strokes, b.Strokes)
	c.vec("Tee", a.Tee, b.Tee)
	c.vec("Pin", a.Pin, b.Pin)
	c.whole("Substeps", a.Substeps, b.Substeps)
	c.num("CupRadius", a.CupRadius, b.CupRadius)
	c.str("World", a.World, b.World)
	c.num("Order", a.Order, b.Order)
	c.num("Shelter", a.Shelter, b.Shelter)
	if (a.Course == nil) != (b.Course == nil) {
		c.at("Course", "nil")
	} else if a.Course != nil {
		fa, fb := a.Course, b.Course
		c.walls("Course.Walls", fa.Walls, fb.Walls)
		c.posts("Course.Posts", fa.Posts, fb.Posts)
		c.zones("Course.Zones", fa.Zones, fb.Zones)
		c.num("Course.Friction", fa.Friction, fb.Friction)
		c.num("Course.Bounce", fa.Bounce, fb.Bounce)
		c.num("Course.Radius", fa.Radius, fb.Radius)
		c.whole("Course.Tick", fa.Tick, fb.Tick)
		c.nums("Course.prep", physics.Prepared(fa), physics.Prepared(fb))
	}
	if c.whole("len(Pulses)", len(a.Pulses), len(b.Pulses)) {
		for i := range a.Pulses {
			p, q := &a.Pulses[i], &b.Pulses[i]
			k := "Pulses[" + strconv.Itoa(i) + "]."
			c.whole(k+"Every", p.Every, q.Every)
			c.whole(k+"On", p.On, q.On)
			c.whole(k+"Phase", p.Phase, q.Phase)
			c.walls(k+"Walls", p.Walls, q.Walls)
			c.posts(k+"Posts", p.Posts, q.Posts)
			c.zones(k+"Zones", p.Zones, q.Zones)
		}
	}
	return c.first
}

type differ struct{ first string }

func (c *differ) at(field, what string) {
	if c.first == "" {
		c.first = field + ": " + what
	}
}

func (c *differ) whole(field string, a, b int) bool {
	if a != b {
		c.at(field, strconv.Itoa(a)+" vs "+strconv.Itoa(b))
		return false
	}
	return true
}

func (c *differ) str(field, a, b string) {
	if a != b {
		c.at(field, strconv.Quote(a)+" vs "+strconv.Quote(b))
	}
}

func (c *differ) flag(field string, a, b bool) {
	if a != b {
		c.at(field, strconv.FormatBool(a)+" vs "+strconv.FormatBool(b))
	}
}

func (c *differ) num(field string, a, b float64) {
	if math.Float64bits(a) != math.Float64bits(b) {
		c.at(field, strconv.FormatFloat(a, 'g', -1, 64)+" vs "+strconv.FormatFloat(b, 'g', -1, 64))
	}
}

func (c *differ) nums(field string, a, b []float64) {
	if c.whole("len("+field+")", len(a), len(b)) {
		for i := range a {
			c.num(field+"["+strconv.Itoa(i)+"]", a[i], b[i])
		}
	}
}

func (c *differ) vec(field string, a, b physics.Vec2) {
	c.num(field+".X", a.X, b.X)
	c.num(field+".Y", a.Y, b.Y)
}

func (c *differ) timing(k string, e1, o1, p1, e2, o2, p2 int) {
	c.whole(k+"Every", e1, e2)
	c.whole(k+"On", o1, o2)
	c.whole(k+"Phase", p1, p2)
}

func (c *differ) walls(field string, a, b []physics.Wall) {
	if !c.whole("len("+field+")", len(a), len(b)) {
		return
	}
	for i := range a {
		w, v := &a[i], &b[i]
		k := field + "[" + strconv.Itoa(i) + "]."
		c.vec(k+"Seg.A", w.Seg.A, v.Seg.A)
		c.vec(k+"Seg.B", w.Seg.B, v.Seg.B)
		c.num(k+"Bounce", w.Bounce, v.Bounce)
		c.whole(k+"Mark", int(w.Mark), int(v.Mark))
		c.str(k+"Skin", w.Skin, v.Skin)
		c.timing(k, w.Every, w.On, w.Phase, v.Every, v.On, v.Phase)
	}
}

func (c *differ) posts(field string, a, b []physics.Post) {
	if !c.whole("len("+field+")", len(a), len(b)) {
		return
	}
	for i := range a {
		p, q := &a[i], &b[i]
		k := field + "[" + strconv.Itoa(i) + "]."
		c.vec(k+"C", p.C, q.C)
		c.num(k+"R", p.R, q.R)
		c.num(k+"Bounce", p.Bounce, q.Bounce)
		c.whole(k+"Mark", int(p.Mark), int(q.Mark))
		c.str(k+"Skin", p.Skin, q.Skin)
	}
}

func (c *differ) zones(field string, a, b []physics.Zone) {
	if !c.whole("len("+field+")", len(a), len(b)) {
		return
	}
	for i := range a {
		z, y := &a[i], &b[i]
		k := field + "[" + strconv.Itoa(i) + "]."
		c.whole(k+"Kind", int(z.Kind), int(y.Kind))
		c.vec(k+"Min", z.Min, y.Min)
		c.vec(k+"Max", z.Max, y.Max)
		c.vec(k+"Vec", z.Vec, y.Vec)
		c.num(k+"Scale", z.Scale, y.Scale)
		c.whole(k+"Mark", int(z.Mark), int(y.Mark))
		c.str(k+"Skin", z.Skin, y.Skin)
		c.flag(k+"Round", z.Round, y.Round)
		if c.whole("len("+k+"Poly)", len(z.Poly), len(y.Poly)) {
			for j := range z.Poly {
				c.vec(k+"Poly["+strconv.Itoa(j)+"]", z.Poly[j], y.Poly[j])
			}
		}
		c.flag(k+"Outside", z.Outside, y.Outside)
		c.timing(k, z.Every, z.On, z.Phase, y.Every, y.On, y.Phase)
		c.flag(k+"Air", z.Air, y.Air)
		c.flag(k+"Capped", z.Capped, y.Capped)
	}
}
