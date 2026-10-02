#!/bin/sh
# holedata.sh [--check]: data/holes.txt, every course hole as GG1 data, from its source.
#
# Runs every hole's fingerprint test (which also proves the hole survives
# encoding: see fingerprint.Check), one run over them all, and keeps the line
# each logs, one per hole:
#
#   <slot> <pkgpath> <sha8> <hex>
#
# slot is world/order, pkgpath the realm the hole is today (what a client
# maps old ids from), sha8 the first 4 bytes of the data's sha256, hex the
# data. Sorted by slot, so a change to a hole is a one-line diff to review.
# Then scripts/paritydata.sh copies it into golf's parity test.
#
# --check writes nothing: it fails unless data/holes.txt (what publishdata.sh
# publishes) and golf's parity_data_test.gno are exactly what the hole realms
# give now (check.sh runs it: a hole edited without holedata.sh never ships).
#
# GNO is the gno binary (default: the onyx toolchain's, in GNO_TOOLCHAIN: see
# check.sh). The run is at low priority.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
toolchain=${GNO_TOOLCHAIN:-${XDG_CACHE_HOME:-$HOME/.cache}/gno-toolchains/onyx}
GNO=${GNO:-$toolchain/gno}
: "${GNOHOME:=$toolchain/gnohome}"
export GNOHOME
check=""
[ "${1:-}" = --check ] && check=1

cd "$root"
tmp=$(mktemp)
log=$(mktemp)
par=$(mktemp)
trap 'rm -f "$tmp" "$log" "$par"' EXIT
pkgs=$(for d in $(ls -d gno.land/r/gnogolf/*/ | sort); do [ -f "$d/fingerprint_test.gno" ] && echo "./${d%/}"; done)
# shellcheck disable=SC2086 # (one word a package)
if ! nice -n 20 "$GNO" test -v -run TestFingerprint $pkgs >"$log" 2>&1; then
	cat "$log" >&2
	echo "holedata.sh: a hole fails its fingerprint test" >&2
	exit 1
fi
# a package's output ends on its "ok ./<pkgpath>" line, its data line above it
awk '/^data /{d = $2 " " $3 " " $4; next} /^ok /{if (d != "") {p = $2; sub(/^\.\//, "", p); split(d, a, " "); print a[1], p, a[2], a[3]; d = ""}}' "$log" |
	sort -t/ -k1,1 -k2,2n >"$tmp"
want=$(echo "$pkgs" | grep -c .)
got=$(wc -l <"$tmp" | tr -d ' ')
[ "$got" = "$want" ] || { echo "holedata.sh: $got data lines for $want holes" >&2; exit 1; }
if [ -n "$check" ]; then
	cmp -s "$tmp" data/holes.txt || { diff "$tmp" data/holes.txt | cut -c1-120 >&2; echo "holedata.sh --check: data/holes.txt is not the hole realms' data: run scripts/holedata.sh" >&2; exit 1; }
	OUT=$par "$root/scripts/paritydata.sh" >/dev/null
	cmp -s "$par" gno.land/r/gnogolf/golf/parity_data_test.gno || { echo "holedata.sh --check: golf's parity_data_test.gno is not data/holes.txt: run scripts/paritydata.sh" >&2; exit 1; }
	echo "data/holes.txt: the $got hole realms' data, and golf's parity data with it"
	exit 0
fi
mkdir -p data
cp "$tmp" data/holes.txt
echo "data/holes.txt: $got holes, $(awk '{n += length($4)/2} END {print n}' data/holes.txt) bytes of data"
"$root/scripts/paritydata.sh"
