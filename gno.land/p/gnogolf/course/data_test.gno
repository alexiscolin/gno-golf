package course

import (
	"math"
	"strings"
	"testing"

	"gno.land/p/gnogolf/physics"
)

// every is a hole with one of each thing GG1 stores: style runs, a timed and
// a soft wall, posts, every zone kind and flag, a polygon, pulses with pieces
// of all three sorts, a -0.
func every() *Simple {
	v := physics.V
	lane := physics.Outline(physics.Stadium(v(1, 1), v(30, 12), 4)...)
	walls := physics.Walls(lane,
		physics.Timed(physics.Bar(v(12, 2), v(12, 6), 0.5, 'T', "tram"), 12, 5, 3),
		physics.Soft(physics.Bar(v(20, 8), v(24, 8), 0.4, 'h', "hay"), 0.3))
	return Fit(&Simple{
		W: 32, H: 14, Title: "Everything", Strokes: 4, Tee: v(3, 6), Pin: v(28, 6),
		Substeps: 24, CupRadius: 1.2, World: "island", Order: 7, Shelter: 0.1,
		Course: &physics.Field{
			Walls: walls,
			Posts: []physics.Post{{Circle: physics.Circle{C: v(16, 4), R: 0.8}, Bounce: 1.2, Mark: 'o', Skin: "palm"}},
			Zones: []physics.Zone{
				{Kind: physics.Surface, Min: v(5, 2), Max: v(8, 5), Scale: 0.6, Round: true, Skin: "sand"},
				{Kind: physics.Slope, Min: v(9, 7), Max: v(14, 11), Vec: v(math.Copysign(0, -1), -0.2), Mark: '^', Air: true, Capped: true, Every: 6, On: 3, Phase: 1},
				{Kind: physics.Tunnel, Min: v(17, 9), Max: v(19, 11), Vec: v(25, 4), Skin: "cave"},
				{Kind: physics.Hazard, Min: v(0, 0), Max: v(32, 14), Vec: v(3, 6), Skin: "sea",
					Poly: []physics.Vec2{v(1, 1), v(31, 1), v(31, 13), v(1, 13)}, Outside: true},
				{Kind: physics.Loop, Min: v(26, 2), Max: v(28, 4), Vec: v(22, 3), Scale: 0.9, Skin: "loop"},
			},
			Friction: 0.86, Bounce: 0.85, Radius: 0.5,
		},
		Pulses: []Pulse{
			{Every: 2, On: 1, Walls: physics.Bar(v(10, 9), v(10, 11), 0.5, '=', "gate door")},
			{Every: 3, On: 1, Phase: 2, Posts: []physics.Post{{Circle: physics.Circle{C: v(22, 10), R: 0.6}, Skin: "crab"}},
				Zones: []physics.Zone{{Kind: physics.Surface, Min: v(6, 8), Max: v(8, 10), Scale: 0.5, Round: true, Skin: "puddle"}}},
		},
	}, 1.5)
}

func TestAHoleSurvivesAsData(t *testing.T) {
	h := every()
	data := Encode(h)
	d, err := Decode(data)
	if err != nil {
		t.Fatal(err.Error())
	}
	if diff := Diff(h, d); diff != "" {
		t.Fatal("the decoded hole differs: " + diff)
	}
	if !Exact(d) {
		t.Fatal("the stored lengths are the walls' own")
	}
	if Encode(d) != data {
		t.Fatal("the decoded hole encodes to other bytes")
	}
	if !math.Signbit(d.Course.Zones[1].Vec.X) {
		t.Fatal("a -0 comes back -0")
	}
	for _, a := range []float64{0, 1.3, 2.9, 4.4} {
		s1, h1 := h.PreviewWith(h.Tee, a, 7, 1, 3, nil)
		s2, h2 := d.PreviewWith(d.Tee, a, 7, 1, 3, nil)
		if h1 != h2 || len(s1.Path) != len(s2.Path) || s1.Rest() != s2.Rest() {
			t.Fatalf("a shot at %v plays otherwise decoded", a)
		}
	}
}

