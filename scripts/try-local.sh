#!/usr/bin/env bash
# try-local.sh: the whole game on this machine, to try by hand, from this
# machine or another one on the tailnet: a local chain with the game, the
# gnome shop and the Builder on it, throwaway wallets, and the site's dev
# server. Ctrl+C stops everything. docs/try-local.md says what to try.
#
#   scripts/try-local.sh          start it all (a new chain each time)
#   scripts/try-local.sh wave2    open the gnomes' wave 2 now, on the chain running
#   scripts/try-local.sh all      open every wave not yet open, now (testing only)
#   scripts/try-local.sh close [days]  bring the genesis's closing date forward, to days from now (30); the
#                                 seed sets it 90 days on
#   scripts/try-local.sh rebuild  build the site again from this checkout and swap it in, the chain and the
#                                 links running all along (the old site serves until the new one is in)
#   scripts/try-local.sh down     clean up after a crash: its processes and its Serve entries
#
# What it does: scripts/e2e-gnomes.sh SEED=1 starts gnodev (the onyx
# toolchain's) and deploys physics, course, weblink, store, golf/v2 and
# gnomes under the test name NS; publishes the Garden's eighteen holes; the
# genesis series, its closing date 90 days on (the realm wants one before any
# wave: "close" brings it forward), wave 1 open (its players' window an
# hour); community publishing open; the treasury moved to a test key; p1 and
# b1 with a record and a few gnomes; all the course, the four classic cups
# and the Crystal Mines. Then the site built as the real one is (next build:
# no dev server's compiles or reloads over a proxied link), with the shop,
# the Builder and the community holes on (NEXT_PUBLIC_GNOMES, BUILDER,
# COMMUNITY) and the test hooks (?geo=blocked), pointed at that chain, and
# served by scripts/playground-server.mjs. The build is web/out's, as `npm
# run build` writes it; the site is served from a copy in WORK, through a
# link the server reads on every request, so "rebuild" swaps a new build in
# at once (one rename) while the old one keeps serving.
#
# Every server listens on 127.0.0.1 alone. With Tailscale, the tailnet-preview
# skill (TAILNET_PREVIEW, ~/.claude/skills/tailnet-preview) opens Tailscale
# Serve entries, tailnet only, never Funnel, and removes them on exit: the site
# as https on the machine's ts.net name (a secure context: copying and sharing
# links need one) and as raw TCP on its Tailscale IP (the fallback, plain
# http: the rest works there too), the node's RPC as raw TCP for a
# wallet, which signs straight to it, and gnoweb as raw TCP for the "read
# its code" links. The page reads the chain on its own origin, /rpc, which
# the site's server streams to the node: no CORS, no second host, both links
# alike.
#
# The wallets' seed phrases are made each run, held in memory and printed in
# the terminal only; the keybase in WORK holds the keys under a throwaway
# password, for this chain alone.
#
# Env: APP_PORT (the site, 5175 or the next free port), RPC_PORT
# (26667) and GNOWEB_PORT (8868: not gnodev's own 26657 and 8888, often
# another node's), CHAINID (gnogolf-local: not "dev", which Adena keeps for its
# own network), NS (nym-trylocal000), WORK (a new folder under
# ~/.cache/gnogolf-try-local), TAILNET=0 (this machine alone), GNO_TOOLCHAIN
# as in check.sh. Local only: nothing is sent anywhere else.
set -u
root=$(cd "$(dirname "$0")/.." && pwd)
toolchain=${GNO_TOOLCHAIN:-${XDG_CACHE_HOME:-$HOME/.cache}/gno-toolchains/onyx}
GNOKEY=${GNOKEY:-$toolchain/gnokey}
PREVIEW=${TAILNET_PREVIEW:-$HOME/.claude/skills/tailnet-preview/scripts/tailnet-preview.sh}
NAME=gnogolf-try # the Serve entries' name in tailnet-preview
cache=${XDG_CACHE_HOME:-$HOME/.cache}/gnogolf-try-local
last=$cache/last # the WORK of the playground running, for `wave2` and `down`
log() { printf '%s\n' "$*" >&2; }
die() { log "try-local: $*"; exit 1; }
tree() { local c; for c in $(pgrep -P "$1"); do tree "$c"; done; echo "$1"; } # a process and all it started
# the site built as the real one is, with the playground's settings ($WORK/site.env), into a new folder, then swapped
# in: $WORK/site is a link the server reads on every request, replaced in one rename. Kept: the build served until
# then (a request still reading it finishes) and the new one; the folders' numbers only grow.
build_site() {
	[ ! -e "$WORK/site" ] || [ -L "$WORK/site" ] || die "this playground's site is a folder, from before rebuild: restart the playground once"
	# shellcheck disable=SC1091
	. "$WORK/site.env"
	log "try-local: the site built (a few minutes; its log: $WORK/build.log)"
	(cd "$root/web" && env NEXT_PUBLIC_PLAYGROUND=1 NEXT_PUBLIC_TEST_HOOKS=1 NEXT_PUBLIC_RPC=/rpc NEXT_PUBLIC_WALLET_RPC="$WALLET_RPC" \
		NEXT_PUBLIC_WEB="$WEB_URL" NEXT_PUBLIC_REALM="$GOLF" NEXT_PUBLIC_NETWORK=testnet \
		NEXT_PUBLIC_GNOMES=1 NEXT_PUBLIC_BUILDER=1 NEXT_PUBLIC_COMMUNITY=1 npm run -s build) >"$WORK/build.log" 2>&1 ||
		{ tail -5 "$WORK/build.log" >&2; die "the site's build failed (the site running is untouched)"; }
	local n=0 d k served
	for d in "$WORK"/site.[0-9]*; do
		k=${d##*.}
		[[ $k =~ ^[0-9]+$ ]] && [ "$k" -gt "$n" ] && n=$k
	done
	n=$((n + 1))
	served=$(readlink "$WORK/site" 2>/dev/null || true)
	cp -R "$root/web/out" "$WORK/site.$n"
	rm -f "$WORK/site.next" && ln -s "site.$n" "$WORK/site.next"
	python3 -I -c 'import os, sys; os.replace(sys.argv[1], sys.argv[2])' "$WORK/site.next" "$WORK/site" # (one rename: the link swapped at once)
	for d in "$WORK"/site.[0-9]*; do
		[[ ${d##*.} =~ ^[0-9]+$ ]] && [ "${d##*/}" != "site.$n" ] && [ "${d##*/}" != "$served" ] && rm -rf "$d"
	done
	return 0
}

# the running playground's settings (its WORK's seed.env), for the commands below
running() {
	[ -f "$last" ] && WORK=$(cat "$last") && [ -f "$WORK/seed.env" ] || die "no playground running (start one with scripts/try-local.sh)"
	# shellcheck disable=SC1091
	. "$WORK/seed.env"
}
# the chain's time (unix seconds, its last block's) in NOW; the command stops if the chain does not answer
chainnow() {
	NOW=$(curl -sf --max-time 10 "$RPC/status" | python3 -I -c 'import json,sys,re; from datetime import datetime; t=json.load(sys.stdin)["result"]["sync_info"]["latest_block_time"]; print(int(datetime.fromisoformat(re.sub(r"\.\d+","",t).replace("Z","+00:00")).timestamp()))' 2>/dev/null) &&
		[ -n "$NOW" ] || die "the chain does not answer at $RPC (is the playground running?)"
}
# a call by the collection's owner (test1) on the gnomes realm; refused: its reason in REFUSED
owner() {
	local fn=$1 a=() x out
	shift
	for x in "$@"; do a+=(-args "$x"); done
	out=$(echo "$PASS" | "$GNOKEY" maketx call -home "$KH" -pkgpath "$GNOMES" -func "$fn" "${a[@]}" \
		-gas-fee 5000000ugnot -gas-wanted 200000000 -remote "$RPC" -chainid "$CHAINID" -broadcast -insecure-password-stdin test1 2>&1)
	printf %s "$out" | grep -q '^OK!' && return 0
	REFUSED=$(printf %s "$out" | grep -o 'gnomes: [^"]*' | head -1)
	[ -n "$REFUSED" ] || REFUSED=$(printf '%s\n' "$out" | tail -1)
	return 1
}
# a wave of data/gnomes.json (index from 0) on sale from NOW, its players' window as the catalogue says
open_wave() {
	local first lastid hours
	read -r first lastid hours < <(python3 -I -c 'import json,sys; s=json.load(open(sys.argv[1]))["series"][0]; w=s["plan"][int(sys.argv[2])]; print(w["first"], w["last"], s["sale"]["playerWindowHours"])' "$root/data/gnomes.json" "$1")
	owner AddWave "$first" "$lastid" "$NOW" "$hours" || return 1
	log "try-local: wave $(($1 + 1)) ($first-$lastid) on sale from now, its players' window ${hours} h"
}

case "${1:-}" in
wave2)
	running
	chainnow
	open_wave 1 || die "wave 2 was refused: $REFUSED"
	exit 0
	;;
all)
	# every wave not yet open, now: a wave open already is left as it is; any other refusal fails the command
	running
	chainnow
	n=$(python3 -I -c 'import json,sys; print(len(json.load(open(sys.argv[1]))["series"][0]["plan"]))' "$root/data/gnomes.json")
	failed=0 already=0
	for k in $(seq 0 $((n - 1))); do
		open_wave "$k" && continue
		case $REFUSED in
		*"in a wave already"*) already=$((already + 1)) ;;
		*) log "try-local: wave $((k + 1)) was refused: $REFUSED" && failed=$((failed + 1)) ;;
		esac
	done
	log "try-local: $already of $n waves were open already"
	[ "$failed" = 0 ] || die "$failed refused"
	exit 0
	;;
