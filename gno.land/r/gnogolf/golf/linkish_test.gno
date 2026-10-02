package golf

import (
	"strings"
	"testing"
)

// linkishRef is linkish as it was before its one byte pass (strings.ToLower,
// the look-alike dots replaced, then three scans): the reference its answers
// must equal, whatever the text.
func linkishRef(s string) bool {
	low := strings.ToLower(s)
	for _, d := range []string{"．", "。", "․", "﹒"} {
		low = strings.ReplaceAll(low, d, ".")
	}
	if strings.Contains(low, "www.") {
		return true
	}
	letter := func(c byte) bool { return c >= 'a' && c <= 'z' }
	digit := func(c byte) bool { return c >= '0' && c <= '9' }
	for i := 1; i+2 < len(low); i++ {
		if p := low[i-1]; low[i] == '.' && (letter(p) || digit(p)) && letter(low[i+1]) && letter(low[i+2]) {
			return true
		}
	}
	for _, w := range strings.Fields(low) {
		if strings.Count(w, ".") == 3 && strings.Trim(w, "0123456789.") == "" {
			return true
		}
	}
	return false
}

// linkish answers as linkishRef does: on names and notes, domains, IP
// addresses, every look-alike, the two runes that lower-case to ASCII, the
// spaces past ASCII, CJK, invalid UTF-8, and every string of up to three of
// the pieces these are made of.
func TestLinkishIsItsReference(t *testing.T) {
	cases := []string{
		"", "a", "claim at bonus.xyz", "see www.bonus", "WWW.X", "wWw.", "ww.w", "awww.", "awww, so close",
		"t.me/golf", "GNOGOLF.APP", "at 10.0.0.1 now", "1.2.3.4", "1.2.3.4.", "1.2.3", "...", "Hmm ... ok", "a...b",
		"１.２.３.４", "1．2．3．4", "1。2。3。4", "1.2.3.4\u00a0x", "x\u30001.2.3.4", "1.2.3.4\u2028", "\u00851.2.3.4",
		"1.2.3.4\u200b", "1.2.3.4\ufeff", "1.2.3.4\u1680y", "\t1.2.3.4\n", "\v1.2.3.4\f", "1.2.3.4\x00",
		"bonus．xyz", "win。app", "a․bc", "a﹒bc", "a．Bc", "Par 3. Mind the pond", "e.g. a pond, i.e. water",
		"St.Andrews", "St. Andrews", "x.Kom", "x.\u212aom", "x.İo", "x.İİ", "x.\u212a\u212a", "\u212a.co", "İ.co",
		"ww\u212a.", "WW\u212a．", "wwİ.", "ÀÉ.ÎÕ", "Ⱥ.ab", "a.Ⱥb", "é.co", "É.CO", "9.Zz", ".abc", "a.b", "a.bc",
		"ǅ.ab", "Ω.ab", "ſ.ab", "a.ſb", "ß.ab", "ﬀ.ab",
		"\xff.co", "x\xe2\x80.co", "\xe2\x80\xa4", "a\xe2\x80\xa4bc", "a\xe2\x80bc", "a\xef\xbc.bc", "a\xef\xef\xbc\x8ebc",
		"\xc4.co", "x.\xc4\xb0o", "x.\xc4o", "1\xff.2.3.4", "\xff1.2.3.4", "1.2.3.4\xff", "\xe3\x80\x80",
		"池に気をつけて、丘を越えてカップへ。", "池.co", "カップ。com", "1。2。3。4 は", "www。池",
		strings.Repeat("Par 3. Mind the pond, then 2.5 and a hill! ", 4),
		strings.ToUpper(strings.Repeat("Par 3. Mind the pond, then 2.5 and a hill! ", 4)),
		strings.Repeat("池に気をつけて、丘を越えてカップへ。", 8),
	}
	for i := 0; i < 256; i++ {
		b := string([]byte{byte(i)})
		cases = append(cases, "a."+string(rune(i))+"b", string(rune(i))+".ab", "a."+b+"b", b+".ab", "1.2.3"+b+"4", "1.2.3.4"+b)
	}
	for r := rune(0x80); r < 0x3100; r += 7 {
		cases = append(cases, "a."+string(r)+"b", string(r)+".ab", "a"+string(r)+"co", "1.2.3.4"+string(r)+"x")
	}
	for _, r := range []rune{0x85, 0xa0, 0x1680, 0x2000, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0x130, 0x131, 0x212a, 0x212b, 0x1e9e} {
		cases = append(cases, "1.2.3.4"+string(r)+"x", "x"+string(r)+"1.2.3.4", "a."+string(r)+"b", string(r)+".ab")
	}
	pieces := []string{"a", "Z", "w", "W", "1", ".", "．", "。", "İ", "\u212a", " ", "\u00a0", "\u3000", "é", "池", "\xff", "\xe2\x80"}
	n := len(cases)
	for _, a := range pieces {
		cases = append(cases, a)
		for _, b := range pieces {
			cases = append(cases, a+b)
			for _, c := range pieces {
				cases = append(cases, a+b+c, "x"+a+b+c+"yz", "www"+a+b+c, "1.2"+a+b+c)
			}
		}
	}
	if len(cases)-n < 4*len(pieces)*len(pieces)*len(pieces) {
		t.Fatal("the table is too small")
	}
	for _, c := range cases {
		if got, want := linkish(c), linkishRef(c); got != want {
			t.Errorf("linkish(%q) = %v, the reference says %v", c, got, want)
		}
	}
}
