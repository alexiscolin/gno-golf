# Security audit: gno packages (2026-09-24)

This audit was run by the gnomcp `gno-auditor` agent. It had no write access, so the coordinator saved its report here. Scope: `p/gnogolf/physics`, `p/gnogolf/course`, `r/gnogolf/golf`, and the 74 hole realms. The audit read the local tree and spot-checked it against the deployed copy through the gnomcp profile `gnogolf`, chain `test-gnogolf`.

## Verdict

**BLOCK** until the `gnogolf` namespace is reserved on the target chain. Once it is, **PROCEED WITH CAUTION**. The hub's isolation from hostile holes is sound. What remains is gas and presentation.

## Findings

### RED

**R1. "Official" rests on a namespace nobody has reserved** (`golf.gno` Register, slot and retire; `stroke`'s official test)
- On test-gnogolf, `r/sys/names.IsEnabled()` is false and the name `gnogolf` is not registered.
- So anyone can deploy `gno.land/r/gnogolf/evil` with World garden and Order 1, and a `Play` that always holes. Registering it archives `hole1`, and its 1-stroke finishes rank on the course board.
- Repeated per slot, it takes over every cup. No admin can undo it. On the target testnet the same holds until the name is registered to us and enforcement is on. Whoever registers `gnogolf` first also owns `r/gnogolf/golf`.
- Fix:
  - Register `gnogolf` on the target chain before deploying, and confirm `names.IsEnabled()`.
  - Defence in depth: only treat the official prefix as official when `names.IsEnabled()` is true.

### YELLOW

**Y1. The namespace owner is a de facto admin** (`render.gno` `noAdmin`, `golf.gno` package doc)
- Whoever holds `r/gnogolf/*` can replace and archive any cup hole, which means controlling the course ranking. They can also publish official holes that have no slot.
- The page says "no way to delist a course — not for us either", which overclaims.
- Fix: reword `noAdmin()` to state it.

**Y2. `Register` takes an open `course.Hole`** (a Class 3 impl-substitution)
- This is contained: name, world, order and par are read once and cleaned, the lists never call hole code, the interface has no `cur`, and `maxPath` is checked.
- A hostile hole can still store non-finite `Rest()` values, loop or panic, or blow the gas of its own page. All of this stays scoped to its own hole.
- The hole code is also called by Reset, Launch, State, its page, Simulate*, Extras and Weather, not only at Register time and in strokes, so the docs need correcting.
- Fix: reject a non-finite `Rest()` in `stroke`, and fix the docs.

**Y3. `retire()` scales with every player, and it can be inflated** (`improve` adds a `totals` row for any finish, official or not)
- Sybils finishing a throwaway unofficial hole grow `totals`.
- Once the refill in `retire` exceeds the transaction gas limit, no slot can be replaced again.
- Fix:
  - Only create `totals` rows for official finishes.
  - Keep a rank-ordered avl index, so the top ten is a prefix read.

**Y4. `HoleLeaderboard` scans every finisher**, with a cross-realm `named()` per entry.
- Sybils can copy the public record's shots and flood a hole.
- Past the query gas limit, the board becomes unreadable.
- Fix: a sorted per-hole index (`%03d/<player>`) that stops after `offset+limit` named rows.

**Y5. Unofficial holes are mixed into the official cup tables and `Holes()`** (`render.gno` `listed`)
- An unofficial `Order: 0.5` becomes "#1" of the Garden Cup, renumbers the other holes and adds its par. Its `plays` count can be inflated.
- `Holes()` has no `official` field.
- Fix:
  - List community holes in a separate section.
  - Number only official holes.
  - Add `"official"` to `Holes()`.

**Y6. Validating before quantizing breaks replay** (`golf.gno` stroke, `state.gno` simulateRound)
- A power in (0, 0.00005) passes validation, then `q4` turns it into 0 and it is recorded as `0.0000`.
- Replaying that record panics.
- Fix: quantize first, then validate, in both places.

**Y7. Floats in the consensus path.** gnovm uses softfloat, so results are deterministic today. Keep the golden tests, and run them on more than one architecture in CI.

**Y8. `named` is a function-typed package variable on the ranking gate.** It is not settable today, but it's a latent hazard. Fix: make it a plain func (register names in tests through r/sys/users), or document that it must never become settable.

### GREEN (checked, no issue)

- **Caller identity:** it always comes from `cur.Previous()`. The `/e/` MsgRun path is rejected for Register.
- **Exported surface:** there are no realm-typed methods, and the exported reads return strings only.
- **Storage attribution** is correct.
- **Shot parsing:** NaN and Inf are rejected, the tick is clamped, and the limits are enforced.
- **Modes and periods** hold, and the `named()` gate works.
- **Read bounds:** Bests and Standings are capped at 50, the lists at 120, and rounds shown at 24.
- **Render:**
  - `cleanName`, `cleanSkin` and `mark` block link, HTML and code-fence injection;
  - `jstr` escapes;
  - links and forms are built only from pkgpaths and bech32 addresses.
- **Slots and hole realms:** the 74 slots don't collide, and every hole realm keeps its `me` unexported.

## Open questions

1. Is `gnogolf` registered on the target testnet, and is `IsEnabled()` true there? This decides R1.
2. For a MsgRun-based record, is the `/e/…/run` realm's `Address()` the user's own? The 3D client uses a two-message MsgCall, so this doesn't affect it.
3. `notAhead` is cosmetic: future weather is computable off-chain. The impact is low, because recording is still limited to the current or previous period.
4. Rounds never expire. A round started long ago keeps its weather.
5. Records can be copied, since shots are public. The rankings are a search contest (as intended, see Leaderboards in the README).
6. A named player with only unofficial finishes can fill an empty top-ten spot as a "0 holes" row until the next retire.
7. `cleanName` doesn't strip bidi or zero-width characters, so unofficial hole names can spoof.
8. A hostile unofficial hole can make its own players' strokes expensive.
