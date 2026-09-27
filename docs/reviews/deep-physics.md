# Deep review: the physics and the realms' use of it (2026-09-25)

Scope: `p/gnogolf/physics`, `p/gnogolf/course` (including `Fit` and the weather), how `r/gnogolf/golf` calls them, and the geometry of all 74 hole realms. Idioms, DRY and ABI are in `deep-code-gno.md` and are only cross-referenced here. Nothing in the repo was changed.

## How this was checked

- **Chain.** gnomcp profile `gnogolf`, chain `test-gnogolf`, 77 packages.
  - All 84 deployed files (physics 4, course 2, golf 4, 74 holes) are byte-identical to the local files, compared with `gno_read full`. The chain restarted during the review, and the file sizes still matched afterwards.
  - The experiments ran on chain with `gno_eval` in `gno.land/r/gnogolf/golf`. Function literals work in qeval, so a call like `func() string { … previewAt(e.h, …) … }()` can drive the real holes with the real code.
- **Local.** `/tmp/claude-501/gnobin test`, run at `nice -n 20`.
  - The physics, course and golf tests pass as they stand.
  - The rest ran on a scratch copy of the tree (`scratchpad/aud*`), never in the repo:
    - a one-line `Hole()` getter was added to each hole;
    - `r/gnogolf/zaudit` is a geometry audit of every hole;
    - synthetic physics experiments;
    - one copy per candidate fix (`aud_f1`…`aud_f6`).
- **Replay fingerprints.** For each hole, 576 tee shots are hashed: 24 angles × 3 powers × 2 ticks × {calm, rain}. For every fix below, "Changes replays" is **measured**: the fix was applied in a scratch copy and the fingerprints were diffed against the baseline. The golden tests (`zz_golden_test.gno`) were rerun for each fix too. **No proposed fix changes a golden hash**: the six fixtures have no local Surface, no timed hill, no free wall end and no timed hazard. The golden set therefore does not guard any of these mechanics (see the table at the end).

In the findings, **Replays** means the recorded rounds on a hole: a fix that changes them makes old `shots` strings replay to different results.

---

## Ranked findings

### 1. [High] The Seesaw stops a ball dead on a tilted plank

- **Where.**
  - `physics/step.gno:416`: `isAir` is true for "anything timed" (`z.Every > 0`).
  - `step.gno:420-428`: `groundSlopes` therefore leaves the seesaw out.
  - `step.gno:300-309`: the stop branch asks `pull(slopes, pos) > Drag`, and gets 0.
  - The geometry is at `hole20/hole20.gno:60-62`.
- **Evidence (chain).** hole20, from the tee, straight at the plank, tick 0, so the plank tilts toward the tee at 0.22, well above Drag:

  ```
  previewAt(hole20, tee, 0°, power 3.5…7, stroke 0, tick 0)
  → every power from 3.5 to 7 RESTS ON THE PLANK, e.g. p5 at [18.777,12.800] after 10 points (of 30 substeps)
  ```

  The ball climbs against the tilt, its speed reaches the stop threshold, and the stroke ends. A 0.22 tilt never rolls it back. The doc says "tipped toward the tee it rolls a ball back" (`hole20.gno:4`), but the code parks it.

  The skin-less timed-hill case gives the same result (`TestExpTimedHill`): an untimed 0.22 hill rolls the ball to 41.7, while the same hill with `Every` set leaves it at 27.3 after 5 points. Cause marks the seesaw push `'w'` (wind), not `'s'`.
- **Fix.** Classify air explicitly (see finding 15). Then:
  - let `pull` and `climbing` see timed hills while they are present, by passing the clock and testing `z.There(i+f.Tick)`;
  - keep roll-on past the stroke's substeps for untimed hills only.

  Untimed-only roll-on matters. With it on for timed hills too (variant f2), a ball on the rocking plank rocks for all 120 roll-on substeps (151 points).

  Refined variant f2b, which rocks within the stroke and then stops:

  ```go
  func pull(slopes []*Zone, pos Vec2, tick int) float64 { // tick < 0: untimed hills only
  	for _, z := range slopes {
  		if (tick < 0 && z.Every > 0) || (tick >= 0 && !z.There(tick)) { continue }
  		if z.contains(pos) { return z.Vec.Len() }
  	}
  	return 0
  }
  // step.gno:162  pull(slopes, pos, -1) > Drag     // roll-on: untimed hills
  // step.gno:304  pull(slopes, pos, i+f.Tick) > Drag
  // step.gno:181/274 climbing(slopes, pos, vel, i+f.Tick)
  ```

  Measured with f2b: power 4 rests at 16.52 and power 5 at 19.70, after the full 30 substeps of rocking. Update the hole's doc to match what it does. A slow ball ends somewhere on the plank; it does not reliably come back.
- **Replays: changes hole20 only**, measured for f2 and f2b. Goldens are unchanged. Side effect to check: a fast ball leaving the plank's far end while climbing it now takes off, as off any crest.

### 2. [High] Calm vs weather: in calm, a Surface's friction outlives the Surface. Fog is not cosmetic

