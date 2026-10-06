//go:build builder

// builder.wasm's calls, beside golf.wasm's (main.go): the hole builder's
// (scripts/wasm.sh builds it with -tags builder; web/lib/builder/wasm.ts).
//
//	check(n, m)    PublishMine's checks (golf.Check); arg: slug (n), the data's hex (m), then the note
//	fit(n, margin) a draft made publishable (golf.Fit); arg: its GG1 in hex (n), then its bars
//	bar()          build.Bar's corners (golf.Bar); arg: "ax ay bx by thickness"
//	decode()       a hole's data as JSON, lossless (golf.Decode); arg: its hex
//	setperiod(p)   the test clock (golf.SetPeriod): what Period answers
//	state()        HoleState; arg: a loaded hole's id
//	extras(stroke) Extras; arg: the id
//	forecast(p)    Weather; arg: the id
//	find(n, from)  the latest period of a weather kind (golf.Find); arg: id (n), then the kind; -1 if none
//	commit(n, x, y, stroke, period)  SimulateCommit; arg: id (n), then the shots
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

//go:wasmexport setperiod
func setperiod(p int64) { golf.SetPeriod(p) }

//go:wasmexport state
func state() { out = golf.HoleState(args()) }

//go:wasmexport extras
func extras(stroke int32) { out = golf.Extras(args(), int(stroke)) }

//go:wasmexport forecast
func forecast(period int64) { out = golf.Weather(args(), period) }

//go:wasmexport find
func find(n int32, from int64) int64 {
	s := args()
	return golf.Find(s[:n], s[n:], from)
}

//go:wasmexport commit
func commit(n int32, x, y float64, stroke int32, period int64) {
	s := args()
	out = golf.SimulateCommit(s[:n], x, y, int(stroke), s[n:], period)
}
