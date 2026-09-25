# golf: final pre-deploy correctness review (HEAD affe241)

**Scope:** `r/gnogolf/golf`, all of its non-test code:
- `golf.gno`, `state.gno`, `data.gno`, `owner.gno`, `weather.gno`, `render.gno`;
- the parts of `p/gnogolf/course` that golf calls.

**Method:** every suspicion was turned into a scratch `*_test.gno`, run on a copy of the tree with the pearl toolchain (`nice -n 20 ~/.cache/gno-toolchains/pearl/gno test .`). No `.gno` file in the repo was changed.

## Summary

| # | Severity | Status | Where | Bug |
|---|---|---|---|---|
| 1 | Low | confirmed | `golf.gno:510-512`, `527-537` | `PlayRound` cannot continue a live round once the period has turned. |
| 2 | Low | confirmed | `state.gno:426-446` | `SimulateRoundAt` and `SimulateCommit` answer for a stale period that `PlayRoundAt` refuses. |
| 3 | Info | confirmed | `data.gno:287-290` | `Versions(alias)` echoes its input unescaped, so an invalid-UTF-8 alias gives invalid JSON. |
| 4 | Info | argued, not reachable today | `golf.gno:260-262` | `rankKey` sorts wrong past 9,999 holes. |
| 5 | Info, client | likely | `web/lib/engine.ts:198-200, 1099-1102` | The client writes `?hole=<position>` and reads it back as the order. |

**No bug was found in the core bookkeeping:** the standings, the drain, fresh, counts, records, Rank and the paging all hold. See "Checked and holding" below.

---

## 1. `PlayRound` cannot continue a live round across a period turn (Low)

**What happens.** `PlayRound` always passes `Period()` as the round's period (`golf.gno:511`). `playRound` then refuses any round under way whose period differs (`golf.gno:533`).

So an assisted round started with `PlayRound` in period P gets its next `PlayRound` refused in P+1, with `this round is being played in the weather of period P`. The round is still valid at that point: `stroke()` accepts `r.period >= Period()-1`, and `Launch` and `PlayRoundAt(…, P)` both continue it. So `PlayRound` breaks every 5 minutes, which goes against its doc ("continuing the caller's round").

The 3D client normally sends a period (`PlayRoundAt`). It falls back to `PlayRound` when it has none (`web/lib/adena.ts:307`), and so do gnokey and script users.

**Repro (fails on HEAD):**
```go
func TestRevPlayRoundCrossesThePeriod(cur realm, t *testing.T) {
	id := courseHole(cur, 81)
	p := testutils.TestAddress("rev1")
	testing.SetRealm(testing.NewUserRealm(p))
	PlayRound(cross(cur), id, "90,0.5") // one stroke, not holed
	now := testing.GetContext().Time
	defer setContext(func(c *testing.Context) { c.Time = now.Add(PeriodSeconds * time.Second) })()
	testing.SetRealm(testing.NewUserRealm(p))
	uassert.NotPanics(t, cur, func() { PlayRound(cross(cur), id, "0,0.5") })
}
// → Abort value: golf: this round is being played in the weather of period 4115226
```

**Fix.** Give `PlayRound` the round's own period when a round is under way. `stroke()` still refuses a stale one.
```go
func PlayRound(cur realm, hole string, shots string) string {
	e, p := mustHole(hole), cur.Previous().Address()
	period := Period()
	if v := e.rounds.Get(p.String()); v != nil && v.(*round).strokes > 0 {
		period = v.(*round).period
	}
	return playRound(e, p, shots, period, assisted)
}
```

## 2. The previews answer for a period the writes refuse (Low)

**What happens.** `SimulateRoundAt`, `SimulateCommit` and `SimulateFrom` only check `notAhead`: the period must not be in the future. `PlayRoundAt` refuses more:
- on a first stroke, any period other than now or now-1 (`playablePeriod`);
- on every stroke, a round with `r.period < Period()-1` (`stroke()`).

`SimulateCommit`'s doc says "It refuses what that commit would refuse … so a client can check every commit of a long round before it signs any". With period P-2 it answers a full result, while the commit it previews is refused.

