package hole12

import (
	"testing"

	"gno.land/p/gnogolf/course/fingerprint"
)

// The hole's shots, pinned: see fingerprint.Of.
func TestFingerprint(t *testing.T) { fingerprint.Check(t, me, "daf52eccd906bce0") }