- **Where.** `step.gno:171` sets `surface := 1.0` once per **substep**, and `zonesAt` (`step.gno:332-333`) writes to it only while the ball is in a Surface zone. In calm, a ball that leaves sand or ice at move k keeps that friction for the rest of the substep, and friction is applied once at the end (`step.gno:292-300`).

  Any weather that lays a whole-board Surface resets `surface` on every move: rain, storm, snow, and **fog (Scale 1)**. Wind lays only a Slope, so wind keeps the calm behaviour.
- **Is it real?** Yes. It only happens when a substep has 2 or more moves (speed of 1.5 or more) and crosses a Surface's edge.
- **Is it a bug?** Yes, in the calm path. The comment at `step.gno:333` says `surface` is "the surface the ball last rolled on this substep". After leaving the sand, that is grass, not sand. The weather path is the one that matches the stated intent.

  The same stale-surface effect makes the "decor" Scale-1 Surfaces physically live: `molehill` (hole2), `mill` (hole4), `bridge` (hole12, town7, town10), `plank bridge` (town15). They reset a sticky sand or ice value mid-substep, so they are **not inert today**. That matters for M9 in `deep-code-gno.md`, which proposes Scale-1 Surfaces as decor.
- **Evidence.**
  - Chain. hole6 (Icehouse), shot from the tee at 30° and power 8, calm vs fog:

    ```
    previewAt(hole6, tee, 30°, 8, 0, 0, nil)            → rest [37.690,10.816]
    previewAt(hole6, tee, 30°, 8, 0, 0, fog zones)       → rest [38.765,10.272]
    SimulateRoundAt(hole6,"30,8",5967531 /*clear*/) cause "--biiibiiii---b-----"
    SimulateRoundAt(hole6,"30,8",5967534 /*fog*/)   cause "--biiibiii-----b----"
    ```

    Also at 330°: calm [38.720,8.106], fog [38.172,7.204].
  - Local. A 3-wide sand strip at speed 4 rests at 16.94 in calm and at 26.86 in fog, 9.9 units apart (`TestExpCalmVsFog`).
- **Minimal fix (f1).** One line: reset the surface per move, where the zones are read.

  ```go
  // step.gno:177
  if air <= 0 {
  	surface = 1.0 // the ground under this move: grass unless a zone says otherwise
  	if f.zonesAt(&pos, &vel, &surface, n, i+f.Tick, &out) {
  ```

  After it, fog (Scale 1) plays exactly like calm, and the Scale-1 decor surfaces become truly inert.
- **Replays: CHANGES calm rounds on 10 holes**, measured: hole3, hole5, hole6, hole11, hole13, island1, mountain1, mountain7, mountain14, town12. Rounds recorded in rain, snow, storm or fog are unchanged. Goldens are unchanged.

### 3. [High] island7's tube mouth is narrower than a move: strong shots skip it and bounce off the castle

- **Where.**
  - `island7/island7.gno:39`: the Loop mouth is 1.0 wide along its axis (x 12.4 to 13.4).
  - `step.gno:78-80`: `MaxMove = 1.5`, whose comment claims "Every zone is at least twice this wide on the holes as built". That is false, see the list below.

  Zones are only sampled at the start of each move, so a move longer than 1.0 can step over the mouth.
- **Evidence (chain).** island7, straight at the mouth from the tee, stroke 0, tick 0, powers 4.0 to 10.0 in steps of 0.25:

  ```
  4.5 ROUND  4.75 miss  5..6.5 ROUND  6.75 miss  7..8 ROUND  8.25 miss  8.5 ROUND  8.75 miss  9.0 miss  9.25.. ROUND
  p6.75 path: [3.500,12.700][7.550,12.700][9.079,12.700][7.208,12.700]…  cause "--b---"
  ```

  At power 6.75 the samples land at 7.55 and then about 8.90, just short of the mouth's edge; the next is 10.25, past it. The ball meets the castle and comes back. Stronger shots than working ones fail at random.
- **Fix.** Widen the mouth to at least `MaxMove`, which is the true bound, not twice it. For example, `Min: physics.V(11.4, 12.2)` (2.0 wide), measured with 0 misses over 4.5 to 10.
  - Add the audit's rule as a test: every non-decor zone must be at least `MaxMove` along the direction it is crossed.
  - Fix the `MaxMove` comment.
- **Other zones under 2·MaxMove.** Safe today, but either near the edge or relying on luck:
  - town14 door tunnel, 1.2 × 1.6. The rebound off the house catches it: 9 of 9 powers went in, but only by that rebound.
  - hole4 tunnels, 2.4 × 2.2.
  - island9 gaps and island10 gap, 2.0 to 3.0.
  - hole12 water, 2.2 tall.
  - mountain16 cliff, 2.5.
  - town15 and town7 bridges.
  - hole2 molehill, which is decor.
- **Replays: changes island7 only.**

### 4. [Medium-High] A free wall end can be passed through, and the square caps give wrong normals

