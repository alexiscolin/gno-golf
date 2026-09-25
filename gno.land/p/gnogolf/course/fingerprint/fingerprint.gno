// Package fingerprint pins a real hole's physics: a fixed grid of tee shots,
// in calm, in rain and in wind, hashed down to one short string. Each hole's
// own test checks it (fingerprint.Check(t, me, "…")), so a change to the
// physics, the weather or the hole shows up as the list of holes it moves.
//
// It is for tests only: nothing on chain calls it, and it is never deployed.
package fingerprint

import (
	"crypto/sha256"
	"encoding/hex"
	"math"
	"strconv"

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
	// A hole with no pulse and nothing timed plays stroke 1 at tick 5 as it
	// plays stroke 0 at tick 0 (these weathers are untimed): its bytes are
	// worked out once and hashed twice, the same input either way.
	still := !h.Varies() && !timed(h.Course)
	for _, weather := range [][]physics.Zone{nil, rain, wind} {
		for a := 0; a < 360; a += 15 {
			for _, pw := range []float64{3, 6.5, 10} {
				from := len(b)
				for stroke := 0; stroke < 2; stroke++ {
					if still && stroke == 1 {
						b = append(b, b[from:]...)
						break
					}
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

// timed is whether any wall or zone of a field comes and goes within a stroke.
func timed(f *physics.Field) bool {
	for _, w := range f.Walls {
		if w.Every > 0 {
			return true
		}
	}
	for _, z := range f.Zones {
		if z.Every > 0 {
			return true
		}
	}
	return false
}

// Full is the fingerprint of what Of does not see: every piece's kind,
// flags, timing, mark and skin, the header (title, world, order, par, board,
// shelter, substeps), and on a pulse hole the shots of every stroke its
// pulses cycle through beyond Of's first two. Check compares it between a
// hole and the same hole encoded and decoded; it pins no value of its own.
func Full(h *course.Simple) string {
	var b []byte
	num := func(x float64) {
		u := math.Float64bits(x)
		for i := 0; i < 8; i++ {
			b = append(b, byte(u>>(8*i)))
		}
	}
	whole := func(n int) { num(float64(n)) }
	str := func(s string) {
		whole(len(s))
		b = append(b, s...)
	}
	flag := func(v bool) {
		if v {
			b = append(b, 1)
		} else {
			b = append(b, 0)
		}
	}
	pieces := func(ws []physics.Wall, ps []physics.Post, zs []physics.Zone) {
		whole(len(ws))
		for _, w := range ws {
			num(w.Bounce)
			whole(int(w.Mark))
			str(w.Skin)
			whole(w.Every)
			whole(w.On)
			whole(w.Phase)
		}
		whole(len(ps))
		for _, p := range ps {
			num(p.Bounce)
			whole(int(p.Mark))
			str(p.Skin)
		}
		whole(len(zs))
		for _, z := range zs {
			whole(int(z.Kind))
			flag(z.Air)
			flag(z.Capped)
			flag(z.Round)
			flag(z.Outside)
			whole(z.Every)
			whole(z.On)
			whole(z.Phase)
			whole(int(z.Mark))
			str(z.Skin)
			whole(len(z.Poly))
		}
	}
	str(h.Title)
	str(h.World)
	num(h.Order)
	whole(h.Strokes)
	whole(h.W)
	whole(h.H)
	whole(h.Substeps)
	num(h.Shelter)
	num(h.CupRadius)
	f := h.Course
	pieces(f.Walls, f.Posts, f.Zones)
	num(f.Friction)
	num(f.Bounce)
	num(f.Radius)
	whole(f.Tick)
	every := 0
	for _, p := range h.Pulses {
		whole(p.Every)
		whole(p.On)
		whole(p.Phase)
		pieces(p.Walls, p.Posts, p.Zones)
		if p.Every > every {
			every = p.Every
		}
	}
	// the strokes past Of's two, up to the longest pulse's cycle: 8 angles,
	// one power, calm
	for stroke := 2; stroke < every; stroke++ {
		for a := 0; a < 360; a += 45 {
			sh, holed := h.PreviewWith(h.Tee, float64(a)*math.Pi/180, 6.5, stroke, 0, nil)
			for _, p := range sh.Path {
				num(p.X)
				num(p.Y)
			}
			b = append(b, sh.Cause...)
			flag(holed)
		}
	}
	s := sha256.Sum256(b)
	return hex.EncodeToString(s[:8])
}

// T is what Check needs of a test: *testing.T is one. The package takes it
// rather than importing testing, which only a test file may.
type T interface {
	Logf(format string, args ...any)
	Errorf(format string, args ...any)
	Fatalf(format string, args ...any)
	Fatal(args ...any)
}

// Check fails the test when the hole's fingerprint is not want, and prints
// the new one: after a change to the game that is meant, paste it in.
//
// It also proves the hole survives as data: Decode(Encode(h)) must be h field
// by field (course.Diff, the prep included), encode back to the same bytes,
// play the same shots (Of, the same want) and have the same Full. Then it
// logs the data, for scripts/holedata.sh: "data <slot> <sha8> <hex>".
//
// A commit that moves a hole's fingerprint says, for each hole it moves, why
// (as "hole20: seesaw pivot, par 3").
func Check(t T, h *course.Simple, want string) {
	got := Of(h)
	t.Logf("fingerprint %s", got)
	if got != want {
		t.Errorf("fingerprint %s, want %s: this change moves the hole's shots (paste the new one in, and say why in the commit)", got, want)
	}
	data := course.Encode(h)
	d, err := course.Decode(data)
	if err != nil {
		t.Fatalf("the hole does not decode: %s", err.Error())
	}
	if diff := course.Diff(h, d); diff != "" {
		t.Fatalf("the decoded hole differs: %s", diff)
	}
	if !course.Exact(d) {
		t.Fatal("the decoded hole's stored lengths are not its walls' own")
	}
	if course.Encode(d) != data {
		t.Fatal("the decoded hole encodes to other bytes")
	}
	if got := Of(d); got != want {
		t.Errorf("the decoded hole's fingerprint is %s, want %s", got, want)
	}
	if a, b := Full(h), Full(d); a != b {
		t.Errorf("the decoded hole's full fingerprint is %s, want %s", b, a)
	}
	sum := sha256.Sum256([]byte(data))
	t.Logf("data %s/%s %s %s", h.World, strconv.Itoa(int(h.Order)), hex.EncodeToString(sum[:4]), hex.EncodeToString([]byte(data)))
}
