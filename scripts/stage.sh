#!/bin/sh
# stage.sh <ns> <out>: the deployed packages, under the gno.land name <ns> and
# the game's own sub-path, gnogolf (an address has one name, so each game
# under it takes a sub-path), ready for addpkg:
#
#   p/gnogolf/physics  ->  p/<ns>/gnogolf/physics
#   p/gnogolf/course   ->  p/<ns>/gnogolf/course
#   r/gnogolf/golf     ->  r/<ns>/gnogolf/golf      the v1 rules, on onyx
#   r/gnogolf/store    ->  r/<ns>/gnogolf/store     the records
#   r/gnogolf/golf/v2  ->  r/<ns>/gnogolf/golf/v2   the rules that write them
#
#   scripts/stage.sh nym-alexiscolin000 /tmp/stage           onyx
#   MAINNET=1 scripts/stage.sh nym-alexiscolin000 /tmp/stage mainnet
#
# MAINNET=1 leaves out v1 and v2's import_v1.gno (the migration of onyx's v1
# records, which imports v1): mainnet starts with no v1 to read.
#
# A realm keeps its last element, golf (v2's version suffix aside): the chain
# takes a package only when its name is its path's last element (gnovm's
# ValidatePkgNameMatchesPath).
#
# Copies every file of each package's directory but its tests (*_test.gno,
# *_filetest.gno) into <out>/gno.land/…, as it is. The one change is that
# prefix, [pr]/gnogolf/ to [pr]/<ns>/gnogolf/, wherever a path is named (the
# imports, gnomod.toml's module). The subpackages (physics/build,
# course/author, course/fingerprint) and the hole realms are other
# directories, and not deployed. Then it checks that each staged package is
# the repo's, file for file and byte for byte once the prefix is read back;
# that no repo path is left; that each gnomod.toml names its own path; lints
# the result with the onyx toolchain; and prints each package's size.
#
# GNO is the gno binary to lint with (default: the onyx toolchain's, in
# GNO_TOOLCHAIN: see check.sh).
set -eu

ns=${1:?usage: stage.sh <ns> <out>}
out=${2:?usage: stage.sh <ns> <out>}
if ! printf %s "$ns" | grep -Eqx 'nym-[a-z]{5,13}[0-9]{3}'; then
	echo "stage.sh: $ns is not a nym name (nym-<5 to 13 letters><3 digits>)" >&2
	exit 1
fi
to() { sed "s#gno\.land/\([pr]\)/gnogolf/#gno.land/\1/$ns/gnogolf/#g"; }
back() { sed "s#gno\.land/\([pr]\)/$ns/gnogolf/#gno.land/\1/gnogolf/#g"; }

root=$(cd "$(dirname "$0")/.." && pwd)
pkgs="gno.land/p/gnogolf/physics gno.land/p/gnogolf/course gno.land/r/gnogolf/golf gno.land/r/gnogolf/store gno.land/r/gnogolf/golf/v2"
skip='_(file)?test\.gno$'
if [ "${MAINNET:-}" = 1 ]; then
	pkgs=$(echo "$pkgs" | sed 's# gno.land/r/gnogolf/golf # #')
	skip='_(file)?test\.gno$|^import_v1\.gno$'
fi
rm -rf "$out/gno.land"
for pkg in $pkgs; do
	dst=$out/$(echo "$pkg" | to)
	mkdir -p "$dst"
	for f in "$root/$pkg"/*; do
		[ -f "$f" ] || continue
		basename "$f" | grep -Eq "$skip" && continue
		to <"$f" >"$dst/$(basename "$f")"
	done
done

fail=0
# the staged packages are the repo's: the same files, and each the same bytes
# once the prefix is read back
for pkg in $pkgs; do
	dst=$out/$(echo "$pkg" | to)
	want=$(cd "$root/$pkg" && for f in *; do [ -f "$f" ] && echo "$f"; done | grep -Ev "$skip" | LC_ALL=C sort)
	got=$(cd "$dst" && for f in * .*; do [ -f "$f" ] && echo "$f"; done | LC_ALL=C sort)
	if [ "$want" != "$got" ]; then
		echo "stage.sh: $pkg staged other files than the repo's:" >&2
		printf 'repo:   %s\nstaged: %s\n' "$(echo $want)" "$(echo $got)" >&2
		fail=1
	fi
	for f in $want; do
		if ! back <"$dst/$f" | cmp -s - "$root/$pkg/$f"; then
			echo "stage.sh: $pkg/$f is not the repo's" >&2
			fail=1
		fi
	done
done
if grep -rn 'gno\.land/[pr]/gnogolf' "$out/gno.land"; then
	echo "stage.sh: a repo path is still named above" >&2
	fail=1
fi
for m in $(find "$out/gno.land" -name gnomod.toml); do
	d=$(dirname "$m")
	grep -qx "module = \"${d#"$out"/}\"" "$m" || { echo "stage.sh: $m does not name its own path" >&2; fail=1; }
	grep -q '^gno = "0.9"$' "$m" || { echo "stage.sh: $m is not gno 0.9" >&2; fail=1; }
	if grep -q 'replace' "$m"; then echo "stage.sh: $m has a replace" >&2; fail=1; fi
done
[ $fail = 0 ] || exit 1

toolchain=${GNO_TOOLCHAIN:-${XDG_CACHE_HOME:-$HOME/.cache}/gno-toolchains/onyx}
GNO=${GNO:-$toolchain/gno}
if [ -x "$GNO" ]; then
	[ -f "$out/gnowork.toml" ] || : >"$out/gnowork.toml"
	(cd "$out" && GNOHOME=$toolchain/gnohome "$GNO" lint ./gno.land/...)
else
	echo "stage.sh: no onyx gno at $GNO, not linted" >&2
fi

for d in $(find "$out/gno.land" -name gnomod.toml -exec dirname {} \; | sort); do
	printf '%8d B  %s\n' "$(find "$d" -maxdepth 1 -type f -exec cat {} + | wc -c)" "${d#"$out"/}"
done
