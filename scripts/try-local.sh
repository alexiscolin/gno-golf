#!/usr/bin/env bash
# try-local.sh: the whole game on this machine, to try by hand, from this
# machine or another one (Tailscale): a local chain with the game, the gnome
# shop and the Builder on it, throwaway wallets, and the site's dev server.
# Ctrl+C stops everything. docs/try-local.md says what to try.
#
#   scripts/try-local.sh          start it all (a new chain each time)
#   scripts/try-local.sh wave2    open the gnomes' wave 2 now, on the chain running
#
# What it does: scripts/e2e-gnomes.sh SEED=1 starts gnodev (the onyx
# toolchain's) and deploys physics, course, weblink, store, golf/v2 and
# gnomes under the test name NS; publishes the Garden's eighteen holes; the
# genesis series, wave 1 open (its players' window an hour), the close in 30
# days; community publishing open; the treasury moved to a test key; p1 and
# b1 with a record and a few gnomes. Then `next dev` with the shop, the
# Builder and the community holes on (NEXT_PUBLIC_GNOMES, BUILDER,
# COMMUNITY), pointed at that chain.
#
# Everything listens on 0.0.0.0, and the client is given HOST's addresses:
# a browser on another machine reaches the RPC and gnoweb at the address it
# loaded the page from (127.0.0.1 there would be its own machine).
#
# A page from http://<HOST> is not a "secure context" for a browser elsewhere
# (only https and this machine's own addresses are): no crypto.subtle (the
# Builder's proofs, the community holes' verdicts), no clipboard. So with
# Tailscale it is served over HTTPS too, on the tailnet alone (`tailscale
# serve`, never funnel): https://<this machine's MagicDNS name>/ for the site,
# :8443 the RPC, :8444 gnoweb, and the client given those https addresses
# (an http page may read them too). Its three entries are removed on exit;
# the other entries of `tailscale serve` are not touched. TS_HTTPS=0: http
# alone (the guide then prints the Chrome flag that makes it secure).
#
# Env: HOST (this machine's Tailscale address, `tailscale ip -4`, else
# 127.0.0.1), APP_PORT (5174, or the first free port after it when unset:
# `tailscale serve` may hold it on the Tailscale address), RPC_PORT (26667), GNOWEB_PORT (8868: not
# gnodev's own 26657 and 8888, often another node's), CHAINID
# (gnogolf-local: not "dev", which Adena keeps for its own network), NS
# (nym-trylocal000), WORK (a new folder under ~/.cache/gnogolf-try-local),
# GNO_TOOLCHAIN as in check.sh. Local only: the keys are made for this chain
# and nothing is sent anywhere else.
set -u
root=$(cd "$(dirname "$0")/.." && pwd)
toolchain=${GNO_TOOLCHAIN:-${XDG_CACHE_HOME:-$HOME/.cache}/gno-toolchains/onyx}
GNOKEY=${GNOKEY:-$toolchain/gnokey}
cache=${XDG_CACHE_HOME:-$HOME/.cache}/gnogolf-try-local
last=$cache/last # the WORK of the chain running, for `wave2`
log() { printf '%s\n' "$*" >&2; }
die() { log "try-local: $*"; exit 1; }

# wave2: the next wave of data/gnomes.json on sale from now, its players'
# window as the catalogue says, sent by the collection's owner (test1)
if [ "${1:-}" = wave2 ]; then
	[ -f "$last" ] && WORK=$(cat "$last") && [ -f "$WORK/seed.env" ] || die "no playground running (start one with scripts/try-local.sh)"
	# shellcheck disable=SC1091
	. "$WORK/seed.env"
	jf() { python3 -I -c 'import json,sys; d=json.load(open(sys.argv[1])); print(eval(sys.argv[2], {"d": d}))' "$root/data/gnomes.json" "$1"; }
	first=$(jf "d['series'][0]['plan'][1]['first']") lastid=$(jf "d['series'][0]['plan'][1]['last']") hours=$(jf "d['series'][0]['sale']['playerWindowHours']")
	now=$(curl -s "$RPC/status" | python3 -I -c 'import json,sys,re; from datetime import datetime; t=json.load(sys.stdin)["result"]["sync_info"]["latest_block_time"]; print(int(datetime.fromisoformat(re.sub(r"\.\d+","",t).replace("Z","+00:00")).timestamp()))')
	echo "$PASS" | "$GNOKEY" maketx call -home "$KH" -pkgpath "$GNOMES" -func AddWave -args "$first" -args "$lastid" -args "$now" -args "$hours" \
		-gas-fee 5000000ugnot -gas-wanted 200000000 -remote "$RPC" -chainid "$CHAINID" -broadcast -insecure-password-stdin test1 |
		grep -q '^OK!' || die "AddWave($first, $lastid) was refused (is wave 2 open already?)"
	log "try-local: wave 2 ($first-$lastid) on sale from now, its players' window ${hours} h"
	exit 0
