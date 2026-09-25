# Gno security audit, round 2 (2026-09-25)

This report comes from the gno-auditor agent, which audited the physics, course and fingerprint packages, the golf hub and the 74 holes on `test-gnogolf`. The coordinator saved it here.

**Verdict: PROCEED WITH CAUTION.** Nothing is RED on a public chain that enforces namespaces.

## Previous findings

| Finding | Status |
|---|---|
| R1 | Fixed for public chains. On dev and test-gnogolf it stays open by design (see N1). |
| Y1, Y3, Y4, Y5, Y6, Y8 | Fixed. The batching adds a new gap, N2. |
| Y2, Y7 | Still YELLOW: catalog floor, contained. |

## New YELLOW findings

- **N1: the chain-id allowlist makes every `r/gnogolf/*` hole official on "dev" and "test-gnogolf".** "dev" is the default chain id of `gnoland` and gnodev, so any reachable default node hosting the hub inherits R1.
  - **Fix:** anchor "official" to the course author. Capture the hub deployer at `init` and accept an official Register when the origin is that deployer, or when names are enabled. At a minimum, drop "dev".
  - **Deploy note:** a hole's official status is frozen at Register. On a public chain, enable names before registering the holes.
- **N2: during a retire drain, a first finish on an archived hole still adds a hole to the player's total.** The player can then exceed the course's hole count and lead the top ten until the drain reaches them. The drain runs 16 players per finish, and addresses late in the sort order are drained last.
  - **Fix:** `counts` refuses finishes on an archived hole with `was == 0`. `drain` subtracts only what was counted.
- **N3: the A6 push-out ignores the other walls.** On town18, a ball resting against the north rail at x≈20 is inside the tram's end cap. The tram pushes it through the cap to y≈−0.22, outside the course, and the round is lost until Reset. The preview matches, and it only affects that player.
  - **Fix:** after the push, test the move against the static walls with `Crosses`. If it crosses one, push the other way or leave the ball where it is. Alternatively, shorten the town18 tram caps. Add a regression test with a ball at (20, 0.6).
- **N4: any address can call Register for a hole deployed under `r/gnogolf/`.** This archives a cup hole between the hole's deploy and its registration. 72 holes still say "cannot register from init".
  - **Fix:** register from `init(cur realm)` and remove the exported `Register`, or gate it on the deployer.

## Checked (GREEN)

- **Official gate:** it can't be spoofed. The chain id comes from consensus, and the prefix includes its trailing `/`.
- **Sorted indexes:** they stay consistent, and the drain terminates with no skips.
- **Batching:** bounded gas per call.
- **Work cap:** it is a UX guard only. An underestimate reverts only the caller's own transaction, and pulses are not counted (a small underestimate).
- **Shots-not-paths:** the replay round-trips.
- **SimulateFrom:** read-only and bounded.
- **Paged reads:** clamped.
- **Period checks:** a stale period fails on every stroke.
- **named():** nil-safe.
- **`physics.Prepare`/`prep`:** it can't be poisoned. Offsets are revalidated per wall, and extra walls are recomputed.
- **Air/Capped:** each hole's own.
- **Render:** the cleaning holds.
- **Hole realms:** each exposes only `Register`.
- **Fingerprint package:** not deployed. Its coverage is limited: zone kind, Air, Capped and Every are not hashed, it only runs strokes 0 and 1, and only from the tee.

## Open questions

1. Is any chain with id "dev" hosting the hub reachable by others?
2. Does gnoweb linkify community hole names? `cleanName` keeps `:/.`, and bidi and zero-width characters still pass.
3. Who holds the `gnogolf` name in r/sys/users? Whoever holds it holds the course. Pinning the author closes this.
4. Do other capped timed walls (island11 planks, hole4 sails) push the ball into hazards or tunnels?
5. A client that passes `rest` back as a Gno literal loses −0. This is harmless.
