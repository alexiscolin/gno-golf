package jsonq

import (
	"testing"

	"gno.land/p/nt/uassert/v0"
)

// The quote, the backslash and every byte below 0x20 escaped, as golf/v2's
// jstr does; anything else as it is.
func TestAStringCannotBreakOutOfItsJSON(t *testing.T) {
	uassert.Equal(t, `"a\"b\\c\u000a\u0001\u001f"`, Quote("a\"b\\c\n\x01\x1f"))
	uassert.Equal(t, `"Pip Seedwell é ~"`, Quote("Pip Seedwell é ~"))
	uassert.Equal(t, `""`, Quote(""))
}
