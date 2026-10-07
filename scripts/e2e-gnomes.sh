#!/usr/bin/env bash
# e2e-gnomes.sh: the gnomes realm end to end, on a local chain of its own.
# It starts a gnodev with throwaway keys, stages and deploys what gnomes
# needs (store, golf/v2, gnomes and their packages, under the test name NS,
# as scripts/stage.sh does), publishes the genesis rows
# (data/gnomes/rows/genesis.txt) and plays the sale through: waves and the
# player window, buys and caps, a Legendary at its fixed price (one a
# wallet, its first buyer's), the switch paused and resumed, Equip, the
# locker, the treasury moved and a stray coin swept to it, the site link, the
# close, an earned gnome, the token reads and the page, and the portraits:
# every catalogue gnome's drawn, and what TokenURI costs a tier, held to
# URIMAX (ADR-007's figure on a chain). Each step is a call
# and what it must give; the table of them goes to OUT, a markdown file,
# with the gas each transaction used.
#
#   scripts/e2e-gnomes.sh                      everything with gnokey
#   MCP=1 scripts/e2e-gnomes.sh                the owner's calls and the reads through gnomcp
#   SEED=1 scripts/e2e-gnomes.sh               the setup only, a chain to try the shop on
#
# Local only. The chain is a gnodev on its own ports (RPC 127.0.0.1:26757,
# gnoweb :8898 by default: 26657 is often another gnodev's), its keys made
# in WORK (test1 is gnodev's well-known deploy key, the collection's owner;
# the others are generated each run). Nothing reads or writes another
# keybase, and no chain but that gnodev is ever named.
#
# It takes a few minutes: the one wait is the close's minute of chain time
# (and up to six weather periods, if the ace on garden/3 needs one).
#
# MCP=1 needs gnomcp (github.com/gnoverse/gno-mcp, GNOMCP the binary): the
# owner (test1, which gnomcp signs with on a local profile) calls through
# its gno_call, the reads through gno_eval, gno_account and gno_render (an
# answer over gno_eval's size, about 8 KB, through gnokey), the gas runs
# through gno_run, and the p/ packages are deployed with gno_addpkg. gno_addpkg caps a deploy's
# storage deposit at 10 GNOT, which the realms pass, so they go with
# gnokey; a call refused for that cap, or over gnomcp's gas ceiling (the
# genesis's AddSeries, about 1.1 billion gas), is sent again with gnokey,
# and its row says so. The players are other accounts, so they call with gnokey.
#
# SEED=1 plays no scenario: it deploys, then seeds what the shop's screens
# show (the genesis published; wave 1 of data/gnomes.json open since a
# minute, its player window an hour; wave 2 in two days; the close in 30
# days; p1 and b1 with a record, p1 holding two Commons and a Rare, one
# worn, b1 a Common; wave 1's Legendary on sale at its price; p0 and b2 with
# their balance alone), in a few minutes. The chain
# is left running (KEEP=1) and $WORK/seed.env written: its addresses, the
# realms, the keybase and password, each key's address, what was seeded.
# Stop it with kill $DEV_PID (seed.env). scripts/try-local.sh seeds more for
# a person to try it all (its env below), with the wallets' phrases it made
# (MNEMONIC_p0, MNEMONIC_p1: written nowhere).
#
# Env: NS (nym-gnometest000), RPC_ADDR, WEB_ADDR (where gnodev listens, on
# this machine), CHAINID (dev), WORK (a
# new temp dir), OUT ($WORK/e2e.md), KEEP=1 leaves the chain running at the
# end, SEED=1, GNO_TOOLCHAIN as in check.sh. With SEED=1: SEED_WAVE2=0 adds
# no wave 2, SEED_WORLDS publishes every course hole of those worlds too
# ("garden island": garden/3 alone by default), SEED_CLOSE_DAYS puts the
# closing date that many days on (30; set first, as the realm wants it
# before any wave or open sale), SEED_PUBLISHING=1 opens
# community publishing, SEED_TREASURY=1 moves the treasury to the treas key.
set -u

root=$(cd "$(dirname "$0")/.." && pwd)
toolchain=${GNO_TOOLCHAIN:-${XDG_CACHE_HOME:-$HOME/.cache}/gno-toolchains/onyx}
GNOKEY=${GNOKEY:-$toolchain/gnokey}
GNODEV=${GNODEV:-$toolchain/gnodev}
GNOMCP=${GNOMCP:-$HOME/.local/src/gno-mcp/bin/gnomcp}
NS=${NS:-nym-gnometest000}
RPC_ADDR=${RPC_ADDR:-127.0.0.1:26757}
WEB_ADDR=${WEB_ADDR:-127.0.0.1:8898}
WORK=${WORK:-$(mktemp -d)}
OUT=${OUT:-$WORK/e2e.md}
MCP=${MCP:-0}
CHAINID=${CHAINID:-dev}
PASS=pass # the throwaway keys' password
GN=gno.land/r/$NS/gnogolf/gnomes
GOLF=gno.land/r/$NS/gnogolf/golf/v2
STORE=gno.land/r/$NS/gnogolf/store
ROWS=$root/data/gnomes/rows/genesis.txt
mkdir -p "$WORK"
log() { printf '%s\n' "$*" >&2; }
die() { log "e2e: $*"; exit 1; }

# ------------------------------------------------------------------ helpers
# python3 for what sh reads badly: a qeval answer, JSON, base64, gnomcp's
# stdio protocol
cat >"$WORK/h.py" <<'EOF'
import base64, json, os, re, subprocess, sys, xml.etree.ElementTree as ET
def unq(s):
    """A qeval answer's first value, ("..." string), ("g1…" .uverse.address),
    (n int64) or (true bool), as itself."""
    s = s.strip()
    m = re.match(r'^\("((?:[^"\\]|\\.)*)" [^ ()]+\)', s, re.S)
    if m: return json.loads('"' + m.group(1) + '"')
    m = re.match(r'^\(([^ ]*) [^ ()]+\)', s)
    return m.group(1) if m else s
def bech32(hrp, data):
    G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
    def polymod(v):
        c = 1
        for x in v:
            b = c >> 25; c = (c & 0x1ffffff) << 5 ^ x
            for i in range(5): c ^= G[i] if (b >> i) & 1 else 0
        return c
    acc, bits, five = 0, 0, []
    for x in data:
        acc = acc << 8 | x; bits += 8
        while bits >= 5: bits -= 5; five.append(acc >> bits & 31)
    if bits: five.append(acc << (5 - bits) & 31)
    v = [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp] + five + [0] * 6
    pm = polymod(v) ^ 1
    return hrp + "1" + "".join("qpzry9x8gf2tvdw0s3jn54khce6mua7l"[x] for x in five + [pm >> 5 * (5 - i) & 31 for i in range(6)])
