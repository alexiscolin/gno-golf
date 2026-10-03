#!/bin/sh
# importv1.sh <key>: onyx's migration, v1's course and records into golf/v2
# (import_v1.gno), as v2's owner (<key>, a gnokey key name). First v1's drain
# is finished (v1's Drain, until no archived hole is left to take out of its
# standings: v1's course ranking then counts its current holes alone, the
# ones that come over). Then `gnokey maketx run`s, each simulated first and
# sent asking the gas the simulation used and a tenth more: a hole's first
# run imports it (ImportHole, unless v2 has its slot already), and its runs go
# through every record of its boards in both modes, paged from v1's Records,
# up to PER records a run, each read from v1 in the same transaction
# (ImportRecord); a run says where the next starts. Nothing goes through this
# script but the holes' ids and the players' addresses, so it can be run
# again after a failure: what is there already is left as it is. A record
# left on v1 (a shot finer than v2 takes) is listed. Then it checks (below).
# The key's password is asked once.
#
# importv1.sh -verify: only the check, reads (vm/qeval, no key): every
# board's first 100 rows and records, and the course rankings', the same on
# v1 and v2. After an import, a board that differs where a record was left on
# v1 (and a course ranking, then) is told apart and is no failure; -verify
# alone does not know them, and every difference fails.
#
# V1 and V2 are the realms (default gno.land/r/gnogolf/golf and
# gno.land/r/gnogolf/golf/v2), REMOTE the node (default 127.0.0.1:26657),
# CHAINID its chain id (default dev), GNOKEY the gnokey (default the onyx
# toolchain's: see check.sh), PER the records a run (default 40, about 18M
# gas each); the storage deposit is capped at MAX_DEPOSIT a run (default
# 20000000ugnot).
#
#   scripts/importv1.sh test1                                     a local gnodev
#   V1=gno.land/r/nym-alexiscolin000/gnogolf/golf V2=gno.land/r/nym-alexiscolin000/gnogolf/golf/v2 \
#     REMOTE=https://rpc.onyx.testnets.gno.land:443 CHAINID=onyx-1 scripts/importv1.sh <your-key-name>
set -eu
v1=${V1:-gno.land/r/gnogolf/golf}
v2=${V2:-gno.land/r/gnogolf/golf/v2}
remote=${REMOTE:-127.0.0.1:26657}
chainid=${CHAINID:-dev}
per=${PER:-40}
toolchain=${GNO_TOOLCHAIN:-${XDG_CACHE_HOME:-$HOME/.cache}/gno-toolchains/onyx}
gnokey=${GNOKEY:-$toolchain/gnokey}

qeval() { "$gnokey" query vm/qeval -remote "$remote" -data "$1"; }

# the course's current versions on v1, one id a line, in the course's order:
# its slots (not its archived versions, nor the community's holes)
ids=$(qeval "$v1."'func() (s string) { slots.Iterate("", "", func(_ string, v any) bool { s += v.(string) + " "; return false }); return }()' |
	sed -n 's/^data: ("\(.*\)" string)$/\1/p' | tr ' ' '\n' | grep . || true)
[ -n "$ids" ] || { echo "importv1.sh: no course holes on $v1 at $remote" >&2; exit 1; }

left="" # after an import: its records left on v1, "<hole> <mode> <player>" a line

verify() {
	bad=0
	same() { # same <what> [<hole mode pattern>]: the expression's answer, v1's and v2's
		a=$(qeval "$v1.$1") b=$(qeval "$v2.$1")
		[ "$a" = "$b" ] && return
		if [ -n "${2:-}" ] && [ -n "$left" ] && grep -q "^$2 " "$left"; then
			echo "differs: $1 (a record left on v1)"
		else
			echo "differs: $1" >&2
			bad=$((bad + 1))
		fi
	}
	for id in $ids; do
		for m in assisted pro; do
			same "HoleLeaderboard(\"$id\", \"$m\", 0, 100)" "$id $m"
			same "Records(\"$id\", \"$m\", \"\", 100)" "$id $m"
		done
	done
	for m in assisted pro; do same "CourseLeaderboard(\"$m\", 0, 100)" "[^ ]* $m"; done
	[ $bad = 0 ] || { echo "$bad differences" >&2; return 1; }
	echo "every board the same on v1 and v2 ($(echo "$ids" | wc -l | tr -d ' ') holes), but where a record was left on v1"
}

if [ "${1:-}" = -verify ]; then
	verify
	exit
fi
key=${1:?usage: importv1.sh <key> | -verify}

