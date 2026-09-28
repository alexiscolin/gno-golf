#!/bin/sh
# stage.sh <ns> <out>: the three deployed packages (physics, course, golf),
# under the namespace <ns>, ready for addpkg.
#
#   scripts/stage.sh nym-golfer000 /tmp/stage  the production namespace (onyx)
#   scripts/stage.sh gnogolf /tmp/stage        the canonical repo tree (the
#                                              identity; what check.sh stages)
#
# Copies every file of each package's directory but its tests (*_test.gno,
# *_filetest.gno) into <out>/gno.land/{p,r}/<ns>/…, as it is. The one change
# is the namespace in the import paths (gno.land/[pr]/gnogolf/ to <ns>),
# which is none at all for gnogolf. The subpackages (physics/build,
# course/author, course/fingerprint) and the hole realms are other
# directories, and not deployed. Then it checks that each staged package is
# the repo's, file for file and byte for byte once the namespace is read
# back; that nothing of the old namespace is left; lints the result with the
# onyx toolchain; and prints each package's size.
#
# GNO is the gno binary to lint with (default: the onyx toolchain's, in
# GNO_TOOLCHAIN: see check.sh).
set -eu

ns=${1:?usage: stage.sh <ns> <out>}
out=${2:?usage: stage.sh <ns> <out>}
if [ "$ns" != gnogolf ] && ! printf %s "$ns" | grep -Eqx 'nym-[a-z]{5,13}[0-9]{3}'; then
	echo "stage.sh: $ns is neither gnogolf nor a nym name (nym-<5 to 13 letters><3 digits>)" >&2
	exit 1
fi

root=$(cd "$(dirname "$0")/.." && pwd)
src=$root/gno.land
pkgs="p/gnogolf/physics p/gnogolf/course r/gnogolf/golf"
rm -rf "$out/gno.land"
for pkg in $pkgs; do
	dst=$out/gno.land/$(echo "$pkg" | sed "s#/gnogolf/#/$ns/#")
	mkdir -p "$dst"
	for f in "$src/$pkg"/*; do
		[ -f "$f" ] || continue
		case $f in *_test.gno | *_filetest.gno) continue ;; esac
		sed "s#gno\.land/\([pr]\)/gnogolf/#gno.land/\1/$ns/#g" "$f" >"$dst/$(basename "$f")"
	done
done

fail=0
# the staged packages are the repo's: the same files, and each the same bytes
# once its namespace is read back
for pkg in $pkgs; do
	dst=$out/gno.land/$(echo "$pkg" | sed "s#/gnogolf/#/$ns/#")
	want=$(cd "$src/$pkg" && for f in *; do [ -f "$f" ] && echo "$f"; done | grep -Ev '_(file)?test\.gno$' | LC_ALL=C sort)
	got=$(ls -A "$dst" | LC_ALL=C sort)
	if [ "$want" != "$got" ]; then
		echo "stage.sh: $pkg staged other files than the repo's:" >&2
		printf 'repo:   %s\nstaged: %s\n' "$(echo $want)" "$(echo $got)" >&2
		fail=1
	fi
	for f in $want; do
		if ! sed "s#gno\.land/\([pr]\)/$ns/#gno.land/\1/gnogolf/#g" "$dst/$f" | cmp -s - "$src/$pkg/$f"; then
			echo "stage.sh: $pkg/$f is not the repo's" >&2
			fail=1
		fi
	done
done
if [ "$ns" != gnogolf ] && grep -rn 'gno\.land/[pr]/gnogolf' "$out/gno.land"; then
	echo "stage.sh: the old namespace is still named above" >&2
	fail=1
fi
for m in $(find "$out/gno.land" -name gnomod.toml); do
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
	printf '%8d B  %s\n' "$(cat "$d"/* | wc -c)" "${d#"$out"/}"
done