**Repro (fails on HEAD):**
```go
func TestRevSimulateAcceptsAStalePeriod(cur realm, t *testing.T) {
	id := courseHole(cur, 82)
	stale := Period() - 2
	testing.SetRealm(testing.NewUserRealm(testutils.TestAddress("rev2")))
	uassert.AbortsContains(t, cur, "not the current weather", func() { PlayRoundAt(cross(cur), id, "0,1", stale) })
	uassert.PanicsContains(t, cur, "weather", func() { SimulateRoundAt(id, "0,1", stale) })       // no panic
	uassert.PanicsContains(t, cur, "weather", func() { SimulateCommit(id, 2, 8, 0, "0,1", stale) }) // no panic
}
```

**Fix.** In `SimulateRoundAt` and `SimulateCommit`, refuse `period < Period()-1` with the same sentence `stroke()` uses. `playablePeriod(period)` is the exact rule for a first stroke (`SimulateRoundAt`, and `SimulateCommit` at stroke 0).

`SimulateFrom` can stay open to replay old rounds, but then its doc should say so: today it says "exactly what PlayRoundAt would play".

**What the fix changes.** The trajectories are unaffected. A 218-commit randomized parity run found them bit-identical (see below). Only the refusal differs.

## 3. `Versions(alias)` echoes raw input into JSON (Info)

**What happens.** `Versions` writes `jstr(alias)` of the caller's own argument (`data.gno:290`). `jstr` escapes `"`, `\` and control bytes, but passes invalid UTF-8 through. So `Versions("g1\xff/x")` is not valid JSON.

**Impact.** Only the caller's own query is affected. Everything stored is clean: `cleanText` turns invalid bytes into U+FFFD, and a check of `utf8.ValidString(cleanName("A\xffB\xc3"))` passes.

**Repro:** `uassert.True(t, utf8.ValidString(Versions("g1\xff/x")))` fails.

**Fix.** Return `"slot":""` (or panic "unknown alias") when `current(alias) == ""`, and echo `now.slot` instead of the input.

## 4. `rankKey` breaks past 9,999 holes (Info, argued)

**What happens.** `pad(9999-r.holes, 4)` goes negative at 10,000 holes. `"-1…"` then sorts before `"-2…"`, so a player with 10,000 holes would rank above one with 10,001.

**Reachability.** The slot count is bounded only by the owner: any a–z world name, orders 1–999. The course has 74 slots, so this is unreachable in practice.

**Fix.** Use `pad(999999-r.holes, 6)`, or cap the number of slots in `Publish`.

## 5. Client: a shared `?cup=&hole=` can open the wrong hole (Info, likely, outside golf)

**What happens.**
- **Writing the link.** The address bar writes `hole=<position in the cup>`: `place = perList().holes.findIndex(…) + 1` (`engine.ts:200`).
- **Reading it back.** `linked()` reads that number first as an **order**, and only then as a position: `cup.find(h => Math.round(h.order) === n) || cup[n-1]` (`engine.ts:1102`).
- **golf's own links.** `playLink` writes the order. golf itself is consistent.

**When it bites.** Only when a cup's orders have gaps. With orders 1, 3, 4, the hole of order 4 is written as `hole=3`, and read back as the hole of order 3.

This was not tested; it depends on whether the published slots are contiguous.

**Fix.** Write `Math.round(h.order)` in the URL, as golf does.

---

## Checked and holding (tests run, all pass)

### Standings across versions, archiving and the drain

`TestRevStandingsModel` is a model check, run on a copy of the tree with `retireBatch=2` and `finishBatch=1` so that every drain stops part way.

**Setup:**
- 8 players, 4 of them named;
- 3 slots;
- 300 random steps, over 4 seeds.

**Each step is one of:**
- a finish in 1–3 strokes, assisted or pro, on the current version or on a random archived one;
- a new version of a slot;
- `Drain(1)`.

**Checked after every step:**
- no negative standing;
- every `ranks` key is its row's current `rankKey`;
- every named player with a row is ranked;
- the `bests` trees match the model.

**Checked every 20 steps, after a full `Drain`:**
- each standing equals the sum of that player's bests on the current versions, exactly;
- `archiving` ends empty.

**Result: all pass.** In particular these all hold:
- a player the drain has not reached yet who improves on an archived hole (`counts`);
- a first finish on an archived hole (`fresh`, `p >= from`), and one the drain has already passed (`p < from`);
- a drain that stops exactly at the end of a mode;
- two archives of the same slot queued back to back.

