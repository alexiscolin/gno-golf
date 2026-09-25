package mountain16

import (
	"testing"

	"gno.land/p/gnogolf/course/fingerprint"
)

// The hole's shots, pinned: see fingerprint.Of.
func TestFingerprint(t *testing.T) { fingerprint.Check(t, me, "85b6a259e28095fe") }
