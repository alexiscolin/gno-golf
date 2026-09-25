# Gno bug hunt, second pass (2026-09-25)

**Scope.** This pass covers:
- `p/gnogolf/physics` and `p/gnogolf/course`;
- `r/gnogolf/golf`;
- the 74 hole realms.

**How it was run.**
- On chain: gnomcp, profile `gnogolf` (chain `test-gnogolf`, node :26757), signed by the agent key `g1zgrxalm67jhrzn62nngj860wj4c7hraaq327lr`.
  - `gno_eval` for reads. `vm/qeval` also evaluates function literals in golf's package scope, private functions included, and throws away whatever they change. That made it possible to probe `playRound`, `stroke` and the period rules with `recover`, without writing anything.
  - `gno_call` / `gno_run` / `gno_addpkg` with `simulate=true` for writes.
  - No real write was made.
- Locally: a scratch invariant checker, run as one `*_test.gno` per hole with `nice -n 20 gno test`.
  - 100 shots per hole, 7,400 in all, with real forecasts from the last 3,000 periods.
  - Half the shots start from the tee and half from the rest point of a first shot. Strokes 0–3, ticks 0–39, powers 0.3–10.
  - A second scratch test round-tripped 60,000 q4 values through `ufmt "%.4f"` and back.
- **Cleanup:** every scratch file is deleted, and `git status` shows no change to the code.

Periods quoted below: when the calls were made, `Period()` was 5967680–5967682. Every repro that takes a period uses a past one, so it stays valid. The chain only moves its clock when a block is made.

## Summary

| # | Severity | Where | Bug |
|---|---|---|---|
| 1 | **Medium** | `physics/step.gno:215-253` | A ball that comes at a free wall end along the wall's line gets in past the end cap. It then slides and comes to rest with half the ball inside the wall. |
| 2 | Low–Medium | `physics/walls.gno:160-167` | `Unstick` pushes the ball out of a bar from the bar's centre, not along the side's normal. The ball is left overlapping the bar that just arrived, and is moved sideways along it. |
| 3 | Low | `golf/state.gno:304-331` | `SimulateRound("")` or `";;"` answers `strokes:0, rest:[0,0]`, where PlayRound refuses the same list. The cap check is not the same either. |
| 4 | Low | `golf/golf.gno:404-407`, `state.gno:306-309` | `maxShots` counts empty entries: 12 shots with a trailing `;` are refused. |
| 5 | Low | `golf/state.gno:270-273`, `course/course.gno:539` | `SimulateFrom`/`Simulate` accept any finite ball: off the board, 1e308, or inside a fixed post (the shot goes straight through the post). |
| 6 | Low | `golf/state.gno:500-508` | `Bests`/`Standings` print a duplicated address twice, and duplicates and junk count toward the 50 cap. |
| 7 | Info | `golf/golf.gno:640-653` | A tick that overflows `int` panics with "bad tick" instead of being clamped as documented. |
| 8 | Info | `golf/golf.gno:156-165` | On `dev` / `test-gnogolf`, any key can addpkg a hole under `r/gnogolf/` that takes a cup slot and archives an official hole, for good. |
| 9 | Info | `physics/step.gno` | A Loop bounce-back or an `Unstick` push moves the ball, but the path's `cause` still says `-`. |

Nothing was found against the other targets: see "Checked and holding" at the end.

---

## 1. A ball passes into a free wall end and rests inside the wall (Medium)

**Repro (on chain).** Mountain18, calm period 5967679 (checked with `weatherOf(e,p).Kind == ""`):

```
gno_eval gno.land/r/gnogolf/golf
  SimulateFrom("gno.land/r/gnogolf/mountain18", 12.2, 3.75, "195,3,0", 1, 5967679)
→ {"version":1,"holed":false,"bounces":2,"path":[[12.200,3.750],[11.686,4.298],[12.094,5.565],
   [12.433,6.616],[12.708,7.468],[12.924,8.139],[13.086,8.641],[13.198,8.989],[13.264,9.195],
   [13.267,9.203]],…,"cause":"-b-------b","rest":[13.266773689179164,9.203406448143419]}
```

**What happens.** The wall is the Lane's segment `(13.358,9.695)→(12.364,6.494)`. The ball's signed distance to that wall's line, point by point, is:

```
-0.656, -0.003, -0.017, -0.029, -0.039, -0.047, -0.053, -0.056, -0.058, -0.059
```

1. After its first bounce the ball runs along the line through the wall. It starts past the wall's end B.
2. It passes end B and slides the whole length of the wall with its centre 0.03–0.06 from it.
3. It comes to rest 0.059 from the wall. The ball's radius is 0.5, so nearly half of it is inside the wall.