fi
[ -z "${1:-}" ] || die "usage: scripts/try-local.sh [wave2]"

HOST=${HOST:-$(tailscale ip -4 2>/dev/null | head -1)}
HOST=${HOST:-127.0.0.1}
# a port listened on, on any address (netstat sees tailscaled's own too, which lsof run as a user does not)
taken() { netstat -an -p tcp 2>/dev/null | grep -Eq "[.:]$1 +[^ ]+ +LISTEN"; }
if [ -z "${APP_PORT:-}" ]; then
	APP_PORT=5174
	while taken "$APP_PORT"; do APP_PORT=$((APP_PORT + 1)); done
fi
RPC_PORT=${RPC_PORT:-26667} GNOWEB_PORT=${GNOWEB_PORT:-8868}
# HTTPS on the tailnet: the MagicDNS name, and three serve ports free of the user's own entries
TS_NAME="" TS_PORTS="443 8443 8444"
if [ "${TS_HTTPS:-1}" = 1 ] && command -v tailscale >/dev/null && tailscale ip -4 2>/dev/null | grep -qx "$HOST"; then
	TS_NAME=$(tailscale status --json | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')
	used=$(tailscale serve status --json | python3 -I -c 'import json,sys; d=json.load(sys.stdin) or {}; print(" ".join(list(d.get("TCP") or {})))')
	for p in $TS_PORTS; do case " $used " in *" $p "*) die "tailscale serve already uses port $p: remove that entry, or TS_HTTPS=0" ;; esac; done
fi
CHAINID=${CHAINID:-gnogolf-local}
NS=${NS:-nym-trylocal000}
[ -x "$GNOKEY" ] && [ -x "$toolchain/gnodev" ] || die "no onyx toolchain in $toolchain (the README, \"Running it locally\"), or set GNO_TOOLCHAIN"
[ -d "$root/web/node_modules" ] || die "the client's packages are not installed: (cd web && npm ci)"
for p in "$APP_PORT" "$RPC_PORT" "$GNOWEB_PORT"; do
	! taken "$p" || die "port $p is taken (another gnodev or dev server?): stop it, or set APP_PORT, RPC_PORT, GNOWEB_PORT"
done
mkdir -p "$cache"
WORK=${WORK:-$(mktemp -d "$cache/run.XXXXXX")}

# Ctrl+C (or any end): the dev server, then the chain, each with what it started
DEV_PID="" APP_PID=""
tree() { local c; for c in $(pgrep -P "$1"); do tree "$c"; done; echo "$1"; }
stop() {
	trap - INT TERM EXIT
	log ""
	log "try-local: stopping"
	if [ -n "$TS_NAME" ]; then for p in $TS_PORTS; do tailscale serve --https="$p" off >/dev/null 2>&1; done; fi
	for p in $APP_PID $DEV_PID; do kill $(tree "$p") 2>/dev/null; done
	wait 2>/dev/null
	rm -f "$last"
	log "try-local: stopped (its files stay in $WORK)"
	exit 0
}
trap stop INT TERM EXIT

# ------------------------------------------------------------------ the chain
log "try-local: a local chain ($CHAINID) and the realms under $NS, seeded (a few minutes; its log: $WORK/seed.log)"
SEED=1 SEED_WAVE2=0 SEED_WORLDS=garden SEED_PUBLISHING=1 SEED_TREASURY=1 NS=$NS CHAINID=$CHAINID WORK=$WORK \
	RPC_ADDR=127.0.0.1:$RPC_PORT WEB_ADDR=127.0.0.1:$GNOWEB_PORT RPC_LISTEN=0.0.0.0:$RPC_PORT WEB_LISTEN=0.0.0.0:$GNOWEB_PORT \
	bash "$root/scripts/e2e-gnomes.sh" >"$WORK/seed.out" 2>"$WORK/seed.log" ||
	{ DEV_PID=$(sed -n 's/^DEV_PID=//p' "$WORK/seed.env" 2>/dev/null); tail -5 "$WORK/seed.log" >&2; die "the seed failed (its steps: $WORK/e2e.md)"; }
# shellcheck disable=SC1091
. "$WORK/seed.env"
echo "$WORK" >"$last"

# ------------------------------------------------------------------ the site
RPC_URL=http://$HOST:$RPC_PORT WEB_URL=http://$HOST:$GNOWEB_PORT APP_URL=http://$HOST:$APP_PORT
APP_HTTPS="" ORIGINS=$HOST
if [ -n "$TS_NAME" ]; then
	set -- $TS_PORTS
	tailscale serve --bg --https="$1" "http://127.0.0.1:$APP_PORT" >/dev/null &&
		tailscale serve --bg --https="$2" "http://127.0.0.1:$RPC_PORT" >/dev/null &&
		tailscale serve --bg --https="$3" "http://127.0.0.1:$GNOWEB_PORT" >/dev/null || die "tailscale serve refused (TS_HTTPS=0 for http alone)"
	APP_HTTPS=https://$TS_NAME RPC_URL=https://$TS_NAME:$2 WEB_URL=https://$TS_NAME:$3 ORIGINS=$HOST,$TS_NAME
	[ "$1" = 443 ] || APP_HTTPS=$APP_HTTPS:$1
