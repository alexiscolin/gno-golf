#!/usr/bin/env bash
# e2e-builder.sh: holes made with the Builder, published for real, on a local
# chain of its own. It starts a gnodev with throwaway keys, stages and
# deploys what golf/v2 needs (store and golf/v2 and their packages, under the
# test name NS, as scripts/stage.sh does), opens publishing as golf's owner,
# then hands over to scripts/e2e-builder.ts: drafts built with the Builder's
# code, checked, proved in test mode, published with the exact gnokey
# command the Builder prints, then read and played back from the chain; a
# few holes the Builder refuses, published around it; what each publish
# stored and cost against the bill the Builder shows. Each step is a call
# and what it must give; the table goes to OUT, a markdown file.
#
#   scripts/e2e-builder.sh
#
# Local only. The chain is a gnodev on its own ports (RPC 127.0.0.1:26757,
# gnoweb :8898 by default: 26657 is often another gnodev's), its keys made in
# WORK (test1 is gnodev's well-known deploy key, golf's owner; the authors
# and the player are generated each run). Nothing reads or writes another
# keybase, and no chain but that gnodev is ever named.
#
# Needs web/node_modules (npm ci in web/: the census draws with three). Env:
# NS (nym-buildtest000), RPC_ADDR, WEB_ADDR, WORK (a new temp dir), OUT
# ($WORK/e2e.md), KEEP=1 leaves the chain running, GNO_TOOLCHAIN as in
# check.sh.
set -u

root=$(cd "$(dirname "$0")/.." && pwd)
toolchain=${GNO_TOOLCHAIN:-${XDG_CACHE_HOME:-$HOME/.cache}/gno-toolchains/onyx}
GNOKEY=${GNOKEY:-$toolchain/gnokey}
GNODEV=${GNODEV:-$toolchain/gnodev}
NS=${NS:-nym-buildtest000}
RPC_ADDR=${RPC_ADDR:-127.0.0.1:26757}
WEB_ADDR=${WEB_ADDR:-127.0.0.1:8898}
WORK=${WORK:-$(mktemp -d)}
OUT=${OUT:-$WORK/e2e.md}
CHAINID=dev
PASS=pass # the throwaway keys' password
GOLF=gno.land/r/$NS/gnogolf/golf/v2
KH=$WORK/keys
mkdir -p "$WORK"
log() { printf '%s\n' "$*" >&2; }
die() { log "e2e: $*"; exit 1; }
[ -d "$root/web/node_modules/three" ] || die "web/node_modules is missing: npm ci in web/"

# shellcheck source=lib/e2e.sh
. "$root/scripts/lib/e2e.sh"
q() { "$GNOKEY" query vm/qeval -remote "$RPC_ADDR" -data "$GOLF.$1" 2>&1 | sed -n 's/^data: //p'; }

# the report: the rows the TypeScript driver goes on with (its row(), the same table)
report

# ------------------------------------------------------------------- chain
log "e2e: work dir $WORK"
addkey test1 "$TEST1_MNEMONIC"
for k in a1 a2 pl; do addkey $k "$("$GNOKEY" generate 2>/dev/null | tail -1)"; done
OWNER=$(addr test1) A1=$(addr a1) A2=$(addr a2) PL=$(addr pl)
[ -n "$PL" ] || die "the keys were not made"
if curl -s "http://$RPC_ADDR/status" >/dev/null; then die "a node answers on $RPC_ADDR already: stop it, or set RPC_ADDR"; fi
pre=()
for a in $A1 $A2 $PL; do pre+=(-add-account "$a=1000000000ugnot"); done
# the examples the packages import, loaded at start: gnodev loads one lazily
# by reloading the node, which a transaction then in flight does not survive
# (refused "unauthorized")
deps=gno.land/p/nt/bptree/v0,gno.land/p/nt/ufmt/v0,gno.land/r/sys/users
mkdir -p "$WORK/devroot"
(cd "$WORK/devroot" && exec "$GNODEV" local -no-watch -empty-blocks -empty-blocks-interval 1 \
	-node-rpc-listener "$RPC_ADDR" -web-listener "$WEB_ADDR" -paths "$deps" "${pre[@]}") >"$WORK/gnodev.log" 2>&1 &
DEV=$!
[ "${KEEP:-}" = 1 ] || trap 'kill $DEV 2>/dev/null' EXIT
for _ in $(seq 60); do curl -s "http://$RPC_ADDR/status" >/dev/null && break; sleep 1; done
curl -s "http://$RPC_ADDR/status" >/dev/null || die "gnodev did not start (see $WORK/gnodev.log)"

# ------------------------------------------------------------------ deploy
MAINNET=1 sh "$root/scripts/stage.sh" "$NS" "$WORK/stage" >"$WORK/stage.log" 2>&1 || die "stage.sh failed (see $WORK/stage.log)"
for p in p/$NS/gnogolf/physics p/$NS/gnogolf/course r/$NS/gnogolf/store r/$NS/gnogolf/golf/v2; do
	sleep 2 # (the last deploy's block in, so that the sequence read is its next)
	TXOUT=$(echo "$PASS" | "$GNOKEY" maketx addpkg -home "$KH" -pkgpath "gno.land/$p" -pkgdir "$WORK/stage/gno.land/$p" -gas-fee 10000000ugnot \
		-gas-wanted 900000000 -max-deposit 1000000000ugnot -remote "$RPC_ADDR" -chainid "$CHAINID" -broadcast -insecure-password-stdin test1 2>&1)
	GAS=$(printf %s "$TXOUT" | sed -n 's/^GAS USED: *//p')
	if printf %s "$TXOUT" | grep -q '^OK!'; then row "deploy" "addpkg gno.land/$p" "deployed" "deployed" 0 "$GAS"
	else row "deploy" "addpkg gno.land/$p" "deployed" "$(printf %s "$TXOUT" | grep -m1 'Data:')" 1 "$GAS"; die "deploy of $p failed"; fi
done

# --------------------------------------------------- publishing, opened
no "publishing: closed at deploy" "golf: publishing community holes is not open yet" a1 "$GOLF" PublishMine early "$(awk '$1=="garden/3"{print $4}' "$root/data/holes.txt")" ""
no "publishing: owner only" "golf: only the owner can open or close publishing" a1 "$GOLF" SetPublishing true
ok "publishing: the owner opens it" "opened" test1 "$GOLF" SetPublishing true
is "publishing: Publishing()" "Publishing()" "(true bool)" "$(q 'Publishing()')"

# --------------------------------------------- the Builder's holes, played
cd "$root/web" || die "no web/"
RPC="http://$RPC_ADDR" WEB="http://$WEB_ADDR" NEXT_PUBLIC_REALM=$GOLF GNOKEY=$GNOKEY KEYHOME=$KH PASS=$PASS \
	OWNER=$OWNER A1=$A1 A2=$A2 PL=$PL OUT=$OUT N0=$n PASS0=$npass FAIL0=$nfail FAILS0="$FAILS" \
	node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./test/setup.mjs ../scripts/e2e-builder.ts