// Diff sees every field: change one, anywhere, and it says which.
func TestDiffSeesEveryField(t *testing.T) {
	for _, c := range []struct {
		field string
		edit  func(h *Simple)
	}{
		{"Title", func(h *Simple) { h.Title = "x" }},
		{"Order", func(h *Simple) { h.Order = 8 }},
		{"Shelter", func(h *Simple) { h.Shelter = 0 }},
		{"Course.Walls[10].Mark", func(h *Simple) { h.Course.Walls[10].Mark = 'x' }},
		{"Course.Walls[10].Phase", func(h *Simple) { h.Course.Walls[10].Phase = 4 }},
		{"Course.Posts[0].Skin", func(h *Simple) { h.Course.Posts[0].Skin = "rock" }},
		{"Course.Zones[1].Air", func(h *Simple) { h.Course.Zones[1].Air = false }},
		{"Course.Zones[1].Capped", func(h *Simple) { h.Course.Zones[1].Capped = false }},
		{"Course.Zones[1].Vec.X", func(h *Simple) { h.Course.Zones[1].Vec.X = 0 }},
		{"Course.Zones[3].Outside", func(h *Simple) { h.Course.Zones[3].Outside = false }},
		{"Course.Zones[3].Poly[2].Y", func(h *Simple) { h.Course.Zones[3].Poly[2].Y += 1e-12 }},
		{"Course.prep", func(h *Simple) {
			h.Course.Walls[0].Seg.A.X += 1e-9
			physics.Prepare(h.Course)
			h.Course.Walls[0].Seg.A.X -= 1e-9
		}},
		{"Pulses[1].Phase", func(h *Simple) { h.Pulses[1].Phase = 1 }},
		{"Pulses[1].Zones[0].Skin", func(h *Simple) { h.Pulses[1].Zones[0].Skin = "" }},
	} {
		a, b := every(), every()
		c.edit(b)
		if got := Diff(a, b); !strings.HasPrefix(got, c.field) {
			t.Errorf("a change to %s: Diff says %q", c.field, got)
		}
	}
	if got := Diff(every(), every()); got != "" {
		t.Errorf("the same hole twice: %q", got)
	}
}

// The tripwire: these literals name every field of every type GG1 stores,
// by position. A field added to any of them stops this from building —
// Encode, Decode, Diff and fingerprint.Full must learn it first
// (physics.Field's own is in physics).
var _ = []any{
	physics.Vec2{0, 0},
	physics.Segment{physics.Vec2{}, physics.Vec2{}},
	physics.Circle{physics.Vec2{}, 0},
	physics.Wall{physics.Segment{}, 0, 0, "", 0, 0, 0},
	physics.Post{physics.Circle{}, 0, 0, ""},
	physics.Zone{0, physics.Vec2{}, physics.Vec2{}, physics.Vec2{}, 0, 0, "", false, nil, false, 0, 0, 0, false, false},
	Pulse{0, 0, 0, nil, nil, nil},
	Simple{Marks{}, 0, 0, "", 0, physics.Vec2{}, physics.Vec2{}, nil, nil, 0, 0, "", 0, 0},
}

// zonesAt is the offset of the zones' count in the data of every(): found
// by the bytes its first zone starts with.
func zonesAt(h *Simple, data string) int {
	e := &encoder{}
	e.u16(len(h.Course.Zones))
	e.u8(int(h.Course.Zones[0].Kind))
	e.u8(flagRound)
	e.vec(h.Course.Zones[0].Min)
	return strings.Index(data, string(e.b))
}

