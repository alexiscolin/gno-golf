#!/bin/sh
# publishdata.sh <key>: publishes every course hole of data/holes.txt into its
# slot, as the course's owner (<key>, a gnokey key name): one plain
# `gnokey maketx call` of golf's Publish(slot, hex, "") a hole, in order,
# each simulated before it is sent (gnokey's default). A slot whose current
# version already holds the data is refused by the simulation ("nothing to
# publish") and skipped, so the script can be run again after a failure.
# Then it checks every slot (below). The key's password is asked once and
# handed to each call on its stdin.
#
# publishdata.sh -verify: only the check, a read (vm/qeval, no key): the
# current version of every slot has the sha data/holes.txt lists it with.
#
# REALM is the golf realm (default gno.land/r/gnogolf/golf), REMOTE the node
# (default 127.0.0.1:26657), CHAINID its chain id (default dev), GNOKEY the
# gnokey (default the onyx toolchain's, in GNO_TOOLCHAIN: see check.sh). A
# call asks gas for its hole's data (below, measured on the course) at the
# node's gas price (auth/gasprice), and its storage deposit is capped at
# MAX_DEPOSIT (default 10000000ugnot; a hole stores 4 to 35 KB).
#
#   scripts/publishdata.sh test1                                  a local gnodev
#   REALM=gno.land/r/nym-golfer000/golf REMOTE=https://rpc.onyx.testnets.gno.land:443 \
#     CHAINID=onyx-1 scripts/publishdata.sh <your-key-name>
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
realm=${REALM:-gno.land/r/gnogolf/golf}
remote=${REMOTE:-127.0.0.1:26657}
chainid=${CHAINID:-dev}
toolchain=${GNO_TOOLCHAIN:-${XDG_CACHE_HOME:-$HOME/.cache}/gno-toolchains/onyx}
gnokey=${GNOKEY:-$toolchain/gnokey}
holes=$root/data/holes.txt

# verify: one read over every slot. vm/qeval evaluates an expression in the
# realm, where only its own names are in reach: a slot's entry in Versions
# is found by hand.
verify() {
	list=$(awk '{printf "%s{\"%s\", \"%s\"}", (NR > 1 ? ", " : ""), $1, $3}' "$holes")
	expr='func() string { at := func(s, sub string) int { for i := 0; i+len(sub) <= len(s); i++ { if s[i:i+len(sub)] == sub { return i } }; return -1 }; bad := ""; for _, h := range [][2]string{'"$list"'} { id := Current(h[0]); v := Versions(h[0]); i := at(v, `"id":"`+id+`"`); if id != "" && i >= 0 { v = v[i:]; if j := at(v, "}"); j >= 0 && at(v[:j], `"sha":"`+h[1]) >= 0 { continue } }; bad += " " + h[0] }; if bad == "" { return "every slot holds its data" }; return "missing or other:" + bad }()'
	"$gnokey" query vm/qeval -remote "$remote" -data "$realm.$expr"
}

if [ "${1:-}" = -verify ]; then
	verify
	exit
fi
key=${1:?usage: publishdata.sh <key> | -verify}

# the node's price, "<price>ugnot/<gas>gas" as ugnot a gas
price=$("$gnokey" query auth/gasprice -remote "$remote" | tr -d " \n" | sed -n 's/.*"gas":"*\([0-9]*\)"*,"price":"\([0-9]*\)ugnot".*/\2 \1/p')
[ -n "$price" ] || { echo "publishdata.sh: no gas price at $remote" >&2; exit 1; }

printf 'Password for %s: ' "$key" >&2
stty -echo 2>/dev/null || true
read -r pass
stty echo 2>/dev/null || true
echo >&2

n=0
while read -r slot _ _ hex; do
	n=$((n + 1))
	# what Publish of b bytes costs, with a fifth more: every course hole's
	# first version took under 25M and 55K a byte (onyx toolchain, gnodev)
	gas=$(awk -v b=$((${#hex} / 2)) 'BEGIN {printf "%d", (25000000 + 55000 * b) * 1.2}')
	fee=$(echo "$price" | awk -v g="$gas" '{printf "%d", g * $1 / $2 + 1}')
	printf '%2d %-12s ' "$n" "$slot"
	publish() {
		echo "$pass" | "$gnokey" maketx call -pkgpath "$realm" -func Publish -args "$slot" -args "$hex" -args "" \
			-gas-wanted "$gas" -gas-fee "${fee}ugnot" -max-deposit "${MAX_DEPOSIT:-10000000ugnot}" \
			-broadcast -chainid "$chainid" -remote "$remote" -insecure-password-stdin "$key" 2>&1
	}
	# a call signed as the one before lands may read the account's old
	# sequence: once more, a block later
	out=$(publish) || { echo "$out" | grep -q "signature verification failed" && sleep 6 && out=$(publish); } || true
	if echo "$out" | grep -q "^OK!"; then
		echo "$out" | awk '/GAS USED|STORAGE DELTA|TX HASH/ {printf "%s  ", $0} END {print ""}'
	elif echo "$out" | grep -q "nothing to publish"; then
		echo "already current"
	else
		echo "$out" >&2
		exit 1
	fi
done <"$holes"
verify
