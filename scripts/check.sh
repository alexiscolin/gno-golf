#!/bin/sh
# check.sh [--smoke]: everything that must pass before a commit or a deploy.
# The Gno packages' tests with the pearl toolchain (their gas and storage
# goldens included) and the 74 holes' fingerprints, then the client: types,
# lint, the realm sync check, the unit tests with their coverage floor, and
# with --smoke the end-to-end run against a local chain and dev server (see
# the README). Stops at the first
# failure. This is also what a CI would run.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)

store=${XDG_CACHE_HOME:-$HOME/.cache}/gno-toolchains/pearl
GNO=${GNO:-$store/gno}
if [ -x "$GNO" ]; then
	: "${GNOROOT:=$(go env GOMODCACHE)/github.com/gnolang/gno@$(go version -m "$GNO" | awk '$1 == "mod" {print $3}')}"
	export GNOROOT
	echo "== gno test (pearl toolchain)"
	(cd "$root" && GNOHOME=$store/gnohome "$GNO" test ./gno.land/p/gnogolf/... ./gno.land/r/gnogolf/golf)
	echo "== the holes' fingerprints"
	(cd "$root" && GNOHOME=$store/gnohome "$GNO" test -run TestFingerprint ./gno.land/r/gnogolf/...)
else
	echo "check.sh: no pearl gno at $GNO: the Gno tests are skipped" >&2
fi

cd "$root/web"
echo "== typecheck" && npx tsc --noEmit
echo "== lint" && ./node_modules/.bin/eslint . ../media/promo ../media/camera ../media/lib ../scripts
echo "== selfcheck" && npm run -s selfcheck
echo "== unit tests" && npm test --silent
if [ "${1:-}" = "--smoke" ]; then echo "== smoke" && npm run -s smoke; fi
echo "all checks passed"