def mcp(tool, args):
    p = subprocess.Popen([os.environ["GNOMCP"], "-config", os.environ["GNOMCP_CONFIG"], "-audit-path", os.environ["GNOMCP_AUDIT"]],
                         stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    def rpc(i, method, params, notify=False):
        m = {"jsonrpc": "2.0", "method": method, "params": params}
        if not notify: m["id"] = i
        p.stdin.write(json.dumps(m) + "\n"); p.stdin.flush()
        while not notify:
            r = json.loads(p.stdout.readline())
            if r.get("id") == i: return r
    rpc(1, "initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "e2e-gnomes", "version": "1"}})
    rpc(0, "notifications/initialized", {}, True)
    r = rpc(2, "tools/call", {"name": tool, "arguments": args}); p.stdin.close(); p.wait()
    if "error" in r: print(json.dumps(r["error"])); return 2
    res = r["result"]
    for c in res.get("content", []):
        print(c.get("text") or c.get("resource", {}).get("text", ""))
    if res.get("structuredContent"): print("STRUCT " + json.dumps(res["structuredContent"]))
    return 1 if res.get("isError") else 0
cmd, a = sys.argv[1], sys.argv[2:]
if cmd == "unq": print(unq(sys.stdin.read()))
elif cmd == "mcp": sys.exit(mcp(a[0], json.loads(a[1])))
elif cmd == "realm":  # a realm's address: sha256("pkgPath:" + path), its first 20 bytes
    import hashlib; print(bech32("g", hashlib.sha256(("pkgPath:" + a[0]).encode()).digest()[:20]))
elif cmd == "jq":  # a JSON answer's field, by a python expression over d
    d = json.loads(sys.stdin.read()); print(eval(a[0], {"d": d, "re": re}))
elif cmd == "svg":  # a data URI's SVG: parses as XML, its root an svg
    u = sys.stdin.read().strip(); pre = "data:image/svg+xml;base64,"
    assert u.startswith(pre), "not an SVG data URI"
    root = ET.fromstring(base64.b64decode(u[len(pre):]))
    print(root.tag.split("}")[-1], len(u))
elif cmd == "portraits":  # every catalogue gnome's page: its portrait parsed, titled, sized
    import hashlib, urllib.request
    rpc, pkg, rows = a
    names = {int(l.split("|")[0]): l.split("|") for l in open(rows).read().split("\n")}
    out, seen, bad = {}, set(), []
    for i in sorted(names):
        q = {"jsonrpc": "2.0", "id": 1, "method": "abci_query", "params": {"path": "vm/qrender",
             "data": base64.b64encode(f"{pkg}:{i}".encode()).decode()}}
        r = json.load(urllib.request.urlopen(urllib.request.Request(rpc, json.dumps(q).encode(), {"Content-Type": "application/json"})))
        page = base64.b64decode(r["result"]["response"]["ResponseBase"]["Data"] or "").decode()
        m = re.search(r"\((data:image/svg\+xml;base64,[A-Za-z0-9+/=]+)\)", page)
        if not m: bad.append(f"{i}: no portrait"); continue
        svg = base64.b64decode(m.group(1)[len("data:image/svg+xml;base64,"):])
        try: t = ET.fromstring(svg).find("{http://www.w3.org/2000/svg}title")
        except ET.ParseError as e: bad.append(f"{i}: {e}"); continue
        if t is None or t.text != names[i][2]: bad.append(f"{i}: title"); continue
        out[i] = (len(svg), m.group(1)); seen.add(hashlib.sha256(svg).digest())
    heavy = max(out, key=lambda i: out[i][0])
    # parsed, distinct, the heaviest's id, its tier, its bytes, its data URI, the first refusals
    print(len(out), len(seen), heavy, names[heavy][1], out[heavy][0], out[heavy][1], ";".join(bad[:3]) or "-")
elif cmd == "holeshot":  # a shot that holes in one in this period's weather, "" for none
    import urllib.request
    rpc, pkg, hole = a
    def qeval(expr):
        q = {"jsonrpc": "2.0", "id": 1, "method": "abci_query", "params": {"path": "vm/qeval",
             "data": base64.b64encode(f"{pkg}.{expr}".encode()).decode()}}
        r = json.load(urllib.request.urlopen(urllib.request.Request(rpc, json.dumps(q).encode(), {"Content-Type": "application/json"})))
        return unq(base64.b64decode(r["result"]["response"]["ResponseBase"]["Data"] or "").decode())
    # around the calm weather's shot (0,9.25), the nearest first: the wind bends it
    for da in sorted((x / 2 for x in range(-16, 17)), key=abs):
        for pw in sorted((x / 4 for x in range(28, 49)), key=lambda p: abs(p - 9.25)):
            if '"holed":true' in qeval(f'SimulateRound("{hole}","{da:g},{pw:g}")'):
                print(f"{da:g},{pw:g}"); sys.exit(0)
    print("")
elif cmd == "epoch":  # an RFC 3339 time as unix seconds
    from datetime import datetime
    t = re.sub(r"\.(\d+)", "", sys.stdin.read().strip()).replace("Z", "+00:00"); print(int(datetime.fromisoformat(t).timestamp()))
EOF
py() { python3 -I "$WORK/h.py" "$@"; }
export GNOMCP GNOMCP_CONFIG=$WORK/profiles.toml GNOMCP_AUDIT=$WORK/gnomcp-audit.jsonl
cat >"$GNOMCP_CONFIG" <<EOF
[local]
rpc-url    = "http://$RPC_ADDR"
chain-id   = "$CHAINID"
gnoweb-url = "http://$WEB_ADDR"
EOF

KH=$WORK/keys
addr() { "$GNOKEY" list -home "$KH" | grep " $1 (" | sed 's/.*addr: \([^ ]*\).*/\1/'; }
addkey() { printf '%s\n%s\n%s\n' "$2" "$PASS" "$PASS" | "$GNOKEY" add -home "$KH" -recover -insecure-password-stdin "$1" >/dev/null 2>&1; }

# chain time: the last block's, unix seconds; a block's by height
chaintime() { curl -s "http://$RPC_ADDR/status" | jq -r .result.sync_info.latest_block_time | py epoch; }
blocktime() { curl -s "http://$RPC_ADDR/block?height=$1" | jq -r .result.block.header.time | py epoch; }
wait_until() { # wait_until <unix> <why>
	log "e2e: waiting for chain time $1 ($2), $(($1 - $(chaintime)))s"
	while [ "$(chaintime)" -lt "$1" ]; do sleep 5; done
}

# q <pkg> <expr>: a read, its value unquoted (gnomcp's gno_eval with MCP=1;
# gnokey's for an answer gno_eval will not return whole: about 8 KB and up,
# "preview omitted", a large portrait's TokenURI)
q() {
	local r
	if [ "$MCP" = 1 ] && r=$(py mcp gno_eval "$(jq -nc --arg p "$1" --arg e "$2" '{profile:"local",path:$p,expr:$e}')") &&
		! printf %s "$r" | grep -q 'preview omitted'; then
		printf '%s\n' "$r" | sed -n '/<untrusted_content/,/<\/untrusted_content>/p' | sed '1d;$d' | py unq
	else
		"$GNOKEY" query vm/qeval -remote "$RPC_ADDR" -data "$1.$2" 2>&1 | sed -n 's/^data: //p' | py unq
	fi
}
qg() { q "$GN" "$1"; }
# qraw <expr>: gnomes' answer as qeval writes it, every value (an error's included)
qraw() { "$GNOKEY" query vm/qeval -remote "$RPC_ADDR" -data "$GN.$1" 2>&1 | sed -n '/^data: /,$p'; }
bal() { # ugnot of an address
	if [ "$MCP" = 1 ]; then
		py mcp gno_account "$(jq -nc --arg a "$1" '{profile:"local",address:$a}')" | sed -n 's/^STRUCT //p' |
			py jq "(lambda m: int(m.group(1)) if m else 0)(re.search(r'(\\d+)ugnot', d.get('coins') or ''))" # ("0" when none)
	else
		"$GNOKEY" query bank/balances/"$1" -remote "$RPC_ADDR" 2>&1 | sed -n 's/^data: "\([0-9]*\)ugnot"/\1/p' | grep . || echo 0
	fi
}

# tx <key> <pkg> <func> [args...]: a call, SEND coins attached; sets TXOUT,
# GAS, HEIGHT, VIA, and returns 0 when it went through. test1's go through
# gnomcp with MCP=1.
tx() {
	local key=$1 pkg=$2 fn=$3 rc
	shift 3
	VIA=gnokey
	if [ "$MCP" = 1 ] && [ "$key" = test1 ]; then
		VIA=mcp
		local j
		j=$(jq -nc --arg r "$pkg" --arg f "$fn" --arg s "${SEND:-}" '{profile:"local",realm:$r,func:$f,args:$ARGS.positional} + (if $s == "" then {} else {send:$s} end)' --args "$@")
		TXOUT=$(py mcp gno_call "$j" 2>&1)
		rc=$?
		if [ $rc != 0 ] && printf %s "$TXOUT" | grep -q 'not enough deposit'; then
			VIA="gnokey (gnomcp's 10 GNOT deposit cap)"
		elif [ $rc != 0 ] && printf %s "$TXOUT" | grep -q 'out of gas'; then
			VIA="gnokey (over gnomcp's gas ceiling)"
		else
			GAS=$(printf %s "$TXOUT" | sed -n 's/^GasUsed: *//p' | head -1)
			HEIGHT=$(printf %s "$TXOUT" | sed -n 's/^Height: *//p' | head -1)
			return $rc
		fi
	fi
	local a=() try
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
# the panic a refused call gave, on one line
why() { printf %s "$TXOUT" | sed -n 's/^Data: //p;s/^.*\(gnomes: [^"]*\).*$/\1/p;s/^.*\(golf: [^"]*\).*$/\1/p' | head -1 | cut -c1-160; }

# urigas <id>: the gas TokenURI(id) takes in a transaction of its own: a
# MsgRun of it, less the same MsgRun reading OwnerOf(id) alone (gnomcp's
# gno_run with MCP=1)
grun() {
	printf 'package main\n\nimport gnomes "%s"\n\nfunc main() {\n\t%s\n}\n' "$GN" "$1" >"$WORK/run.gno"
	if [ "$MCP" = 1 ]; then
		py mcp gno_run "$(jq -nc --rawfile c "$WORK/run.gno" '{profile:"local",code:$c}')" | sed -n 's/^GasUsed: *//p' | head -1
	else
		echo "$PASS" | "$GNOKEY" maketx run -home "$KH" -gas-fee 10000000ugnot -gas-wanted 400000000 -remote "$RPC_ADDR" \
			-chainid "$CHAINID" -broadcast -insecure-password-stdin test1 "$WORK/run.gno" 2>&1 | sed -n 's/^GAS USED: *//p'
	fi
}
urigas() {
	local base one
	[ -n "$(qg "OwnerOf(\"$1\")")" ] || { echo "unminted"; return; }
	base=$(grun "o, _ := gnomes.OwnerOf(\"$1\"); println(o)")
	one=$(grun "u, _ := gnomes.TokenURI(\"$1\"); println(len(u))")
	echo $((one - base))
}
# within <step> <call> <bound> <got>: a number at most bound
within() { if [ "$4" -eq "$4" ] 2>/dev/null && [ "$4" -le "$3" ]; then row "$1" "$2" "≤ $3" "$4" 0; else row "$1" "$2" "≤ $3" "${4:-none}" 1; fi; }
# URIMAX: the most a TokenURI may take on a chain: the heaviest portrait's
# measured here, 83.08M (ADR-007; 4a852c6's "0.076e9" is gno test's, which
# charges no object loads), with room
URIMAX=84000000

# the report
n=0 npass=0 nfail=0
FAILS=""
cat >"$OUT" <<EOF
| # | step | call | expected | got | result | gas |
|---|------|------|----------|-----|--------|-----|
EOF
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
# has <step> <call> <substring> <got>
has() { case $4 in *"$3"*) row "$1" "$2" "contains $3" "$(cell "$4" | cut -c1-140)" 0 ;; *) row "$1" "$2" "contains $3" "$4" 1 ;; esac; }
jf() { py jq "$1"; } # a field of the JSON on stdin
# findshot: a shot that holes garden/3/v1 in this weather, in shot ("" for
# none found). (searched over the chain's own SimulateRound; the weather
# changes each five minutes of chain time, and some holds no ace: then the
# next one)
findshot() {
	shot=""
	for _ in 1 2 3 4 5 6; do
		shot=$(py holeshot "http://$RPC_ADDR" "$GOLF" garden/3/v1)
		[ -n "$shot" ] && break
		period=$(q "$GOLF" 'Period()')
		log "e2e: no ace on garden/3 in period $period's weather: waiting for the next"
		while [ "$(q "$GOLF" 'Period()')" = "$period" ]; do sleep 5; done
	done
}

# ------------------------------------------------------------------- chain
log "e2e: work dir $WORK"
addkey test1 "source bonus chronic canvas draft south burst lottery vacant surface solve popular case indicate oppose farm nothing bullet exhibit title speed wink action roast"
for k in p0 p1 b1 b2 treas; do # (MNEMONIC_<key>: a phrase the caller made, try-local.sh's; else one made here)
	m=MNEMONIC_$k
	addkey $k "${!m:-$("$GNOKEY" generate 2>/dev/null | tail -1)}"
done
OWNER=$(addr test1) P0=$(addr p0) P1=$(addr p1) B1=$(addr b1) B2=$(addr b2) TREAS=$(addr treas)
[ -n "$TREAS" ] || die "the keys were not made"
if curl -s "http://$RPC_ADDR/status" >/dev/null; then die "a node answers on $RPC_ADDR already: stop it, or set RPC_ADDR"; fi
pre=()
for a in $P0 $P1 $B1 $B2 $TREAS; do pre+=(-add-account "$a=5000000000ugnot"); done
# the examples the packages import, loaded at start: gnodev loads one lazily
# by reloading the node, which a transaction then in flight does not survive
# (refused "unauthorized")
deps=gno.land/p/nt/bptree/v0,gno.land/p/nt/grc721/v0,gno.land/p/nt/grc721/royalty/v0,gno.land/p/nt/ufmt/v0,gno.land/r/sys/users
mkdir -p "$WORK/devroot"
(cd "$WORK/devroot" && exec "$GNODEV" local -no-watch -empty-blocks -empty-blocks-interval 1 \
	-chain-id "$CHAINID" -node-rpc-listener "$RPC_ADDR" -web-listener "$WEB_ADDR" -paths "$deps" "${pre[@]}") >"$WORK/gnodev.log" 2>&1 &
DEV=$!
if [ "${SEED:-}" = 1 ]; then # (kept running once seeded, killed when the seed fails)
	trap '[ $? = 0 ] || kill $DEV 2>/dev/null' EXIT
else
	[ "${KEEP:-}" = 1 ] || trap 'kill $DEV 2>/dev/null' EXIT
fi
for _ in $(seq 60); do curl -s "http://$RPC_ADDR/status" >/dev/null && break; sleep 1; done
curl -s "http://$RPC_ADDR/status" >/dev/null || die "gnodev did not start (see $WORK/gnodev.log)"

# ------------------------------------------------------------------ deploy
MAINNET=1 sh "$root/scripts/stage.sh" "$NS" "$WORK/stage" >"$WORK/stage.log" 2>&1 || die "stage.sh failed (see $WORK/stage.log)"
for p in p/$NS/gnogolf/physics p/$NS/gnogolf/course p/$NS/gnogolf/weblink r/$NS/gnogolf/store r/$NS/gnogolf/golf/v2 r/$NS/gnogolf/gnomes; do
	d=$WORK/stage/gno.land/$p
	if [ "$MCP" = 1 ] && [ "${p%%/*}" = p ]; then
		files=$(cd "$d" && for f in *; do jq -n --arg n "$f" --rawfile b "$f" '{name:$n,body:$b}'; done | jq -sc .)
		TXOUT=$(py mcp gno_addpkg "$(jq -nc --arg p "gno.land/$p" --argjson f "$files" '{profile:"local",deploy_path:$p,files:$f}')")
		rc=$? VIA=mcp GAS=$(printf %s "$TXOUT" | sed -n 's/^GasUsed: *//p')
	else
		sleep 2 # (the last deploy's block in, so that the sequence read is its next)
		TXOUT=$(echo "$PASS" | "$GNOKEY" maketx addpkg -home "$KH" -pkgpath "gno.land/$p" -pkgdir "$d" -gas-fee 10000000ugnot \
			-gas-wanted 900000000 -max-deposit 1000000000ugnot -remote "$RPC_ADDR" -chainid "$CHAINID" -broadcast -insecure-password-stdin test1 2>&1)
		printf %s "$TXOUT" | grep -q '^OK!'
		rc=$? VIA=gnokey GAS=$(printf %s "$TXOUT" | sed -n 's/^GAS USED: *//p')
	fi
	if [ $rc = 0 ]; then row "deploy" "addpkg gno.land/$p [$VIA]" "deployed" "deployed" 0 "$GAS"
	else row "deploy" "addpkg gno.land/$p [$VIA]" "deployed" "$(printf %s "$TXOUT" | tail -3)" 1 "$GAS"; die "deploy of $p failed"; fi
done
is "deploy" "gnomes.Owner()" "$OWNER" "$(qg 'Owner()')"
is "deploy" "gnomes.Treasury()" "$OWNER" "$(qg 'Treasury()')"
is "deploy" "store.Writer()" "$GOLF" "$(q "$STORE" 'Writer()')"

# -------------------------------------------------------------------- seed
# SEED=1: the state the shop's screens need (the header), then the chain
# left running and $WORK/seed.env written
if [ "${SEED:-}" = 1 ]; then
	must() { [ "$nfail" = 0 ] || die "seed: step $n failed${TXOUT:+: $(why)} (see $OUT)"; }
	G=$root/data/gnomes.json
	pl() { jf "d['series'][0]['plan'][$1]$2" <"$G"; } # pl <wave index> <field path>
	W1F=$(pl 0 "['first']") W1L=$(pl 0 "['last']") W2F=$(pl 1 "['first']") W2L=$(pl 1 "['last']")
	C1=$(pl 0 "['tiers']['common']['first']") R1=$(pl 0 "['tiers']['rare']['first']") L1=$(pl 0 "['tiers']['legendary']['first']")
	WIN2=$(jf "d['series'][0]['sale']['playerWindowHours']" <"$G")
	price() { qg "Gnome(\"$1\")" | jf 'd["price"]'; }
	recorded() { q "$STORE" "Has(\"totals\",\"assisted $1\")"; }
	GASW=3000000000 ok "seed: publish the genesis" "published" test1 "$GN" AddSeries genesis "$(cat "$ROWS")"; must
	NOW=$(chaintime)
	CLOSE=$((NOW + ${SEED_CLOSE_DAYS:-30} * 86400))
	ok "seed: close in ${SEED_CLOSE_DAYS:-30} days" "set" test1 "$GN" SetCloseAt "$CLOSE"; must
	ok "seed: open the sale" "open" test1 "$GN" SetMintOpen true; must
	# the records first (finding a holing shot may wait out a period), so
	# that the player window starts when the rest is quick
	ok "seed: publish garden/3" "published" test1 "$GOLF" Publish garden/3 "$(awk '$1=="garden/3"{print $4}' "$root/data/holes.txt")" e2e; must
	for k in p1 b1; do
		a=$(addr $k)
		for _ in 1 2 3; do # (the weather may turn between the search and the round: search again)
			findshot
			[ -n "$shot" ] && tx $k "$GOLF" PlayRound garden/3/v1 "$shot"
			[ "$(recorded "$a")" = true ] && break
		done
		is "seed: $k holes garden/3 (a record)" "store.Has(\"totals\",\"assisted <$k>\")" "true" "$(recorded "$a")"; must
	done
	NOW=$(chaintime)
	ok "seed: wave 1 ($W1F-$W1L) open, 1 h player window" "added" test1 "$GN" AddWave "$W1F" "$W1L" "$((NOW - 60))" 1; must
	W1UNTIL=$((NOW - 60 + 3600)) W2AT=$((NOW + 2 * 86400))
	if [ "${SEED_WAVE2:-1}" = 1 ]; then
		ok "seed: wave 2 ($W2F-$W2L) in 2 days" "added" test1 "$GN" AddWave "$W2F" "$W2L" "$W2AT" "$WIN2"; must
	else W2AT=""; fi
	C2=$((C1 + 1)) C3=$((C1 + 2))
	SEND=$(($(price "$C1") + $(price "$C2")))ugnot ok "seed: p1 buys Commons $C1, $C2" "sold" p1 "$GN" Buy "$C1,$C2"; must
	SEND=$(price "$R1")ugnot ok "seed: p1 buys Rare $R1" "sold" p1 "$GN" Buy "$R1"; must
	ok "seed: p1 wears $C1" "worn" p1 "$GN" Equip "$C1"; must
	SEND=$(price "$C3")ugnot ok "seed: b1 buys Common $C3" "sold" b1 "$GN" Buy "$C3"; must
	for w in ${SEED_WORLDS:-}; do # every course hole of the world (garden/3's data is there already: skipped)
		while read -r slot hex; do
			GASW=2000000000 ok "seed: publish $slot" "published" test1 "$GOLF" Publish "$slot" "$hex" e2e; must
		done < <(awk -v w="$w" 'index($1, w "/") == 1 && $1 != "garden/3" {print $1, $4}' "$root/data/holes.txt")
	done
	if [ "${SEED_PUBLISHING:-}" = 1 ]; then
		ok "seed: community publishing open" "open" test1 "$GOLF" SetPublishing true; must
	fi
	if [ "${SEED_TREASURY:-}" = 1 ]; then
		ok "seed: the treasury offered to treas" "offered" test1 "$GN" SetTreasury "$TREAS"; must
		ok "seed: treas accepts it" "accepted" treas "$GN" AcceptTreasury; must
		is "seed: Treasury()" "gnomes.Treasury()" "$TREAS" "$(qg 'Treasury()')"; must
	fi
	ENV=$WORK/seed.env
	{
		echo "# gnomes seed chain ($(date -u +%FT%TZ)): scripts/e2e-gnomes.sh SEED=1. Stop it: kill \$DEV_PID"
		echo "RPC=http://$RPC_ADDR"
		echo "WEB=http://$WEB_ADDR"
		echo "CHAINID=$CHAINID"
		echo "NS=$NS"
		echo "GOLF=$GOLF"
		echo "GNOMES=$GN"
		echo "STORE=$STORE"
		echo "KH=$KH"
		echo "PASS=$PASS"
		echo "GNOKEY=$GNOKEY"
		echo "WORK=$WORK"
		echo "DEV_PID=$DEV"
		echo "WAVE1=$W1F-$W1L"
		echo "WAVE1_PLAYERS_UNTIL=$W1UNTIL"
		echo "WAVE2=$W2F-$W2L"
		echo "WAVE2_START=$W2AT"
		echo "CLOSE_AT=$CLOSE"
		echo "LEGENDARY=$L1"
		echo "P1_GNOMES=$C1,$C2,$R1"
		echo "P1_EQUIPPED=$C1"
		echo "B1_GNOMES=$C3"
		for k in test1 p0 p1 b1 b2 treas; do echo "$k=$(addr $k)"; done
	} >"$ENV"
	log "e2e: seeded in ${SECONDS}s, $npass steps (the table is in $OUT); gnodev $DEV left running on $RPC_ADDR, gnoweb $WEB_ADDR"
	echo "$ENV"
	exit 0
fi

# --------------------------------------------------------------- catalogue
no "catalogue: owner only" "only the owner" p0 "$GN" AddSeries genesis "$(cat "$ROWS")"
no "catalogue: genesis first" "the genesis first" test1 "$GN" AddSeries drop2 "721|common|X|01"
GASW=3000000000 ok "catalogue: publish the genesis (720 rows)" "published" test1 "$GN" AddSeries genesis "$(cat "$ROWS")"
c=$(qg 'Collection()')
is "catalogue: Collection series" "Collection().series[0]" "genesis 1 720 0" "$(printf %s "$c" | jf '" ".join(str(x) for x in (d["series"][0]["name"], d["series"][0]["first"], d["series"][0]["last"], d["series"][0]["sold"]))')"
no "catalogue: once" "already published" test1 "$GN" AddSeries genesis "$(cat "$ROWS")"
is "catalogue: Gnome(104)" "Gnome(\"104\").tier,name" "legendary The Miller" "$(qg 'Gnome("104")' | jf 'd["tier"] + " " + d["name"]')"

# ------------------------------------------------------- the sale opens
REALM_ADDR=$(py realm "$GN")
SEND=36000000ugnot no "sale: closed at deploy" "the sale is closed" p0 "$GN" Buy 1
no "sale: not before the closing date" "closing date first" test1 "$GN" SetMintOpen true
no "waves: not before the closing date" "closing date first" test1 "$GN" AddWave 1 104 0 1
NOW=$(chaintime)
ok "close: set before the sale opens, in 30 days" "set" test1 "$GN" SetCloseAt "$((NOW + 30 * 86400))"
ok "sale: open" "open" test1 "$GN" SetMintOpen true
is "sale: MintOpen()" "MintOpen()" "true" "$(qg 'MintOpen()')"

# ------------------------------------------------------------------- waves
no "waves: owner only" "only the owner" p0 "$GN" AddWave 1 104 0 1
NOW=$(chaintime)
no "waves: 0 to 168 hours" "a player window is 0 to 168 hours" test1 "$GN" AddWave 1 104 "$NOW" 169
ok "waves: Garden wave 1-104, 1 h player window" "added" test1 "$GN" AddWave 1 104 "$NOW" 1
no "waves: no overlap" "are in a wave already" test1 "$GN" AddWave 100 110 "$NOW" 0
SEND=36000000ugnot no "player window: no record, refused" "players only until" p0 "$GN" Buy 1

# a record: p1 holes garden/3 on golf/v2 (published here alone: the local
# Garden cup is that one hole)
ok "record: publish garden/3" "published" test1 "$GOLF" Publish garden/3 "$(awk '$1=="garden/3"{print $4}' "$root/data/holes.txt")" e2e
findshot
is "record: a holing shot this weather" "SimulateRound(garden/3/v1, …)" "found ($shot)" "$([ -n "$shot" ] && echo "found ($shot)" || echo none)"
ok "record: p1 holes garden/3" "holed" p1 "$GOLF" PlayRound garden/3/v1 "$shot"
is "record: store totals" "store.Has(\"totals\",\"assisted <p1>\")" "true" "$(q "$STORE" "Has(\"totals\",\"assisted $P1\")")"

# buys in the window
SEND=35999999ugnot no "buy: underpaid" "wrong payment, send exactly 36000000ugnot" p1 "$GN" Buy 5
SEND=36000001ugnot no "buy: overpaid" "wrong payment, send exactly 36000000ugnot" p1 "$GN" Buy 5
no "buy: nothing sent" "wrong payment" p1 "$GN" Buy 5
SEND=36000000ugnot no "buy: not an id" "not a gnome id" p1 "$GN" Buy 05
SEND=216000000ugnot no "buy: at most 5 ids" "name 1 to 5 gnomes" p1 "$GN" Buy 1,2,3,4,5,6
SEND=72000000ugnot no "buy: an id twice" "is named twice" p1 "$GN" Buy 5,5
t_before=$(bal "$OWNER")
SEND=36000000ugnot ok "buy: p1 buys Common 5 at its price" "sold" p1 "$GN" Buy 5
is "buy: treasury up by the price" "balance(treasury) after - before" "36000000" "$(($(bal "$OWNER") - t_before))"
is "buy: the realm keeps nothing" "balance(realm)" "0" "$(bal "$REALM_ADDR")"
is "buy: OwnerOf(5)" "OwnerOf(\"5\")" "$P1" "$(qg 'OwnerOf("5")')"
SEND=36000000ugnot no "buy: sold once" "already sold" p1 "$GN" Buy 5
SEND=72000000ugnot ok "buy: two in one call" "sold" p1 "$GN" Buy 6,7
SEND=36000000ugnot no "caps: player window, 3 Commons" "the player window takes 3 common a wallet" p1 "$GN" Buy 8
SEND=144000000ugnot ok "caps: 2 Rares in the window" "sold" p1 "$GN" Buy 73,74
SEND=72000000ugnot no "caps: no third Rare in the window" "the player window takes 2 rare a wallet" p1 "$GN" Buy 75
SEND=336000000ugnot ok "caps: 1 Epic in the window" "sold" p1 "$GN" Buy 94
SEND=336000000ugnot no "caps: no second Epic in the window" "the player window takes 1 epic a wallet" p1 "$GN" Buy 95

# a Legendary: sold as any gnome, by Buy at its wave's fixed price, to its
# first buyer, one a wallet
is "legendary: its price" "Gnome(\"104\").price" "1296000000" "$(qg 'Gnome("104")' | jf 'd["price"]')"
SEND=1295999999ugnot no "legendary: underpaid" "wrong payment, send exactly 1296000000ugnot" p1 "$GN" Buy 104
t_before=$(bal "$OWNER")
SEND=1296000000ugnot ok "legendary: p1 buys #104 at its price" "sold" p1 "$GN" Buy 104
is "legendary: treasury up by the price" "balance(treasury) after - before" "1296000000" "$(($(bal "$OWNER") - t_before))"
is "legendary: the realm keeps nothing" "balance(realm)" "0" "$(bal "$REALM_ADDR")"
is "legendary: OwnerOf(104)" "OwnerOf(\"104\")" "$P1" "$(qg 'OwnerOf("104")')"
SEND=1296000000ugnot no "legendary: a second buyer refused" "this gnome is already sold" b1 "$GN" Buy 104
ok "legendary: #208 on sale alone, no window" "added" test1 "$GN" AddWave 208 208 "$(chaintime)" 0
SEND=1296000000ugnot no "legendary: one a wallet" "the cap is 1 legendary a wallet" p1 "$GN" Buy 208
SEND=1296000000ugnot ok "legendary: b1 buys #208" "sold" b1 "$GN" Buy 208
SEND=1296000000ugnot no "legendary: #208 sold once" "this gnome is already sold" b2 "$GN" Buy 208
is "legendary: SoldOfTier(3)" "SoldOfTier(3)" "2" "$(qg 'SoldOfTier(3)')"

# the owner's switch: every sale paused, then open again
ok "pause: SetMintOpen(false)" "paused" test1 "$GN" SetMintOpen false
SEND=36000000ugnot no "pause: no buy" "the sale is closed" p0 "$GN" Buy 1
ok "pause: SetMintOpen(true)" "open" test1 "$GN" SetMintOpen true

# a wave with no window, and the lifetime cap
no "price: owner only" "only the owner" p0 "$GN" SetPrice common 40000000
no "price: bounds" "a price is between" test1 "$GN" SetPrice common 999999
ok "price: Common 40 GNOT for the next waves" "set" test1 "$GN" SetPrice common 40000000
is "price: a wave keeps its prices" "Gnome(\"8\").price" "36000000" "$(qg 'Gnome("8")' | jf 'd["price"]')"
NOW=$(chaintime)
ok "waves: 105-208, no window" "added" test1 "$GN" AddWave 105 208 "$NOW" 0
SEND=1296000000ugnot no "legendary: one a wallet" "the cap is 1 legendary a wallet" p1 "$GN" Buy 208
SEND=1296000000ugnot ok "legendary: b1 buys 208" "sold" b1 "$GN" Buy 208
ok "waves: 209-310, tomorrow" "added" test1 "$GN" AddWave 209 310 "$((NOW + 86400))" 0
SEND=40000000ugnot no "waves: not yet" "is not on sale yet" p0 "$GN" Buy 209
SEND=36000000ugnot no "waves: in no wave" "is not on sale" p0 "$GN" Buy 400
commons=$(awk -F'|' '$1>=105 && $1<=207 && $2=="common"{print $1}' "$ROWS" | head -11 | tr '\n' ' ')
set -- $commons
is "price: the new wave at the new price" "Gnome(\"$1\").price" "40000000" "$(qg "Gnome(\"$1\")" | jf 'd["price"]')"
SEND=200000000ugnot ok "caps: p0 (no record) buys 5 Commons, no window" "sold" p0 "$GN" Buy "$1,$2,$3,$4,$5"
SEND=200000000ugnot ok "caps: 5 more (10 Commons)" "sold" p0 "$GN" Buy "$6,$7,$8,$9,${10}"
SEND=40000000ugnot no "caps: lifetime, 10 Commons" "the cap is 10 common a wallet" p0 "$GN" Buy "${11}"
is "buy: SoldOfTier(0)" "SoldOfTier(0)" "13" "$(qg 'SoldOfTier(0)')"

# --------------------------------------------------------- equip, locker
ok "equip: p1 wears 5" "worn" p1 "$GN" Equip 5
is "equip: Equipped(p1)" "Equipped(p1).id,tier" "5 common" "$(qg "Equipped(\"$P1\")" | jf 'd["id"] + " " + d["tier"]')"
is "worn: the one put on" "Worn(p1).id,equipped" "5 True" "$(qg "Worn(\"$P1\")" | jf 'd["id"] + " " + str(d["equipped"])')"
no "equip: not someone else's" "not your gnome" p0 "$GN" Equip 5
no "equip: not unsold" "not your gnome" p0 "$GN" Equip 9
ok "equip: p0 wears $1" "worn" p0 "$GN" Equip "$1"
is "worn: WornMany, repeats and junk skipped" "WornMany(\"p1,p0,p1,junk\")" "5,$1" \
	"$(qg "WornMany(\"$P1,$P0,$P1,junk\")" | jf '",".join(r["id"] for r in d["rows"])')"
ok "equip: p1 wears 6" "worn" p1 "$GN" Equip 6
ok "equip: p1 sends 6 to b1" "moved" p1 "$GN" TransferFrom "$P1" "$B1" 6
is "equip: a gnome sent on is worn no more" "Equipped(p1)" "" "$(qg "Equipped(\"$P1\")")"
ok "equip: off" "off" p0 "$GN" Equip ""
is "equip: Equipped(p0) after off" "Equipped(p0)" "" "$(qg "Equipped(\"$P0\")")"
is "locker: GnomesOf(p0, 0)" "GnomesOf(p0,0) total,next,rows" "10 -1 10" "$(qg "GnomesOf(\"$P0\",0)" | jf '" ".join(str(x) for x in (d["total"], d["next"], len(d["rows"])))')"
is "locker: GnomesOf(p0, 4)" "GnomesOf(p0,4) first row, rows" "$5 6" "$(qg "GnomesOf(\"$P0\",4)" | jf 'd["rows"][0]["id"] + " " + str(len(d["rows"]))')"
is "locker: GnomesOf(p1, 0) in id order" "GnomesOf(p1,0) ids" "5,7,73,74,94,104" "$(qg "GnomesOf(\"$P1\",0)" | jf '",".join(r["id"] for r in d["rows"])')"
is "locker: past the end" "GnomesOf(p1,99) rows,next" "0 -1" "$(qg "GnomesOf(\"$P1\",99)" | jf 'str(len(d["rows"])) + " " + str(d["next"])')"
is "locker: TokenOfOwnerByIndex(p0, 9)" "TokenOfOwnerByIndex(p0,9)" "${10}" "$(qg "TokenOfOwnerByIndex(\"$P0\",9)")"

# ---------------------------------------------------------------- treasury
no "treasury: owner only" "only the owner" p0 "$GN" SetTreasury "$TREAS"
no "treasury: not the realm" "not the realm's own address" test1 "$GN" SetTreasury "$REALM_ADDR"
ok "treasury: offered to treas" "offered" test1 "$GN" SetTreasury "$TREAS"
is "treasury: pending" "PendingTreasury(), Treasury()" "$TREAS $OWNER" "$(qg 'PendingTreasury()') $(qg 'Treasury()')"
rare=$(awk -F'|' '$1>=105 && $1<=207 && $2=="rare"{print $1; exit}' "$ROWS")
t_before=$(bal "$OWNER")
SEND=72000000ugnot ok "treasury: a buy while only offered" "sold" p0 "$GN" Buy "$rare"
is "treasury: still paid to the old one" "balance(test1) after - before" "72000000" "$(($(bal "$OWNER") - t_before))"
no "treasury: only the offered takes it" "no treasury is offered to you" p0 "$GN" AcceptTreasury
ok "treasury: treas accepts" "taken" treas "$GN" AcceptTreasury
is "treasury: moved" "Treasury(), PendingTreasury()" "$TREAS " "$(qg 'Treasury()') $(qg 'PendingTreasury()')"
is "treasury: royalty follows" "RoyaltyInfo(\"5\", 1000000)" "$TREAS 50000" "$(qraw 'RoyaltyInfo("5",1000000)' | sed 's/^data: //' | head -2 | tr -d '()"' | awk '{print $1}' | paste -sd' ' -)"
t_before=$(bal "$TREAS")
SEND=40000000ugnot ok "treasury: a buy pays the new treasury" "sold" b2 "$GN" Buy "${11}"
is "treasury: up by the price" "balance(treas) after - before" "40000000" "$(($(bal "$TREAS") - t_before))"
is "treasury: the owner unchanged" "Owner()" "$OWNER" "$(qg 'Owner()')"

# a coin sent to the realm's address stays there until swept to the treasury
# (a call cannot carry one it does not read: the chain refuses "coins were
# sent but the called function never read them"); a plain bank send can
if echo "$PASS" | "$GNOKEY" maketx send -home "$KH" -to "$REALM_ADDR" -send 1ugnot -gas-fee 1000000ugnot -gas-wanted 10000000 \
	-remote "$RPC_ADDR" -chainid "$CHAINID" -broadcast -insecure-password-stdin p0 2>&1 | grep -q '^OK!'; then
	row "sweep: a stray coin" "p0: gnokey maketx send 1ugnot to the realm" "sent" "sent" 0
else row "sweep: a stray coin" "p0: gnokey maketx send 1ugnot to the realm" "sent" "refused" 1; fi
is "sweep: the realm holds it" "balance(realm)" "1" "$(bal "$REALM_ADDR")"
no "sweep: owner only" "only the owner" p0 "$GN" Sweep
t_before=$(bal "$TREAS")
ok "sweep: to the treasury" "swept" test1 "$GN" Sweep
is "sweep: the treasury has it" "balance(treas) after - before, balance(realm)" "1 0" "$(($(bal "$TREAS") - t_before)) $(bal "$REALM_ADDR")"

# ---------------------------------------------------------- the site link
no "site: owner only" "only the owner" p0 "$GN" SetSiteURL "https://gnogolf.xyz/"
no "site: https only" "a site link is https://" test1 "$GN" SetSiteURL "http://gnogolf.xyz/"
no "site: ends with /" "a site link is https://" test1 "$GN" SetSiteURL "https://gnogolf.xyz"
no "site: no query" "a site link is https://" test1 "$GN" SetSiteURL "https://gnogolf.xyz/?a=1"
is "metadata: no external_url before the site" "TokenMetadata(\"5\") has external_url" "False" "$(qg 'TokenMetadata("5")' | jf '"external_url" in d' 2>/dev/null || echo error)"
ok "site: set" "set" test1 "$GN" SetSiteURL "https://gnogolf.xyz/"
is "site: SiteURL()" "SiteURL()" "https://gnogolf.xyz/" "$(qg 'SiteURL()')"

# ------------------------------------------------------ token reads, page
md=$(qg 'TokenMetadata("5")')
is "metadata: JSON" "TokenMetadata(\"5\") name,external_url,tier" \
	"$(awk -F'|' '$1==5{print $3}' "$ROWS") https://gnogolf.xyz/g/5/ common" \
	"$(printf %s "$md" | jf 'd["name"] + " " + d["external_url"] + " " + d["attributes"][0]["value"]' 2>&1)"
is "token: TokenURI SVG" "TokenURI(\"5\") parsed as XML" "svg" "$(qg 'TokenURI("5")' | py svg 2>&1 | cut -d' ' -f1)"
is "token: image is TokenURI" "TokenMetadata(\"5\").image == TokenURI(\"5\")" "True" "$(printf %s "$md" | jf "d['image'] == '''$(qg 'TokenURI("5")')'''")"
is "token: unminted" "TokenURI(\"9\")" "error" "$(qraw 'TokenURI("9")' | grep -q 'gnomes: no such gnome' && echo error || echo none)"
is "token: Name, Symbol, TotalSupply" "Name() Symbol() TotalSupply()" "Gnogolf Gnomes GNOME 20" "$(qg 'Name()') $(qg 'Symbol()') $(qg 'TotalSupply()')"
if [ "$MCP" = 1 ]; then page=$(py mcp gno_render "$(jq -nc --arg r "$GN" '{profile:"local",realm:$r}')"); via=gno_render
else page=$("$GNOKEY" query vm/qrender -remote "$RPC_ADDR" -data "$GN:" 2>&1); via=qrender; fi
has "render: the collection" "Render(\"\") [$via]" "fixed price" "$page"
page=$(curl -s "http://$WEB_ADDR/r/$NS/gnogolf/gnomes:5")
has "render: a gnome on gnoweb" "GET /r/$NS/gnogolf/gnomes:5" "$(awk -F'|' '$1==5{print $3}' "$ROWS")" "$page"
has "render: a player" "Render(\"<p1>\")" "5" "$("$GNOKEY" query vm/qrender -remote "$RPC_ADDR" -data "$GN:$P1" 2>&1)"
has "render: not found" "Render(\"nope\")" "Not found" "$("$GNOKEY" query vm/qrender -remote "$RPC_ADDR" -data "$GN:nope" 2>&1)"

# ---------------------------------------------------------- the portraits
# every catalogue gnome's page carries its portrait (the TokenURI drawing):
# each read, parsed, titled with its name; the heaviest bought and its
# TokenURI read, and what TokenURI costs per tier
set -- $(py portraits "http://$RPC_ADDR" "$GN" "$ROWS")
is "portrait: every page draws its gnome" "Render(\"1\") … Render(\"720\") [qrender]: SVG parsed, <title> its name" "720 -" "$1 $7"
is "portrait: no two alike" "distinct SVGs of the 720" "720" "$2"
HEAVY=$3 HTIER=$4
within "portrait: the heaviest, #$HEAVY ($HTIER)" "its SVG's bytes (6 KiB)" 6144 "$5"
heavyuri=$6
if [ "$HTIER" != legendary ]; then
	if [ "$HEAVY" -gt 208 ]; then # (105 to 208 are on sale with no window; 104 and under are players' still)
		ok "portrait: a wave of #$HEAVY alone" "added" test1 "$GN" AddWave "$HEAVY" "$HEAVY" "$(chaintime)" 0
	fi
	SEND=$(qg "Gnome(\"$HEAVY\")" | jf 'd["price"]')ugnot ok "portrait: b2 buys #$HEAVY" "sold" b2 "$GN" Buy "$HEAVY"
	is "portrait: TokenURI is the page's portrait" "TokenURI(\"$HEAVY\") == its page's image" "True" "$([ "$(qg "TokenURI(\"$HEAVY\")")" = "$heavyuri" ] && echo True || echo False)"
	within "portrait: TokenURI gas, the heaviest (#$HEAVY)" "MsgRun TokenURI(\"$HEAVY\") - MsgRun OwnerOf" "$URIMAX" "$(urigas "$HEAVY")"
fi
within "portrait: TokenURI gas, a Common (#5)" "MsgRun TokenURI(\"5\") - MsgRun OwnerOf" "$URIMAX" "$(urigas 5)"
within "portrait: TokenURI gas, a Rare (#73)" "MsgRun TokenURI(\"73\") - MsgRun OwnerOf" "$URIMAX" "$(urigas 73)"
within "portrait: TokenURI gas, an Epic (#94)" "MsgRun TokenURI(\"94\") - MsgRun OwnerOf" "$URIMAX" "$(urigas 94)"
within "portrait: TokenURI gas, a Legendary (#104)" "MsgRun TokenURI(\"104\") - MsgRun OwnerOf" "$URIMAX" "$(urigas 104)"
c=14 r=3 e=1 l=2
case $HTIER in common) c=15 ;; rare) r=4 ;; epic) e=2 ;; esac
sold=$((c + r + e + l))

