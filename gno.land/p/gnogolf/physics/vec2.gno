// Package physics is the geometry and motion a rolling-ball game needs. It
// knows nothing about golf: it answers where a ball goes, never what that
// means.
//
// Conventions: +X is right, +Y is down, 1.0 is one board unit, angles are in
// radians. Determinism contract: float64 only, no map iteration, no clock, no
// randomness — same inputs, same outputs, on every validator.
package physics

import "math"

// Vec2 is a point or a displacement on the board, in board units.
type Vec2 struct{ X, Y float64 }

// V is the short form. A course is mostly coordinates, and they should read
// like coordinates.
func V(x, y float64) Vec2 { return Vec2{X: x, Y: y} }

// Add is a+b.
func (a Vec2) Add(b Vec2) Vec2 { return Vec2{a.X + b.X, a.Y + b.Y} }

// Sub is a-b.
func (a Vec2) Sub(b Vec2) Vec2 { return Vec2{a.X - b.X, a.Y - b.Y} }

// Scale is a times s.
func (a Vec2) Scale(s float64) Vec2 { return Vec2{a.X * s, a.Y * s} }

// Dot is the dot product of a and b.
func (a Vec2) Dot(b Vec2) float64 { return a.X*b.X + a.Y*b.Y }

// Len is the length of a.
func (a Vec2) Len() float64 { return math.Sqrt(a.Dot(a)) }

// FromPolar builds a vector of length r pointing at angle (radians).
func FromPolar(angle, r float64) Vec2 {
	return Vec2{r * math.Cos(angle), r * math.Sin(angle)}
}

// Reflect mirrors v across the unit normal n.
func Reflect(v, n Vec2) Vec2 { return v.Sub(n.Scale(2 * v.Dot(n))) }
