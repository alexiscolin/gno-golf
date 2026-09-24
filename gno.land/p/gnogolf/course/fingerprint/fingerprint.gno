// Package fingerprint pins a real hole's physics: a fixed grid of tee shots,
// in calm, in rain and in wind, hashed down to one short string. Each hole's
// own test checks it (fingerprint.Check(t, me, "…")), so a change to the
// physics, the weather or the hole shows up as the list of holes it moves.
//
// It is for tests only; nothing on chain calls it.
package fingerprint

import (
	"crypto/sha256"
	"encoding/hex"
	"math"
	"testing"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

// Of is the hole's fingerprint: 24 angles × 3 powers × 2 (tick 0 on stroke 0,
// tick 5 on stroke 1) from the tee, in calm, rain and wind, plus the rain and
// wind zones themselves. Every path point, air flag, cause letter, bounce
// count and holed flag goes into the hash, bit for bit.
func Of(h *course.Simple) string {
	_, rain := course.WeatherFor(course.Rain, h, 7)
	_, wind := course.WeatherFor(course.Wind, h, 11)
	var b []byte
	num := func(x float64) {
		u := math.Float64bits(x)
		for i := 0; i < 8; i++ {
			b = append(b, byte(u>>(8*i)))
		}
	}
	zones := func(zs []physics.Zone) {
		for _, z := range zs {
			num(z.Min.X)
			num(z.Min.Y)
			num(z.Max.X)
			num(z.Max.Y)
			num(z.Vec.X)
			num(z.Vec.Y)
			num(z.Scale)
		}
	}
	zones(rain)
	zones(wind)
	for _, weather := range [][]physics.Zone{nil, rain, wind} {
		for a := 0; a < 360; a += 15 {
			for _, pw := range []float64{3, 6.5, 10} {
				for stroke := 0; stroke < 2; stroke++ {
					sh, holed := h.PreviewWith(h.Tee, float64(a)*math.Pi/180, pw, stroke, 5*stroke, weather)
					for i, p := range sh.Path {
						num(p.X)
						num(p.Y)
						if i < len(sh.Air) && sh.Air[i] {
							b = append(b, 'A')
						}
					}
					b = append(b, sh.Cause...)
					num(float64(sh.Bounces))
					if holed {
						b = append(b, 'H')
					}
					b = append(b, ';')
				}
			}
		}
	}
	s := sha256.Sum256(b)
	return hex.EncodeToString(s[:8])
}

// Check fails the test when the hole's fingerprint is not want, and prints
// the new one: after a change to the game that is meant, paste it in.
func Check(t *testing.T, h *course.Simple, want string) {
	got := Of(h)
	t.Logf("fingerprint %s", got)
	if got != want {
		t.Errorf("fingerprint %s, want %s: this change moves the hole's shots", got, want)
	}
}
