# Final audit: p/gnogolf/physics and p/gnogolf/course (before the pearl deploy)

This is the gno-auditor's report; the coordinator saved it here. It covers the staged source at HEAD affe241, cross-checked against test-gnogolf.

## Verdict

PROCEED WITH CAUTION. Nothing blocks the deploy and nothing is exploitable today. Because `/p/` packages are frozen once deployed:
- fix Y1 before staging (a one-line change that moves no shot);
- decide on Y3 now.

## YELLOW findings

### Y1: ParOf, OrderOf and WorldOf check one call's result and return another's (90%)

**Where:** `course/course.gno:45-73`.

**What happens:**
- `ParOf` calls `p.Par()` three times, so a hostile realm hole can return 3, 3 and then -7.
- `golf.Register` stores `course.ParOf(h)` without checking it again (`golf.gno:344`). The bad par then reaches that community hole's JSON and its Render tables.
- Golf re-checks order and world itself, so only par gets through.

**Fix:** call each method once and bound the local value, for example `if n := p.Par(); n > 0 && n < 20 { return n }`. Do the same in OrderOf and WorldOf, then add a doc line saying the helpers trust the Hole they're given. Honest holes behave exactly as before.

### Y2: Simple and Marks expose mutators that run with the owning realm's authority (85%)

Anyone holding a `*course.Simple` can call `MarkOn` or `Play`, which writes the allocating realm's wear grid (borrow rule #2).

**Why it isn't exploitable today:**
- the hole realms keep `me` unexported;
- golf never returns a hole or a field;
- data holes are decoded fresh on every call.

**Fix:** a doc line on Simple and Marks saying that holding the pointer lets you mark the wear, so an importer must never export it.

### Y3: Decode trusts the stored wall lengths; only Exact checks them (85%)

Golf runs `Decode`, then `Exact`, then `Encode == data` when a hole is published. A future importer that skips `Exact` could ship rigged holes.

**Fix:** consider adding `DecodeChecked` (Decode followed by Exact) before the freeze. Also document that `Exact` only works on freshly decoded values: on a value stored in another realm it panics, because the copy keeps the read-only mark.

### Y4: all the physics is floating point in paths that must be deterministic (95%)

This is an accepted design choice. It is deterministic on a single VM version.

**Fix:** record the toolchain the fingerprints were captured on, and state in the docs that callers must pass finite inputs.

## GREEN

- **Classes 1a, 1b, 2 and 4, and hypotheses B and C:** nothing takes a realm, a func parameter or a func field, and no closure escapes.
- **State and getters:** there is no exported mutable package state, and getters return copies.
- **Borrow rules:** the only writes through a receiver are Marks.Mark/MarkOn, which touch only the allocating realm's wear cells.
- **Decode as a hostile parser:** bounds, running totals, finiteness, polygon and timing rules, no trailing bytes, no overflow.
- **Staging:** the fingerprint package is test-only, and stage.sh never copies it.
- **Wording to fix:** the docs of WithTick, WithZones, WithExtras and WithWeather say "a new Field", but these may return the input itself. Reword to "may be f itself; do not mutate".

## Open questions

1. **Per-shot gas worst case under the frozen limits.**
   - SpeedCap is applied only on a bounce, but a slope with Scale 8 can reach about 69 units per substep. A maximal hostile PublishMine hole might then exceed pearl's tx or query gas cap, for its own players only.
   - Measure one worst-case GG1 hole before staging, and fix or reword the SpeedCap doc.
2. **float→int conversion of NaN or Inf:** is it defined the same way on every platform? Golf's finite checks make it unreachable through golf.
3. **Community realm holes:** their methods run under golf's authority (hypothesis C). This belongs in the golf audit.
