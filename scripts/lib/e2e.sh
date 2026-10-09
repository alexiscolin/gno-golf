# scripts/lib/e2e.sh: what the local chain's scripts share (e2e-gnomes.sh,
# e2e-builder.sh, try-local.sh), sourced by bash: a throwaway keybase's keys,
# a call by gnokey, and the report's table with its steps. It reads GNOKEY,
# KH (the keybase), PASS (its password), RPC_ADDR, CHAINID, and OUT (the
# report) and log, which each script defines.

# gnodev's well-known deploy key, the realms' owner on a local chain
TEST1_MNEMONIC="source bonus chronic canvas draft south burst lottery vacant surface solve popular case indicate oppose farm nothing bullet exhibit title speed wink action roast"

addr() { "$GNOKEY" list -home "$KH" | grep " $1 (" | sed 's/.*addr: \([^ ]*\).*/\1/'; }
addkey() { printf '%s\n%s\n%s\n' "$2" "$PASS" "$PASS" | "$GNOKEY" add -home "$KH" -recover -insecure-password-stdin "$1" >/dev/null 2>&1; }

# gnotx <key> <pkg> <func> [args...]: a call by gnokey, SEND coins attached,
# GASW gas wanted (200M); sets TXOUT, GAS, HEIGHT, and returns 0 when it
# went through
gnotx() {
	local key=$1 pkg=$2 fn=$3 x a=() try
	shift 3
	for x in "$@"; do a+=(-args "$x"); done
	for try in 1 2 3; do # (a sequence read before the last tx's block is "unauthorized": again)
		TXOUT=$(echo "$PASS" | "$GNOKEY" maketx call -home "$KH" -pkgpath "$pkg" -func "$fn" ${a[@]+"${a[@]}"} \
			${SEND:+-send "$SEND"} -gas-fee 5000000ugnot -gas-wanted "${GASW:-200000000}" -max-deposit 100000000ugnot \
			-remote "$RPC_ADDR" -chainid "$CHAINID" -broadcast -insecure-password-stdin "$key" 2>&1)
		printf %s "$TXOUT" | grep -q 'unauthorized error' || break
		sleep 2
	done
	GAS=$(printf %s "$TXOUT" | sed -n 's/^GAS USED: *//p' | head -1)
	HEIGHT=$(printf %s "$TXOUT" | sed -n 's/^HEIGHT: *//p' | head -1)
	printf %s "$TXOUT" | grep -q '^OK!'
}
# tx <key> <pkg> <func> [args...]: the call ok and no make, VIA how it went;
# a script may send some another way (e2e-gnomes.sh: gnomcp)
tx() { VIA=gnokey; gnotx "$@"; }
# the panic a refused call gave, on one line
why() { printf %s "$TXOUT" | sed -n 's/^Data: //p;s/^.*\(gnomes: [^"]*\).*$/\1/p;s/^.*\(golf: [^"]*\).*$/\1/p' | head -1 | cut -c1-160; }

# report: the table started in OUT, a row a step from then on
report() {
	n=0 npass=0 nfail=0 FAILS=""
	printf '%s\n' '| # | step | call | expected | got | result | gas |' '|---|------|------|----------|-----|--------|-----|' >"$OUT"
}
cell() { printf %s "$1" | tr '\n' ' ' | sed 's/|/\\|/g' | cut -c1-220; }
row() { # row <step> <call> <expected> <got> <ok 0|1> [gas]
	n=$((n + 1))
	local r=PASS
	if [ "$5" = 0 ]; then npass=$((npass + 1)); else r=FAIL nfail=$((nfail + 1)) FAILS="$FAILS $n"; fi
	printf '| %s | %s | `%s` | %s | %s | %s | %s |\n' "$n" "$(cell "$1")" "$(cell "$2")" "$(cell "$3")" "$(cell "$4")" "$r" "${6:--}" >>"$OUT"
	log "$r $n $1: $(cell "$4")"
}
# args: a call's arguments for the table, a long one as its size
args() {
	local x out=""
	for x in "$@"; do
		[ ${#x} -gt 64 ] && x="<${#x} bytes>"
		out="$out${out:+, }$x"
	done
	printf %s "$out"
}
# ok <step> <expected> <key> <pkg> <func> [args...]: the call must go through
ok() {
	local s=$1 e=$2 k=$3 p=$4 f=$5
	shift 5
	if tx "$k" "$p" "$f" "$@"; then row "$s" "$k: ${p##*/}.$f($(args "$@"))${SEND:+ send $SEND} [$VIA]" "$e" "went through" 0 "$GAS"
	else row "$s" "$k: ${p##*/}.$f($(args "$@"))${SEND:+ send $SEND} [$VIA]" "$e" "refused: $(why)" 1 "$GAS"; fi
}
# no <step> <panic substring> <key> <pkg> <func> [args...]: refused, with that panic
no() {
	local s=$1 e=$2 k=$3 p=$4 f=$5 w
	shift 5
	if tx "$k" "$p" "$f" "$@"; then row "$s" "$k: ${p##*/}.$f($(args "$@"))${SEND:+ send $SEND} [$VIA]" "refused: $e" "went through" 1 "$GAS"; return; fi
	w=$(printf %s "$TXOUT" | grep -o "$e" | head -1)
	if [ -n "$w" ]; then row "$s" "$k: ${p##*/}.$f($(args "$@"))${SEND:+ send $SEND} [$VIA]" "refused: $e" "refused: $(why)" 0 "${GAS:-}"
	else row "$s" "$k: ${p##*/}.$f($(args "$@"))${SEND:+ send $SEND} [$VIA]" "refused: $e" "refused otherwise: $(why)" 1 "${GAS:-}"; fi
}
# is <step> <call> <expected> <got>: a read or a balance, compared
is() { if [ "$3" = "$4" ]; then row "$1" "$2" "$3" "$4" 0; else row "$1" "$2" "$3" "$4" 1; fi; }