- **Where.** `step.gno:219-232` and `shapes.gno:47-62` (`Toward`).
  1. **Corner skip.** When the ball is closer than r to the wall's line, past an end, but more than r from the end point (the corner of the square around the cap), the code `continue`s. That skips the swept test for that wall, so the move can cross the wall's end region.
  2. **Square caps.** `Toward` lengthens each offset line by r, so a free end is a square of side 2r, not a round cap. A ball grazing the end within r of the line meets a flat face early, up to about 0.3 early, with a normal square to the wall. It is sent straight back instead of glancing off.
- **Evidence (local).**
  - A lone wall from (10,0) to (10,5), ball at (9.6,5.35) with velocity (0.5,-1): after one substep it is at (10.1,4.35) with 0 bounces. The centre crossed x=10 at y≈4.55, inside the wall (`TestExpCornerSkip`).
  - A ball passing 0.45 above the end point bounces at x=5.66 off the flat line; the true contact would be at x=9.78 (`TestExq`).
  - No escape from the lane was seen in 720 tee shots on mountain12 or mountain18, and Bars are covered by their cap face. Holes with truly free ends: hole19's maze (the ring gaps are open Polylines, the spokes are single segments), island7's ramparts, and the open Polylines of island5 and island9.
- **Fix (f4).** Past an end, sweep against the round cap instead of skipping:

  ```go
  } else if t, nn, ok := (Circle{C: end, R: f.Radius}).Hit(pos, next); ok && t < best {
  	best, normal, hit = t, nn, true
  	restitution = o.bounce
  }
  continue
  ```

  With it, the corner case bounces (bounces=1, stays at (9.62,5.32)). Next step: drop the `Toward` lengthening and rely on the round caps (a true capsule), which removes the phantom flat corner too.
- **Replays: changes mountain12 and mountain18**, measured for f4; there the ball grazes outline vertices. Goldens are unchanged. Dropping the lengthening would change more holes; measure before shipping.

### 5. [Medium] A ball at rest under a timed hazard is checked at one arbitrary instant

- **Where.** `step.gno:319`. The final resolution uses `substeps+f.Tick`, the nominal end of the stroke, not when the ball stopped and not the time until the next stroke. A ball that stops under a serac is swept only if the serac happens to be falling at that one tick.
- **Evidence (chain).** mountain15, aimed at -8.5°, tick 0:

  ```
  p4.25 rests under serac at [18.410,17.721] (stopped at substep 10; the serac falls at substeps 12-15 and 24-27
  before the stroke's end, 28, where it is checked)   — same for p4.5, 4.75, 5.0, 5.25
  ```

  The doc says "a ball caught under falling ice is swept back down to the start" (`mountain15.gno:3`), yet a lay-up under a serac survives. It then escapes on the next stroke by choosing a release tick. island15's timed blowhole has the same flaw, for a ball at rest on it.
- **Fix (f3).** After the untimed resolution, meet each timed Hazard or Tunnel the ball rests in at its next "on" substep, within one period of `stop`:

  ```go
  for j := range f.Zones { z := &f.Zones[j]
  	if z.Every <= 0 || (z.Kind != Hazard && z.Kind != Tunnel) || !z.contains(pos) { continue }
  	for k := 0; k < z.Every; k++ { if z.There(stop+f.Tick+k) { /* hazard: add Vec, return; tunnel: move, break */ } }
  }
  ```

  Measured: all three lay-ups are now swept to [11.078,18.039].
- **Replays: changes island15 and mountain15 only.** Goldens are unchanged.

### 6. [Medium] Timed walls appear on a rolling ball and swallow it

- **Where.** `course.Unstick` (`course.gno:666-703`) runs only for pulse pieces, at the start of a stroke. Timed walls (`Wall.Every`) that appear mid-stroke on top of the ball are handled only when a face is within r (`step.gno:197-213`). Inside a thick bar, the ball bounces between the inner faces.
- **Evidence (chain).** town4 (Tram Crossing), tee shot at 0°, power 5, tick 0. The tram spans x 21.8 to 24.8 and stands in substeps 0-6 and 12-18:

  ```
  path … [23.866,7.000][24.020,7.000][24.042,7.000]  cause "---------------"  bounces 0
  ```

  The ball rolls into the tram's track while the tram is away, the tram arrives at substep 12, and the ball rests **inside the tram car**.

  With the ball placed inside the tram (23.5,7.5) and hit at power 6, it bounces 5 times between x=22.30 and x=24.30 inside the bar until the tram leaves, then stops at 23.7.

  Local sweep (192 tee shots per hole, 8 ticks × 8 powers × 3 angles): the ball's centre ends up inside a standing timed bar in **town4 30/192**, town18 8/192, island11 7/192 and town8 7/192.
- **Fix.** Move `Unstick`'s logic into physics. At the substep where a timed bar reappears (`There(i) && !There(i-1)`), push a ball found inside it out through the nearest face; better, out in the bar's direction of travel.
- **Replays:** changes town4, town8, town18 and island11 (not measured; the patch is not written).