**How often.** The local grid search (a ball near the bend, calm and wind, powers 0.8–3) found 6 such rests in a few hundred shots. One of the 7,400 random shots also hit it: mountain18 in a storm, a rest 0.155 and 0.337 from two walls.

**Expected vs actual.**
- Expected: the ball meets the wall's end as a round cap of radius `Radius` and bounces off it.
- Actual: the cap is never tested, and the ball ends up embedded in the wall.

**Cause (`step.gno:215-253`).** The near test runs when the distance to the line is at most `Radius`. Inside it:
- the end cap is swept only when `u` lies in `[-Radius, length+Radius]`;
- past that range the code falls through to the offset lines, which run parallel to a ball moving along the wall and never cross its path.

A move can be up to `MaxMove = 1.5` long, three times the width of the `[-r, 0]` window. So a ball can go from u = -0.97 to u = +0.13 in one move (points 2→3 above) without ever starting a move inside the window. Once it is inside, `move.Dot(facing) >= 0`, so the wall is skipped (`continue`), and the ball slides along with part of it inside the wall.

**Effect.**
- The ball is drawn half inside a wall.
- It can get past a wall end it should have hit, into a gap narrower than itself: a rampart end, a Lane vertex, a Polyline end.
- The preview still equals the commit, so this is a physics bug, not a consensus bug.

**Fix.** Sweep the end caps whether or not the ball is within `[-r, L+r]`. When `d <= Radius+skin/2` and `u < -Radius` (or `u > length+Radius`), run `Circle{C: end, R: Radius}.Hit(pos, next)` on the nearer end, just as the in-window branch already does.

The simplest version treats both ends of every wall whose box the move touches as posts of radius `Radius`, since the offset lines already stop `r` short of the round cap. A fix changes fingerprints only for shots that meet this case.

## 2. `Unstick` leaves the ball overlapping an arriving bar (Low–Medium)

**Repro (on chain).** Mountain8, calm period 5967679, tick 9:

```
gno_eval  SimulateFrom("gno.land/r/gnogolf/mountain8", 7.087709781256686, 6.895168599709078, "119.9552,8.4530,9", 0, 5967679)
→ …,[22.304,9.950],[22.447,9.852],[22.624,10.339]],…,"cause":"-b---b-----b-----",
  "rest":[22.624315439916856,10.339322945467647]
```

**What happens.** The first lift bar (`Every 12, On 4, Phase 0`) fills x ∈ [21.688, 22.488] and y ∈ [3.295, 12.495].
- The ball stops at (22.447, 9.852), inside the space where the bar comes back.
- When the bar comes back, `Unstick` moves the ball to (22.624, 10.339). That is:
  - only 0.137 from the bar's face, where the ball's radius is 0.5, so it still overlaps by 0.36;
  - and 0.49 along the bar, in +y.
- That last point is also a displacement of 0.52 with cause `-`. The invariant checker counted it as a "speed-up": the ball was moved, its velocity did not grow.

**Cause (`walls.gno:160-167`).** For a ball inside the bar:
- `out = best - c` points from the bar's centre `c` to the nearest point `best` on a side;
- the ball is then set to `best + out·(r+0.02)/|out|`.

On a long, thin bar that direction is mostly along the bar, so the ball moves only a fraction of `r` away from the face.

**Fix.** When the ball is inside, push it along the outward normal of the nearest side:

```
ball = best + n·(r+0.02)
```

where `n` is `q[k].Seg.Normal()`, oriented away from `c`. The `bestD < r` branch (`ball - best`) is already right.

## 3. `SimulateRound` answers an empty list; `PlayRound` refuses it (Low)

**Repro.**

```
gno_eval  SimulateRound("gno.land/r/gnogolf/hole1", ";;")      (same for "")
→ {"version":1,"holed":false,"strokes":0,"bounces":0,"period":5967680,"path":[],"air":"","cause":"","rest":[0,0]}

gno_call simulate PlayRoundAt("gno.land/r/gnogolf/hole1", ";;", "5967680")
→ golf: no shots
```

**Expected vs actual.**
- Expected: SimulateRound refuses exactly what PlayRound refuses (its doc says so).
- Actual: it answers, with a rest point at `[0,0]`, which is not the tee and is off the lane. A client that chains `rest` into `SimulateFrom` then previews from (0,0).

**Where.** `state.gno:304-331`: nothing checks `strokes == 0` after the loop.

**Fix.** After the loop, add `if strokes == 0 { panic("golf: no shots") }`, the same sentence as `golf.gno:424-426`.

## 4. Empty entries count toward `maxShots` (Low)

**Repro.**

```
gno_eval  SimulateRound("gno.land/r/gnogolf/hole1", "180,1;180,1;…12 shots…;180,1;")   (trailing ;)
→ golf: too many shots in one round
gno_eval  SimulateRound("gno.land/r/gnogolf/hole1", "0,1;;;;;;;;;;;;")     (1 shot, 12 empties)
→ golf: too many shots in one round
```

