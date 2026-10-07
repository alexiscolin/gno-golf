// Package jsonq quotes a string as JSON, so a name or a trait cannot break
// out of an answer: the quote, the backslash and every byte below 0x20
// escaped (one in a name would make the whole answer invalid JSON for every
// client). Most strings need nothing escaped: they go out as they are,
// without the copy (a byte at a time costs gas). It is golf/v2's jstr
// (state.gno), shared from the gnomes realm on; golf/v2 keeps its copy until
// its next version.
package jsonq

// Quote is s as a JSON string, quotes included.
func Quote(s string) string {
	for i := 0; i < len(s); i++ {
		if c := s[i]; c == '"' || c == '\\' || c < 0x20 {
			return escape(s)
		}
	}
	return `"` + s + `"`
}

func escape(s string) string {
	const hex = "0123456789abcdef"
	b := make([]byte, 0, len(s)+2)
	b = append(b, '"')
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == '"' || c == '\\':
			b = append(b, '\\', c)
		case c < 0x20:
			b = append(b, '\\', 'u', '0', '0', hex[c>>4], hex[c&15])
		default:
			b = append(b, c)
		}
	}
	return string(append(b, '"'))
}
