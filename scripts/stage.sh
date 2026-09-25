#!/bin/sh
# stage.sh <ns> <out>: the three deployed packages (physics, course, golf),
# moved from the gnogolf namespace to <ns>, ready for addpkg.
#
#   scripts/stage.sh nym-golfer000 /tmp/stage
#
# Copies each package's .gno files and gnomod.toml into
# <out>/gno.land/{p,r}/<ns>/…, leaving out the tests, course/fingerprint and
# the hole realms; rewrites gno.land/[pr]/gnogolf/ to the new namespace;
# checks nothing of the old one is left; then lints the result with the
# pearl toolchain and prints each package's size.
#
# GNO is the gno binary to lint with (default: the pearl toolchain store,
# under ~/.cache/gno-toolchains/pearl), GNOROOT its source tree.
set -eu

ns=${1:?usage: stage.sh <ns> <out>}
out=${2:?usage: stage.sh <ns> <out>}
if ! printf %s "$ns" | grep -Eqx 'nym-[a-z]{5,13}[0-9]{3}'; then
	echo "stage.sh: $ns is not a pearl nym name (nym-<5 to 13 letters><3 digits>)" >&2
	exit 1
fi

root=$(cd "$(dirname "$0")/.." && pwd)
src=$root/gno.land
rm -rf "$out/gno.land"
for pkg in p/gnogolf/physics p/gnogolf/course r/gnogolf/golf; do
	dst=$out/gno.land/$(echo "$pkg" | sed "s#/gnogolf/#/$ns/#")
	mkdir -p "$dst"
	for f in "$src/$pkg"/*.gno "$src/$pkg/gnomod.toml"; do
		case $f in *_test.gno | *_filetest.gno) continue ;; esac
		sed "s#gno\.land/\([pr]\)/gnogolf/#gno.land/\1/$ns/#g" "$f" >"$dst/$(basename "$f")"
	done
done

fail=0
if grep -rn 'gno\.land/[pr]/gnogolf' "$out/gno.land"; then
	echo "stage.sh: the old namespace is still named above" >&2
	fail=1
fi
for m in $(find "$out/gno.land" -name gnomod.toml); do
	grep -q '^gno = "0.9"$' "$m" || { echo "stage.sh: $m is not gno 0.9" >&2; fail=1; }
	if grep -q 'replace' "$m"; then echo "stage.sh: $m has a replace" >&2; fail=1; fi
done
[ $fail = 0 ] || exit 1

store=${XDG_CACHE_HOME:-$HOME/.cache}/gno-toolchains/pearl
GNO=${GNO:-$store/gno}
if [ -x "$GNO" ]; then
	: "${GNOROOT:=$(go env GOMODCACHE)/github.com/gnolang/gno@$(go version -m "$GNO" | awk '$1 == "mod" {print $3}')}"
	export GNOROOT
	[ -f "$out/gnowork.toml" ] || : >"$out/gnowork.toml"
	(cd "$out" && GNOHOME=$store/gnohome "$GNO" lint ./gno.land/...)
else
	echo "stage.sh: no pearl gno at $GNO, not linted" >&2
fi

for d in $(find "$out/gno.land" -name gnomod.toml -exec dirname {} \; | sort); do
	printf '%8d B  %s\n' "$(cat "$d"/*.gno "$d"/gnomod.toml | wc -c)" "${d#"$out"/}"
done
