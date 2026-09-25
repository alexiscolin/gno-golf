package golf

import (
	"crypto/sha256"
	"encoding/hex"
	"math"
	"strconv"
	"strings"
	"testing"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
)

// Every course hole published as data plays through golf as the hole its
// realm declares, bit for bit.
//
// The chain of proof: each hole's own test (fingerprint.Check) proves that
// Decode(Encode(me)) is its realm value me field by field, prep included,
// and plays the same shots; data/holes.txt is that Encode(me), logged by the
// same check (scripts/holedata.sh), and courseData is data/holes.txt. So the
// course.Simple decoded here from that data is the realm's hole. This test
// then plays that Simple directly against the published version, in the same
// weather laid on both: calm, rain, wind and storm, from the tee, on stroke 0
// at tick 0 and on stroke 1 at tick 5, previewed and played; and checks that
// both give a renderer the same pieces, and golf's listing the hole's own
// name, par, world and order.
func TestDataPlaysAsTheRealmHole(cur realm, t *testing.T) {
	for _, d := range courseData {
		raw, err := hex.DecodeString(d[3])
		if err != nil {
			t.Fatalf("%s: not hex", d[0])
		}
		if sum := sha256.Sum256(raw); hex.EncodeToString(sum[:4]) != d[2] {
			t.Fatalf("%s: its data is not the sha it is listed with", d[0])
		}
		me, err := course.Decode(string(raw))
		if err != nil {
			t.Fatalf("%s: %s", d[0], err.Error())
		}
		vid := publish(cur, me)
		if vid != d[0]+"/v1" {
			t.Fatalf("%s: published as %s", d[0], vid)
		}
		de := mustHole(vid)
		var rh course.Hole = me
		dh := de.hole()

		if name := cleanName(me.Title); name != de.name || course.ParOf(me) != de.par || me.World != de.world || me.Order != de.order {
			t.Errorf("%s: the listing differs: %q %d %s %v, data %q %d %s %v", d[0], name, course.ParOf(me), me.World, me.Order, de.name, de.par, de.world, de.order)
		}
		if a, b := pieceJSON(rh), pieceJSON(dh); a != b {
			t.Errorf("%s: the pieces a client draws differ", d[0])
		}
		_, rain := course.WeatherFor(course.Rain, me, 7)
		_, wind := course.WeatherFor(course.Wind, me, 11)
		_, storm := course.WeatherFor(course.Storm, me, 13)
		for wi, weather := range [][]physics.Zone{nil, rain, wind, storm} {
			for a := 0; a < 360; a += 90 {
				angle := float64(a+wi*20) * math.Pi / 180
				for stroke := 0; stroke < 2; stroke++ {
					want := shotKey(previewAt(rh, me.Tee, angle, 6.5, stroke, 5*stroke, weather))
					if got := shotKey(previewAt(dh, me.Tee, angle, 6.5, stroke, 5*stroke, weather)); got != want {
						t.Errorf("%s: the preview differs at %d°, stroke %d, weather %d", d[0], a, stroke, wi)
					}
					if got := shotKey(playAt(dh, me.Tee, angle, 6.5, stroke, 5*stroke, weather)); got != want {
						t.Errorf("%s: the played shot differs at %d°, stroke %d, weather %d", d[0], a, stroke, wi)
					}
				}
			}
		}
		if n := sumWear(de); n != 32 {
			t.Errorf("%s: 32 shots played, %d marks on its wear", d[0], n)
		}
	}
}

// pieceJSON is what a client draws a hole from: its board, tee, cup, pieces
// and the extras of its first strokes.
func pieceJSON(h course.Hole) string {
	f := h.Field()
	s := boardJSON(h) + jvec(h.Start()) + jvec(h.Cup()) + strconv.FormatBool(isTimed(h)) +
		wallsJSON(f.Walls) + postsJSON(f.Posts) + zonesJSON(f.Zones, true)
	if tm, ok := h.(course.Timed); ok {
		for stroke := 0; stroke < 4; stroke++ {
			ws, ps := tm.Extras(stroke)
			s += wallsJSON(ws) + postsJSON(ps) + zonesJSON(extraZones(h, stroke), true)
		}
	}
	return s
}

// shotKey is everything a shot is, bit for bit.
func shotKey(sh physics.Shot, holed bool) string {
	var sb strings.Builder
	for i, p := range sh.Path {
		sb.WriteString(strconv.FormatUint(math.Float64bits(p.X), 16) + "," + strconv.FormatUint(math.Float64bits(p.Y), 16))
		if i < len(sh.Air) && sh.Air[i] {
			sb.WriteString("A")
		}
		sb.WriteString(";")
	}
	return sb.String() + string(sh.Cause) + strconv.Itoa(sh.Bounces) + strconv.FormatBool(holed)
}
