#!/bin/sh
# holedata.sh: data/holes.txt, every course hole as GG1 data, from its source.
#
# Runs each hole's fingerprint test (which also proves the hole survives
# encoding: see fingerprint.Check) and keeps the line it logs, one per hole:
#
#   <slot> <pkgpath> <sha8> <hex>
#
# slot is world/order, pkgpath the realm the hole is today (what a client
# maps old ids from), sha8 the first 4 bytes of the data's sha256, hex the
# data. Sorted by slot, so a change to a hole is a one-line diff to review.
# Then scripts/paritydata.sh copies it into golf's parity test.
#
# GNO is the gno binary (default: the pearl toolchain store), GNOROOT its
# source tree. The packages run one at a time, at low priority.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
store=${XDG_CACHE_HOME:-$HOME/.cache}/gno-toolchains/pearl
GNO=${GNO:-$store/gno}
: "${GNOROOT:=$(go env GOMODCACHE)/github.com/gnolang/gno@$(go version -m "$GNO" | awk '$1 == "mod" {print $3}')}"
: "${GNOHOME:=$store/gnohome}"
export GNOROOT GNOHOME

cd "$root"
mkdir -p data
tmp=$(mktemp)
log=$(mktemp)
trap 'rm -f "$tmp" "$log"' EXIT
for d in $(ls -d gno.land/r/gnogolf/*/ | sort); do
	[ -f "$d/fingerprint_test.gno" ] || continue
	pkg=gno.land/r/gnogolf/$(basename "$d")
	if ! nice -n 20 "$GNO" test -v -run TestFingerprint "./$d" >"$log" 2>&1; then
		cat "$log" >&2
		echo "holedata.sh: $pkg fails its fingerprint test" >&2
		exit 1
	fi
	line=$(grep '^data ' "$log" || true)
	[ -n "$line" ] || { echo "holedata.sh: $pkg logged no data" >&2; exit 1; }
	echo "$line" | awk -v pkg="$pkg" '{print $2, pkg, $3, $4}' >>"$tmp"
done
sort -t/ -k1,1 -k2,2n "$tmp" >data/holes.txt
echo "data/holes.txt: $(wc -l <data/holes.txt | tr -d ' ') holes, $(awk '{n += length($4)/2} END {print n}' data/holes.txt) bytes of data"
"$root/scripts/paritydata.sh"