func TestHostileDataIsRefused(t *testing.T) {
	good := Encode(every())
	refuse := func(what, data string) {
		if h, err := Decode(data); err == nil || h != nil {
			t.Errorf("%s: decoded", what)
		}
	}
	for i := 0; i < len(good); i++ {
		refuse("truncated", good[:i])
	}
	refuse("trailing bytes", good+"\x00")
	refuse("magic", "GG2"+good[3:])

	edits := []struct {
		what string
		edit func(h *Simple)
	}{
		{"board 0", func(h *Simple) { h.W = 0 }},
		{"board 97", func(h *Simple) { h.H = 97 }},
		{"substeps 61", func(h *Simple) { h.Substeps = 61 }},
		{"par 20", func(h *Simple) { h.Strokes = 20 }},
		{"world", func(h *Simple) { h.World = "Island" }},
		{"no world", func(h *Simple) { h.World = "" }},
		{"order", func(h *Simple) { h.Order = 1000 }},
		{"cup 0", func(h *Simple) { h.CupRadius = 0 }},
		{"shelter", func(h *Simple) { h.Shelter = 1.5 }},
		{"friction 1", func(h *Simple) { h.Course.Friction = 1 }},
		{"ball", func(h *Simple) { h.Course.Radius = 1.1 }},
		{"bounce", func(h *Simple) { h.Course.Walls[14].Bounce = 1.6 }},
		{"off the board", func(h *Simple) { h.Tee.X = float64(h.W) + 1.01 }},
		{"a wall off the board", func(h *Simple) { h.Course.Walls[3].Seg.B.Y = -1.5 }},
		{"post radius", func(h *Simple) { h.Course.Posts[0].R = 0 }},
		{"kind 5", func(h *Simple) { h.Course.Zones[0].Kind = 5 }},
		{"scale", func(h *Simple) { h.Course.Zones[0].Scale = 9 }},
		{"slope push", func(h *Simple) { h.Course.Zones[1].Vec.Y = -1.2 }},
		{"a slope past its steepest grade", func(h *Simple) { h.Course.Zones[1].Vec = physics.V(0.7, 0.7) }},
		{"a tunnel off the board", func(h *Simple) { h.Course.Zones[2].Vec.X = -3 }},
		{"a zone's box far off the board", func(h *Simple) { h.Course.Zones[0].Max.X = float64(h.W) + MaxBoard + 1 }},
		{"phase = every", func(h *Simple) { h.Course.Zones[1].Phase = 6 }},
		{"on > every", func(h *Simple) { h.Course.Walls[10].On = 13 }},
		{"negative phase", func(h *Simple) { h.Course.Walls[10].Phase = -1 }},
		{"untimed phase", func(h *Simple) { h.Course.Walls[0].Phase = 2 }},
		{"every", func(h *Simple) { h.Course.Walls[10].Every = MaxTiming + 1 }},
		{"negative phase", func(h *Simple) { h.Pulses[0].Phase = -1 }},
		{"a two-point polygon", func(h *Simple) { h.Course.Zones[3].Poly = h.Course.Zones[3].Poly[:2] }},
		{"a 65-point polygon", func(h *Simple) {
			z := &h.Course.Zones[3]
			for len(z.Poly) < MaxPoly+1 {
				z.Poly = append(z.Poly, physics.V(5, 5))
			}
		}},
		{"513 polygon points", func(h *Simple) {
			for i := 0; i < 8; i++ {
				z := h.Course.Zones[3]
				z.Poly = make([]physics.Vec2, MaxPoly)
				h.Pulses[1].Zones = append(h.Pulses[1].Zones, z)
			}
		}},
		{"161 walls", func(h *Simple) {
			for len(h.Course.Walls) <= MaxWalls {
				h.Course.Walls = append(h.Course.Walls, h.Course.Walls[0])
			}
		}},
		{"pulse walls over the total", func(h *Simple) {
			for len(h.Course.Walls)+len(h.Pulses[0].Walls) <= MaxWalls {
				h.Pulses[0].Walls = append(h.Pulses[0].Walls, h.Pulses[0].Walls[0])
			}
		}},
		{"33 posts", func(h *Simple) {
			for len(h.Course.Posts) <= MaxPosts {
				h.Course.Posts = append(h.Course.Posts, h.Course.Posts[0])
			}
		}},
		{"33 zones", func(h *Simple) {
			for len(h.Course.Zones) <= MaxZones {
				h.Course.Zones = append(h.Course.Zones, h.Course.Zones[0])
			}
		}},
		{"17 pulses", func(h *Simple) {
			for len(h.Pulses) <= MaxPulses {
				h.Pulses = append(h.Pulses, h.Pulses[0])
			}
		}},
		{"65 skins", func(h *Simple) {
			for i := 0; i <= MaxSkins; i++ {
				w := h.Course.Walls[0]
				w.Skin = "s" + string(rune('a'+i%26)) + string(rune('a'+i/26))
				h.Course.Walls = append(h.Course.Walls, w)
			}
		}},
	}
	for _, e := range edits {
		h := every()
		e.edit(h)
		refuse(e.what, Encode(h))
	}

	// every float slot, NaN and the infinities
	nan, inf := math.NaN(), math.Inf(1)
	for _, bad := range []float64{nan, inf, -inf} {
		for i, set := range []func(h *Simple){
			func(h *Simple) { h.Order = bad },
			func(h *Simple) { h.Tee.Y = bad },
			func(h *Simple) { h.Pin.X = bad },
			func(h *Simple) { h.CupRadius = bad },
			func(h *Simple) { h.Shelter = bad },
			func(h *Simple) { h.Course.Friction = bad },
			func(h *Simple) { h.Course.Bounce = bad },
			func(h *Simple) { h.Course.Radius = bad },
			func(h *Simple) { h.Course.Walls[2].Seg.A.X = bad },
			func(h *Simple) { h.Course.Walls[14].Bounce = bad },
			func(h *Simple) { h.Course.Posts[0].C.Y = bad },
			func(h *Simple) { h.Course.Posts[0].R = bad },
			func(h *Simple) { h.Course.Posts[0].Bounce = bad },
			func(h *Simple) { h.Course.Zones[0].Min.X = bad },
			func(h *Simple) { h.Course.Zones[0].Max.Y = bad },
			func(h *Simple) { h.Course.Zones[1].Vec.X = bad },
			func(h *Simple) { h.Course.Zones[2].Vec.Y = bad },
			func(h *Simple) { h.Course.Zones[4].Scale = bad },
			func(h *Simple) { h.Course.Zones[3].Poly[1].X = bad },
			func(h *Simple) { h.Pulses[0].Walls[1].Seg.B.Y = bad },
			func(h *Simple) { h.Pulses[1].Posts[0].R = bad },
			func(h *Simple) { h.Pulses[1].Zones[0].Min.Y = bad },
		} {
			h := every()
			set(h)
			refuse("float slot "+string(rune('a'+i)), Encode(h))
		}
	}

	// a stored length one ulp off decodes (Decode trusts them), and Exact
	// catches it: it is what a publish checks
	h := every()
	data := Encode(h)
	l, _, _ := physics.Lengths(h.Course.Walls[0].Seg, h.Course.Radius)
	var lb, ob [8]byte
	u, o := math.Float64bits(l), math.Float64bits(math.Nextafter(l, 2*l))
	for i := 0; i < 8; i++ {
		lb[i], ob[i] = byte(u>>(8*i)), byte(o>>(8*i))
	}
	i := strings.Index(data, string(lb[:]))
	if i < 0 {
		t.Fatal("the first wall's length is in the data")
	}
	off := data[:i] + string(ob[:]) + data[i+8:]
	d, err := Decode(off)
	if err != nil {
		t.Fatalf("a length an ulp off still decodes: %s", err.Error())
	}
	if Exact(d) {
		t.Fatal("Exact passes a length an ulp off")
	}
	if good, _ := Decode(data); !Exact(good) {
		t.Fatal("Exact fails the hole's own lengths")
	}
	if c, err := DecodeChecked(off); err == nil || c != nil {
		t.Fatal("DecodeChecked passes a length an ulp off")
	}
	if c, err := DecodeChecked(data); err != nil || Encode(c) != data {
		t.Fatal("DecodeChecked refuses the hole's own lengths")
	}

	// the bytes no Encode writes: an unknown flag, a skin past the table
	z := zonesAt(h, data)
	if z < 0 {
		t.Fatal("zonesAt finds the zones")
	}
	flags := data[:z+3] + string(rune(0x10)) + data[z+4:]
	refuse("unknown zone flag", flags)
	skin := data[:z+2+62] + "\xff\x00" + data[z+2+64:]
	refuse("skin index out of range", skin)
}