**Expected vs actual.**
- Expected: the docs say empty entries are skipped and at most 12 shots are taken, so both lists are valid.
- Actual: `len(strings.Split(shots, ";")) > maxShots` counts the empty entries.

**Where.** `golf.gno:404-407` and `state.gno:306-309`. The two messages also differ: "…in one commit" and "…in one round".

**Fix.** Count the non-empty entries: trim and filter them first, then check the count. Use one message in both places.

## 5. `SimulateFrom` / `Simulate` accept any finite ball (Low)

**Repro** (one qeval, with its output cut down):

```
SimulateFrom(h1, -1000, -1000, "45,10,0", 0, p)   → path [[-1000.000,-1000.000],[-995.757,-995.757],…], rest [-969.9,-969.9]
SimulateFrom(h1, 1e308, 1e308, "0,10,0", 0, p)     → path [[100000000000000001097906362944…(309 digits).000, …]]
SimulateFrom(h1, 13.114, 6.799, "0,5,0", 0, p)     (the centre of hole1's stump, R 0.7) → the ball leaves straight through the post
```

**Expected vs actual.**
- Expected: the error text is already "golf: the ball must be on the board", so a ball off the board, or inside a fixed piece, should be refused, or at least moved out first.
- Actual:
  - only NaN and Inf are refused;
  - `PreviewWith` runs `Unstick` only against the stroke's *extra* pieces (`course.gno:539`);
  - `Circle.Hit` ignores a ball that starts inside, so the post doesn't stop it.

**Impact.** Read-only, and a real round never gets there: no rest point was inside a post in 7,400 shots. But a client that sends a bad ball gets a plausible preview, not an error, and the 1e308 answer is several KB of digits.

**Fix.** In `simulateFrom` (`state.gno:270-273`):
- refuse a ball outside `[0,W]×[0,H]` (`course.BoardOf`);
- optionally refuse one inside a fixed post or bar.

Do not add fixed-field `Unstick` to `PreviewWith`: that would change the physics of committed rounds.

## 6. `Bests` / `Standings`: duplicates and junk (Low)

**Repro** (qeval sandbox, after one finish on hole16):

```
Standings("", "g1zgrx…27lr,g1zgrx…27lr,garbage,,")
→ {"version":1,"mode":"assisted","holes":74,"rows":[{"player":"g1zgrx…27lr","holes":1,"strokes":1},
                                                    {"player":"g1zgrx…27lr","holes":1,"strokes":1}]}
```

**Expected vs actual.**
- Expected: one row per player.
- Actual:
  - the same player is printed twice;
  - duplicates and invalid strings use up the 50-address cap;
  - past 50, the list is cut with no sign that it was.

**Where.** `friends` at `state.gno:500-508`.

**Fix.**
- Dedupe with a `map[string]bool`.
- Skip `!address(p).IsValid()`.
- Optionally panic past 50 instead of truncating silently.

## 7. A tick that overflows panics instead of clamping (Info)

```
gno_eval  parseShot(" 10 , 5 , 99999999999999999999")   → golf: bad tick: …
          parseShot("0x1p3,Infinity,-1")                 → (8, +Inf, 0)   (a hex float is accepted; validShot then refuses +Inf)
```

**What the docs say.** golf.md says a tick is "clamped to 0..1023". `-1` does become 0 and `1024` becomes 1023 (checked with SimulateFrom: `0,5,1024` gives the same path as `0,5,-1`). But `strconv.Atoi` fails on a value that overflows an `int`.

**Fix.** Either say "an int, clamped", or treat `strconv.ErrRange` as the clamp. Hex floats are harmless: the shot is recorded normalized (`%.4f`).

## 8. Official holes on the local chains (Info, as designed)

**Repro.**

```
gno_addpkg simulate  gno.land/r/gnogolf/zzevil
  (course.Simple{World:"garden", Order:1, …}, init(cur realm){ golf.Register(cross(cur), me) })
→ gas_used 200549532, no error
```

**What it means.** On `test-gnogolf`, `official()` returns true for any path under `r/gnogolf/`. So any key can take a cup slot and `retire` an official hole: hole1 here. That cannot be undone: there is no delisting. This is the documented choice (fix-hub C4), and the addpkg was only simulated.

**Two things to keep in mind:**
- **The shared dev chain.** One mistaken or hostile deploy on it archives a course hole for everyone.
- **Chain ids.** The check matches the chain ids `dev` and `test-gnogolf` literally. Any other network deployed with chain id `dev` gets the same "everything is official" rule.

A safer form is an explicit allowlist of deployers (`[addpkg] creator`), or a flag set at init for dev only.

## 9. The path's `cause` misses repositioning (Info)

