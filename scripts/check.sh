#!/bin/sh
# check.sh [--smoke]: everything that must pass before a commit or a deploy.
# The Gno packages' tests with the onyx toolchain (their gas and storage
# goldens included), the course holes' fingerprints, and the deployed packages
# staged as addpkg takes them (stage.sh: at the deploy's paths, the repo's
# files byte for byte, linted); then the client: types, lint, the realm sync
# check, the unit tests with their coverage floor, and with --smoke the
# end-to-end run against a local chain and dev server (see the README). Stops
# at the first failure.
# This is also what a CI would run.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)

# The onyx toolchain (the README, "Running it locally"): GNO_TOOLCHAIN is the
# folder of the gno, gnokey and gnodev built from a gno checkout at the tag
# chain/onyx, each finding its GNOROOT (that checkout) by itself; GNO is the
# gno binary alone. Without it the check fails: SKIP_GNO=1 checks the client
# alone, and says so.
toolchain=${GNO_TOOLCHAIN:-${XDG_CACHE_HOME:-$HOME/.cache}/gno-toolchains/onyx}
GNO=${GNO:-$toolchain/gno}
skipped=""
if [ "${SKIP_GNO:-}" = 1 ]; then
	skipped=" (the Gno tests skipped: SKIP_GNO=1)"
	echo "check.sh: SKIP_GNO=1: the Gno tests are skipped" >&2
elif [ -x "$GNO" ]; then
	echo "== gno test (onyx toolchain)"
	(cd "$root" && GNOHOME=$toolchain/gnohome "$GNO" test ./gno.land/p/gnogolf/... ./gno.land/r/gnogolf/golf)
	echo "== the holes' fingerprints"
	(cd "$root" && GNOHOME=$toolchain/gnohome "$GNO" test -run TestFingerprint ./gno.land/r/gnogolf/...)
	echo "== the staged packages: the repo's, byte for byte, and linted"
	stage=$(mktemp -d)
	trap 'rm -rf "$stage"' EXIT
	GNO=$GNO "$root/scripts/stage.sh" nym-stagecheck000 "$stage" # any name will do; the deploy's is in deploy-v1.md
else
	echo "check.sh: no onyx gno at $GNO. Build the toolchain there (the README, \"Running it locally\"), or set GNO_TOOLCHAIN (or GNO) to one; SKIP_GNO=1 checks the client alone." >&2
	exit 1
fi

cd "$root/web"
echo "== typecheck" && npx tsc --noEmit
echo "== lint" && npm run -s lint
echo "== selfcheck" && npm run -s selfcheck
echo "== unit tests" && npm test --silent
if [ "${1:-}" = "--smoke" ]; then echo "== smoke" && npm run -s smoke; fi
echo "all checks passed$skipped"