price=$("$gnokey" query auth/gasprice -remote "$remote" | tr -d " \n" | sed -n 's/.*"gas":"*\([0-9]*\)"*,"price":"\([0-9]*\)ugnot".*/\2 \1/p')
[ -n "$price" ] || { echo "importv1.sh: no gas price at $remote" >&2; exit 1; }

trap 'stty echo 2>/dev/null || true; rm -rf "$tmp"' EXIT
trap 'exit 130' INT TERM
tmp=$(mktemp -d)
left=$tmp/left
: >"$left"
printf 'Password for %s: ' "$key" >&2
stty -echo 2>/dev/null || true
read -r pass
stty echo 2>/dev/null || true
echo >&2

# the run of hole $1 from mode $2's record after player $3 ("": its first):
# v1's own answers, read and written in one transaction
runfile() {
	cat <<EOF
package main

import (
	"strings"

	v1 "$v1"
	golf "$v2"
)

func main(cur realm) {
	id, m, after, n := "$1", "$2", "$3", 0
	if golf.Current(id[:strings.LastIndex(id, "/v")]) == "" {
		golf.ImportHole(cross(cur), id)
	}
	for {
		page := v1.Records(id, m, after, 20)
		for _, s := range strings.Split(page, \`"player":"\`)[1:] {
			if n == $per {
				println("next", m, after)
				return
			}
			p := address(s[:strings.Index(s, \`"\`)])
			// (not copied, and none as good here, from v1 or played since: left on v1)
			if !golf.ImportRecord(cross(cur), id, m, p) {
				if mine := golf.BestOf(id, m, p); mine == 0 || mine > v1.BestOf(id, m, p) {
					println("left", id, m, p)
				}
			}
			after, n = p.String(), n+1
		}
		if strings.HasSuffix(page, \`"next":""}\`) {
			if m == "pro" {
				println("done")
				return
			}
			m, after = "pro", ""
		}
	}
}
EOF
}

# run <maketx args> <gas> <simulate>: one transaction (-simulate only, or
# test: simulated and sent), its answer in out
run() {
	fee=$(echo "$price" | awk -v g="$2" '{printf "%d", g * $1 / $2 + 1}')
	for try in 1 2 3; do
		# (word-split on purpose: the maketx subcommand and its arguments)
		# shellcheck disable=SC2086
		out=$(printf '%s\n' "$pass" | "$gnokey" maketx $1 -gas-wanted "$2" -gas-fee "${fee}ugnot" -max-deposit "${MAX_DEPOSIT:-20000000ugnot}" \
			-broadcast -simulate "$3" -chainid "$chainid" -remote "$remote" -insecure-password-stdin "$key" ${4:-} 2>&1) && return 0
		echo "$out" | grep -q "signature verification failed" || return 1
		sleep 6
	done
	return 1
}

# send <maketx args> [<file>]: simulated, then sent asking the gas it used and
# a tenth more; the script stops on a refusal
send() {
	if run "$1" 2000000000 only "${2:-}"; then
		gas=$(echo "$out" | awk '/GAS USED/ {printf "%d", ($3 * 11 + 9) / 10}')
		run "$1" "$gas" test "${2:-}" || true
	fi
	echo "$out" | grep -q "^OK!" || { echo "$out" >&2; exit 1; }
}

# v1's drain, to its end (a call takes up to 400 standings out)
while :; do
	send "call -pkgpath $v1 -func Drain -args 400"
	n=$(echo "$out" | sed -n 's/^(\([0-9]*\) int)$/\1/p')
	[ -n "$n" ] || { echo "importv1.sh: v1's Drain answered no count:" >&2; echo "$out" >&2; exit 1; }
	echo "v1's drain: $n archived holes left to drain"
	[ "$n" = 0 ] && break
done

n=0
for id in $ids; do
	n=$((n + 1))
	m=assisted after=""
	while :; do
		runfile "$id" "$m" "$after" >"$tmp/run.gno"
		send run "$tmp/run.gno"
		printf '%2d %-16s %-8s ' "$n" "$id" "$m"
		echo "$out" | awk '/GAS USED|STORAGE DELTA/ {printf "%s  ", $0} END {print ""}'
		echo "$out" | sed -n 's/^left //p' | tee -a "$left" | sed 's/^/   left on v1: /'
		next=$(echo "$out" | sed -n 's/^next //p')
		[ -n "$next" ] || break
		m=${next%% *} after=${next#"$m"}
		after=${after# }
	done
done
verify
