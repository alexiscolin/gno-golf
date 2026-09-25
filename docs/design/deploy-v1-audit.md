# Security audit of the deploy-v1 design (2026-09-25)

This audit was done by the gno-auditor on `docs/design/deploy-v1.md`. The coordinator saved it here.

**Verdict:** PROCEED WITH CAUTION. Nothing is RED. Close the 7 YELLOW items below before Phase 3.

## YELLOW, with the design change each requires

- **Y1, the owner check primitive.** Every owner function (`Publish`, `Transfer`, `Accept`, `Renounce`) checks `cur.Previous().Address() == owner`, never `OriginCaller`. Otherwise the scheme is open to tx.origin phishing through any realm the owner calls. `OriginCaller` is only allowed in golf's own `init`.
- **Y2, official realm holes.**
  - Either (a) drop official realm holes: all official holes are data, and the golden fixtures go through `Publish`.
  - Or (b) require explicit pre-authorisation: `Expect(cur, pkgpath)` by the owner, consumed by `Register` from that exact path. This works for a DAO owner and after a `Transfer`.
  - Either way, an unauthorised `Register` under the namespace panics, and "official" means "has a slot".
- **Y3, Renounce.** `Renounce` clears both `owner` and `pending`. `Accept` requires `owner != ""` and the caller to equal `pending`. `Transfer` requires a valid address and is refused after renounce; `Transfer(owner)` cancels. Every owner check is `owner != "" && …`. Add `Owner()` and `Pending()` getters and an event for each change.
- **Y4, `HoleOf`.** Delete it: it hands out an authority-carrying value that lets any realm write wear. If it has to stay, it returns a freshly decoded `*course.Simple` with no pointer to the entry, and never `e.h`.
- **Y5, value bounds in `Decode`, not only counts.**
  - Bound every value:
    - coordinates within `[-1, W+1] × [-1, H+1]`;
    - `Radius` within `[0, 1]`, `CupRadius` within `(0, 2]`, post `R` within `(0, 8]`;
    - `Friction` within `[0, 1)`, `Bounce` within `[0, 1.5]`, `Scale` within `[0, 8]`;
    - each slope `Vec` component at most 1, `Shelter` within `[0, 1]`;
    - `Every` within `[0, 4096]`, `On` within `[0, Every]`, `Phase` and `Offset` within `[0, Every)`.
  - Structure rules:
    - pulse contents count toward the totals;
    - at most 64 skins, and every index is valid;
    - each run's count is at least 1, and the counts sum to n;
    - `npoly` is 0 or at least 3;
    - unused flag bits are 0;
    - world is `[a-z]{1,16}`.
  - Tighter frozen limits, about 2–3× today's maxima: about 160 walls in total, 32 posts, 32 zones, 64 points per polygon and 512 in total, substeps ≤ 60.
  - The work estimator counts polygon edges and pulse extras.
  - Phase 0 gate: a synthetic hole at the limits must pass a storm shot, State, Render and the forecast within budget, and a 12-shot commit on it must be refused by the estimator.
- **Y6, listing.**
  - Official and community entries live in separate trees.
  - The data string lives in its own tree (`id → data`), not inline in the entry.
  - Name, par, world and order are frozen at publish.
  - No listing path decodes or loads data.
  - Spam must never push the course out of `Holes()`.
- **Y7, the proof has blind spots.**
  - Add a field-by-field `equalSimple(me, Decode(Encode(me)))` with a field-count tripwire.
  - Extend `Of()` to hash Kind, Air, Capped, Round, Outside, Every/On/Phase, Mark and Skin.
  - For pulse holes, run the strokes up to `max(Every)`.
  - `zonesJSON` doesn't emit Air, Capped or Mark, so the State comparison alone isn't enough.
- **Y8, aliases on writes.** Writes take exact version ids only; aliases resolve for reads. `Launch` returns the version id.

## GREEN (checked), with small design changes

- **Owner capture:** `owner = OriginCaller` at golf's init is safe. Add a post-deploy check that `Owner() ==` the deployer.
- **Ids:** slots, versions, community ids and pkgpaths can't collide. Keep the world charset check, and match `/data` only after the exact-id lookup fails.
- **Decoding:** NaN and Inf are rejected, −0 is kept, subnormals are safe once Y5's bounds apply, and all fields are fixed-width.
- **Render:**
  - `mark()`, `cleanSkin`, `cleanName` and `jstr` hold.
  - Clean the title and note once, at publish.
  - Strip bidi and zero-width characters: U+200B–200F, U+202A–202E, U+2066–2069.
- **`PrepareWith`:**
  - Verify each stored length bit-exactly (`l == math.Sqrt(d·d)`, the same expression as `lines()`) once, at Publish and PublishMine.
  - After that, trust the lengths with no per-call tolerance.
  - Document that the caller must verify them.
- **bptree:** it matches avl for Iterate and IterateByOffset. ReverseIterate includes its end, and golf doesn't use it. It doesn't detect mutation during iteration, so add a comment at each Iterate and a cross-check test against avl. Use value fields, not nil pointers.
- **Drain crank and N2 fix:** sound.
- **Storage griefing:** contained once Y6 is in.
- **`dataHole`:** it must override `Play`, `PlayAt`, `PlayWith` and `Wear`, or the wear is silently lost.

## What noAdmin and the README must also say

- The owner can reset any hole's ranking by publishing a new version. Refuse a Publish identical to the current version (same sha).
- "Can't take a hole down" is technically true only: a replacement can be unplayable.
- The owner can add slots. A fractional order shares its `?hole=N` link, because `playLink` uses `int(order)`.
- The publish timing picks the version id, which seeds that hole's weather sequence.
- Whoever holds the namespace can deploy lookalike realms under the URL prefix.
- A compromised owner key can archive every slot, and that is permanent for the rankings. Plan a Renounce, or state the risk.

## Open questions

1. Can `cur.Previous().Previous()` be read (for a precise deploy-origin check)? `Expect` avoids needing it.
2. Is the gnovm float→int conversion deterministic across architectures? Y5's bounds make it moot.
3. Do non-UTF-8 strings survive qobject and amino views?
4. Canonical W/H when the board uses its defaults (0 means 32×16).
5. `Pulse.at` doesn't normalise a negative `Offset`. Y5 requires `Offset ≥ 0`.
