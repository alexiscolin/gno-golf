package weblink

import (
	"strings"
	"testing"

	"gno.land/p/nt/uassert/v0"
)

// The rule golf/v2's SetPlayURL holds a link to (owner.gno validURL), the
// same cases: https:// and up to 100 of a-z, A-Z, 0-9 and -._~/:%, with no
// query, fragment, space or markup.
func TestALinkIsHTTPSAndPlain(t *testing.T) {
	for _, bad := range []string{"", "http://example.org/", "https://", "https://x.org/?a=1", "https://x.org/#top", "https://x.org/a b",
		"https://x.org/)[x](y", "javascript:alert(1)", "https://" + strings.Repeat("x", 100)} {
		uassert.False(t, Valid(bad), bad)
	}
	for _, good := range []string{"https://gnogolf.xyz/", "https://golf.example.org/play/", "https://x.org/a-b_c.d~e%20/:8"} {
		uassert.True(t, Valid(good), good)
	}
	uassert.True(t, Valid("https://"+strings.Repeat("x", MaxLen-len("https://"))), "at the limit")
}