### 7. [Medium] Slopes at or below Drag never move a resting ball; slopes just above it creep at constant speed

- **Where.**
  - `step.gno:162` and `:304`: `pull > Drag`, strictly.
  - `step.gno:300-309`: when `sp <= 0.02` on such a slope, `vel = 0` and it goes on.
- **Two traps.**
  1. **|Vec| ≤ Drag (0.12).** A resting ball moves |Vec| once and stops. No roll-on.
  2. **Drag < |Vec| ≲ 0.152.** Here 0.152 = (Drag+0.02)/keep, for keep = Friction + 0.05 = 0.92. The ball is zeroed every substep and moves exactly |Vec| per substep, like a conveyor, for up to `MaxRollOn`. Friction says it should not move at all.
- **Every hole with such slopes** (zaudit, ground slopes only):

  | ≤ Drag (inert on a resting ball) | Creep band (0.12, 0.16] |
  |---|---|
  | island18 banks ×4 at exactly 0.12 (the tee and the pin sit on one) | hole16 slope 0.15 |
  | island5 beach 0.08 (intended: "gently enough for a ball to stop") | mountain12 saddle 0.14 ×2 |
  | mountain11 bank 0.12 and braking stretch 0.07 | mountain11 downhill 0.16 and mountain14 downhill 0.16, just above 0.152: they accelerate, barely |
  | mountain15 whole-board 0.054 | |
  | mountain9 ×2 and mountain16 `avalanche-warn` at 0 (decor, see 10) | |

- **Evidence (chain, a ball at rest with power 0).**

  ```
  island18 bank 0.12   [4.807,15.248] → [4.927,15.248]  (2 pts: one nudge, stop)
  island5 beach 0.08   [20.5,9.063]  → [20.5,9.143]
  mountain11 braking   [19.5,20]     → [19.5,20.07]     (doc: "a soft one rolls back to the hairpin")
  mountain11 bank      [12,31]       → [12,30.88]       (doc: "a slow one slides down into its inside")
  hole16 0.15          [15.5,6.5]    → [23.6,6.5] in 55 pts   = 0.150/substep flat
  mountain12 0.14      [18.5,11.5]   → [13.46,11.5] in 37 pts = 0.140/substep flat
  ```

- **Doc mismatches.**
  - `mountain11.gno:3-6`: the bank and the braking stretch don't move a stopped ball.
  - `mountain15.gno:40`: "a ball left short rolls back a little" is false at 0.054.
  - island18: "carries you round" holds only for a moving ball.
- **Fix.** Name the threshold and use it in both places:

  ```go
  // holds: a slope of steepness g cannot start a resting ball on a surface of scale s
  // (the same arithmetic as step.gno:292-301, one substep from rest).
  func (f *Field) holds(g, s float64) bool {
  	keep := math.Min((f.Friction+0.05)*s, 0.98)
  	return g*keep-Drag/s <= stopSpeed // stopSpeed = the 0.02 at :301, named
  }
  // replaces `pull(...) > Drag` at :162 and :304 with `!f.holds(pull(...), surface)`
  ```

  Then, on the design side, choose for each hole listed: raise the slope above the threshold (0.16 or more) or rewrite the doc to say the ball stops there. Add a zaudit-style test that fails on any untimed ground slope within ±0.03 of the threshold, unless it is marked as meant.
- **Replays:** the physics change affects hole16, mountain12 and every hole where a ball comes to rest in the band. Hole edits change only their own hole.

### 8. [Medium, latent] The pin check stops an oscillating ball mid-roll

- **Where.** `step.gno:151-161`: a roll-on ball that moved less than 0.1 in 8 substeps is stopped.
- **Can it stop a legitimately slow ball?** Not a creeping one: a roll-on ball always moves |Vec| > 0.12 per substep, at least 0.96 per window. It **can** stop a ball swinging in a valley or circling in a bowl. The ball comes back near its anchor after one window, and stops while still moving.
- **Evidence (local).**
  - Valley (±0.3): stops at 36 points with the last substep moving 0.300.
  - Bowl (0.25): stops with the last substep at 0.354.
  - Other starts run the full 120 roll-on substeps (124 points), whichever comes first.
  - Posts, wall ends and wedges: covered by `TestABallInAWedgeNeverGains` and `TestAPinnedBallStops`; no gain was seen.
- **Real holes.** None has a valley or bowl steeper than Drag today. island18's inward banks are exactly 0.12, so they get no roll-on at all.
- **Fix.** Stop only when both the displacement and the speed are small, e.g. `pos.Sub(anchor).Len() < pinMove && vel.Len() < 2*Drag`. Otherwise let `MaxRollOn` end it.
- **Replays: none today** (no real hole triggers it).

### 9. [Medium] Leaving a hill through its side counts as going over its top

