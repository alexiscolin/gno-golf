#!/bin/sh
# publishdata.sh <key>: publishes every course hole of data/holes.txt into its
# slot, as the course's owner (<key>, a gnokey key name): one plain
# `gnokey maketx call` of golf's Publish(slot, hex, "") a hole, in order,
# each simulated first (-simulate only) and then sent asking the gas the
# simulation used. A slot whose current version already holds the data is
# refused by the simulation ("nothing to publish") and skipped, so the
# script can be run again after a failure.
# Then it checks every slot (below). The key's password is asked once and
# handed to each call on its stdin.
#
# publishdata.sh -verify: only the check, a read (vm/qeval, no key): the
# current version of every slot has the sha data/holes.txt lists it with.
# It fails (exit 1) when a slot is missing or holds other data, and so does
# the check after publishing.
#
# REALM is the golf realm (default gno.land/r/gnogolf/golf), REMOTE the node
# (default 127.0.0.1:26657), CHAINID its chain id (default dev), GNOKEY the
# gnokey (default the onyx toolchain's, in GNO_TOOLCHAIN: see check.sh). A
# call asks the gas its simulation used and a tenth more (below) at the
# node's gas price (auth/gasprice), and its storage deposit is capped at
# MAX_DEPOSIT (default 10000000ugnot; a hole stores 4 to 35 KB).
#
#   scripts/publishdata.sh test1                                  a local gnodev
#   REALM=gno.land/r/nym-alexiscolin000/gnogolf/golf REMOTE=https://rpc.onyx.testnets.gno.land:443 \
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
	out=$("$gnokey" query vm/qeval -remote "$remote" -data "$realm.$expr")
	echo "$out"
	case $out in *'"every slot holds its data"'*) ;; *) return 1 ;; esac
}

if [ "${1:-}" = -verify ]; then
	verify
	exit
fi
key=${1:?usage: publishdata.sh <key> | -verify}

# the node's price, "<price>ugnot/<gas>gas" as ugnot a gas
price=$("$gnokey" query auth/gasprice -remote "$remote" | tr -d " \n" | sed -n 's/.*"gas":"*\([0-9]*\)"*,"price":"\([0-9]*\)ugnot".*/\2 \1/p')
[ -n "$price" ] || { echo "publishdata.sh: no gas price at $remote" >&2; exit 1; }

# the terminal's echo comes back however the script ends (an error, ^C)
trap 'stty echo 2>/dev/null || true' EXIT
trap 'exit 130' INT TERM
printf 'Password for %s: ' "$key" >&2
stty -echo 2>/dev/null || true
read -r pass
stty echo 2>/dev/null || true
echo >&2

# publish slot hex gas simulate: one Publish call (-simulate only, or test:
# simulated and sent), paying gas at the node's price, its output in out. A
# call signed before the one before it has landed reads the account's old
# sequence ("signature verification failed"): sent again, a block later (the
# web client's gnokey paste does the same: adena.ts gnokeyPaste).
publish() {
	fee=$(echo "$price" | awk -v g="$3" '{printf "%d", g * $1 / $2 + 1}')
	for try in 1 2 3; do
		out=$(printf '%s\n' "$pass" | "$gnokey" maketx call -pkgpath "$realm" -func Publish -args "$1" -args "$2" -args "" \
			-gas-wanted "$3" -gas-fee "${fee}ugnot" -max-deposit "${MAX_DEPOSIT:-10000000ugnot}" \
			-broadcast -simulate "$4" -chainid "$chainid" -remote "$remote" -insecure-password-stdin "$key" 2>&1) && return 0
		echo "$out" | grep -q "signature verification failed" || return 1
		sleep 6
	done
	return 1
}

n=0
while read -r slot _ _ hex; do
	n=$((n + 1))
	# the simulation's gas, what Publish of b bytes costs with a fifth more:
	# every hole's first version took under 25M and 55K a byte (onyx
	# toolchain, gnodev). The call then asks what the simulation used and a
	# tenth more, rounded up: the same run, but the state can differ by a few
	# bytes by the time it lands.
	gas=$(awk -v b=$((${#hex} / 2)) 'BEGIN {printf "%d", (25000000 + 55000 * b) * 1.2}')
	printf '%2d %-12s ' "$n" "$slot"
	if publish "$slot" "$hex" "$gas" only; then
		gas=$(echo "$out" | awk '/GAS USED/ {printf "%d", ($3 * 11 + 9) / 10}')
		publish "$slot" "$hex" "$gas" test || true
	fi
	if echo "$out" | grep -q "^OK!"; then
		echo "$out" | awk '/GAS WANTED|GAS USED|STORAGE DELTA|TX HASH/ {printf "%s  ", $0} END {print ""}'
	elif echo "$out" | grep -q "nothing to publish"; then
		echo "already current"
	else
		echo "$out" >&2
		exit 1
	fi
done <"$holes"
verify
