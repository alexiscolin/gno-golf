#!/bin/sh
# importv1.sh <key>: onyx's migration, v1's course and records into golf/v2
# (import_v1.gno), as v2's owner (<key>, a gnokey key name).
#
# It reads first, for free: v1's whole course in one query (every best of
# every current hole, in both modes, and whether a shot of it is finer than
# 0.01) and v2's in another, and works out what v2 lacks: the holes it has no
# slot for yet, and the records it has none of, a worse one of, or only a
# copy (near-copy rule) of. A record with a shot finer than v2 takes stays on
# v1, and is listed. Then it sends only that: v1's drain finished if it is not
# (v1's Drain: its course ranking then counts its current holes alone, the
# ones that come over), each missing hole (ImportHole, a transaction each:
# they are heavy), and the records, BATCH a transaction (ImportRecord, each
# read from v1 in the call that writes it). A transaction is simulated first,
# then sent asking the gas it used and a tenth more. Plain calls only (a chain
# may keep MsgRun to a few accounts: onyx does). Run again, it sends nothing
# that is there already: a run with nothing new sends no transaction at all.
# Then it checks (below). The key's password is asked once. Needs jq.
#
# importv1.sh -verify: only the check, reads (vm/qeval, no key): every
# board's first 100 rows and records, and the course rankings', the same on
# v1 and v2, a few holes a query; but where a record was left on v1 (its
# board, and its mode's course ranking), which it tells apart.
#
# V1 and V2 are the realms (default gno.land/r/gnogolf/golf and
# gno.land/r/gnogolf/golf/v2), REMOTE the node (default 127.0.0.1:26657),
# CHAINID its chain id (default dev), GNOKEY the gnokey (default the onyx
# toolchain's: see check.sh), BATCH the records a transaction (default 20,
# about 25M gas each); the storage deposit is capped at MAX_DEPOSIT a call
# (default 20000000ugnot).
#
#   scripts/importv1.sh test1                                     a local gnodev
#   V1=gno.land/r/nym-alexiscolin000/gnogolf/golf V2=gno.land/r/nym-alexiscolin000/gnogolf/golf/v2 \
#     REMOTE=https://rpc.onyx.testnets.gno.land:443 CHAINID=onyx-1 scripts/importv1.sh <your-key-name>
set -eu
v1=${V1:-gno.land/r/gnogolf/golf}
v2=${V2:-gno.land/r/gnogolf/golf/v2}
remote=${REMOTE:-127.0.0.1:26657}
chainid=${CHAINID:-dev}
batch=${BATCH:-20}
deposit=${MAX_DEPOSIT:-20000000ugnot}
toolchain=${GNO_TOOLCHAIN:-${XDG_CACHE_HOME:-$HOME/.cache}/gno-toolchains/onyx}
gnokey=${GNOKEY:-$toolchain/gnokey}
tmp=$(mktemp -d)
trap 'stty echo 2>/dev/null || true; rm -rf "$tmp"' EXIT
trap 'exit 130' INT TERM

# a read, tried again twice when the node does not answer (a public node times out)
qeval() {
	for try in 1 2 3; do
		"$gnokey" query vm/qeval -remote "$remote" -data "$1" && return 0
		sleep 3
	done
	return 1
}
# a string answer's inside, its rows ("|" apart) a line each
rows() { sed -n 's/^data: ("\(.*\)" string)$/\1/p' | tr '|' '\n' | grep . || true; }

