# Final pre-deploy review: physics determinism and numeric robustness (2026-09-25)

Scope: `gno.land/p/gnogolf/physics` and `gno.land/p/gnogolf/course` at HEAD `affe241`, as they will be frozen on pearl, plus how `r/gnogolf/golf` accepts their output. Nothing in the repo was changed. Every experiment ran on a scratch copy (`scratchpad/fz`) with the pearl toolchain (`~/.cache/gno-toolchains/pearl/gno`, gno `c4c72fdd288c`) at `nice -n 20`.

**Verdict.** Determinism is sound. Nothing panics, produces NaN, or fails to terminate. **Three confirmed bugs let a ball leave the lane**, on 10 of the 74 holes. Two of them (1 and 2) share one root cause and one small fix. That fix was prototyped here and changes no measured replay. The third needs a physics API change, so it has to be decided **before** the freeze.

---

## Confirmed issues

### 1. [High] A ball aimed at the tip of an acute corner passes through the solid and leaves the board

- **Where.** `physics/step.gno:297-358`, the wall loop in `Step`.
- **Mechanism.** A wall's offset lines are lengthened by `r` at each end, which makes square caps. Where two walls meet at less than about 90° and the tip points at the lane, the two square caps do not meet. A wedge-shaped gap is left in front of the tip, and no segment covers it:
  - A ball whose move ends in that gap, or just past the tip, is caught by no swept test.
  - On the next move it is within `r` of both walls. The near test sees it "moving away" from both faces, so it lets it go. The ball crosses the solid and rolls off into the void.
  - The Phase 5 round-cap sweep only runs in the near branch (`|d| <= r`). A ball coming head-on at a tip is farther than `r` from both wall lines until it is already in the gap.
- **Synthetic sweep.** A wedge of angle α, with balls aimed at the tip (804 shots per angle, 3 substeps). The table counts the shots that end inside the solid:

  | α     | 45° | 60° | 63° | 75° | 85° | 89° | ≥ 90° |
  |-------|-----|-----|-----|-----|-----|-----|-------|
  | leaks | 1   | 14  | 19  | 26  | 10  | 0   | 0     |

  Bars (90° corners) are safe.
