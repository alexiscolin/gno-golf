// Package jsonq quotes a string as JSON, so a name or a trait cannot break
// out of an answer: the quote, the backslash and every byte below 0x20
// escaped (one in a name would make the whole answer invalid JSON for every
// client), a byte that is not UTF-8 written as U+FFFD (JSON is UTF-8: as
// Go's encoding/json does), and U+2028 and U+2029 escaped (line ends to
// JavaScript). Most strings need nothing escaped: plain ASCII goes out as it
// is, without the copy (a byte at a time costs gas). It is golf/v2's jstr
// (state.gno), shared from the gnomes realm on; golf/v2 keeps its copy until
// its next version.
package jsonq

import "unicode/utf8"

// Quote is s as a JSON string, quotes included.
func Quote(s string) string {
	for i := 0; i < len(s); i++ {
		if c := s[i]; c == '"' || c == '\\' || c < 0x20 || c >= utf8.RuneSelf {
			return escape(s)
		}
	}
	return `"` + s + `"`
}

func escape(s string) string {
	const hex = "0123456789abcdef"
	b := make([]byte, 0, len(s)+2)
	b = append(b, '"')
	for i := 0; i < len(s); {
		c := s[i]
		switch {
		case c == '"' || c == '\\':
			b = append(b, '\\', c)
		case c < 0x20:
			b = append(b, '\\', 'u', '0', '0', hex[c>>4], hex[c&15])
		case c < utf8.RuneSelf:
			b = append(b, c)
		default:
			r, n := utf8.DecodeRuneInString(s[i:])
			switch {
			case r == utf8.RuneError && n == 1:
				b = append(b, "\ufffd"...)
			case r == '\u2028' || r == '\u2029':
				b = append(b, '\\', 'u', '2', '0', '2', hex[r&15])
			default:
				b = append(b, s[i:i+n]...)
			}
			i += n
			continue
		}
		i++
	}
	return string(append(b, '"'))
}
