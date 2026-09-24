# Gnogolf — similarity audit of the 72 cup holes

Scope: garden (`hole1..hole20` minus the extras `hole10` and `hole16`), `island1..18`,
`town1..18`, `mountain1..18`. I read every hole file in full, plus `physics/field.gno`,
`physics/step.gno` (for how Loop, air and timed zones behave), `course/course.gno`
(Pulse) and the renderers (`web/lib/scene/{zones,pieces,course,garden,island,town,mountain}.js`,
`web/lib/terrain.js`). `town18` is treated as taken, since it is already being redesigned as a
brick plaza. No hole file was edited.

Coordinates below are pre-`course.Fit`, like the ones in the files. Fit shifts everything and
sizes the board, so take W/H as approximate. Every proposal needs a pass with the solver/preview
to tune its speeds.

---

## 0. Summary

**Change 12 holes** (tier 1). Three more are optional (tier 2).

| # | Pair / cluster | Keep as is | Redesign → new hole |
|---|---|---|---|
| 1 | Ditch Jump ≡ Crevasse Jump | mountain5 | **hole20 → "Loop-the-Loop"** (garden 18) |
| 2 | Coral Atoll ≡ Snowman Bowl | island17 | **mountain13 → "Ice Rink"** |
| 3 | Mushroom House ≡ The Chalet | town5 | **mountain12 → "The Col"** |
| 4 | Sandy Start ≡ Tide Line (Tide Line's wave pulse ≡ Swing Bridge) | island1, town10 | **island5 → "Tide Line" (shelving beach)** |
| 5 | Railless S-lane: Sand Spit ≈ Rooftops ≈ Knife Edge | island6 | **town15 → "Rooftops" (rework)**, **mountain11 → "The Bobsleigh"** |
| 6 | Slope strips across a straight lane: Climb ≈ Dune Ramps ≈ Staircase ≈ Terraces | hole9, mountain14 | **island8 → "Rock Pools"**, **town6 → "Skate Park"** |
| 7 | Icehouse ≡ Dogleg (same L outline) | hole6 | **hole11 → "The Vegetable Patch"** (garden 10) |
| 8 | Down the Tunnel ≈ Twin Burrows (two stadiums + tunnel) | hole3 | **hole12 → "The Moon Bridge"** (garden 11) |
| 9 | Crab Beach ≈ Outcrops ≈ Buoy Bay (one board, three post patterns) | island3, island12 | **island15 → "The Blowhole"** |
| 10 | Boulder Field ≈ Pine Slalom | mountain2 | **mountain15 → "Serac Fall"** |
| 11 | Pier ≈ Broken Boardwalk (neighbours) | island9 | *(optional)* island10 |
| 12 | Roundabout ≈ Square Garden | town13 | *(optional)* town16 |
| 13 | Timed bar across a lane, keyholes, U round water, tunnel to a second piece, bumper fields | all | none; recurring motifs (§3) |

Per world: garden 3, island 3, town 2, mountain 4.

---

## 1. Ranked list, most redundant first

### 1. `hole20` Ditch Jump ≡ `mountain5` Crevasse Jump — near-identical numbers

| | hole20 (garden 18) | mountain5 (mountain 5) |
|---|---|---|
| board | Stadium 52×9 | Lane(6) straight 50×14 |
| tee → pin | (4,4.5) → (47,4.5), straight | (5,7) → (45,7), straight |
| ramp | Slope x17–24, full height, Vec −0.3, skin `ramp` | Slope x15–19, full height, Vec −0.35, skin `kicker` |
| gap | Hazard x24–28, full height → tee, `ditch` | Hazard x19.5–22.5, full height → tee, `crevasse` |
| par | 2 | 2 |

This is one hole in two skins. **Keep mountain5.** A ski kicker over a crevasse belongs to the
mountain, and `mountain.js` has dedicated art for it (the `kicker` lip, full-width `crevasses()`).
The garden's finale also deserves a set piece more than a copy.

**Redesign `hole20` → "Loop-the-Loop"** (garden, Order 18, par 3). This is the classic mini-golf
finale, and it would be the first open loop in the game: a speed window rather than a minimum speed.

- **Board** ~52×22. **Shape:** a `Lane(6, 4, …)` that runs along the top and then sweeps round a
  right-hand U: `V(5,5), V(18,5), V(30,5), V(42,8), V(44,15), V(34,18)`.
- **Tee** `V(5,5)`. **Pin** `V(34,18)`, the pad at the end of the return leg.
- **The loop:** `Zone{Kind: Loop, Min: V(16,2), Max: V(18.5,8), Vec: V(26,5), Scale: 2.4, Skin: "loop-the-loop"}`.
  The mouth spans the full lane width (y 2–8), so nothing gets past it. The axis is +x, since
  Vec.x − mid.x dominates.
  - At 2.4–3.48 per substep it goes round and is set down at (26,5), still heading +x at 80% speed.
  - Slower, it falls back at half speed toward the tee.
  - Faster than 1.45×, or more than 25° off straight, it flies off and is set down at rest about 1.5 in front of the mouth.
- **After the loop:** exit speed 1.9–2.8 carries into the U. The outer wall banks it round to the green.
  - Flowerbed on the inside of the U: `Surface 0.45, Round, Min V(36,10) Max V(41,14), Skin "flowerbed"`. It rewards the bank over the shortcut.
  - Rock post on the outer bend, `V(45,12) R0.8 Bounce 0.6 "rock"`, to liven up the bank.
- **Fun and fair:** from tee to mouth is 11 units, so the right power is a medium stroke (about 55–65%) played dead straight.
  - Every failure leaves the ball in front of the loop for another try, so it is always possible.
  - Par 3 is loop, bend, putt. A perfect loop can carry round for a 2.
- **Physics caveat:** a ball that comes back up the lane heading −x meets the mouth from behind and "rolls across" (step.gno `continue`). Under a real loop that is correct. Just don't place anything behind the mouth that could send the ball back.

### 2. `island17` Coral Atoll ≡ `mountain13` Snowman Bowl — same centrepiece, different skin

Both are a circle arena (`Arc` outline). Both ring the cup with a C of **five** posts
(coral R0.45 / snowmen R0.6 at Bounce 1.3), open only at the back: "go round and come in from
behind". The five-post arc even uses the same angles. **Keep island17.** It is the tiny,
charming original, 20×18.

Circle arenas are a cluster anyway: hole19, island7, island17, town13, mountain13. Replacing
mountain13 also removes one of those.

**Redesign `mountain13` → "Ice Rink"** (mountain, Order 13, par 3). It uses a Stadium board
(no other mountain hole has one), an all-ice floor, and the game's first **3-stroke pulse cycle**.

- **Board** ~44×22. `Outline(Stadium(V(2,2), V(42,20), 8))`, the rink boards. Field `Bounce: 0.9` for lively boards.
- **Ice** over the whole rink: `Surface Scale 1.15, Min V(2,2) Max V(42,20), Skin "ice"`.
- **The net** round the cup, three soft bars (`Soft(Bar(…, 0.4, '#', "net"), 0.3)`), open toward the tee:
  - back `V(38.5,9)→V(38.5,13)`
  - sides `V(35,9)→V(38.5,9)` and `V(35,13)→V(38.5,13)`
  - Cup `V(37,11)` inside it. The mouth is 4 wide; the soft mesh kills pace, so a ball that goes in stays in.
- **Tee** `V(8,16)`, the bottom-left face-off spot, so the line in is a diagonal plus boards, not the long axis.
- **Skaters:** three pulses `Every: 3, On: 1` with Offset 0, 2 and 1, one pair per stroke. Posts are R0.7, Bounce 0.8, skin `"skater"`.
  - stroke 1: `(16,8)` and `(24,15)`
  - stroke 2: `(21,11)` and `(29,7)`
  - stroke 3: `(27,14)` and `(31,10)`
  - The board shows where they will be, so the player plans the line around this stroke's pair.
- **Fair:** the net's 4-wide opening is never covered (skaters stay at x ≤ 31), and ice plus boards always give a bank line.

### 3. `town5` Mushroom House ≡ `mountain12` The Chalet — same centrepiece, near-identical numbers

| | town5 | mountain12 |
|---|---|---|
| lane | Lane(8) straight (5,8)→(43,8) | Lane(6) straight (5,7)→(41,7) |
| centrepiece | post R2.4 `house` at (24,9) | post R2.4 `chalet` at (23,7) |
| door | Tunnel ~4 in front → just behind | Tunnel ~4 in front → just behind |
| par | 2 | 2 |

**Keep town5.** The mushroom house is a town signature. town14 uses the same `door` differently
(a house as a way through to another street). Mountain has 9–10 straight lanes and can afford to
lose this one.

**Redesign `mountain12` → "The Col"** (mountain, Order 12, par 3). It is an hourglass board: a
mountain pass that you climb to its saddle and control coming down.

- **Board** ~48×26. **Shape:** a polygon `Outline`, pinched in the middle:
  `V(2,3), V(20,6), V(24,10.5), V(28,6), V(46,3), V(46,23), V(28,20), V(24,15.5), V(20,20), V(2,23)`.
  The waist at x = 24 is 5 wide. The flanks narrowing into it act as a funnel.
- **Tee** `V(6,19)`, bottom-left lobe. **Pin** `V(42,7)`, top-right lobe. The line is an S through the waist.
- **The saddle** is two rectangular slopes meeting at the col. Keep them rectangles, because
  `terrain.js ramps()` draws a slope from its rect only.
  - up: `Slope Min V(14,3) Max V(24,23) Vec V(-0.14,0) Skin "slope"`
  - down: `Slope Min V(24,3) Max V(34,23) Vec V(0.14,0) Skin "slope"`
  - Too soft and the ball rolls back to the west lobe. Fast over the top and it takes off:
    flight = (v − 1.5)·0.14·12, a short hop. It cannot fly over the far lobe.
- **Far side:** a snowdrift on the low line catches hot descents: `Surface 0.5, Round, Min V(30,14) Max V(36,20), "snowdrift"`.
- **Pines:** `V(38,12)` and `V(12,8)`, R0.6, `"pine"`, to make the lobes less open.
- **Fair:** the waist is wide enough for a clean line. The worst case is rolling back to the west lobe and trying again.

### 4. `island1` Sandy Start ≡ `island5` Tide Line — raised by the user; `island5` also ≡ `town10` Swing Bridge

island1 and island5 use the same template:

| | island1 | island5 |
|---|---|---|
| lane | `Lane(6, 4, V(5,6), V(19,9), V(33,7))` | `Lane(6, 4, V(5,6), V(22,8), V(42,6))` |
| tee | (5,6) | (5,6) |
| round wet sand | (24–29, 6–10.5) | (27–32, 4.5–10) |
| other | a palm | a wave pulse |

island4 Beached Boat has the same round wet sand again, at (32–38, 5–10.5).

island5's wave is also the same mechanic as town10's swing bridge, with near-identical numbers:
a full-height Hazard strip that comes on every other stroke (`Every 2, On 1, Offset 1`), at
x 19–23 on island5 and x 20–24 on town10.

**Keep island1**, which opens the cup and must stay easy. **Keep town10**, which has dedicated
`extras()` art for the swinging deck. **Redesign `island5`**, which clears both pairs at once.

**`island5` → "Tide Line", reimagined as a shelving beach** (island, Order 5, par 3). This is the
game's first cambered green: the whole beach tilts toward the sea, so you aim high and let it break.

- **Board** ~44×22. It is an open beach, not a Lane.
  - Rails on three sides only: `Polyline(V(3,17), V(3,3), V(41,3), V(41,15))` (left end, dunes, right end).
  - The bottom edge is the waterline.
- **Tee** `V(6,6)`. **Pin** `V(38,8)`.
- **Camber:** `Slope Min V(3,3) Max V(41,18) Vec V(0,0.08) Skin "beach"`.
  - 0.08 is below `Drag` (0.12), so a ball can stop on the camber, but a rolling ball drifts about a lane-width over a full stroke.
  - This is the break the player has to read.
- **Wet sand** band above the waterline, a poly `Surface 0.6 Skin "wetsand"`:
  `V(2,14.5), V(16,13), V(30,14.5), V(42,12.5), V(42,15), V(30,17.5), V(16,16), V(2,18)`.
  - List it after the camber slope, because the last Surface in field order wins.
  - It brakes a drifting ball before the sea, so the hole stays gentle for Order 5.
- **Sea:** `Hazard Outside poly Skin "sea"`, the beach polygon with a wavy waterline:
  `V(2,2), V(42,2), V(42,15), V(30,17.5), V(16,16), V(2,18)`, Min `V(0,0)` Max `V(44,24)`, Vec back to the tee.
  Add `Shelter: 0.08`, as on the other railless holes.
- **Driftwood:** one soft log on the high line, so aiming high isn't free:
  `Soft(Bar(V(18,5), V(24,8), 0.8, '#', "driftwood"), 0.4)`.
- **Pacing:** island6, next, also has sea at its edge, but it plays differently (no rails on either
  side vs a camber). If that feels too close, swap the orders of island4 and island5.

### 5. The railless S-lane: `island6` Sand Spit ≈ `town15` Rooftops ≈ `mountain11` Knife Edge

All three are a `Box`, plus a Hazard that is `Outside` a zig-zag `Lane`, plus `Shelter 0.08`, par 4.

| | lane |
|---|---|
| island6 | `Lane(5, 3, V(5,6), V(17,12), V(30,6), V(44,11))` |
| town15 | `Lane(4.5, 3, V(5,6), V(16,11), V(28,6), V(40,11))` (same points ×0.9) |
| mountain11 | `Lane(4, 3, V(5,8), V(18,4), V(32,11.5), V(46,6), V(50,8))` |

mountain11 also sits right after mountain10 Snow Cannon Ridge, another ridge with drops on both
sides. island9 The Pier is a fourth railless lane. **Keep island6**, the original, a sand spit in the sea.

**5a. `town15` → "Rooftops", reworked** (town, Order 15, par 4). Keep the `roof` Outside hazard,
the chimneys and `Shelter`. Replace the S-curve with **right-angled flat roofs joined by narrow
planks**.

- **Board** ~48×24. The walkable polygon, as `Poly` for `Hazard Outside Skin "roof"`, Vec = tee:
  ```
  V(3,3), V(15,3), V(15,6.5), V(23,6.5), V(23,3), V(31,3), V(31,16.5), V(37,16.5), V(37,12),
  V(45,12), V(45,22), V(37,22), V(37,19.5), V(31,19.5), V(31,21), V(23,21), V(23,9.5),
  V(15,9.5), V(15,13), V(3,13)
  ```
  - roof A (tee): x 3–15
  - plank 1: x 15–23, 3 wide
  - roof B, tall: x 23–31, y 3–21
  - plank 2: x 31–37, 3 wide
  - roof C (cup): x 37–45, y 12–22
- **Tee** `V(6,8)`. **Pin** `V(42,17)`.
- **Planks:** add `Surface Scale 1, Skin "plank bridge"` zones over x 15–23 / y 6.5–9.5 and
  x 31–37 / y 16.5–19.5. They are for the renderer only.
- **Chimneys** on roof B: `V(27,8)` and `V(27,15)`, R0.8, Bounce 0.7, `"chimney"`. Bank round them on the way down B.
- **Cat** on plank 2: `Pulse{Every: 2, On: 1, Offset: 0}` with a post `V(34,18) R0.6 Bounce 0.7 Skin "cat"`.
  It sits there on strokes 1 and 3, so the plan is plank 1 on stroke 1 and plank 2 on stroke 2.
  A player who needs a third try at plank 2 waits a stroke.
- **Why it's different:** precision along straight planks with right-angle turns, and a stroke-parity
  plan. No flowing S. The `roofs()` renderer already draws houses wherever the zone is hazard,
  so it copes with a right-angled polygon.

**5b. `mountain11` → "The Bobsleigh"** (mountain, Order 11, par 3). A downhill ice chute into an
**open loop**. garden18's loop asks for enough speed; this one asks for restraint, because gravity
supplies the speed.

- **Board** ~26×46, portrait. **Shape:** `Lane(6, 4, V(6,4), V(18,10), V(9,17), V(13,24), V(13,42))`, an S that straightens along +y from y 24.
  Wrap the outline in `Soft(…, 0.6)`: packed-snow banks.
- **Downhill** `Slope Min V(2,2) Max V(22,27) Vec V(0,0.08) Skin "downhill"`, and **ice** `Surface 1.1, Min V(2,2) Max V(22,26), "ice"`.
- **Loop:** `Zone{Kind: Loop, Min: V(10,27), Max: V(16,29.5), Vec: V(13,35), Scale: 2.8, Skin: "bob loop"}`.
  - The axis is +y. It is open (no "tube"), so the window is 2.8–4.06.
  - With the downhill and the ice, a full-power tee shot arrives too fast and is set down in front of the mouth.
- **Finish:** snowdrift `Surface 0.5, Round, Min V(10,37) Max V(16,40.5)` just before the **pin** `V(13,42)`. **Tee** `V(6,4)`.
- **Fair:** too slow, and the ball rolls back up at half speed and settles near the mouth (0.08 < Drag, so it can rest). The retry is a short, straight, measured stroke.

### 6. Slope strips across a straight lane: `hole9` ≈ `island8` ≈ `town6` ≈ `mountain14`

All four are a straight lane with full-height rectangular slopes along x:

| | strips |
|---|---|
| hole9 The Climb | up / down / up (−0.22, +0.2, −0.25) |
| island8 Dune Ramps | two up/down crest pairs (±0.4, ±0.45), par 2 |
| town6 The Staircase | three identical up strips (−0.35 ×3), par 2 |
| mountain14 Terraces | two up (−0.3) + a long down (+0.12) + ice |

**Keep hole9** (it introduces slopes) and **mountain14** (its ice run-out makes it different). town6 is
the purest copy and sits in town's 2–7 run of straight lanes. island8 is hole9 in another skin.

**6a. `island8` → "Rock Pools"** (island, Order 8, par 3). The first portrait, angular island board,
with **polygon hazards**.

- **Board** ~28×40. An angular rock-shelf `Outline`:
  `V(4,38), V(16,38), V(24,32), V(26,20), V(20,14), V(24,4), V(12,2), V(4,8), V(8,20), V(3,28)`.
- **Tee** `V(10,34)`. **Pin** `V(16,6)`.
- **Pools**, poly `Hazard Skin "tidepool"`. Each drops the ball just before the pool, not back at the tee:
  - P1, lower right: `V(14,31), V(24.5,29), V(25,24), V(15,26.5)` → drop `V(9,33)`
  - P2, middle, flush to the left wall: `V(6.5,15), V(15,15.5), V(14,19), V(7.6,20)` → drop `V(12,24)`
  - P3, left of the pin: `V(9,12), V(15,10), V(14,7), V(8,8)` → drop `V(18,14)`
- **The line** zig-zags: up the left past P1, right of P2, then up the middle channel (x 15–21) to the pin.
  - One more thing to make the middle channel hard to rush: a wet-sand poly `Surface 0.6 "wetsand"` round the front of the pin, `V(14,13), V(20,12), V(19,9), V(15,9.5)`.
- **Fair:** every channel is at least 5 wide, and the penalty drops are forgiving.

**6b. `town6` → "Skate Park"** (town, Order 6, par 3). Quarter-pipes are slopes that always return
the ball (push > Drag), and a funbox gives a crest with air.

- **Board** ~40×24. A rounded rectangle: `Outline(Path(Arc(V(6,6),4,π,1.5π,3), Arc(V(34,6),4,1.5π,2π,3), Arc(V(34,18),4,0,0.5π,3), Arc(V(6,18),4,0.5π,π,3)))`.
- **Tee** `V(6,17)`, bottom-left. **Pin** `V(31,6.5)`, the top-right pocket where two pipes meet. The line is diagonal.
- **Pipes** (they push toward the flat; 0.18–0.22 > Drag, so nothing rests on them):
  - top: `Slope Min V(6,2) Max V(34,4.5) Vec V(0,0.18) Skin "quarter pipe"`
  - bottom: `Slope Min V(6,19.5) Max V(34,22) Vec V(0,-0.18)`
  - far end: `Slope Min V(34,2) Max V(38,22) Vec V(-0.22,0)`
  - An overhit rides up the far pipe and comes back down toward the cup: a slope for a backstop instead of a wall.
- **Funbox** across the diagonal. The deck at x 17–20 has no zone:
  - up: `Slope Min V(14,8) Max V(17,16) Vec V(-0.3,0) "funbox"`
  - down: `Slope Min V(20,8) Max V(23,16) Vec V(0.3,0) "funbox"`
  - At speed 3 it flies (3 − 1.5)·0.3·12 = 5.4 and lands on the down ramp. Slower, it rolls over.
  - Or go round it on the low line, past a **grind rail**: `Bar(V(24,17), V(31,17), 0.4, '=', "rail")`.
- **Pacing:** it breaks town's straight run (2–7 becomes 2–5, then 7). To break it further, swap
  town7 Canal Bridge with town9 Back Alleys (par 4 at Order 7 is fine; garden has par 4 at Order 7).

### 7. `hole6` Icehouse ≡ `hole11` The Dogleg — same outline

Both are the same L: a straight along the top, `Arc(V(32,7), 7, -π/2, 0, …)` round the corner, and
down the right side. The boards are 40×26 and 40×24. The tee is top-left and the pin bottom-right
at (35.5, ~21). Icehouse adds ice; Dogleg adds a hay bale, and is dull. **Keep hole6.**

**Redesign `hole11` → "The Vegetable Patch"** (garden, Order 10, par 3). It reads the line through
**polygon Surface beds**.

- **Board** ~40×30. A pentagon `Outline(V(2,2), V(38,2), V(38,28), V(12,28), V(2,18))`.
- **Tee** `V(6,5)`. **Pin** `V(35,24)`, at the foot of the headland path (x 32–38).
- **Beds:** three slanted parallelogram rows, poly `Surface Scale 0.5 Skin "soil"`, with 3-wide grass paths between them:
  - row 0: `V(8,8), V(32,13), V(32,16), V(8,11)`
  - row 1: `V(8,14), V(32,19), V(32,22), V(8,17)`
  - row 2: `V(8,20), V(32,25), V(32,27.5), V(8,22.5)`
- **Scarecrow** in row 1: `Post V(20,18) R0.7 Bounce 0.6 Skin "scarecrow"`.
- **Wheelbarrow** at the head of the top path, to stop it: `Soft(Bar(V(35,3), V(37.5,6), 0.8, '#', "hay"), 0.4)`.
- **Choices:** play along the top path to the barrow, then down the headland (2 + putt). Or go
  diagonally straight through all three beds, which is slow. Or thread a middle path.

### 8. `hole3` Down the Tunnel ≈ `hole12` Twin Burrows — same board

Both are two separate Stadiums side by side (20×8 + 20×8, and 22×10 + 18×10) with tunnel mouths
near the end of the first one. **Keep hole3.** It introduces tunnels, and adds sand, water and a slope.

**Redesign `hole12` → "The Moon Bridge"** (garden, Order 11, par 3). A stream cuts the board
diagonally, and the only way over is an arched bridge: a **crest with air** over a **poly hazard**.

- **Board** ~36×28. Pentagon `Outline(V(2,2), V(30,2), V(34,8), V(34,26), V(2,26))`.
- **Tee** `V(6,6)`, above the stream. **Pin** `V(28,22)`, below it.
- **Stream:** two poly `Hazard Skin "water"`, split around the bridge, with the drop at `V(10,7)`:
  - left: `V(2,16), V(15,10.3), V(15,16.3), V(2,22)`
  - right: `V(19,8.56), V(34,2), V(34,8), V(19,14.56)`
  - It runs wall to wall and out through the cut corner, so there is no way round.
- **Bridge** at x 15–19, running along y:
  - up: `Slope Min V(15,8) Max V(19,12.5) Vec V(0,-0.3) Skin "moon bridge"`
  - down: `Slope Min V(15,12.5) Max V(19,17) Vec V(0,0.3)`
  - Too soft and the ball rolls back. Over the top at speed v it flies 3.6·(v − 1.5) and lands on the far bank.
  - Fly over at an angle and you can land in the stream's right arm. That is the risk.
  - There are no rails, so a ball that rolls off the side of the deck is in the water.
- **Far bank:** a stone lantern `Post V(24,20) R0.8 Bounce 0.7 "rock"` near the cup.
- **Par 3:** to the bridgehead, over, putt.
- **Order:** swap it with hole11's slot as numbered here (Vegetable Patch at 10, Moon Bridge at 11),
  so that hole9 The Climb isn't followed straight away by another slope hole.

### 9. `island3` Crab Beach ≈ `island12` Outcrops ≈ `island15` Buoy Bay — one board, three post patterns

| | lane | pieces |
|---|---|---|
| island3 | Lane(10) `(5,9)→(24,10)→(44,8)`, 50×20 | crabs + mounds |
| island12 | Lane(9) `(5,9)→(24,8)→(44,10)`, 50×18 | big rock + two small |
| island15 | Lane(9) `(5,9)→(24,11)→(44,8)`, 50×20 | four bouncy buoys, par 3 |

Same tee, same pin, same width. Buoy Bay is also the 5th "field of bouncy posts" in the game
(hole2, hole8, hole17, town11). **Keep island3** (pulsing crabs) and **island12** (a split round a
big rock).

**Redesign `island15` → "The Blowhole"** (island, Order 15, par 3). The game's first **timed Tunnel**.

- **Board** ~48×22. A rocky `Outline(V(2,4), V(20,2), V(46,4), V(46,20), V(30,21.5), V(2,20))`.
- **Tee** `V(5,15)`. **Pin** `V(41,14)`.
- **Inlet:** the sea cuts in from the bottom across the direct line.
  `Hazard poly Skin "sea"`: `V(21,24), V(22,12), V(25,8.5), V(28,12), V(29,24)`, drop `V(15,15)`.
- **Blowhole:** `Zone{Kind: Tunnel, Round, Min V(18,13), Max V(21,17), Vec V(31,15), Every: 12, On: 4, Phase: 0, Skin: "blowhole"}`.
  - While it spouts (4 substeps in 12), a ball that crosses it is thrown over the inlet and keeps its +x heading.
  - Otherwise it is just a hole in the rock that the ball rolls over, and a ball that carries on falls into the inlet.
  - `Zone.There` is generic (step.gno:311), so a timed tunnel needs no physics change.
- **The long way:** round the inlet's head along the top (y 2–8.5), past an outcrop `V(25,4.5) R0.8 "outcrop"`. Safe, and par.
- **Landing:** wet sand `Surface 0.6, Round, Min V(33,11) Max V(38,18)` so the blowhole shot doesn't overrun the green.
- **Fun:** watch the spout rhythm, as with the tram, and release for an eagle. Or play safe round the top.

### 10. `mountain2` Pine Slalom ≈ `mountain15` Boulder Field

Both are a straight Lane (8 and 10 wide) with 4–5 posts scattered across the direct line. Boulder
Field is too flat for Order 15. **Keep mountain2**, an easy early slalom.

**Redesign `mountain15` → "Serac Fall"** (mountain, Order 15, par 3). A curving traverse under an
icefall, with **timed Hazard zones**.

- **Board** ~52×24. **Shape:** `Lane(7, 4, V(5,18), V(20,16), V(34,9), V(47,6))`, a rising hook, not a straight.
- **Tee** `V(5,18)`. **Pin** `V(47,6)`.
- **Seracs:** three round timed hazards, `Every: 12, On: 3`, at phases 0, 4 and 8, skin `"serac"`, drop `V(9,17)`:
  - `Min V(16,13) Max V(21,19)`
  - `Min V(26,9.5) Max V(31,15.5)`
  - `Min V(36,5.5) Max V(41,11.5)`
  - They fall in turn along the traverse, so a steady ball can run the gaps if released at the right moment.
- **Debris:** two dead boulders from the old field, `V(24,18) R1.0` and `V(43,10) R1.0`, Bounce 0.5.
  They block the safe lay-up spots, so laying up between seracs takes thought.
- **Fair:** each serac is only there 3 substeps in 12, and a lay-up short of any serac is always open.

---

## 2. Tier 2 (optional)

**11. `island9` The Pier ≈ `island10` Broken Boardwalk (neighbours).** Both are a gently bent lane
with rectangular `gap` Hazards alternating sides and sending you back to the tee, drawn with the
same planks (`island.js green()` matches `island(9|10)`).

- Keep island9: it is harder, railless, and has the pier rail at the far end.
- For a 13th change, give island10 a right-angled boardwalk (an orthogonal Outline round a lagoon
  corner) and move its gaps onto the corners, so they punish cutting the corner rather than a straight
  line. That keeps the plank and lagoon art (keep the `hole` name in the regex).

**12. `town13` Roundabout ≈ `town16` Square Garden.** Both are "go round a central block to the
opposite side". Square Garden is also par 2 at Order 16, which is soft for that slot. town13's
numbers also echo island7 (a circle of r≈10 round a post of R3.2).

- A cheap fix for town16: put the cup inside the railed garden. Give it two gates, N and S, that
  open on alternate strokes (`Pulse Every 2` on each gate bar). The garden becomes the target, not
  the obstacle. Par 3.
- Also make sure the new town18 plaza doesn't reuse town16's square-board-with-central-block.

**13. `mountain4` Snowdrifts** is dull: two round slow blobs on a straight lane. As an easy Order 4
it is acceptable. The lightest fix is to bend its lane (`V(5,8), V(18,4), V(30,12), V(43,8)`) so the
drifts sit on the inside of the bends.

---

## 3. Recurring motifs, kept deliberately

- **A timed bar across a straight lane:** town4 tram, island11 planks, mountain8 lift (garden4's
  sails are a variant, and town18's tram goes with its redesign). One per world is a motif. They
  differ in period and count.
- **Keyhole lane into a round green:** hole5, hole15, town3, island16, mountain6. Five of them,
  two in garden. The mechanics differ (gate, moat, fountain, volcano, ice + boulders). hole5 and
  hole15 are the closest pair; leave them.
- **A U round water:** hole7 The Pond ≈ island13 Lagoon Ring ("cut the bend and you are in it").
  island13 is also the same U as island18 Banked Bend. Watch this if island gets another change.
- **Tunnel to a second, separate piece:** hole3, island14, town14, mountain7. One per world.
- **Bouncy post fields:** hole2, hole8, hole17, town11. town11's 2-1-2 statue layout is hole8's
  bumper layout, scaled down. With island15 gone this is acceptable.
- **Straight long-axis shots** remain the default in early holes of every world. That's fine for
  openers, but mountain still has about eight (1, 2, 4, 5, 6, 8, 14, 17).

---

## 4. Mechanics the physics offers, before and after

| Mechanic | Now | After tier 1 |
|---|---|---|
| Loop | 1 (island7, closed tube) | 3: + hole20 (open, flat approach), mountain11 (open, downhill: a speed ceiling) |
| Timed zones | 1 (mountain10 gust) | 3: + island15 timed tunnel, mountain15 timed hazards |
| Polygon zones inside the lane | 0 (only `Outside` seas and roofs) | 4: hole11 beds, hole12 stream, island8 pools, island5 waterline and wet sand |
| Camber (side slope over the line) | ~0 (island18 banks only) | 1: island5 |
| Crest with air | hole20, mountain5, island8 | mountain5, hole12 moon bridge, town6 funbox, mountain12 col |
| Slope as a backstop that returns the ball | 0 | town6 quarter-pipes |
| Pulse with a 3-stroke cycle | 0 (all `Every 2`) | 1: mountain13 skaters |
| Soft walls as a feature | hay, logs, boat, avalanche | + rink net, bob banks, wheelbarrow |

Physics facts the proposals rely on (from `step.gno`):

- **Loop axis:** it is x or y, whichever of Vec − mid dominates. The ball leaves at Vec along the
  entry direction. The mouth must span the lane.
- **Loop speed:** closed ("tube" in the skin) needs Scale or more. Open needs Scale to 1.45×Scale.
  More than 25° off straight, it falls off.
- **Take-off:** leaving an up-slope at more than 1.5 per substep. Flight = (v − 1.5)·steepness·12, and zones don't act in the air.
- **Resting on a slope:** a ball rests if the slope's push is below `Drag` (0.12), and never rests if it is above.
- **Zone order:** the last Surface a ball crosses sets the friction; Hazard and Tunnel act on the first one reached.

---

## 5. Pacing after the changes

- **Garden:**
  1 Shelf 3 · 2 Bumper Alley 3 · 3 Down the Tunnel 3 · 4 Mill 3 · 5 Gate 2 · 6 Icehouse 3 ·
  7 Pond 4 · 8 Pinball 3 · 9 Climb 3 · **10 Vegetable Patch 3** · **11 Moon Bridge 3** ·
  12 Round the Bed 3 · 13 Meander 4 · 14 Moat 2 · 15 Nursery 3 · 16 Long Green 3 · 17 Maze 5 ·
  **18 Loop-the-Loop 3**
- **Island:**
  1 Sandy Start 2 · 2 Snail Shell 4 · 3 Crab Beach 3 · 4 Beached Boat 3 · **5 Tide Line (shelving) 3** ·
  6 Sand Spit 4 · 7 Sandcastle 3 · **8 Rock Pools 3** · 9 Pier 4 · 10 Broken Boardwalk 3 ·
  11 Rope Bridge 3 · 12 Outcrops 3 · 13 Lagoon Ring 3 · 14 Treasure Isle 2 · **15 Blowhole 3** ·
  16 Volcano 3 · 17 Coral Atoll 2 · 18 Banked Bend 3
  - Coral Atoll, par 2 at Order 17, is still a soft penultimate. It is fine as a breather before the finale.
- **Town:**
  1 Boulevard 2 · 2 Market 3 · 3 Fountain Square 3 · 4 Tram 3 · 5 Mushroom House 2 · **6 Skate Park 3** ·
  7 Canal Bridge 3 · 8 Clock Tower 3 · 9 Back Alleys 4 · 10 Swing Bridge 2 · 11 Gnome Courtyard 2 ·
  12 Crescent 3 · 13 Roundabout 3 · 14 Side Door 3 · **15 Rooftops (rework) 4** · 16 Square Garden 2 ·
  17 Night Market 3 · 18 Grand Plaza (being redesigned)
  - Optionally swap 7 and 9.
- **Mountain:**
  1 Ski School 2 · 2 Pine Slalom 3 · 3 Switchbacks 4 · 4 Snowdrifts 2 · 5 Crevasse Jump 2 ·
  6 Frozen Lake 3 · 7 Ice Cave 2 · 8 Ski Lift 3 · 9 Avalanche 4 · 10 Snow Cannon Ridge 3 ·
  **11 Bobsleigh 3** · **12 The Col 3** · **13 Ice Rink 3** · 14 Terraces 2 · **15 Serac Fall 3** ·
  16 Downhill Run 3 · 17 Glacier Split 3 · 18 Summit 4
  - Bobsleigh (ice), Col (snow), Rink (ice) alternate surfaces.
  - The run of ridges with drop-offs (10, 11) is gone.

---

## 6. Renderer work each redesign needs

Unknown skins fall back to the plain form (field.gno's contract), so everything plays and draws
from day one. The gaps below are about the look.

- **Loops.**
  - `zones.js ZONE_DRAW` draws only `"castle tube"`, and only when a `sandcastle` post exists (`castleSlide`).
  - A generic loop gets no track at all. hole20 `"loop-the-loop"` needs a vertical ring of track;
    mountain11 `"bob loop"` needs an iced one.
  - Don't reuse the plain `"loop"` skin: field.gno lists `loop` as a scenery-only zone skin.
  - Check `engine.js` (~l.864): tube loops are "ridden like a tunnel". The replay of an open loop
    (round, back, or thrown off) needs the same treatment.
- **Polygon Surface and Hazard on island.** `island.js footprint()` ignores `poly` and draws the
  bounding rect, so `wetsand` and `tidepool` polys (island5, island8) would draw wrong. `zones.js
  organic()` already handles `poly`, so reuse it there. Garden and shared zones are fine.
- **Slopes must stay rectangles.** `terrain.js ramps()` builds heights from the zone's rect corners.
  All the proposals use rect slopes. Don't make a poly slope.
- **Timed zones.** Only mountain's `gust` has art. These need a visible cue synced to `tick`, as the trams and lifts have:
  - `"blowhole"` spout (island15)
  - `"serac"` falling ice (mountain15)
- **New skins, by world:**
  - **garden** (no `piece()`; shared `course.js`/`zones.js` only):
    - `"soil"` beds: needs furrows and cabbages; otherwise it is a tinted surface
    - `"scarecrow"` post: otherwise a plain post
    - `"moon bridge"` slopes: the terrain already rises into an arch; it needs a red deck with rails
    - `"loop-the-loop"`: see Loops above
  - **island:** `"blowhole"`, and `"beach"` (the camber: plain contours are acceptable). `driftwood`, `sea`, `wetsand` and `tidepool` exist.
  - **town:**
    - `"quarter pipe"`, `"funbox"` slopes: a concrete look instead of cobbles; the ramps are low by default (`MAX_RISE`)
    - `"rail"` bar
    - `"plank bridge"` surface
    - `"cat"` post
    - `roofs()` already draws a right-angled roof polygon correctly.
  - **mountain:**
    - `"bob loop"`
    - `"skater"` post
    - `"net"` bar: needs an entry in `pieces.js BARS` or a mountain `piece()` case
    - `"serac"`
    - The Col's slopes should use `"slope"` or `"downhill"`, which `mountain.js piece()` already overlays.
    - A Stadium outline is new to mountain but uses the shared kerb.
