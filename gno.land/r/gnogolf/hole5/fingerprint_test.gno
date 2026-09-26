package hole5

import (
	"testing"

	"gno.land/p/gnogolf/course/fingerprint"
)

// The hole's shots, pinned: see fingerprint.Of.
func TestFingerprint(t *testing.T) { fingerprint.Check(t, me, "5af632c5b646f619") }
