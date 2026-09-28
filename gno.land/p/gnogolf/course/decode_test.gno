package course

import (
	"strings"
	"testing"

	"gno.land/p/gnogolf/physics"
)

// plain is a hole with a round, skinned zone first: four walls and a bunker.
func plain() *Simple {
	v := physics.V
	return &Simple{
		W: 32, H: 14, Title: "Plain", Strokes: 3, Tee: v(3, 7), Pin: v(28, 7),
		Substeps: 24, CupRadius: 1.2, World: "garden", Order: 1,
		Course: &physics.Field{
			Walls: []physics.Wall{
				{Seg: physics.Segment{A: v(1, 1), B: v(31, 1)}},
				{Seg: physics.Segment{A: v(31, 1), B: v(31, 13)}},
				{Seg: physics.Segment{A: v(31, 13), B: v(1, 13)}},
				{Seg: physics.Segment{A: v(1, 13), B: v(1, 1)}},
			},
			Zones:    []physics.Zone{{Kind: physics.Surface, Min: v(5, 2), Max: v(8, 5), Scale: 0.6, Round: true, Skin: "sand"}},
			Friction: 0.86, Bounce: 0.85, Radius: 0.5,
		},
	}
}

// zonesAt is the offset of the zones' count in a hole's data: found by the
// bytes its first zone, a round one, starts with.
func zonesAt(h *Simple, data string) int {
	e := &encoder{}
	e.u16(len(h.Course.Zones))
	e.u8(int(h.Course.Zones[0].Kind))
	e.u8(flagRound)
	e.vec(h.Course.Zones[0].Min)
	return strings.Index(data, string(e.b))
}

// The bytes no Encode writes are refused: an unknown flag, a skin past the
// table.
func TestUnwrittenBytesAreRefused(t *testing.T) {
	h := plain()
	data := Encode(h)
	if d, err := Decode(data); err != nil || d == nil {
		t.Fatal("the hole itself decodes")
	}
	z := zonesAt(h, data)
	if z < 0 {
		t.Fatal("zonesAt finds the zones")
	}
	refuse := func(what, data string) {
		if h, err := Decode(data); err == nil || h != nil {
			t.Errorf("%s: decoded", what)
		}
	}
	refuse("unknown zone flag", data[:z+3]+string(rune(0x10))+data[z+4:])
	refuse("skin index out of range", data[:z+2+62]+"\xff\x00"+data[z+2+64:])
}