- **Where.** `step.gno:274-279`. A take-off happens whenever a climbing ball stops being "climbing", including when it leaves the zone sideways while moving slightly uphill.
- **Evidence (local).** A hill with Vec (0.2,0) (uphill is -x), ball moving (-0.4,3.5), mostly across the hill: it takes off at the side edge, with 1 air point and about 4.8 units of flight, during which zones are ignored (water, cup).
- **Fix.** Take off only when leaving through the uphill face: at the crest, require the velocity to point up the slope, e.g. `-vel.Dot(z.Vec) >= 0.7*vel.Len()*z.Vec.Len()`, or test that the exit point is past the zone's edge along `-Vec`.
- **Replays:** changes slope holes on sideways exits (not measured).

### 10. [Low-Med, latent] Zero-Vec decor Slopes hide real hills; `pull` and `climbing` take the first slope while velocity sums them all

- **Where.**
  - `step.gno:432-449`: both return the first containing slope.
  - `course.gno:433-439`: `WithZones` puts pulse zones first.
  - The `avalanche-warn` slopes in mountain9 and mountain16 have Vec 0.
- **Evidence (local).** A hill of 0.3 on its own: 23 points, rest 42.5. The same with a zero-Vec warn zone first: 3 points, rest 13.1, no roll-on (`TestExpMaskingSlope`). No real overlap exists today. Zero-Vec slopes also mark `'s'` in Cause (M9 in `deep-code-gno.md`).
- **Fix.**
  - Add a decor kind that `zonesAt` ignores; not a Scale-1 Surface until finding 2 is fixed.
  - Make `pull` the length of the summed `Vec` of the containing ground slopes, which matches what the velocity actually gets.
- **Replays: none today.** The JSON `kind` changes for the decor zones, so the client must accept it.

### 11. [Low] `WithZones` comment is inverted for Surfaces

- **Where.** `course.gno:431-439`: "The extra zones come first: a puddle over the sand is the puddle." Surfaces are last-wins (`step.gno:333`; `docs/physics.md:116` says so), so a first-listed puddle loses to the sand.
- **Evidence (local).** Overlapping sand and ice rest at 30.24 in one order and at 9.36 in the other (`TestExpSurfaceLastWins`). Hazards and Tunnels are effectively first-wins, so the order means opposite things per kind. `WithWeather` (`course.gno:406-422`) gets it right by putting puddles last.
- **Fix.** Put the extra zones after `f.Zones`, or fix the comment. Better still, document one precedence rule per kind in the `Zone` doc.
- **Replays: none today.** The one Surface pulse, town10's `bridge`, overlaps no other surface.
- **Note on the brief.** There are no "surface products". Overlapping surfaces are last-wins, and slopes sum (see 10).

### 12. [Low] `Fit` leaves band zones sticking out of the board

- **Where.** `fit.gno:79`: a zone counts as "whole" only if it covers all four sides of the old board. Zones that span one axis are shifted, not clamped.
- **Evidence (zaudit).**
  - mountain5: kicker and crevasse, y -0.886 to 13.114 on a board 13 high.
  - mountain11: bank, slope and ice, x down to -0.983 and up to 25.017 on a board 24 wide.
  - mountain14: 3 slopes, y -0.925 to 13.075.
  - mountain16: 2 slopes, y -0.931 to 15.069.
  - hole7: round pond, x up to 48.5 on a board 47 wide. The ellipse is clipped by the lane's own wall, which is fine physically.