### The previews agree with the writes

`TestRevSimulateAgreesWithPlay` covered all 74 course holes, published from `courseData`. Pulses, ticks 0–39 and random powers and angles were all exercised. Half the holes were played in period P-1.

It made 218 commits of 2 shots each. For each commit, the test compared:
- the rest point and stroke count from `SimulateCommit`;
- the rest from `SimulateFrom`, chained shot by shot;
- `Round()` after the real `PlayRoundAt`: its `rest`, `strokes`, and the path of the last stroke.

All were bit-identical.

**Refusal order.** The checks run in a different order in `playRound` and `simulateRound`: work, parse, cap, period, validShot against cap, work, parse, validShot. The same lists are refused either way; only the wording of the message can differ.

### Stroke caps and the work budget

- **60 strokes per round:** the cap is checked before each shot, in both paths.
- **12 shots per commit:** empty entries are not counted.
- **The work budget:** `next()` runs before `add()` in both paths.
- **A shot that holes stops the commit:** trailing shots are then neither parsed nor checked, in both paths.

### Periods

- **How long a weather lasts:** a weather can be played for 2 periods, 10 minutes in all. The code has no 15-minute rule.
- **First strokes:** a round's first stroke takes the current period or the one before; nothing earlier and nothing ahead.
- **Every later stroke:** `stroke()` refuses the round once its period is 2 or more behind the current one, and `Reset` clears it.
- **The page's note:** `weatherNote`'s "until the next weather is over" matches this.

### Rank

- **Edge cases:** Rank is right for one player, for tied players and for an unranked player (it returns `rank 0`).
- **Index 0:** the binary search on `bptree.GetByIndex` handles it.
- **Ties:** two players with the same holes and strokes get different places, ordered by address. This is the same order `Leaderboard` uses, and it is documented.

### Paging

**`Community()` with limit 1** walks all 290 entries exactly once. An exactly full last page gives `next:""`.

The outer `"next"` key and each row's own `"next"` field (the version that replaced it) share a name. A client that finds `next` by searching the string, as a first scratch test did, reads the wrong one. A real JSON parser is fine.

**`HoleLeaderboard`:**
- `next` is 0 on the last page;
- `next` is 2 for `(0, 2)` of 3;
- a partial last page shows only what is left;
- an offset past the end returns an empty page.

**`Records`, `Players` and `Rounds`:** existing tests cover them; they use the same `page()`.

### Aliases and ids

- **Writes:** `mustHole` refuses an alias.
- **Reads:** reads take either an alias or an id.
- **No collisions:** an id has two slashes after the address or the world, and an alias has one. A community address can never pass `isWorld`, so no key can be both an alias and an id.
- **Render's trailing `/data` or `/<address>`:** it is looked up last, after the whole path.

### Names changed in r/sys/users

- **A name taken later:** the player is ranked at their next finish, or when the drain reaches them.
- **A deleted name:**
  - it leaves the top ten and the board;
  - `Rank`'s `of` and the board's `players` count it until that player's next change (documented);
  - `named(nil)` is false through `IsDeleted()`'s nil check.

### JSON, integers and floats

- **`jstr`:** it escapes every byte below 0x20.
- **`cleanText`:** it turns invalid UTF-8 into U+FFFD.
- **`jnum`:** its fast path is sound. The error on `v*1000` stays under 1.2e-4, and the 0.499–0.501 band plus the integer carry case round the same way as `%.3f`.
- **`validShot`:** NaN and Inf are refused, and `q4` keeps the angle and power inside their bounds.
- **`clampTick`:** it clamps.
- **Paging arguments:** offsets and limits are clamped, so they cannot overflow.

## Scratch files (not in the repo)

- `…/scratchpad/tree/gno.land/r/gnogolf/golf/zzz_review_test.gno`: bugs 1–3, Rank, `Community` and `HoleLeaderboard` paging.
- `…/scratchpad/tree/gno.land/r/gnogolf/golf/zzz_parity_rev_test.gno`: the randomized preview-versus-play parity check. Run it alone: it publishes `courseData`, which another test also publishes.
- `…/scratchpad/tree2/gno.land/r/gnogolf/golf/zzz_model_test.gno`: the standings model check. This copy has `retireBatch=2` and `finishBatch=1`.