# the courses, "<id> <mode> <player> <strokes> <flag>" a best, in the boards'
# key order: v1's flag is 1 for a shot finer than 0.01, v2's for a copy; and
# v2's holes, "<id>" a line
dump() {
	qeval "$v1."'func() (s string) { n2s := func(n int) string { if n == 0 { return "0" }; b := ""; for n > 0 { b = string(rune(48+n%10)) + b; n /= 10 }; return b }; off := func(x float64) bool { x *= 100; d := x - float64(int64(x)); if d < 0 { d = -d }; return d > 1e-6 && d < 1-1e-6 }; slots.Iterate("", "", func(_ string, id any) bool { e := find(id.(string)); s += e.id + "|"; for m := 0; m < modes; m++ { e.bests(m).Iterate("", "", func(p string, v any) bool { _, _, sh := bestFields(v); f := "0"; at := 0; for i := 0; i <= len(sh); i++ { if i == len(sh) || sh[i] == 59 { a, pw, _ := parseShot(sh[at:i]); at = i + 1; if off(a) || off(pw) { f = "1" } } }; s += e.id + " " + modeNames[m] + " " + p + " " + n2s(bestStrokes(v)) + " " + f + "|"; return false }) }; return false }); return }()' |
		rows >"$tmp/v1"
	qeval "$v2."'func() (s string) { slots.Iterate("", "", func(_ string, id string) bool { e := find(id); s += e.id + "|"; for m := 0; m < modes; m++ { e.bests(m).Iterate("", "", func(p, v string) bool { c := "0"; if e.copies(m).Has(p) { c = "1" }; s += e.id + " " + modeNames[m] + " " + p + " " + itoa(bestStrokes(v)) + " " + c + "|"; return false }) }; return false }); return }()' |
		rows >"$tmp/v2"
	grep -v ' ' "$tmp/v1" >"$tmp/ids" || true
	[ -s "$tmp/ids" ] || { echo "importv1.sh: no course holes on $v1 at $remote" >&2; exit 1; }
	# what v2 lacks: "hole <id>", "record <id> <mode> <player>", "left <id> <mode> <player>"
	# (FILENAME, not NR == FNR: v2's file is empty before the first import)
	awk 'FILENAME == ARGV[1] { if (NF == 1) have[$1] = 1; else { best[$1" "$2" "$3] = $4; copy[$1" "$2" "$3] = $5 }; next }
		NF == 1 { if (!have[$1]) print "hole " $1; next }
		{ k = $1" "$2" "$3; if ((k in best) && !copy[k] && best[k] <= $4) next; print ($5 == 1 ? "left " : "record ") k }' \
		"$tmp/v2" "$tmp/v1" >"$tmp/todo"
	grep '^left ' "$tmp/todo" | cut -d' ' -f2- >"$tmp/left" || true
}