close)
	running
	days=${2:-30}
	[[ $days =~ ^[0-9]+$ ]] && [ "$days" -gt 0 ] || die "usage: scripts/try-local.sh close [days]"
	chainnow
	at=$((NOW + days * 86400))
	owner SetCloseAt "$at" || die "SetCloseAt was refused: $REFUSED"
	# seed.env says it too, as the seed wrote it
	{ grep -v '^CLOSE_AT=' "$WORK/seed.env"; echo "CLOSE_AT=$at"; } >"$WORK/seed.env.new" && mv "$WORK/seed.env.new" "$WORK/seed.env"
	log "try-local: the genesis closes in $days days"
	exit 0
	;;
rebuild)
	running
	[ -f "$WORK/site.env" ] || die "this playground was started before rebuild existed: restart it once"
	build_site
	log "try-local: the new site is in (the chain and the links kept running)"
	exit 0
	;;
down)
	# after a crash: the processes the last run recorded, and its Serve entries
	if [ -f "$last" ] && WORK=$(cat "$last") && [ -d "$WORK" ]; then
		for f in "$WORK/app.pid" "$WORK/dev.pid"; do [ -f "$f" ] && kill $(tree "$(cat "$f")") 2>/dev/null; done
		rm -f "$last"
	fi
	[ -x "$PREVIEW" ] && "$PREVIEW" list | grep -qx "$NAME:" && "$PREVIEW" down "$NAME"
	log "try-local: down"
	exit 0
	;;
