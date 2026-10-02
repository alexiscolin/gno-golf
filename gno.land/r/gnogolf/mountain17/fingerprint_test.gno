package mountain17

import (
	"testing"

	"gno.land/p/gnogolf/course/fingerprint"
)

// The hole's shots, pinned: see fingerprint.Of.
func TestFingerprint(t *testing.T) { fingerprint.Check(t, me, "859e5c4b7e68e559") }
