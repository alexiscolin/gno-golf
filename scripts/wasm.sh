#!/bin/sh
# wasm.sh [--check]: the aim preview's physics for the browser,
# web/lib/sim/golf.wasm, built from the deployed .gno sources themselves: no
# fork to maintain. The page runs it in a worker (web/lib/sim/), checks its
# sources against the realm's first, and checks every answer the chain gives
# it against its own (web/lib/engine/aim.ts).
#
# The Go sources are the .gno files, as they are, in a Go module named
# gno.land (scripts/wasm/go.mod), so their import paths stay what they are:
#   - p/gnogolf/physics and p/gnogolf/course: every file but the tests,
#     copied (.gno to .go);
#   - p/nt/ufmt/v0: the onyx toolchain's, copied the same way (golf's
#     refusals print with it);
#   - r/gnogolf/golf: the declarations SimulateFrom and simulateRound reach,
#     extracted whole from the realm's files (scripts/wasm/extract), with the
#     realm's storage (a hole's data by its id, readHole) and its clock
#     (Period) given by scripts/wasm/r/gnogolf/golf/local.go, the one
#     hand-written file of the package, which adds Load and Round;
#   - math: the GnoVM's own (gnovm/stdlibs/math of the onyx toolchain's
#     GNOROOT: Go's pure-Go files, and native.go for the four bit casts it
#     injects), as gnovm/math: the one change to the copied files is their
#     import "math", which names it.
# The generated files are not kept (.gitignore); golf.wasm is, and embeds the
# sha256 of every .gno file of the realm's it was built from (sources()): the
# page reads the deployed files back and compares before it trusts a preview.
#
# The same numbers as the chain's. The GnoVM computes every float64 operation
# in software (gnovm/pkg/gnolang/internal/softfloat), correctly rounded as
# IEEE 754 says: the node's CPU plays no part. WebAssembly's f64 add, sub,
# mul, div, sqrt, min, max, conversions, floor, ceil and trunc are IEEE 754's
# correctly rounded operations too, and it has no fused multiply-add
# (WebAssembly 1.0 has none; TinyGo asks LLVM for no contraction and no
# relaxed SIMD): nothing is fused or kept in a wider precision. The math
# functions (Sqrt, Sin, Cos, Atan2, Mod, Round, Abs, Signbit, Float64bits…)
# are the GnoVM's very source, not TinyGo's (which calls a C libm for Sin, Cos
# and Atan2, and LLVM's intrinsics for others). strconv is Go's on both sides,
# and what it prints is fixed by its spec (shortest, or correctly rounded).
# The proof is the parity test, scripts/wasmparity.ts, which --check runs.
#
# TinyGo, not Go's own wasm port: 70 KB gzipped against 700 (Go's runtime
# alone is 570). -scheduler none and the wasip1 target: no JS glue but three
# imports (fd_write, proc_exit, random_get), and no goroutine machinery.
#
# Reproducible: TinyGo and its Go are pinned (TINYGO_VERSION, GOTOOLCHAIN),
# no debug information. --check rebuilds into a scratch folder, fails if the
# committed golf.wasm is not that build, then runs the parity test.
#
# GNO is the onyx gno binary (default: the toolchain's, in GNO_TOOLCHAIN: see
# check.sh), for its GNOROOT; TINYGO the tinygo binary (default: in PATH).
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
here=$root/scripts/wasm
toolchain=${GNO_TOOLCHAIN:-${XDG_CACHE_HOME:-$HOME/.cache}/gno-toolchains/onyx}
GNO=${GNO:-$toolchain/gno}
TINYGO=${TINYGO:-tinygo}
TINYGO_VERSION=0.42.0
export GOTOOLCHAIN=go1.26.0
if ! "$TINYGO" version 2>/dev/null | grep -q "^tinygo version $TINYGO_VERSION "; then
	echo "wasm.sh: TinyGo $TINYGO_VERSION is needed (brew install tinygo-org/tools/tinygo, or set TINYGO); found: $("$TINYGO" version 2>&1 || true)" >&2
	exit 1