"") ;;
*) die "usage: scripts/try-local.sh [wave2|all|close [days]|rebuild|down]" ;;
esac

# a port listened on, on any address (netstat sees tailscaled's own too, which lsof run as a user does not)
taken() { netstat -an -p tcp 2>/dev/null | grep -Eq "[.:]$1 +[^ ]+ +LISTEN"; }
if [ -z "${APP_PORT:-}" ]; then
	APP_PORT=5175
	while taken "$APP_PORT"; do APP_PORT=$((APP_PORT + 1)); done
fi
RPC_PORT=${RPC_PORT:-26667} GNOWEB_PORT=${GNOWEB_PORT:-8868}
CHAINID=${CHAINID:-gnogolf-local}
NS=${NS:-nym-trylocal000}
[ -x "$GNOKEY" ] && [ -x "$toolchain/gnodev" ] || die "no onyx toolchain in $toolchain (the README, \"Running it locally\"), or set GNO_TOOLCHAIN"
[ -d "$root/web/node_modules" ] || die "the client's packages are not installed: (cd web && npm ci)"
for p in "$APP_PORT" "$RPC_PORT" "$GNOWEB_PORT"; do
	! taken "$p" || die "port $p is taken (another gnodev or dev server?): stop it, or set APP_PORT, RPC_PORT, GNOWEB_PORT"
