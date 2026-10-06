//go:build builder

// builder.wasm's calls, beside golf.wasm's (main.go): the hole builder's
// (scripts/wasm.sh builds it with -tags builder; web/lib/builder/wasm.ts).
//
//	check(n, m)    PublishMine's checks (golf.Check); arg: slug (n), the data's hex (m), then the note
//	fit(n, margin) a draft made publishable (golf.Fit); arg: its GG1 in hex (n), then its bars
//	bar()          build.Bar's corners (golf.Bar); arg: "ax ay bx by thickness"
//	decode()       a hole's data as JSON, lossless (golf.Decode); arg: its hex
package main

import "gno.land/r/gnogolf/golf"

//go:wasmexport check
func check(n, m int32) {
	s := args()
	out = golf.Check(s[:n], s[n:n+m], s[n+m:])
}

//go:wasmexport fit
func fit(n int32, margin float64) {
	s := args()
	out = golf.Fit(s[:n], s[n:], margin)
}

//go:wasmexport bar
func bar() { out = golf.Bar(args()) }

//go:wasmexport decode
func decode() { out = golf.Decode(args()) }
