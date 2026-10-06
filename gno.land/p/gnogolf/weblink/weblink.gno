// Package weblink is the rule a link the owner of a realm sets must follow
// before a page or an answer shows it: https://, at most MaxLen of letters,
// digits and "-._~/:%", with no query or fragment (a page adds its own), no
// space and nothing a markdown link could break out of. It is golf/v2's
// SetPlayURL rule (owner.gno validURL), shared from the gnomes realm on;
// golf/v2 keeps its copy until its next version.
package weblink

import "strings"

// MaxLen is the longest link taken.
const MaxLen = 100

// Valid reports whether u is a link as the rule says.
func Valid(u string) bool {
	if len(u) > MaxLen || !strings.HasPrefix(u, "https://") || len(u) == len("https://") {
		return false
	}
	for i := 0; i < len(u); i++ {
		c := u[i]
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || strings.IndexByte("-._~/:%", c) >= 0) {
			return false
		}
	}
	return true
}