# ---------------------------------------------------------- earned gnomes
SEND=1ugnot no "earned: free" "an earned gnome is free" p1 "$GN" MintEarned wizard
no "earned: a kind" "no such earned gnome" p1 "$GN" MintEarned dragon
no "earned: not proven (Island Cup unpublished)" "not proven: pirate" p1 "$GN" MintEarned pirate
no "earned: not proven without a record" "not proven: wizard" p0 "$GN" MintEarned wizard
ok "earned: p1 finished the Garden Cup (wizard)" "minted 1000001" p1 "$GN" MintEarned wizard
is "earned: OwnerOf(1000001)" "OwnerOf(\"1000001\")" "$P1" "$(qg 'OwnerOf("1000001")')"
no "earned: once" "already minted: wizard" p1 "$GN" MintEarned wizard
ok "earned: an ace on a par 2 is the cup at par (viking)" "minted 1000002" p1 "$GN" MintEarned viking
no "earned: bound to its player" "bound to its player" p1 "$GN" TransferFrom "$P1" "$P0" 1000001
no "earned: no approval" "bound to its player" p1 "$GN" Approve "$P0" 1000001
is "earned: TokenMetadata kind" "TokenMetadata(\"1000001\") tier,kind" "earned wizard" "$(qg 'TokenMetadata("1000001")' | jf 'd["attributes"][0]["value"] + " " + d["attributes"][2]["value"]')"
ok "earned: equip it" "worn" p1 "$GN" Equip 1000001
is "earned: Equipped" "Equipped(p1).tier" "earned" "$(qg "Equipped(\"$P1\")" | jf 'd["tier"]')"
is "earned: TokenURI SVG" "TokenURI(\"1000001\") parsed as XML" "svg" "$(qg 'TokenURI("1000001")' | py svg 2>&1 | cut -d' ' -f1)"
within "portrait: TokenURI gas, an earned gnome" "MsgRun TokenURI(\"1000001\") - MsgRun OwnerOf" "$URIMAX" "$(urigas 1000001)"

