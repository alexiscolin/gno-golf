package gnomes

import (
	"strconv"
	"strings"
	"testing"
)

// rowCases: what a row's name and traits may be (plainName, printable), one
// case a line: its field, "ok" or "no", and the text Go-quoted. The client's
// own check reads this same list (web/test/gnomes.test.ts: lib/gnomes/rows.ts
// plainName and printable), so the two rules never drift apart.
const rowCases = `
name ok "Heat-Suit Hal"
name ok "O'Brien Jr."
name ok "Zo\u00eb Bramblef\u00f6ot"
name ok "\u0141ucja \u00d8ster"
name ok "Gnome 721"
name ok "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
name ok "\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9"
name ok "\u00c0\u017f"
name no ""
name no "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
name no "\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9"
name no "x](https://e.vil/p) ![t](https://e.vil/t.png"
name no "Pip \u202egnp.evil"
name no "Pip <script>alert(1)</script>"
name no "Pip \ufffd"
name no "Pi\u200bp"
name no "Pip \u00d7"
name no "Pip \u00f7"
name no "\u041f\u0438\u043f"
name no "Pip_Pip"
name no "Pip|Pip"
name no "Pip\tPip"
name no "e\u0301"
name no "\u0180"
traits ok "x"
traits ok " ~"
traits ok "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
traits no ""
traits no "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
traits no "\u00e9"
traits no "a\tb"
traits no "\u007f"
`

func TestRowCasesAgree(t *testing.T) {
	for _, line := range strings.Split(strings.TrimSpace(rowCases), "\n") {
		f := strings.SplitN(line, " ", 3)
		s, err := strconv.Unquote(f[2])
		if err != nil {
			t.Error("unquoted: " + line)
			continue
		}
		got := plainName(s)
		if f[0] == "traits" {
			got = printable(s, maxTraits)
		}
		if got != (f[1] == "ok") {
			t.Error("not as the list says: " + line)
		}
	}
}