done
# the tailnet: this machine's Tailscale IP and ts.net name, and the skill that opens the Serve entries
TS_IP="" TS_NAME=""
if [ "${TAILNET:-1}" = 1 ] && command -v tailscale >/dev/null && TS_IP=$(tailscale ip -4 2>/dev/null | head -1) && [ -n "$TS_IP" ]; then
	[ -x "$PREVIEW" ] || die "the tailnet-preview skill is not at $PREVIEW (set TAILNET_PREVIEW, or TAILNET=0 for this machine alone)"
	! "$PREVIEW" list | grep -qx "$NAME:" || die "Serve entries of a former run are still up: scripts/try-local.sh down"
	TS_NAME=$(tailscale status --json | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')
fi
mkdir -p "$cache"
WORK=${WORK:-$(mktemp -d "$cache/run.XXXXXX")}

# Ctrl+C (or any end): the Serve entries, the site, then the chain, each with what it started
DEV_PID="" APP_PID="" SERVED=""
stop() {
	trap - INT TERM EXIT
	log ""
	log "try-local: stopping"
	[ -z "$SERVED" ] || "$PREVIEW" down "$NAME" >&2 || true
	for p in $APP_PID $DEV_PID; do kill $(tree "$p") 2>/dev/null; done
	wait 2>/dev/null
	rm -f "$last" "$WORK/app.pid" "$WORK/dev.pid"
	log "try-local: stopped (its files stay in $WORK)"
	exit 0
}
trap stop INT TERM EXIT
echo "$WORK" >"$last"

# ------------------------------------------------------------------ the chain
# the two wallets a person imports: made here, handed to the seed in its
# environment, never written down (the others stay the seed's own)
MNEMONIC_p1=$("$GNOKEY" generate 2>/dev/null | tail -1) MNEMONIC_p0=$("$GNOKEY" generate 2>/dev/null | tail -1)
[ "$(printf %s "$MNEMONIC_p1" | wc -w)" -ge 12 ] && [ "$(printf %s "$MNEMONIC_p0" | wc -w)" -ge 12 ] || die "gnokey generate made no seed phrase"
log "try-local: a local chain ($CHAINID), the realms under $NS and the course's 90 holes (a few minutes; its log: $WORK/seed.log)"
MNEMONIC_p1=$MNEMONIC_p1 MNEMONIC_p0=$MNEMONIC_p0 \
	SEED=1 SEED_WAVE2=0 SEED_CLOSE_DAYS=90 SEED_WORLDS="garden island town mountain mines" SEED_PUBLISHING=1 SEED_TREASURY=1 NS=$NS CHAINID=$CHAINID WORK=$WORK \
	RPC_ADDR=127.0.0.1:$RPC_PORT WEB_ADDR=127.0.0.1:$GNOWEB_PORT \
	bash "$root/scripts/e2e-gnomes.sh" >"$WORK/seed.out" 2>"$WORK/seed.log" ||
	{ DEV_PID=$(sed -n 's/^DEV_PID=//p' "$WORK/seed.env" 2>/dev/null); tail -5 "$WORK/seed.log" >&2; die "the seed failed (its steps: $WORK/e2e.md)"; }
# shellcheck disable=SC1091
. "$WORK/seed.env"
echo "$DEV_PID" >"$WORK/dev.pid"

# ------------------------------------------------------------------ the site
WALLET_RPC=http://127.0.0.1:$RPC_PORT WEB_URL=http://127.0.0.1:$GNOWEB_PORT
# the site as the real one is built, the playground's settings in it; served from WORK
start_app() {
	printf 'WALLET_RPC=%s\nWEB_URL=%s\n' "$WALLET_RPC" "$WEB_URL" >"$WORK/site.env"
	build_site
	log "try-local: the site on 127.0.0.1:$APP_PORT (its log: $WORK/site.log)"
	node "$root/scripts/playground-server.mjs" "$WORK/site" "$APP_PORT" "http://127.0.0.1:$RPC_PORT" >"$WORK/site.log" 2>&1 &
	APP_PID=$!
	echo "$APP_PID" >"$WORK/app.pid"
}
# the Serve entries first (the wallet's RPC and gnoweb are the client's settings), then the site
APP_HTTPS="" APP_TCP=""
if [ -n "$TS_NAME" ]; then
	SERVED=1 # (before: what a failing `up` opened is recorded, and removed on exit all the same)
	out=$("$PREVIEW" up "$NAME" "$APP_PORT" "$RPC_PORT:-" "$GNOWEB_PORT:-") || die "tailnet-preview refused: $out"
	APP_HTTPS=$(printf '%s\n' "$out" | sed -n "s#^ *\(https://[^ ]*\) *-> *127.0.0.1:$APP_PORT\$#\1#p")
	APP_TCP=$(printf '%s\n' "$out" | sed -n "s#^ *\(http://[^ ]*\) *-> *127.0.0.1:$APP_PORT .*#\1#p")
	WALLET_RPC=$(printf '%s\n' "$out" | sed -n "s#^ *\(http://[^ ]*\) *-> *127.0.0.1:$RPC_PORT .*#\1#p")
	WEB_URL=$(printf '%s\n' "$out" | sed -n "s#^ *\(http://[^ ]*\) *-> *127.0.0.1:$GNOWEB_PORT .*#\1#p")
	[ -n "$APP_HTTPS" ] && [ -n "$APP_TCP" ] && [ -n "$WALLET_RPC" ] && [ -n "$WEB_URL" ] || die "tailnet-preview said what this cannot read: $out"
fi
start_app
for _ in $(seq 120); do curl -sf -o /dev/null "http://127.0.0.1:$APP_PORT/" && break; sleep 1; done
curl -sf -o /dev/null "http://127.0.0.1:$APP_PORT/" || { tail -5 "$WORK/site.log" >&2; die "the site's server did not start"; }
# each address as a device on the tailnet reaches it (the ts.net name pinned to the IP: this machine's
# own resolver may not use Tailscale's DNS); the first https request waits for its certificate
check() { curl -s -o /dev/null -w '%{http_code}' --max-time 90 "$@"; }
pin=""
[ -z "$APP_HTTPS" ] || pin="--resolve ${APP_HTTPS#https://}:$TS_IP"
for u in "http://127.0.0.1:$APP_PORT" ${APP_TCP:+"$APP_TCP"} ${APP_HTTPS:+"$APP_HTTPS"}; do
	for path in / /rpc/status /g/; do
		code=$(check $pin "$u$path")
		[ "$code" = 200 ] || log "try-local: warning: $u$path answers $code"
	done
done
[ -z "$TS_NAME" ] || [ "$(check "$WALLET_RPC/status")" = 200 ] || log "try-local: warning: the wallet's RPC $WALLET_RPC does not answer"

# ------------------------------------------------------------------ the guide
cat <<EOF

================================================================ Gnogolf, local
$(if [ -n "$APP_HTTPS" ]; then
	printf '  Open  %s/   (https, a secure page: everything works)\n' "$APP_HTTPS"
	printf '  or    %s/   (http fallback, no Tailscale DNS needed: all of it\n' "$APP_TCP"
	printf '        but copying and sharing links)\n'
	printf '  If the https link does not open: Use Tailscale DNS on in that device'"'"'s Tailscale app.'
else printf '  Open  http://127.0.0.1:%s/   (this machine)' "$APP_PORT"; fi)

  Chain id   $CHAINID
  Wallet RPC $WALLET_RPC   (the page reads the chain through its own /rpc)
  gnoweb     $WEB_URL
  Realms     $GOLF
             $GNOMES

  Throwaway wallets, made for this run and this chain alone (5,000 GNOT each):
    p1  has a record (garden/3), Commons $(echo "$P1_GNOMES" | cut -d, -f1-2), Rare $(echo "$P1_GNOMES" | cut -d, -f3); wears $P1_EQUIPPED
        $MNEMONIC_p1
        address $p1
    p0  no record, no gnome (the players' window refuses it for the first hour)
        $MNEMONIC_p0
        address $p0

  Adena: Settings > Change Network > Add Custom Network:
    Network name  Gnogolf local    Chain ID  $CHAINID    RPC URL  $WALLET_RPC
  then import a seed phrase above as a wallet (a Chrome profile of its own
  keeps your real Adena apart).
  gnokey instead:
    gnokey add p1 -recover          (paste p1's phrase)
    gnokey maketx call -pkgpath $GNOMES -func Buy -args <id> -send <price>ugnot \\
      -gas-fee 5000000ugnot -gas-wanted 200000000 -remote $WALLET_RPC -chainid $CHAINID -broadcast p1

  Try (the title's "Click to start" opens "How do we play?": Solo, Duel, Builder, Gnomes):
    1. Play: Solo, a cup (all five are there), a hole; finish it, see the card
       (and the wave's line at its foot).
    2. The gnomes: the "Gnomes" card (also the picker's Collection band at its
       top, the cups screen's "Gnomes →"). Buy a Common, a Rare, an Epic and the
       Legendary #$LEGENDARY (p1: its window's caps); the two boxes, Adena, the receipt.
    3. Wear one: the gnome picker's row of yours; Show to everyone (Equip).
       Duel: race a player's ghost, their gnome on the boards and as the ghost.
    4. The region gate: add ?geo=blocked to the gnomes' page (/g/?geo=blocked).
    5. The Builder: the "Builder" card on a computer (a phone gets the
       community holes to play): the three hints (again with "?"), make a hole,
       Test it (hole it in each weather), Publish.
    6. Find it: Solo, the cups screen's "Community holes", under the cups.
  Wave 2 on sale now:  scripts/try-local.sh wave2   (every wave: all; an earlier close: close [days])
  This checkout's changes in, the site running all along:  scripts/try-local.sh rebuild
  Logs: $WORK   Ctrl+C stops everything (after a crash: scripts/try-local.sh down).
================================================================================
EOF
wait "$APP_PID"
