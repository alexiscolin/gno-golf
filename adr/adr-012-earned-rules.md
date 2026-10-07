# ADR-012: The rules the earned gnomes' proof reads: accepted, not compiled in

## Status

Accepted (pending the owner's final word), 2026-10-07: option 3 is built
(`earned.gno`'s `rules` and `AcceptRules`). It answers the review's finding on `gno.land/r/gnogolf/gnomes/earned.gno:32`
and corrects ADR-007's Consequences ("the proof refuses until gnomes is
updated", which cannot happen).

## Context

`MintEarned` and `Proof` read a player's results from store's rows
(`bests`, `copies`, `holes`, ADR-007). Store's rows have no format
version, so the proof trusts them only while store's writer is the rules it
was written against:

```go
const rules = "gno.land/r/gnogolf/golf/v2"
...
if rows.Writer() != rules { return false, cup{}, errRules }
```

Store exists so that new rules can replace golf/v2: its owner proposes a
realm (`Propose`), that realm says it is on chain (`Ready`), and 72 hours of
block time later (`DELAY`) it is the writer. From that moment every proof
refuses ("rules changed"), and nothing can lift it:

- `rules` is a constant, and no owner call sets it;
- a gno.land realm cannot be deployed again at its path;
- the GRC721 ledger and the once-only `earned` tree live in this realm, so a
  new gnomes realm would be a new collection.

The nine earned gnomes could then never be minted again. Failing closed is
right (no false proof), but failing closed for good is not what ADR-007
meant.

## Options

1. **Follow store's writer.** Drop the check; trust store's own public
   delay. Simple, but a later writer with a different `bests` layout would
   be read with this one's parser: a wrong proof becomes possible. Refused.
2. **Ask the writer for its format.** Gno imports are static: this realm
   cannot call a realm whose path it learns at run time. Not possible.
3. **The owner accepts the new rules, which must already be store's
   writer.** (Proposed.) `rules` becomes state, set at deploy to golf/v2.
   A new owner call, `AcceptRules(path)`, sets it, and only to store's
   *current* writer (`path == rows.Writer()`). So the owner can only follow
   a change that store's own public 72-hour delay has already carried out,
   never point the proof at another realm. Between store's switch and the
   owner's call, proofs refuse, as today. The owner calls it once they have
   checked that the new rules keep `bests`, `copies` and `holes` as golf/v2
   writes them, which is ADR-007's own condition.

## Decision

Option 3:

- `var rules`, set at deploy to `rulesAtDeploy`, golf/v2 (stage.sh still
  rewrites the path), and `AcceptRules(cur realm, path string)`:
  - owner only;
  - `path` must equal `rows.Writer()`, else it panics;
  - emits `RulesAccepted`.
- `Proof` keeps saying "rules changed" until the owner accepts the new
  rules. The page reads that as "earned gnomes paused for a rules update".
- Tests (`TestTheOwnerAcceptsOnlyStoresNewRules`):
  - a writer change refuses every proof;
  - `AcceptRules` refuses a path that is not the writer, and refuses anyone
    but the owner;
  - once accepted, the same player's proof passes again;
  - an earned gnome already minted is never minted twice.
- ADR-007's Consequences point here, with the release step; the spec's
  line on it is the user's to correct.

## Consequences

- The owner key can unpause the earned gnomes after a rules change, but
  cannot aim the proof anywhere store has not already, publicly, moved.
- One owner call per rules change, in the release checklist after the new
  rules' delay ends.
- Built before the realm's deploy: the owner's final word still stands, and
  dropping it before then removes one call.
