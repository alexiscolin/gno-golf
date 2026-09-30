// The aim preview's physics in the browser (scripts/wasm.sh builds it): the
// realm's reads, answered byte for byte. A call takes its strings in one
// buffer (arg: n bytes, the host writes them) and its numbers as arguments,
// and leaves its answer at out, outlen bytes. A refusal is the realm's panic,
// which TinyGo prints ("panic: " and the realm's sentence) before it traps:
// the host keeps the line and starts a new instance (web/lib/sim/host.ts).
//
//	load(n)                            arg: id then HoleData's hex, n the id's length
//	from(n, x, y, m, stroke, period)   SimulateFrom; arg: id (n), then the shot (m)
//	round(n, period)                   SimulateRoundAt, less its clock; arg: id (n), then the shots
//	sources()                          {path: sha256} of the .gno files it is built from
package main

import (
	"unsafe"

	"gno.land/r/gnogolf/golf"
)

var arg []byte
var out string

//go:wasmexport arg
func argBuf(n int32) *byte {
	arg = make([]byte, n+1) // never empty: its first byte has an address
	return &arg[0]
}

func args() string { return string(arg[:len(arg)-1]) }

//go:wasmexport load
func load(n int32) {
	s := args()
	golf.Load(s[:n], s[n:])
}

//go:wasmexport from
func from(n int32, x, y float64, m int32, stroke int32, period int64) {
	s := args()
	out = golf.SimulateFrom(s[:n], x, y, s[n:n+m], int(stroke), period)
}

//go:wasmexport round
func round(n int32, period int64) {
	s := args()
	out = golf.Round(s[:n], s[n:], period)
}

//go:wasmexport sources
func sourcesOut() { out = sources }

//go:wasmexport out
func outPtr() *byte { return unsafe.StringData(out) }

//go:wasmexport outlen
func outLen() int32 { return int32(len(out)) }

func main() {}
