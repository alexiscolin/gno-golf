package island18

import (
	"testing"

	"gno.land/p/gnogolf/course/fingerprint"
)

// The hole's shots, pinned: see fingerprint.Of.
func TestFingerprint(t *testing.T) { fingerprint.Check(t, me, "a90784adeee2d145") }