- **Everything else about Fit checks out on all 74 holes.**
  - Every wall end, including timed walls and pulse walls, sits at least 1.5 inside the board. The minimum margin is exactly 1.500 everywhere.
  - Posts are inside.
  - Pulse walls, posts and zones are shifted; `Extras("town10",0/1)` shows the canal and the bridge at x 21.296.
  - Tunnel, Hazard and Loop `Vec`s are shifted, Slope `Vec`s are not, and whole-board zones are resized (mountain15's 0.054 slope becomes 57×26).
- **Fix.** After the shift, clamp non-Round, non-Poly zone rectangles to [0,W]×[0,H]. Leave Round zones alone: clamping changes the ellipse.
- **Replays: none**: the clipped area is outside the walls. State JSON changes for those 5 holes (no golden impact; the fixtures don't Fit).

### 13. [Low] "Lively" bumpers are a no-op, and the code still talks about them

- **Where.**
  - `step.gno:259-261` caps every restitution at `MaxBounce` 0.92.
  - `step.gno:91-94`: `Push` is exported and dead.
  - Stale comments: `step.gno:99-102` (`SpeedCap`: "bumpers that add energy"), `step.gno:252-256` ("A bumper… kicks the ball out with a fixed push"), `field.gno:11` ("Bounce above 1 to make it lively"), `field.gno:100-104` (the `Post` doc and its `Bounce` comment).
- **Evidence (local).** Bounce 0.92, 1.1 and 1.3 give an identical rest (3.066). Posts with Bounce above 0.92: hole8 ×6, hole17 ×7, hole10 ×5, town11 ×5, hole2 ×4, hole14 ×1.
- **Energy is otherwise sound.**
  - `TestNoBounceAddsSpeed`, `TestFlatGrassNeverSpeedsUp`, `TestABallInAWedgeNeverGains` and `TestWindNeverSpeedsTheBallUp` all pass.
  - vt·0.97 − vn·r ≤ |v| holds for r ≤ 0.92.
  - The wind cap holds for `Skin == "wind"`, including storm gusts. mountain10's `gust` (0.35) is uncapped by design.
- **Fix.** Delete `Push`, reword the four comments, and either set those posts to ≤ 0.92 or leave them (the cap is the contract).
- **Replays: none** (the cap stays).

### 14. [Low] Replay edge at ±360°

- **Where.** `golf.gno:365` and `state.gno:229`: `q4(validShot(angle, power))`. `Mod` runs before `q4`, so 359.99996 is played as `q4(359.99996) = 360.0000` and recorded as `"360.0000"`. On replay, `Mod(360, 360) = 0`.
- **Evidence (chain).**

  ```
  q4(validShot(359.99996,7)) = 360.000 → q4(validShot(360,7)) = 0.000
  ```

  On hole8 the two paths came out identical, because sin(2π) ≈ -2.4e-16 is lost in the rounding. That is not guaranteed on every field.
- **Fix.** `return math.Mod(q4(angle), 360)` inside `validShot`, which makes the recorded value a fixed point.
- **Replays: none** in practice. `Simulate` not quantising the power is already in `deep-code-gno.md` (M-level).

### 15. [Low, design] Skin strings drive physics, against the package's own contract

- **Where.** `field.gno:22` says "Skin carries no meaning for the simulation". It does:

  | Code | Skin rule | What it drives |
  |---|---|---|
  | `step.gno:404` `closedLoop` | contains `"tube"` | a skin rename such as "castle tunnel" silently turns the tube into an open loop |
  | `step.gno:416` `isAir` | `"wind"`, `"gust"`, or any timed zone | see finding 1 |
  | `step.gno:345` | `Skin == "wind"` | the wind cap |
  | `course.gno:411-417` `WithWeather` | sky skins | whether a zone goes under or over |
  | `course.gno:335` `wet` | only `"ice"` gets wet (`"ice rink"` would not) | wet ice |
  | `course.gno:394` `dryLand` | any skinned Surface | refuses puddles |

- **Fix: explicit fields.**
  - `Zone.Closed bool`, for a Loop.
  - `Zone.Air bool`: pushes but is no hill (no roll-on or take-off), and its speed cap goes with it. Alternatively, a separate `Wind` zone kind.
  - `Forecast.Sky []Zone` and `Forecast.Over []Zone` instead of splitting by skin.
  - `Zone.Wet float64` (scale multiplier in rain), or a `Slick bool` on Surfaces.
  - Keep skins as art only.
- **Replays: none** if the holes set the new fields to match today's skins; finding 1 is the one intended change. State JSON gains fields, so **the State golden hashes change if they are serialised**. Keep them out of `zonesJSON`, or re-pin the goldens.

### 16. [Low] Hole geometry nits (zaudit)

- **Zero-length walls.** hole7 walls 1 and 13 (`hole7.gno:25-28`): `Path` repeats (34,0) and (34,12) where an `Arc` starts. They cost gas on every move; there is no physics effect.
  - Fix: drop the duplicate points, or have `Outline` and `Polyline` skip zero-length sides.
- **Redundant or overlapping walls.**
  - hole4's mill `Box` top and bottom lie on the Stadium edge, 6.0 of overlap each (`hole4.gno:52`). Use two side segments or a Bar.
  - The town2 stall caps and the town17 awning lie on the outer wall.
  - The mountain13 nets share faces.
  - The hole20 hedge bars overlap at their joint, and a cap pokes 0.3 through the outer wall.
  - hole5's door overlaps the gate bars by 0.8, which is intended as a seal.
  - Coincident walls give the same hit at the same t, so removing the duplicate should not change replays. Confirm with the fingerprint.
- **Placement is clean.**
  - Tee and pin: none lies inside a wall's radius, a post, a hazard, a tunnel or a loop, on any hole. They do sit on slopes or surfaces, which is intended, e.g. island18 tee and pin on 0.12 banks, hole3 pin on 0.22, mountain15 on 0.054.
  - Tunnel exits: none lands within r of a wall, inside a post, or inside another tunnel or hazard. The same holds for the Hazard destinations.
  - All pulses have their walls in bars of 4, so `Unstick`'s chunking holds.
- **dryLand's even-odd test** (`course.gno:370-384`) is wrong with open Polylines (hole19's maze rings, island5, island9). island5 and island9 are saved by the sea hazard check. hole19 (garden, rain 15%) can misjudge where the lane is.
  - Fix: take the lane from a declared outline, not from parity over all walls.
- **Checked and fine.**
  - hole20 is "The Seesaw". Pond hazards y 2 to 11.8 and 14.2 to 24, plank y 11.8 to 14.2, tilt ±0.22 on a 20-substep clock, no loop; the plank's behaviour is finding 1.
  - mountain11 has no Loop any more: 3 slopes and 2 surfaces. Its doc needs finding 7.
  - The only Loop left is island7's `"castle tube"`.

### 17. [Low] `Pulse.at` is not sign-safe, unlike `there`

- **Where.** `course.gno:442-447`: `(stroke+p.Offset)%p.Every < p.On`. A negative Offset breaks it. `there` (`field.gno:76-78`) is sign-safe.
- **Fix.** `return ((stroke+p.Offset)%p.Every+p.Every)%p.Every < p.On`, or export and reuse `there`.
- **Replays: none**: all offsets are ≥ 0.

### 18. [Info] Determinism, weather and period: sound

- **Determinism.**
  - GnoVM float ops go through softfloat (`gnovm/pkg/gnolang/internal/softfloat`), so there is no FMA or platform drift.
  - physics has no map iteration. course only looks up the `climates` map, never iterates it.
  - Clients replay the chain's `Path` and never simulate.
  - Zone order dependence is deterministic and documented (see 11).
  - `q4` quantisation of shots is applied in `stroke` and `simulateRound` (edge case: 14).
- **Weather.**
  - Each climate table sums to 100. "extras" falls back to garden, and mountain has no rain, so `WetIce` never applies there.
  - `RainScale` 1.025 gives keep 0.943 on a 0.87 green, as the comment says.
  - `SnowScale` 0.9 lies under the hole's ice, which wins.
  - Wind runs from 0.08 to 0.15 per substep. `Shelter` 0.08 (island5, island6, island9, town3, town15) pins it at `WindMin`.
  - The wind cap means a tailwind never helps and a headwind brakes. That asymmetry is a design choice worth stating in the rules.
- **Period.**
  - `Period()` is block time / 300.
  - `notAhead` refuses future reads.
  - `playablePeriod` accepts the current period or the previous one for a round's first stroke; later strokes must repeat the round's own period.
  - Verified on chain: `Weather("hole6", 5967534)` is fog, one whole-board Surface at Scale 1.

### 19. [Code quality] Comments, length, constants, API

- **Stale or false comments.**
  - `step.gno:78-80` (`MaxMove`, see 3).
  - `step.gno:91-102` and `:252-256` (bumpers, see 13).
  - `step.gno:146-149`: "does not stop on a slope steeper than the drag" is true only for untimed slopes, and see the creep in 7.
  - `step.gno:166-169`: "a bounce keeps what is left of the substep". The rest of the move where the hit happens is dropped; only the later moves continue.
  - `field.gno:22` (skins, see 15).
  - `field.gno:194`: "Friction … 0.8 rolls to a stop in about a dozen". The code keeps `Friction+0.05`, and there is `Drag`.
  - `course.gno:431-433` (see 11).
  - `physics_test.gno:120-121`: the comment of `TestFastBallMeetsANarrowZone` sits above `TestRoundZoneHasNoCorners`.
- **`Step` is about 210 lines.** Split it into:
  - `wallOffsets` (lines 124-143);
  - `collide(pos, next, move, i)`, which returns best, normal and restitution (lines 184-248);
  - `bounce` (250-268);
  - `roll(vel, surface)`, the friction and stop decision (288-310);
  - `rollOn(i)`, the roll-on and pin decision (155-165).
- **Magic numbers to name.**
  - `0.05` friction offset (`:292`) and `0.98` keep cap (`:293`).
  - `0.02` stop speed (`:301`).
  - `1e-6` skin (`:113`).
  - `0.7071` and `0.9063` (`:372`, `:377`): cos 45° and cos 25°, the Loop mouth.
  - `-0.5` loop fall-back (`:394`), `0.01` and `1.5` loop put-down offsets (`:378-386`).
  - `CaptureSpeed*1.5` in `Sink` (`course.gno:618`).
- **Exported API that can go.**
  - `Push` (dead).
  - `Reflect` (tests only).
  - `course.Chance` and `course.Hash` (internal only).
- **Loop.** With only closed tubes in play, `LoopOver` and the fly-off branch are unreachable (`deep-code-gno.md` covers this). The fly-off branch also `return true`s from `zonesAt`, which skips the final rest resolution.

### Aside (render, outside physics)

On the hole20 page, `:` is both "wear" and "flowerbed", and `#` is both "wall" and "hedge" in the legend.

---

## Mechanics → tests → gaps

| Mechanic | Tests covering it | Gaps (found in this review) |
|---|---|---|
| Walls, box, radius | `TestBallStaysInTheBox`, `TestShortWallIsNotAnInfiniteLine`, `TestRoundBallKeepsItsRadiusFromWalls`, `TestBallInACornerStaysIn`, `TestStadiumHoldsTheBall` | Free wall ends: the corner skip and square caps (4). Collinear lone Segment, a documented caveat: a ball at speed 3 or 6 passes through one end-on. |
| Bars | `TestBarStopsABallRollingAlongIt` | — |
| Posts | `TestPostBouncesBack`, radius part of `TestRoundBall…` | — |
| Energy / bounce cap | `TestNoBounceAddsSpeed`, `TestBumpersCannotPumpForever`, `TestFlatGrassNeverSpeedsUp`, `TestABallInAWedgeNeverGains` | Nothing asserts that Bounce > 0.92 equals 0.92 (13) |
| Wind cap | `TestWindNeverSpeedsTheBallUp`, `TestWindDoesNotHideTheHillUnderIt`, `TestATimedGustOnlyBlowsInItsWindow` | Skin-keyed; nothing for a `gust` or a renamed skin (15) |
| Surface | Indirect only (ice in `TestReplaysAreDeterministic` and `TestWindNever…`; puddle in `TestPulseZoneComesAndGoes`) | **No test**: edge crossing mid-substep (2), overlap order (11), calm = fog |
| Slope / roll-on | `TestUphillSlopeSendsTheBallBack`, `TestASlowBallRollsBackDownAHill`, `TestABallLeftOnASlopeRollsDown`, golden `slope` | Threshold and creep band (7), timed hills (1), masking and first-wins (10) |
| Pin check | `TestAPinnedBallStops` | No negative test: an oscillating or bowl ball must not stop mid-roll (8) |
| Take-off / air | `TestFastBallFliesOverThePondBehindAHill`, `TestSlowBallOverTheTopLandsInThePond`, course `TestBallInTheAirFliesOverTheCup` | Side exit (9); airborne at the last substep over a slope |
| Tunnel | `TestTunnelMovesTheBallAndKeepsItRolling`, golden `tunnel` | Timed tunnel at rest (5); exit geometry (no hole-level test) |
| Hazard | `TestHazardStopsTheBallAtItsTarget`, `TestFastBallMeetsANarrowZone`, `TestBallThatStopsInWaterIsResolved`, `TestOffTheLaneIsTheSea`, golden `sea` | Timed hazard at rest (5) |
| Loop | `TestLoopWantsTheRightSpeedAndTheMouth` (incl. tube) | Mouth narrower than MaxMove (3); no golden |
| Timed walls / Tick | `TestATimedWallIsOnlyThereSometimes`, `TestTickMovesTheTimedWalls`, `TestTheReleaseTickShiftsTimedWalls`, golden `timed`, golf `TestTimingIsPartOfTheShot` | A wall appearing on the ball (6) |
| Pulses / Unstick | course `TestPulseZoneComesAndGoes`, `TestPieceAppearingOnTheBallPushesItOut`, golf `TestTimedHoleFollowsTheRoundsStrokes`, golden `pulse` | Negative offset (17); pulse Surface order (11) |
| Zone shapes | `TestRoundZoneHasNoCorners`, `TestOffTheLaneIsTheSea` | — |
| Fit | `TestFitPutsTheWallsInsideTheBoard` | Pulses, timed walls, Tunnel/Loop `Vec` and band zones (12) are all untested; the zaudit found them right except 12 |
| Weather | course `TestWeatherIsLaidUnderTheCourse`, golden `storm` and `slope/rain`, golf `TestWeatherOfTheMoment`, `TestAFuturePeriodIsRefused` | Fog must equal calm (2); wet ice; puddle placement on Polyline holes (16) |
| Sink / capture | `TestSlowBallDropsWhileCrossing`, `TestFastBallSkimsOver` | — |
| Determinism / replay | `TestReplaysAreDeterministic`, golden ×6, `TestPlayRoundEqualsTheSameShotsOneByOne`, `TestSimulateRoundEqualsPlayRound`, `TestPreviewMatchesPlay` | ±360° record (14). **No real hole is pinned**: none of findings 1-7 moves a golden hash. |
| Cause | Length only (`TestReplaysAreDeterministic`) | The letters themselves: seesaw `'w'` (1), decor `'s'` (10) |
| Hole geometry | none | Add the zaudit checks as a test: walls and zones inside the board, tee, pin and exits clear, zones ≥ MaxMove, slopes not near the threshold, no zero-length or duplicate walls, pulse bars in fours |

**The strongest single addition** is to pin the real holes. Commit a per-hole fingerprint like the one used here (576 shots per hole, about 8 minutes; a smaller grid is fine for CI) as a golden. Every replay-changing fix then shows up as the list of holes it touches, as it did in this review.

## Replay impact summary

| Fix | Holes whose replays change (measured) | Goldens |
|---|---|---|
| 1. Timed hills are ground (f2b) | hole20 | unchanged |
| 2. Surface per move (f1) | hole3, hole5, hole6, hole11, hole13, island1, mountain1, mountain7, mountain14, town12 (calm rounds only) | unchanged |
| 3. island7 mouth 2.0 wide (f6) | island7 | unchanged |
| 4. Round caps, no corner skip (f4) | mountain12, mountain18 | unchanged |
| 5. Timed hazard at rest (f3) | island15, mountain15 | unchanged |
| 6. Unstick timed walls | town4, town8, town18, island11 (expected, not measured) | expected unchanged |
| 7. One hold threshold | hole16, mountain12, plus any rest in the band (not measured) | slope golden: re-check |
| 8-17 | none, or JSON only (12, 15) | unchanged, unless new fields go into State (15) |
