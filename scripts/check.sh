#!/bin/sh
# check.sh [--smoke]: everything that must pass before a commit or a deploy.
# The Gno packages' tests with the onyx toolchain (their gas and storage
# goldens included), the course holes' fingerprints, and the deployed packages
# staged as addpkg takes them (stage.sh: at the deploy's paths, the repo's
# files byte for byte, linted), and the aim preview's wasm (wasm.sh --check:
# the build of these sources, bit for bit, and the realm's answers on the
# whole course, byte for byte; TinyGo needed); then the client: types, lint, the realm sync
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
	(cd "$root" && GNOHOME=$toolchain/gnohome "$GNO" test ./gno.land/p/gnogolf/... ./gno.land/r/gnogolf/golf/... ./gno.land/r/gnogolf/store)
	echo "== the holes' fingerprints, and data/holes.txt (what publishdata.sh publishes) their data"
	GNO=$GNO GNOHOME=$toolchain/gnohome "$root/scripts/holedata.sh" --check
	echo "== the staged packages: the repo's, byte for byte, and linted"
	stage=$(mktemp -d)
	trap 'rm -rf "$stage"' EXIT
	GNO=$GNO "$root/scripts/stage.sh" nym-stagecheck000 "$stage" # any name will do
	MAINNET=1 GNO=$GNO "$root/scripts/stage.sh" nym-stagecheck000 "$stage" # without v1, nor the import of its records
	echo "== the aim preview's wasm: the build of these sources, answering as the realm, byte for byte"
	GNO=$GNO "$root/scripts/wasm.sh" --check
else
	echo "check.sh: no onyx gno at $GNO. Build the toolchain there (the README, \"Running it locally\"), or set GNO_TOOLCHAIN (or GNO) to one; SKIP_GNO=1 checks the client alone." >&2
	exit 1
fi

cd "$root/web"
echo "== typecheck" && npx tsc --noEmit
echo "== lint" && npm run -s lint
echo "== selfcheck" && npm run -s selfcheck
echo "== unit tests" && npm test --silent
# the bot check's scoring: its rules are the private notes' (private/, beside the code), when checked out
if [ -f ../private/botcheck/score.test.ts ]; then
	echo "== the bot check: its types and its scoring" && npx tsc --noEmit -p ../private/botcheck/tsconfig.json
	node --experimental-strip-types --disable-warning=ExperimentalWarning --test ../private/botcheck/score.test.ts
fi
if [ "${1:-}" = "--smoke" ]; then echo "== smoke" && npm run -s smoke; fi
echo "all checks passed$skipped"
