# Final audit: r/gnogolf/golf (before the pearl deploy)

This is the gno-auditor's report; the coordinator saved it here. It covers the working tree at affe241, read on-chain from test-gnogolf.

## Verdict

PROCEED WITH CAUTION. No non-owner can affect the official course, its rankings or another player's records. One YELLOW remains.

## Y1: community realm holes run arbitrary code in the player's transaction (85%)

**Where:**
- `Register` stores any `course.Hole` (golf.gno:311-348).
- Golf then calls the hole's own methods when anyone plays it: PlayWith, Play, PlayAt, Start, Cup and Field (golf.gno:726, 872, 483, 618; state.gno:44-65; render.gno:271-306).

**Class:** Class 3, impl-substitution, which also breaks safety hypothesis (C).

**The exploit:**
1. A hostile hole type, declared in the attacker's own realm, pads that realm's storage on every play.
2. The keeper charges that storage deposit to the caller (keeper.go:2407), so the player pays it, up to max_deposit or DefaultDeposit.
3. The attacker later frees the storage and collects the refund (keeper.go:2465). If ugnot is restricted, the refund goes to the fee collector instead, and the player still loses the deposit.

**Secondary path (below 80% confidence):** a /p/ primitive-typed hole, or a typed-nil hole (which passes the `h == nil` check), may run with golf as the current realm. It could then call golf's crossing functions as golf.

**What it cannot reach:** golf's internal state, the official rankings, or acting as the player.

**Fix:**
- **Best fit for pearl:** drop `Register` and `Expect` (the course is data, and `PublishMine` covers community holes), or accept only a concrete `*course.Simple`.
- **If code holes stay:** warn on the hub and hole pages that playing a realm hole runs its code with the player's deposit, and tell players to set max_deposit.

## GREEN

- **G1, the owner role:** captured once in init. Every owner check is `cur.Previous().Address()`. The handover takes two steps. Renounce clears the owner, the offer and `expected`. `setOwner` exists only in the tests.
- **G2, Publish:** owner-gated, and the data goes through decodeData (limits, Exact, canonical Encode). The slot must equal the data's world and order, and identical data is refused.
- **G3, PublishMine:** a caller can only add versions under their own address, and the three id kinds cannot collide.
- **G4, caller identity:** every crossing function uses its first `cur`. There are no secondary realm parameters and no unsafe.PreviousRealm. `/e/` callers are refused in Register. There is no OriginSend or banker use.
- **G5, rankings:** only counts() → improve() moves a standing, and only for official holes. The drain bookkeeping takes each best out exactly once. Rounds and bests are keyed by the caller.
- **G6, dataHole:** golf-declared, decoded on each call and never stored. Its wear goes on golf's own entry.
- **G7, Render:** cleanText, cleanName, cleanSkin, mark and jstr all hold; evals on the local chain confirm it.
- **G8, events:** attributed to the code's package by the VM. PublishMine reuses `hole_published`; a distinct type, or an `official` attribute, would be clearer.
- **G9, storage:** the caller pays for their own growth. Every listing is bounded. Each finish drains 16 at most, and Publish (the owner) drains 400.

## Open questions

1. Does a /p/ primitive-typed or typed-nil hole run with golf as the current realm? A filetest would settle it.
2. Does the readonly taint on a foreign hole's field make its page or its rainy periods panic (WithExtras, `wet()`)?
3. Is ugnot restricted on pearl?
4. Drain refunds the freed storage to whoever calls it. The amounts are tiny; this is not a finding.