- **Holes affected.** The scan looked for acute corners whose tip points into the lane. Shots aimed at each tip from the lane (`Step`, the hole's substeps) left the lane this often:

  | hole       | tip angle | shots that leave the lane |
  |------------|-----------|---------------------------|
  | hole14     | 69.3°     | 74 / 2750                 |
  | island2    | 74.0°     | 37 / 1895                 |
  | mountain11 | 63.4°     | 21 / 1770                 |
  | mountain12 | 83.3°     | 18 / 2750 at each of its 2 tips |

  mountain18 has three acute corners, all pointing into ground no ball reaches: 0 leaks. The random fuzz also found the mountain11 leak on its own, with no aiming.
- **Repro.** Calm, stroke 0, tick 0, through the real API. `mountain12`, `mountain11` and the rest are each hole's GG1 string, hex-decoded from its line in `data/holes.txt`:

  ```go
  h, _ := course.Decode(mountain12)
  shot, _ := h.PreviewWith(physics.V(23.5, 10.874), -math.Pi/2, 5, 0, 0, nil) // straight up at the tip (23.5, 9)
  // shot.Rest() == (27.052366319399439, -7.0897890302000954): off the 47x23 board, 0 bounces

  h, _ = course.Decode(mountain11) // found by the fuzz, from a rest near the tee
  shot, _ = h.PreviewWith(physics.V(5.0468656881583138, 4.8619634298512899), 4.2902542084598672, 10, 3, 3244, nil)
  // passes the tip (7.8165, 9.8698) at substep 4, rests at (-19.567790342712723, 9.3354537811004299)
  ```

- **What follows.** `golf.resolve` rejects only non-finite rests ("a ball off the board" is checked for NaN and Inf only). The round goes on from the void: no wall is left to hit, so every later shot rolls off further, until `maxRoundStrokes` or a Reset. The best score is not at risk, because a ball in the void can never be holed.

### 2. [Medium-High] A free wall end can still be cut diagonally from afar

- **Where.** The same loop, in the far branch.
- **Mechanism.** It is the same gap, at a free end. The square cap has no end face, only its two long sides. A ball that starts a move farther than `r` from the wall's line, past its end, and moves diagonally, can enter the cap region through the missing end face. It then crosses the wall itself, all in one move. The Phase 5 fix (round cap, `step.gno:328-351`) catches this only when the move *starts* within `r` of the line.
- **Repro.** One wall, `(0,0)-(5,0)`, `Radius: 0.5`, one substep:

  ```go
  f := &physics.Field{Walls: []physics.Wall{{Seg: physics.Segment{physics.V(0, 0), physics.V(5, 0)}}}, Friction: 0.9, Bounce: 0.8, Radius: 0.5}
  physics.Prepare(f)
  s := f.Step(physics.V(6.8450752494799332, 1.1982058770330597), physics.V(-2.5462835171612519, -1.387962625661413), 1)
  // s.Rest() == (4.2988, -0.1898): through the wall, 0 bounces
  ```

- **Holes affected.** The scan fired one-substep shots at every free end from all round (36 directions × 9 offsets × 4 speeds). These crossed the wall:

  | hole    | free ends | shots that cross the wall |
  |---------|-----------|---------------------------|
  | hole19  | 14        | 60 / 15336                |
  | island5 | 2         | 17 / 2376                 |
  | island7 | 4         | 20 / 4356                 |
  | island9 | 2         | 17 / 2304                 |

**Fix for 1 and 2 (prototyped).** In the far branch, after `seg.hitN`, also sweep the wall's two ends as round caps:

```go
if f.Radius > 0 && o.length > 0 {
	b := o.a.Add(Vec2{o.n.Y, -o.n.X}.Scale(o.length))
	for _, end := range [2]Vec2{o.a, b} {
		if t, nn, ok := (Circle{C: end, R: f.Radius}).Hit(pos, next); ok && t < best {
			best, normal, hit = t, nn, true
			restitution = o.bounce
		}
	}
}
```

- **Why it changes no good shot.** A round cap lies inside its square cap. A ball can only reach the round cap first through the missing face or the gap, and those are exactly the broken shots. Measured in the scratch copy:
  - The spike sweep drops to 0 leaks at every angle, and the free-end scan to 0 crossings.
  - The four repro shots in issue 1 stay in the lane.
  - 2960 random shots on all 74 holes (weather, ticks, strokes) give bit-identical paths before and after.
  - The fingerprints of the 8 affected holes are unchanged, and the golf tests (goldens and parity) pass.
  - It costs +5% gas on that 2960-shot workload.
- **Not done.** The fingerprints of the other 66 holes were not rerun. The random-shot digests cover them.
- **Zero-length walls.** The `o.length > 0` guard leaves them as they are: ignored (see R3).

### 3. [Medium-High] A piece that comes back between strokes pushes a resting ball through the lane's walls

- **Where.**
  - `course/course.gno` `PreviewWith`: `ball = physics.Unstick(ball, ws, ps, r)`.
  - `physics/walls.gno:932`: the exported `Unstick` calls `unstick(…, nil)`.
- **Mechanism.** Phase 5 gave `unstick` a `stays` list, so that a push never crosses an untimed wall. Only `Step` uses it, for timed bars. The between-stroke path, for pulse bars and posts, passes `nil`. The post push (`walls.gno:989-997`) checks no wall at all, on either path.
- **mountain9.** Two pulse bars alternate every stroke. On a sample of 5405 rests that are reachable (clear of every wall, and not moved by the pieces of the stroke before), 64 are pushed out of the lane when the other bar comes back.
- **hole2.** A pulse post (a mole) pushes the ball through an internal wall corner, into the other compartment.
- **Repro.**

  ```go
  h, _ := course.Decode(mountain9)
  ws, ps := h.Extras(1)
  physics.Unstick(physics.V(41.999366005765964, 4.0059792230650704), ws, ps, 0.5)
  // == (41.999366005765964, 2.8859792230650707): across the rail (41.77,3.42)-(48.98,5.11), out of the lane
  shot, _ := h.PreviewWith(physics.V(41.999366005765964, 4.0059792230650704), 270*math.Pi/180, 4, 1, 0, nil)
  // shot.Rest() == (41.999366005765964, -9.9402843787594239): off the 64x21 board

  h, _ = course.Decode(hole2)
  ws, ps = h.Extras(1) // the post that appears on stroke 1; stroke 0 has none
  physics.Unstick(physics.V(27.3, 5.8), ws, ps, 0.5)
  // == (27.050956572256091, 5.0528697167682699): across walls x=27.1 and y=5.3
  ```

- **Fix.** It needs a physics API change, so it must be made before the freeze:
  - export the `stays` form (say `UnstickIn(ball, walls, posts, r, stays)`), with the post push behind the same `crossesAny` check;
  - have `course.PreviewWith` pass `h.Course.Walls`.
- **Replays.** Only shots whose start was pushed across a wall change.

### Backstop (optional, golf realm)

`golf.resolve` could treat a finite rest outside `[0,W]×[0,H]` like a hazard: the ball goes back to `from`. That would contain issues 1-3 and any leak not found yet. It only changes replays that are already wrong.

---

## Risks (no bug on the 74 holes; they matter for data holes and future holes)

- **R1. SpeedCap is enforced only at a bounce.**
  - A slope on ice has no cap: a synthetic 96×96 board with ice ×8 and a (1,1) slope reaches 16.6 units per substep before it hits the wall. That shot is 60 substeps, 69 points and 94M gas.
  - Everything is still bounded: the keep factor is capped at 0.98, and the moves per substep are `|v|/1.5 + 1`.
  - Each real-hole fuzz run peaked above SpeedCap: 18.6 in the first, 23.8 in the second. The 23.8 is town10's pulse-zone teleport, which the fuzz does not recognise as one. The 18.6 was not traced.
- **R2. Decode vouches for bounds, not for geometry.** It accepts all of these:
  - a tunnel or loop exit inside a wall, or off the lane. A loop's roll-back and slanted set-downs are placed outside the mouth, and on a synthetic 1×2 board they landed outside the walls;
  - a tunnel whose exit lies in its own zone. It re-teleports on every move: 76 points in a 60-substep test. At higher speed it could pass golf's `maxPath` 512, and then every shot through it would panic;
  - pulse walls that are not bars of 4. `Unstick` chunks walls by 4 blindly;
  - `Every` up to 4096, while golf's `maxTick` is 1023. The player cannot choose every phase, and golf's comment "any timed piece turns in fewer" is false for data holes.

  A static check of the 74 holes found every destination (tunnel exits, loop exits, roll-back line, slanted drop) clear of walls and posts and on the board. None lies inside a tunnel or a hazard.
- **R3. Zero-length walls are no-ops in `Step`**, at radius 0 and above: the parallel test fails and the facing normal is zero. `lines` guards them, so nothing turns NaN. This is harmless unless a data hole means one as a point obstacle.
- **R4. A flying ball stopped dead hovers.** Restitution 0, head-on, while `air > 0`, gives a velocity of 0. `air` is decremented by the move length, which is now 0, and no friction applies in the air. The ball hangs until the substeps run out, then is set down. This is bounded and cosmetic, and was found by reading only.
- **R5. Timed-bar push (Phase 5).**
  - It works: 1500 shots on hole4, island11, town4, town8 and town18 had no path point inside a standing timed bar.
  - The deep review had found town4 at 30/192 before the fix.
  - Balls do come to rest where an absent bar will stand (town4 and town18, 5/300 each). The `i == 0` push resolves them at the next stroke.
  - The pushed position is checked against untimed walls only, not against posts or other timed pieces.
- **R6. `unstick` indexes `tried[k]` with `k = -1`** if every distance is NaN. Only a NaN ball does that, and golf already rejects non-finite rests.
- **R7. Absolute thresholds.** `hitN` treats `|den| < 1e-12` as parallel, and `Circle.Hit` ignores moves below 1e-6. Both are fine at board scale: every moving ball is faster than `stopSpeed` 0.02, or is pushed by a slope stronger than Drag. The fuzz found no tunnelling at those scales.
- **R8. The fuzz's in-wall and off-board counts are not triaged.** Synthetic holes at the limits (3000 + 1500 shots) had in-wall and off-board rests. The causes seen were generator artefacts:
  - a ball radius as large as a 1-3 unit board;
  - loop set-downs outside a tiny board;
  - random bars over the tee;
  - teleport exits placed at random.

  Each of those counts was not triaged. The synthetic run also saw 4 path crossings, which is consistent with issue 1 (random bars and segments make acute corners).

---

## Determinism: sound

Everything below was checked against the pearl toolchain's own gno source (`c4c72fdd288c`). `gnovm/stdlibs/math` there is identical to the local checkout.

- **Float arithmetic.**
  - Every float64 `+ - * /`, comparison, negation and compound assignment goes through `internal/softfloat` (`op_binary.go`, `op_unary.go`). Each operation is rounded on its own, so there is no FMA contraction, whatever `GOARCH` the validator runs.
  - The math stdlib is pure Gno: `Sqrt` is the bit-by-bit integer algorithm, and `Sin`, `Cos`, `Atan2`, `Asin`, `Mod`, `Min`, `Max`, `Ceil` are all Gno code. The only natives in `math` are `Float64bits` and `Float64frombits` (and their float32 forms), which are bit-exact.
  - `strconv` has no natives.
- **Float to int.**
  - Conversions use `softfloat.F64toint`, which truncates.
  - NaN and ±Inf give 0 (`ok == false` is ignored). `int(vel.Len()/MaxMove) + 1` is therefore 1 even for a non-finite speed, never an endless loop.
  - Constants convert through `big.Rat` and `big.Float`, which are integer-exact.
- **Map iteration.** Neither package ranges over a map in play. `Encode`'s skin map is used for lookups only, and so is `climates`.
- **Sorting.** There is none.
- **Clock and randomness.** There is none. The weather comes from FNV plus an LCG over integers.
- **Decode.** It refuses NaN and ±Inf (`x-x != 0`). `-0` round-trips bit for bit.

## Termination, NaN and panics

- **Termination.** `Step` is bounded:
  - at most `Substeps + MaxRollOn` (60 + 120) substeps;
  - finite moves in each;
  - one pass over the zones per move;
  - `unstick` at most 4 × 4 tries per bar.

  No loop depends on a float converging.
- **NaN.**
  - Every division is guarded: `l == 0` in `lines` and `Normal`, the empty box in `contains` for Round zones, the `(a.Y > p.Y) != (b.Y > p.Y)` test in `inPoly`, `v0 == 0` for the wind, `sp` for the Loop.
  - A cup radius as small as a subnormal makes `Sink`'s `radius*radius` 0. That yields NaN only inside a comparison, never in a path.
- **Fuzz results (pearl gno, a few minutes of CPU in total).**
  - **74 real holes: 15,540 shots.** Shots were chained from rest, at random angle and power, with exact grazes and axis angles, strokes 0-12, ticks up to 8191, and all 6 weathers. Results: 0 panics, 0 NaN, 0 paths over the step cap (the longest had 71 points). The only escape and wall crossing was issue 1 (mountain11).
  - **Synthetic holes at the Decode limits: 4,500 shots.** Each hole was built, then Encoded and Decoded. The generator used:
    - boards from 1×1 to 96×96;
    - ball radius 0, 0.5, 1 or random;
    - friction up to 0.9999999, bounce up to 1.5;
    - up to 160 walls, including zero-length walls, walls a hair long (1e-9), timed walls up to `Every` 4096, and timed bars;
    - posts up to R 8 and down to 1e-6;
    - every zone kind and flag, including inverted boxes, degenerate polygons (repeated points) and Scale 8;
    - pulses, substeps 1-60, and a cup radius down to 1e-9.

    Results: 0 panics, 0 NaN, no path longer than 199 points.

## Scratch material

Under `scratchpad/fz`:

- `course/zz_fuzz_test.gno`: the fuzz;
- `zz_spikes_test.gno`, `zz_tips_test.gno`, `zz_freeend_test.gno`, `zz_pulse*_test.gno`, `zz_dest*_test.gno`, `zz_timed_test.gno`: the scans;
- `physics/zz_corner_test.gno`: the synthetic wedge and free-end sweeps;
- `step.gno.patched`: the prototype fix;
- `before.txt` and `after.txt`: the replay digests.