fi
log "try-local: the site's dev server on $APP_URL (its log: $WORK/next.log)"
(cd "$root/web" && exec env NEXT_PUBLIC_RPC="$RPC_URL" NEXT_PUBLIC_WEB="$WEB_URL" NEXT_PUBLIC_REALM="$GOLF" \
	NEXT_PUBLIC_NETWORK=testnet NEXT_PUBLIC_GNOMES=1 NEXT_PUBLIC_BUILDER=1 NEXT_PUBLIC_COMMUNITY=1 DEV_ORIGINS="$ORIGINS" \
	npm run -s dev -- -H 0.0.0.0 -p "$APP_PORT") >"$WORK/next.log" 2>&1 &
APP_PID=$!
for _ in $(seq 120); do curl -sf -o /dev/null "http://127.0.0.1:$APP_PORT/" && break; sleep 1; done
curl -sf -o /dev/null "http://127.0.0.1:$APP_PORT/" || { tail -5 "$WORK/next.log" >&2; die "the dev server did not start"; }
# each address as a browser elsewhere reaches it (the MagicDNS name pinned to HOST: this machine's own
# resolver may not use Tailscale's DNS); the first https request waits for its certificate
for u in "$APP_URL/" ${APP_HTTPS:+"$APP_HTTPS/"} "$RPC_URL/status" "$WEB_URL/"; do
	pin=$(printf %s "$u" | sed -n "s#^https://\($TS_NAME\)\(:\([0-9]*\)\)\{0,1\}/.*#--resolve \1:\3:$HOST#p" | sed "s/::/:443:/")
	curl -s -o /dev/null --max-time 90 $pin "$u" || log "try-local: warning: $u does not answer from this machine (a firewall?)"
done
curl -sf -o /dev/null "$APP_URL/g/" # (the first visit of a page compiles it: the gallery's, before anyone waits on it)

# ------------------------------------------------------------------ the guide
# shellcheck disable=SC1091
. "$WORK/mnemonics.env"
cat <<EOF

================================================================ Gnogolf, local
$( [ -n "$APP_HTTPS" ] && printf '  Open  %s/   (https: everything works, any browser on the tailnet)\n  or    %s/   (http)' "$APP_HTTPS" "$APP_URL" || printf '  Open  %s/' "$APP_URL")
  (this machine: http://127.0.0.1:$APP_PORT/ plays the same chain)

  Chain id   $CHAINID
  RPC        $RPC_URL
  gnoweb     $WEB_URL
  Realms     $GOLF
             $GNOMES

  Throwaway wallets (this chain only, 5,000 GNOT each):
    p1  has a record (garden/3), Commons $(echo "$P1_GNOMES" | cut -d, -f1-2), Rare $(echo "$P1_GNOMES" | cut -d, -f3); wears $P1_EQUIPPED
        $MNEMONIC_p1
        address $p1
    p0  no record, no gnome (the players' window refuses it for the first hour)
        $MNEMONIC_p0
        address $p0

  The http link elsewhere is not a secure page: the Builder (test, publish),
  the community holes' check and copying links need one. Use https, or in
  that device's Chrome enable chrome://flags/#unsafely-treat-insecure-origin-as-secure
  for $APP_URL

  Adena: Settings > Change Network > Add Custom Network:
    Network name  Gnogolf local    Chain ID  $CHAINID    RPC URL  $RPC_URL
  then import a seed phrase above as a wallet (a Chrome profile of its own
  keeps your real Adena apart).
  gnokey instead:
    gnokey add p1 -recover          (paste p1's phrase)
    gnokey maketx call -pkgpath $GNOMES -func Buy -args <id> -send <price>ugnot \\
      -gas-fee 5000000ugnot -gas-wanted 200000000 -remote $RPC_URL -chainid $CHAINID -broadcast p1

  Try:
    1. Play a Garden hole (the title's Play), finish it, see the card.
    2. The gnomes: /g/ . Buy a Common, a Rare, an Epic and the Legendary #$LEGENDARY
       (p1: its window's caps); the order's two boxes, Adena, the receipt.
    3. Wear one: the gnome picker's Yours row; Show to everyone (Equip).
       Race a board's ghost: see the rivals' gnomes on the boards and as ghosts.
    4. The region gate: /g/?geo=blocked (a dev build alone).
    5. The Builder: /build/ on a computer: make a hole, Test it
       (hole it in each weather), Publish (Adena or the gnokey line).
    6. Find it: the cups screen's community holes.
  Wave 2 on sale now:  scripts/try-local.sh wave2   (another terminal)
  Logs: $WORK   Ctrl+C stops everything.
================================================================================
EOF
wait "$APP_PID"
