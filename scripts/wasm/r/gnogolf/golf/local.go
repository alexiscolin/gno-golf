package golf

// The realm's storage as a local preview has it, the one hand-written part
// of this package: golf.go is golf's own code, extracted (scripts/wasm.sh).
// A hole is what the chain keeps of it: its version's id, its data (HoleData)
// and the world it plays in, its data's own, as dataEntry sets it.

import "gno.land/p/gnogolf/course"

type entry struct{ id, world string }

type store map[string]string

// Get is the realm's view's: false for a hole never loaded.
func (s store) Get(k string) (string, bool) {
	v, ok := s[k]
	return v, ok
}

var (
	entries  = map[string]*entry{}
	holeData = store{}
)

func readHole(id string) *entry {
	if e := entries[id]; e != nil {
		return e
	}
	panic(errUnknownHole + id)
}

// Period is never behind the round the page asks for: notAhead is the
// chain's clock, not a rule of the physics.
func Period() int64 { return 1<<63 - 1 }

// Load keeps a hole's data, HoleData's hex, under its version's id.
func Load(id, hexData string) {
	b := unhex(hexData)
	h, err := course.Decode(b)
	if err != nil {
		panic("golf: " + err.Error())
	}
	holeData[id] = b
	entries[id] = &entry{id: id, world: h.World}
}

// unhex is encoding/hex's DecodeString without the fmt it imports (a third
// of the module).
func unhex(s string) string {
	if len(s)%2 != 0 {
		panic("golf: the data is not hex")
	}
	b := make([]byte, len(s)/2)
	for i := range b {
		b[i] = nib(s[2*i])<<4 | nib(s[2*i+1])
	}
	return string(b)
}

func nib(c byte) byte {
	switch {
	case c >= '0' && c <= '9':
		return c - '0'
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10
	}
	panic("golf: the data is not hex")
}

// Round is SimulateRoundAt without its clock (playablePeriod): the replay.
func Round(id, shots string, period int64) string { return simulateRound(id, nil, 0, shots, period) }
