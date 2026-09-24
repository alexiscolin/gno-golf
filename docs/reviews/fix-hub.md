# Hub fixes: `r/gnogolf/golf` (PLAN B3–B6, C1–C7), 2026-09-25

Scope: `gno.land/r/gnogolf/golf` only (`golf.gno`, `state.gno`, `render.gno`, `weather.gno`, the tests). Nothing was committed. `web/` was not touched: the client changes are listed in the API changelog below.

## How it was measured

- **Local:** filetests in scratch copies of the workspace (`scratchpad/ws_old`, `ws_new`), with the *same* `p/gnogolf/*` snapshot (the physics agent's current tree) and two versions of golf: HEAD (before) and this change (after). The runner prints gas and golf's storage delta per filetest. A "cost" below is the difference between two filetests (for example register + play minus register alone). The runner is local, so it pays no tx overhead.
- **On-chain:** gnomcp `gno_call` / `gno_run` with `simulate=true`, profile `gnogolf` (gnodev on :26757, chain `test-gnogolf`). The new hub was hot-reloaded and the 74 holes are registered. The period is 5967550.
- The physics got much cheaper in parallel (PLAN B1/B2, the other agent). So the "before" figures in `deep-perf-gno.md` are not comparable with these. Every before/after pair below uses the same physics.
- **Storage:** golf's own bytes. At the default 100 ugnot/B, 10 KB is 1 GNOT.

## Changes

### B3: an integer `jnum`, and no paths in State's round list

- **`state.gno:157` `jnum`:**
  - Integer formatting in place of `ufmt "%.3f"`.
  - Near-ties (a fraction within 1e-3 of .5) and |v·1000| ≥ 1e12 fall back to `strconv`, which is exact, so the bytes are identical.
  - Checked two ways: against `ufmt "%.3f"` on 3,022 values (ties, −0, tiny negatives, giants), and on the six golden fixtures, whose SimulateRoundAt and State outputs are byte-identical once the new fields are removed.
- **`state.gno:28` `State`:** the rounds carry no `path` or `air` (`roundJSON(..., false)`, `state.gno:77`). A client reads one round's path with `Round`.

| read (local) | before | after |
|---|---|---|
| `State(town14)`, 1 round | 180.1M | **29.4M** (−84%) |
| `State(hole16)`, 1 round | 56.9M | 17.2M |
| `SimulateRoundAt(town14, 3 shots)` | 68.6M | 53.3M |
| `SimulateRoundAt(hole16, 3 shots)` | 116.2M | 70.0M |
| on-chain `State(town14)` | 182M (review) | 68.2M |

### B4: a commit is capped by its work, not by 12 shots

**What.** In `golf.gno`:
- the doc of `work` is at :431;
- the constants are at :461-466;
- `newWork`, `next` and `add` are at :469-495;
- they are used in `playRound` (:393) and in `simulateRound` (`state.gno:304`).

**How.**
- Each shot adds an estimate of its gas: `10M + 150K·walls + pathPoints·(1.2M + 15K·(walls+posts+zones+weather zones))`.
- Before each shot after the first, the commit is refused if `spent + heaviest shot so far > 1.4e9`. The error says how many shots fit: `golf: more shots than one transaction can replay on this hole: commit the first N, then the rest`.
- `SimulateRound*` refuses the same list with the same sentence, so the client learns this before it signs.
- `maxShots = 12` stays as the length cap on the list.

**The choice.**
- **Why an estimate:** gno has no gas meter to read, and one fixed shot count is either unsafe on heavy holes or wasteful on light ones.
- **Fit data:** I fitted the constants on 592 shots: the 74 holes × 8 angles at power 10 from the tee, with the forecast's own gas measured separately and subtracted.
- **Constants:** the tightest fit that bounds every shot, raised by a fifth.
- **Margin:** every estimate is at least 1.25× the measured gas (median 2.14×).
- **Heaviest shot:** 78M actual (hole16 at 135°), estimated at 127M. So even the heaviest hole takes 11 of its heaviest shots.
- **Budget:** 1.4e9 of Adena's 2e9 simulate cap. That leaves room for one shot heavier than its estimate, the forecast (up to 170M measured, in rain on island14) and the tx overhead.
- **If physics gets dearer:** these constants must be refit. Cheaper physics is safe. This is marked `ponytail:` in the code.

| commit (local) | gas |
|---|---|
| hole16, 12 × `135,10` | 623.8M (accepted) |
| island14 in rain, 12 × `315,10` | 416.4M (holed at 8) |
| test hole with 1,004 walls, 8 shots | refused: "commit the first 6" |

### B5: store the shots, not the path

**What.**
- **`golf.gno:80` `round`:**
  - The ball is stored as `bx, by`, flat floats rather than a nested `Vec2` object.
  - `fx, fy` is where the last stroke started.
  - `shots` is one `;`-joined string.
  - There is no `path` and no `air`.
- **`state.gno:95` `lastShot`:** it rebuilds the last stroke's path by replaying that one stroke from `fx, fy` with its own stroke number, tick and period. So a `Round` read costs one stroke, whatever the round's length.
- **`render.gno` `board`:** it draws the focused player's last shot the same way.
- **`golf.gno:498` `Reset`:** it removes the round, which frees its storage, instead of writing a fresh one.

| round storage (local, golf bytes) | before | after |
|---|---|---|
| town14, 1 full shot | 4,787 B | **2,169 B** (−55%) |
| town14, 3 shots | 4,938 B | 2,204 B |
| hole16, 3 shots (roll-on) | 6,404 B | 2,204 B |
| hole16, 12 shots | 11,585 B | **2,384 B** (4.9× less) |
| `Round(town14)` read | 30.0M | 27.5M (it now replays a stroke, but `jnum` is cheaper) |
| `Reset` of a finished round | +2 B | −2.2 KB (freed) |

Caveat: `Round` now computes the round's forecast. On a lane hole in rain that is up to 170M today, until the physics agent's B1 fix lands.

### B6: `SimulateFrom(hole, ballX, ballY, shot, stroke, period)`

**What.** `state.gno:261`. It previews one shot (`"angle,power,tick"`) from an exact ball, at a given stroke number (timed and pulse holes) and weather period. The rules:
- `notAhead(period)`;
- the stroke must be within 0..59;
- the ball must be finite;
- the shot is quantized as it is recorded.

It is the stroke `PlayRoundAt` would play. The test checks this stroke by stroke on a timed hole, and in two weathers.

**JSON.** The same shape as `Simulate`: `{"version","holed","bounces","path","air","cause","rest"}`. `"rest"` is the exact resting ball, the shortest round-trip float: feed it back as the next `ballX, ballY`.

`Simulate` itself now delegates to it (stroke 0, tick 0, current period), and it now quantizes the power too.

| preview (local) | before | after |
|---|---|---|
| town14, the preview of stroke 3 | `SimulateRoundAt` × 3 shots: 68.6M | `SimulateFrom`: **18.1M** |
| hole16, the preview of stroke 3 | 116.2M | 14.2M |
| on-chain town14 | `SimulateRoundAt` × 3: 96.7M | `SimulateFrom`: 60.1M (it includes ~10M of package loads and the forecast) |

A preview at stroke k now costs one shot instead of k (scale finding 1).

### C1: quantize before validating; refuse a non-finite `Rest()`

- **`golf.gno:512` `validShot`** now returns `(angle, power)` already quantized:
  - the power is `q4`'d *before* the `(0, 10]` check, so a power of 0.00004 is refused rather than recorded as `0.0000`, a record that could not be replayed (Y6);
  - the angle is `q4`'d after `Mod` and brought back into (−360, 360), so −359.99996 is recorded as the `-0.0000` it is played at, and the ±360° replay edge is gone.
  - It is used by `stroke`, `simulateRound` and `simulateFrom`.
- **`golf.gno:529` `resolve`:** a path longer than 512 points, or a `Rest()` that is NaN or ±Inf, is refused, on every path: play, SimulateRound, SimulateFrom and Simulate (Y2).

### C2: official-only totals, sorted indexes, a bounded retire

**Totals.** `improve` (`golf.gno:205`) is called only when `counts(e, m, p)` (`golf.gno:323`). So a finish on anyone's hole creates no `totals` row (Y3).

**The ranking index.** `ranks[m]` holds `rankKey = (9999-holes)/strokes/player` → player, for named players with at least one hole. `setRow` (`golf.gno:187`) keeps it in step and deletes a row that falls to 0 holes. The course top ten is its first ten entries (`Leaderboard`, `state.gno:432`, and the hub).

**The hole board index.** `entry.board[m]` holds `strokes/player` for named finishers, created at the first named finish. `HoleLeaderboard` (`state.gno:461`) reads it with `IterateByOffset(offset, limit)`: O(page), with no cross-realm call per finisher (Y4).

**Retire.** It no longer rescans every player. `retire` (`golf.gno:275`) queues the archived hole, and `drain` (`golf.gno:291`) takes its players out of the standings in batches:
- the replacing `Register` takes 400;
- every finish takes 16.

A player the drain has not reached yet is still counted, including a new best on the archived hole. The drain then removes that best, so the totals end up exact; `TestRetireDrainsInBatches` checks this.

| (local) | before | after |
|---|---|---|
| `HoleLeaderboard` page, 50 / 150 named finishers | 14.1M / 26.3M (~122K per finisher) | **9.9M / 10.0M** (flat) |
| `Leaderboard`, 50 / 150 players | 8.7M / 8.7M | 10.5M / 10.6M (flat; one `named()` per row shown) |
| replacing `Register`, 50 / 150 players on the old hole | 8.6M / 25.2M, and it scans **every** player | 24.9M / 86.6M, and it touches that hole's players only, at most 400 per tx |
| storage change of that retire | +5.4 KB | **−755 KB** (rows with 0 holes are freed) |
| golf storage, first named finish per player | 9,835 B | 12,489 B |
| gas, first named finish per player | 14.8M | 15.7M |
| `Register` storage per hole | 7,118 B | 8,555 B |

**Trade-off.** Each named player now pays for two index entries: one on the hole's board, and one in the course ranking, the latter once per player. Across a course the round's saving makes up for most of it:
- per (player, hole), before: round 4.8 KB + best, about 6.5 KB;
- per (player, hole), after: round 2.2 KB + best + board entry, about 6.6 KB;
- per player, once: + about 2.5 KB for the ranking entry.

### C3: community holes apart, and `official` in `Holes()`

- **`entry.official`** (`golf.gno:57`) is decided once at `Register` by `official()` (C4).
- **`Holes()`** (`state.gno:229`):
  - it adds `"official"`;
  - it lists the course's holes first (`render.gno:623` `before`).
- **The hub** (`render.gno:71`):
  - cups hold official holes only;
  - numbers go to the current official holes, and an archived one shows `archived`;
  - cup cards count current holes only;
  - every other hole goes in a "Community holes" section with no number and no cup (Y5).

### C4: who holds power; `named`; the official gate

- **`noAdmin`** (`render.gno:216`) and the package doc (`golf.gno:1-24`) now state that whoever may publish under `r/gnogolf/` can archive any course hole, and so shape the ranking, and can add course holes, but cannot touch a round, a record or a community hole (Y1).
- **The hub page, from deep-ux:**
  - the "not for us either" line is gone (§4);
  - the title is "Gnogolf — mini-golf on-chain", with a how-to line under it (§37);
  - cup cards are bold text, not `###`, so they no longer duplicate the table of contents (§36);
  - "most played" is hidden at 0 plays (§36, C3);
  - the pro note is reworded (§178);
  - the archived note names the new hole and says "your best here still shows on this page" (§181);
  - a "see your ball" line sits under Launch (§175);
  - the weather note says a stale round must be Reset.
- **`named`** (`golf.gno:143`) is a plain func (Y8). The tests register real names through `r/sys/users`, as its init controller `gno.land/r/sys/users/init` on chain `dev` (`giveName`, `golf_test.gno`). There is no test hook.
- **`official(id)`** (`golf.gno:156`) is true when the path is under `gno.land/r/gnogolf/` **and** either:
  - `r/sys/names.IsEnabled()` is true (checked on profile `gnogolf` with `gno_read`: `func IsEnabled() bool`, currently false there); or
  - `runtime.ChainID()` is exactly `"dev"` or `"test-gnogolf"`, the local chains, so that gnodev stays playable, as the coordinator asked.

> **On any public chain (pearl-1, betanet, …) the namespace enforcement is required:** `r/sys/names` must be enabled and `gnogolf` registered to the course's author before the hub is deployed. Otherwise no hole is official there: no cups and no ranking. Only the GovDAO admin can call `names.Enable`.

### C5: the board fixes

- **No 0-hole rows:** a row is ranked only with ≥1 hole and is deleted at 0 (`setRow`).
- **An unknown mode is an error:** `modeOf` (`golf.gno:104`) accepts `""`, `"assisted"` and `"pro"`, and panics on anything else. This applies to every read that takes a mode.
- **`Leaderboard`** has `"mode"`.
- **`HoleLeaderboard`:**
  - `"players"` is now the named board's size, the rows a client pages through;
  - the new `"finished"` counts every finisher;
  - offsets are no longer capped at 100.
- **`"by"`** (always equal to the id) is dropped from `Holes()` and `State()`.

### C6: paged reads and `version`

New reads, all paged by address. `after` is the last address of the previous page (`""` for the first). `limit` is clamped to 1..100. `next` is the `after` of the next page, and `""` once there is none.
- `Records(hole, mode, after, limit)`, `state.gno:553`: every best on a hole, named or not.
- `Players(mode, after, limit)`, `state.gno:566`: every course standing.
- `Rounds(hole, after, limit)`, `state.gno:579`: every round, without paths.

Every object a read returns now starts with `"version":1`. `Holes()` stays a bare array.

### C7: the weather period is checked on every stroke

`stroke` (`golf.gno:547`) refuses any stroke of a round whose `period < Period()-1`: `golf: this round's weather (period P) is over: Reset to play again`. This covers `Launch` as well as `PlayRound*`, so a round can no longer be opened in a calm period and finished days later.

### Docs and cleanup

- **The package doc:**
  - the "six writes" count is gone; the writes are listed once, and `noAdmin` lists them without a count;
  - `Register`'s doc says a hole can register from its `init(cur realm)` or from a crossing function;
  - the "Reset + PlayRound" line now names PlayRoundAt/PlayRoundPro;
  - `SimulateFrom` is mentioned.
- **Comment fixes:**
  - the `notAhead` over-claim is reworded (M7);
  - the `maxShots` "~1.8B" comment is replaced;
  - the two stacked Leaderboard doc comments are merged into one.
- **Not mine to fix:** the 74 hole realms still say "a hole cannot register from init()" in their own `Register` comments.
- **The stray scratch files** (`zz_scale_scratch_test.gno`, `zz_scratch{a,b,c}_filetest.gno`, `zz_perfp_filetest.gno`) were already gone. None was left behind by this work.

## Goldens (`zz_golden_test.gno`)

- **Columns 1 (SimulateRoundAt) and 3 (State) changed** for all six fixtures, because of the JSON shape only:
  - the added `"version":1`;
  - the exact `"rest"`;
  - `"official"` in State;
  - `"by"` removed.
- **Checked:** I dumped every fixture's full output before and after. With those fields stripped, `cmp` reports the outputs identical byte for byte, integer `jnum` included.
- **Column 2 (forecast) did not move.**
- **The physics agent:** by the time of this run it had not changed a replay, and the goldens pass on its current tree. I told the coordinator that golden hashes computed against the old golf will not match, and that it should send me the fixtures and columns it moves, not new hashes, so I recompute them.

## API changelog (for the client agent)

**New**
- `SimulateFrom(hole string, ballX, ballY float64, shot string, stroke int, period int64) string`. It returns `{"version":1,"holed","bounces","path","air","cause","rest":[x,y]}`. Use it for aim previews: pass the `rest` of the last `Round`, `SimulateRound*` or `SimulateFrom` answer, the stroke number (0 = first) and the round's period. The shot is `"angle,power,tick"`.
- `Records(hole, mode, after, limit)`. Returns `{"version":1,"hole","mode","rows":[{"player","strokes"}],"next"}`.
- `Players(mode, after, limit)`. Returns `{"version":1,"mode","rows":[{"player","holes","strokes"}],"next"}`.
- `Rounds(hole, after, limit)`. Returns `{"version":1,"hole","rows":[<round without path>],"next"}`.

**Changed**
- **Every object read** (State, Round, Simulate, SimulateRound(At), SimulateFrom, Leaderboard, HoleLeaderboard, Bests, Standings, Extras, Weather, and the new reads) now carries a leading `"version":1`.
- **`Simulate`:**
  - it adds `"rest"`;
  - it quantizes the power as a recorded shot does, so it matches the record.
- **`SimulateRound`, `SimulateRoundAt`:**
  - they add `"rest"`;
  - they can refuse a list that is too heavy for one commit, with the message `commit the first N, then the rest`.
- **`PlayRound`, `PlayRoundAt`, `PlayRoundPro`:**
  - the same work cap applies: split the round into commits of N shots, since each commit continues the round;
  - a round in progress whose weather is two periods old is refused (`… is over: Reset to play again`).
- **`Launch`:** the same stale-round refusal.
- **`Round`:**
  - it adds `"rest"` (the exact ball) and `"cause"`;
  - `"path"`/`"air"`/`"cause"` are the last stroke's, replayed;
  - `"shots"` is unchanged: the `;`-joined string;
  - it returns `null` after `Reset`: `Reset` now deletes the round.
- **`State`:**
  - `"rounds"` items have no `"path"` and no `"air"`, and gain `"rest"` and `"version"`;
  - the top level gains `"official"` and loses `"by"`.
- **`Holes()`:**
  - each item gains `"official"` (bool) and loses `"by"`;
  - the order is the course's holes first, then everyone's.
- **`Leaderboard(mode)`:**
  - it gains `"mode"`;
  - rows are the named players with ≥1 current course hole: there are no more 0-hole rows.
- **`HoleLeaderboard`:**
  - `"players"` = named players on the board, the same set as the rows, so page up to it;
  - the new `"finished"` = all finishers;
  - `offset` can go past 100.
- **All reads that take a mode** panic on anything but `""`, `"assisted"` or `"pro"`.
- **The course ranking and the hole boards** only count holes that are official: under `r/gnogolf/` on a chain that enforces namespaces, or on `dev`/`test-gnogolf`.

**Removed**
- `"by"` in `Holes()` and in `State()`.
- `"path"` and `"air"` in `State().rounds[]`.
- The 100-deep cap on `HoleLeaderboard` offsets. `limit` is still at most 100.

**Client notes**
- `web/lib/chain.js`: add `simulateFrom` and switch previews to it.
- `adena.js recordRound`: split a round whose `SimulateRound` answers "commit the first N" into several commits, with one Reset only before the first.
- `Golf.jsx:1462`: keep paging by `players`; it is now consistent.
- Anything that reads `"by"` must stop.

## Tests

`nice -n 20 /tmp/claude-501/gnobin test ./gno.land/r/gnogolf/golf`, in one process: **ok, 44 tests** (there were 30). `gno lint` and `gno fmt -diff` are clean.

New tests, in `fixes_test.gno` unless noted:

| test | covers |
|---|---|
| `TestJnumIsPercentThreeF` | B3: jnum's bytes match `%.3f` (3,022 values) |
| `TestRoundsStoreShotsNotPaths` | B3/B5: no path in State; Round replays the last stroke; Reset frees the round |
| `TestACommitIsBoundedByWork` | B4: refusal with N, the same in SimulateRound, a split commit, a light hole takes 12 |
| `TestSimulateFromIsTheNextStroke` | B6: equal to the recorded strokes on a timed hole; the stroke number and period matter; input checks |
| `TestWhatPassesIsWhatReplays` | C1: tiny powers refused in Play/Launch/Simulate; −359.99996 replays; a NaN rest refused |
| `TestRetireDrainsInBatches` | C2: batched drain, a late improvement on an archived hole, 0-hole rows freed |
| `TestAnyonesHoleRanksNobody` (golf_test) | C2/C5: no totals row or ranking from a community hole |
| `TestHoleLeaderboardSortsBests` (rewritten) | C2/C5: the index order, paging, `players`/`finished`, an improvement moves the key |
| `TestNoZeroHoleRows` | C5: retire takes a player out of the top ten; an archived hole has no number |
| `TestHolesAreListedWorldByWorld` (extended) | C3: the community section, `"official"`, the course before the community holes |
| `TestOfficialNeedsNamespaces` | C4: both branches. On `pearl-1` with names off nothing is official (no slot, `official:false`); after `names.Enable` by its admin, it is official; on `dev`, it is official |
| `TestTheHubSaysWhoHoldsPower` | C4/UX: the new noAdmin text; no "most played" at 0 plays |
| `TestAnUnknownModeIsRefused` (golf_test) | C5: six reads panic; `""` is assisted |
| `TestNoByField` | C5 |
| `TestPagedReads` | C6: Records paging and `next`, Rounds, Players, `version` |
| `TestAStaleRoundMustBeReset` | C7 |

All ranking tests now use names registered through the real `r/sys/users` (`giveName`), and `TestTheTopIsTen` ranks 13 named players.