fi
gnoroot=$(GNOHOME=$toolchain/gnohome "$GNO" env GNOROOT | sed 's/^GNOROOT="\(.*\)"$/\1/')

rm -rf "$here/p" "$here/gnovm"
gnomath() { sed -e 's#^import "math"$#import "gno.land/gnovm/math"#' -e 's#^\(	*\)"math"$#\1"gno.land/gnovm/math"#'; }
copy() { # copy <from dir> <to dir>: the package's files but its tests
	mkdir -p "$2"
	for f in "$1"/*.gno; do
		case $f in *_test.gno | *_filetest.gno) continue ;; esac
		gnomath <"$f" >"$2/$(basename "$f" .gno).go"
	done
}
copy "$root/gno.land/p/gnogolf/physics" "$here/p/gnogolf/physics"
copy "$root/gno.land/p/gnogolf/course" "$here/p/gnogolf/course"
copy "$gnoroot/examples/gno.land/p/nt/ufmt/v0" "$here/p/nt/ufmt/v0"
copy "$gnoroot/gnovm/stdlibs/math" "$here/gnovm/math"
rm "$here/gnovm/math/native.go" # native.gno: the natives' declarations, bodiless
cp "$gnoroot/gnovm/stdlibs/math/native.go" "$here/gnovm/math/native.go"
golf=$(cd "$here" && go run ./extract "$root/gno.land/r/gnogolf/golf" r/gnogolf/golf/golf.go \
	entry,readHole,holeData,Period SimulateFrom simulateRound entry.hole)
gnomath <"$here/r/gnogolf/golf/golf.go" >"$here/r/gnogolf/golf/golf.go.tmp"
mv "$here/r/gnogolf/golf/golf.go.tmp" "$here/r/gnogolf/golf/golf.go"
if grep -rln '^import "math"$\|^	"math"$' "$here/p" "$here/r" "$here/gnovm" --include=*.go | grep -v '/gnovm/math/native.go$'; then
	echo "wasm.sh: a file above still imports Go's math" >&2
	exit 1
fi

# sources: the realm's files it is built from, as the repo has them (the
# page reads the deployed ones back through stage.sh's prefix)
{
	echo "// Code generated by scripts/wasm.sh. DO NOT EDIT."
	echo
	echo "package main"
	echo
	printf '%s' 'const sources = `{'
	sep=""
	for f in $(cd "$root" && ls gno.land/p/gnogolf/physics/*.gno gno.land/p/gnogolf/course/*.gno | grep -Ev '_(file)?test\.gno$') \
		$(for g in $golf; do echo "gno.land/r/gnogolf/golf/$g"; done); do
		printf '%s"%s":"%s"' "$sep" "$f" "$(shasum -a 256 "$root/$f" | cut -d' ' -f1)"
		sep=","
	done
	echo '}`'
} >"$here/sources.go"

(cd "$here" && GOOS=wasip1 GOARCH=wasm go vet ./...)
out=$root/web/lib/sim
[ "${1:-}" = "--check" ] && out=$(mktemp -d)
(cd "$here" && "$TINYGO" build -o "$out/golf.wasm" -target wasip1 -buildmode c-shared -scheduler none -no-debug -opt 2 -panic print .)
echo "golf.wasm: $(wc -c <"$out/golf.wasm" | tr -d ' ') B, $(gzip -9c "$out/golf.wasm" | wc -c | tr -d ' ') B gzipped (from $(echo $golf | tr ' ' ','), physics, course)"

if [ "${1:-}" = "--check" ]; then
	if ! cmp -s "$out/golf.wasm" "$root/web/lib/sim/golf.wasm"; then
		echo "wasm.sh: web/lib/sim/golf.wasm is not the build of these sources: run scripts/wasm.sh" >&2
		exit 1
	fi
	rm -rf "$out"
	cd "$root/web" && node --experimental-strip-types --disable-warning=ExperimentalWarning ../scripts/wasmparity.ts
fi
