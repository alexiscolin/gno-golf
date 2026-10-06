//go:build builder

// builder.wasm's calls, beside golf.wasm's (main.go): the hole builder's
// (scripts/wasm.sh builds it with -tags builder; web/lib/builder/wasm.ts).
//
//	check(n, m)    PublishMine's checks (golf.Check); arg: slug (n), the data's hex (m), then the note
//	fit(margin)    a draft made publishable (golf.Fit); arg: its GG1 in hex
package main

import "gno.land/r/gnogolf/golf"

//go:wasmexport check
func check(n, m int32) {
	s := args()
	out = golf.Check(s[:n], s[n:n+m], s[n+m:])
}

//go:wasmexport fit
func fit(margin float64) { out = golf.Fit(args(), margin) }