# ------------------------------------------------------------------- close
NOW=$(chaintime)
no "close: owner only" "only the owner" p0 "$GN" SetCloseAt "$((NOW + 600))"
no "close: in the future" "a closing date is in the future" test1 "$GN" SetCloseAt "$((NOW - 10))"
ok "close: brought forward, in 10 minutes" "set" test1 "$GN" SetCloseAt "$((NOW + 600))"
no "close: never later" "never later than" test1 "$GN" SetCloseAt "$((NOW + 900))"
no "close: no genesis wave from it on" "before the genesis sale closes" test1 "$GN" AddWave 400 410 "$((NOW + 600))" 0
NOW=$(chaintime)
CLOSE=$((NOW + 60))
ok "close: brought forward" "set" test1 "$GN" SetCloseAt "$CLOSE"
is "close: CloseAt()" "CloseAt()" "$CLOSE" "$(qg 'CloseAt()')"
wait_until "$CLOSE" "the close"
SEND=36000000ugnot no "close: buys refused" "the genesis sale closed on" p1 "$GN" Buy 1
no "close: no wave for its ids" "the genesis sale closed on" test1 "$GN" AddWave 400 410 "$CLOSE" 0
no "close: no date after" "the genesis sale closed on" test1 "$GN" SetCloseAt "$((CLOSE + 600))"
is "close: Collection genesis closed, sold" "Collection().series[0] closed,sold" "True $sold" "$(qg 'Collection()' | jf 'str(d["series"][0]["closed"]) + " " + str(d["series"][0]["sold"])')"
is "close: an unsold gnome closed" "Gnome(\"1\").closed" "True" "$(qg 'Gnome("1")' | jf 'd["closed"]')"
is "close: a sold Legendary is not closed" "Gnome(\"104\").closed" "False" "$(qg 'Gnome("104")' | jf 'd["closed"]')"
is "close: an unsold Legendary is" "Gnome(\"311\").closed" "True" "$(qg 'Gnome("311")' | jf 'd["closed"]')"
is "close: final supply" "Collection().series[0].sold, tiers sold" "$sold $c,$r,$e,$l" "$(qg 'Collection()' | jf 'str(d["series"][0]["sold"]) + " " + ",".join(str(t["sold"]) for t in d["tiers"])')"

# ------------------------------------------------------------- the owner
no "owner: only the offered accepts" "no transfer of the collection is offered to you" p0 "$GN" Accept
ok "owner: Transfer offers" "offered" test1 "$GN" Transfer "$P0"
ok "owner: p0 accepts" "taken" p0 "$GN" Accept
is "owner: moved, the treasury stays" "Owner() Treasury()" "$P0 $TREAS" "$(qg 'Owner()') $(qg 'Treasury()')"
no "owner: the old owner no more" "only the owner" test1 "$GN" SetMintOpen false

{
	echo
	echo "**$npass passed, $nfail failed** of $n steps.${FAILS:+ Failed:$FAILS.}"
} >>"$OUT"
log "e2e: $npass passed, $nfail failed; the table is in $OUT"
[ "$nfail" = 0 ]