A Loop bounce-back (`zonesAt`: `vel·-0.5`, pos moved to the front of the mouth), a Loop exit, a Tunnel, and an `Unstick` push each move the ball without writing a cause. The checker's "speed-up" hits all came from these:
- island7: a loop bounce-back, `0.11→0.48→0.76`;
- town8, hole4, island11, mountain8: timed bars pushing the ball.

None of them was a velocity gain. A client animating by cause shows these as plain rolling. A letter (`t` for teleport or push) would make them visible.

---

## Checked and holding

**Shot parsing (C1).**
- Every NaN and ±Inf form is refused: `"NaN"`, `"+Inf"`, `"Infinity"`, as `Launch` args and in lists.
- Powers:
  - `0.00004` is refused;
  - `0.00005` becomes `0.0001`;
  - `10.00004` becomes 10 and is accepted, as designed;
  - `10.00005` is refused.
- Angles:
  - `359.99996` becomes 0;
  - `-359.99996` becomes `-0`;
  - `1e300` becomes 0, since `math.Mod` of it is exactly 0;
  - `-0` replays identically.
- `ufmt "%.4f"` round-trips all 60,000 q4 values it was tested on, so a recorded shot always replays bit for bit.

**Mode and period.** Tested in the qeval sandbox and with simulated `gno_run`:
- a future period is refused, and so is P-2;
- a first stroke at P-1 is accepted;
- a round in progress refuses any other period, and refuses the other mode;
- `Launch` on an assisted round panics with "…assisted mode";
- `Launch` on a pro round started by `PlayRoundPro(P-1)` continues it, in P-1's weather;
- a round with `period = Period()-2` is refused on every path;
- stroke 59 plays, and stroke 60 panics;
- `Reset` makes `Round` return `null`.

**Commit cap.** No estimate came out below the real gas. Each line below gives the estimate, then the real gas of the simulated tx including overhead and forecast.

| hole and list | estimate | real gas |
|---|---|---|
| mountain7, 12 shots at full power | 617M | 313M |
| town8, 12 shots at power 10 with ticks, 16 timed walls | 607M | 421M (worst per-shot ratio, ~1.6×) |
| island14 | 577M | 313M |
| hole20 in rain | 327M | 194M |
| hole16, 12 × `135,10` | — | 221M |

- The heaviest per-shot estimate seen was 62M, so no 12-shot list can reach the 1.4e9 budget.
- `SimulateRound` refuses exactly what `PlayRound` refuses for a fresh round, except in #3 and #4.

**SimulateFrom.** Its path equals the last path of `SimulateRoundAt` for the same state:
- the next stroke from the exact `rest`;
- stroke 2, ticks 3, 17 and 40, period P-1;
- on hole4, town8 and island11.

It checks stroke -1 and 60 (refused), a future period (refused) and a NaN ball (refused).

**Rebuilding a round.**
- `Round` after `playRound` equals `SimulateRoundAt` byte for byte on hole4 and mountain8 (qeval).
- The same holds on hole4 after `PlayRoundPro` + `Launch` in a simulated `gno_run`, in rain, through a tunnel.

**Leaderboards and pages.** Everything below returns a well-formed empty or clamped page:
- `HoleLeaderboard` with offset `MaxInt64` and a negative limit;
- `Records` with an `after` past the end and limit -1;
- `Players` with `after="\x00"` and limit 1e6;
- `Rounds` with limit 0;
- `Weather` for period `-MaxInt64`;
- `Round` for an invalid address (`null`).

An unknown mode (`"PRO"`) panics, as designed.

**Community vs official.** A community entry was injected in the sandbox at `r/g1…/zzhole` (`official()` is false there) and played on the physics of hole16. Its holed finish:
- made no `totals` row;
- did not appear in `Leaderboard`, `Standings` or `HoleLeaderboard`;
- is kept in `Records`;
- is listed last in `Holes()` with `"official":false`;
- is drawn under "Community holes" in the hub, with no cup.

The official finish on hole16 did count.

**Physics invariants.** Over 7,400 sampled shots (74 holes × 100):
- no NaN;
- no point off the board;
- no rest point inside a post, a hazard or a tunnel mouth;
- `air` never starts away from a ground hill, and the ball never rests in the air;
- a holed ball always ends on the pin, with the step before it within the cup's radius, and a ball at rest within the radius is always holed;
- no speed above `SpeedCap`;
- no speed gain across a bounce;
- `PreviewWith` twice gives identical output.

The only rest points inside walls were #1 (and #2 for timed bars).

**Doc drift.** `docs/golf.md` is behind the code:
- `Launch` returns "Stroke N: the ball stopped…", or "Holed in N!…".
- The following changed in fix-hub and are not in golf.md:
  - `Leaderboard(mode)`;
  - `rest`/`version`;
  - rounds in `State` have no path.