verify() {
	bad=0
	# every board of a few holes in one query a realm; told apart hole by hole if they differ
	same() { # same <expression> [<hole mode> …]: v1's and v2's answers; the boards a record was left on may differ
		a=$(qeval "$v1.$1") b=$(qeval "$v2.$1")
		[ "$a" = "$b" ] && return 0
		return 1
	}
	boards() { printf 'func() (s string) { for _, id := range []string{%s} { for _, m := range []string{"assisted", "pro"} { s += HoleLeaderboard(id, m, 0, 100) + Records(id, m, "", 100) } }; return }()' "$1"; }
	set -- $(cat "$tmp/ids")
	while [ $# -gt 0 ]; do
		list="" chunk=""
		for i in 1 2 3 4 5 6; do
			[ $# -gt 0 ] || break
			list="$list${list:+, }\"$1\"" chunk="$chunk $1"
			shift
		done
		same "$(boards "$list")" && continue
		for id in $chunk; do
			for m in assisted pro; do
				same "$(boards "\"$id\"" | sed "s/\"assisted\", \"pro\"/\"$m\"/")" && continue
				if grep -q "^$id $m " "$tmp/left"; then
					echo "differs: $id $m (a record left on v1)"
				else
					echo "differs: $id $m" >&2
					bad=$((bad + 1))
				fi
			done
		done
	done
	for m in assisted pro; do
		same "CourseLeaderboard(\"$m\", 0, 100)" && continue
		if grep -q "^[^ ]* $m " "$tmp/left"; then
			echo "differs: the $m course ranking (a record left on v1)"
		else
			echo "differs: the $m course ranking" >&2
			bad=$((bad + 1))
		fi
	done
	[ $bad = 0 ] || { echo "$bad differences" >&2; return 1; }
	echo "every board the same on v1 and v2 ($(wc -l <"$tmp/ids" | tr -d ' ') holes), but where a record was left on v1 ($(wc -l <"$tmp/left" | tr -d ' '))"
}

dump
if [ "${1:-}" = -verify ]; then
	verify
	exit
fi
key=${1:?usage: importv1.sh <key> | -verify}

holes=$(grep -c '^hole ' "$tmp/todo" || true) records=$(grep -c '^record ' "$tmp/todo" || true)
drain=$(qeval "$v1.len(archiving)" | sed -n 's/^data: (\([0-9]*\) int)$/\1/p')
echo "to send: ${drain:-?} archived holes to drain on v1, $holes holes, $records records ($(wc -l <"$tmp/left" | tr -d ' ') left on v1)"
sed -n 's/^left /   left on v1: /p' "$tmp/todo"
if [ "${drain:-0}" = 0 ] && [ "$holes" = 0 ] && [ "$records" = 0 ]; then
	echo "nothing to send"
	verify
	exit
fi

price=$("$gnokey" query auth/gasprice -remote "$remote" | tr -d " \n" | sed -n 's/.*"gas":"*\([0-9]*\)"*,"price":"\([0-9]*\)ugnot".*/\2 \1/p')
[ -n "$price" ] || { echo "importv1.sh: no gas price at $remote" >&2; exit 1; }
addr=$("$gnokey" list | sed -n "s/^[0-9]*\. $key (.*addr: \([a-z0-9]*\).*/\1/p")
[ -n "$addr" ] || { echo "importv1.sh: no key $key" >&2; exit 1; }
printf 'Password for %s: ' "$key" >&2
stty -echo 2>/dev/null || true
read -r pass
stty echo 2>/dev/null || true
echo >&2

# call <pkgpath> <func> <args…>: one call, a JSON line, into the next transaction
call() {
	pkg=$1 fn=$2
	shift 2
	printf '%s\n' "$@" | jq -R . | jq -sc --arg c "$addr" --arg d "$deposit" --arg p "$pkg" --arg f "$fn" \
		'{"@type": "/vm.m_call", caller: $c, send: "", max_deposit: $d, pkg_path: $p, func: $f, args: .}' >>"$tmp/msgs"
}

# send: the calls gathered, in one transaction, signed, simulated, then sent
# asking the gas it used and a tenth more; out holds the answer, and the
# script stops on a refusal
sign() { # sign <gas>
	fee=$(echo "$price" | awk -v g="$1" '{printf "%d", g * $1 / $2 + 1}')
	jq -s --arg g "$1" --arg f "${fee}ugnot" '{msg: ., fee: {gas_wanted: $g, gas_fee: $f}, signatures: null, memo: ""}' "$tmp/msgs" >"$tmp/tx.json"
	acct=$("$gnokey" query "auth/accounts/$addr" -remote "$remote" | sed -e '/^height:/d' -e 's/^data: //')
	printf '%s\n' "$pass" | "$gnokey" sign -tx-path "$tmp/tx.json" -chainid "$chainid" -remote "$remote" -insecure-password-stdin -quiet \
		-account-number "$(echo "$acct" | jq -r .BaseAccount.account_number)" -account-sequence "$(echo "$acct" | jq -r .BaseAccount.sequence)" "$key" >/dev/null
}
send() {
	sign 3000000000
	out=$("$gnokey" broadcast -dry-run -remote "$remote" "$tmp/tx.json" 2>&1) || true
	gas=$(echo "$out" | awk '/GAS USED/ {printf "%d", ($3 * 11 + 9) / 10}')
	if [ -n "$gas" ] && [ "$gas" != 0 ] && ! echo "$out" | grep -q "Error =--"; then
		for try in 1 2 3; do
			sign "$gas"
			out=$("$gnokey" broadcast -remote "$remote" "$tmp/tx.json" 2>&1) && break
			echo "$out" | grep -q "signature verification failed" || break
			sleep 6
		done
	fi
	echo "$out" | grep -q "^HEIGHT: *[1-9]" && ! echo "$out" | grep -q "Error =--" || { echo "$out" >&2; exit 1; }
	: >"$tmp/msgs"
}
said() { echo "$out" | awk '/GAS USED|STORAGE DELTA/ {printf "%s  ", $0}'; }
: >"$tmp/msgs"

# v1's drain, to its end (a call takes up to 400 standings out)
while [ "${drain:-0}" != 0 ]; do
	call "$v1" Drain 400
	send
	drain=$(qeval "$v1.len(archiving)" | sed -n 's/^data: (\([0-9]*\) int)$/\1/p')
	echo "v1's drain: ${drain:-?} archived holes left  $(said)"
done

for id in $(sed -n 's/^hole //p' "$tmp/todo"); do
	call "$v2" ImportHole "$id"
	send
	echo "$id imported  $(said)"
done

n=0
grep '^record ' "$tmp/todo" | while read -r _ id m p; do
	call "$v2" ImportRecord "$id" "$m" "$p"
	n=$((n + 1))
	if [ "$n" = "$batch" ]; then
		send
		echo "$n records copied  $(said)"
		n=0
	fi
done
# (the pipe ran the loop in a subshell: the calls it left are in the file)
if [ -s "$tmp/msgs" ]; then
	n=$(wc -l <"$tmp/msgs" | tr -d ' ')
	send
	echo "$n records copied  $(said)"
fi

dump
if grep -q '^record \|^hole ' "$tmp/todo"; then
	echo "importv1.sh: still missing after the import:" >&2
	grep '^record \|^hole ' "$tmp/todo" >&2
	exit 1
fi
verify
