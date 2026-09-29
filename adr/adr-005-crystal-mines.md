# ADR-005: The Crystal Mines, an expert cup

## Status

Proposed, 2026-09-29. This is a design on paper only: no game code, no hole
realm and no chain write goes with it. The cup ships after the launch as data,
published with `Publish`, and needs no redeploy. The backlog chose it
("A fifth cup, for experts", **Chosen: the Crystal Mines**). The owner asked
for holes that are hard for several reasons at once, visually worth a trailer,
unique against the other four cups, and on a real curve up to a boss hole.

Amended 2026-09-29, before the deploy froze golf: golf's `worlds` names the
mines ("Crystal Mines", fifth, after the mountain), and the course ranking
counts holes, then the score against par (see Consequences), so the mines
count in the general ranking weighted by their par.

## Summary

- **A fifth world, `mines`: 18 holes, par 86.** The four cups are par 52 to
  56. Boards run from 44×42 to 96×56. Every hole uses the engine as deployed:
  existing zone kinds, pieces and timings only. What is new is how they are
  combined, and the client that draws them.
- **Difficulty comes in layers, not length alone.** Every hole stacks at least
  three of these: precision, a clock, a route choice with a risk/reward
  shortcut, and weather that changes the shot.
  - The mines use all three clocks the engine has. The release tick (timed
    pieces within a stroke). The stroke number (pulses, including a period-3
    lava tide and a door calendar on periods 2 and 3). And a clock no cup has
    used: pulses that only ever switch on, so a gallery collapses for good
    behind a slow player.
- **Every hole has a signature idea no other cup has**, and a set piece for
  the trailer:
  - a cage dropping down a shaft
  - carts crossing a rail yard
  - a swaying rope bridge
  - a geode whose crystal walls kick
  - a stamp mill over a conveyor
  - a lava tide
  - a lift between three levels
  - a collapsing gallery
  - chained geysers
  - a corkscrew ore chute
  - a wave of steam vents
  - twin lava falls
  - the mine cart ride
  - a stalactite hall
  - a vault on a stroke calendar
  - a ledge round a bottomless shaft
  - the boss hole, the Mother Lode, in three acts
- **Nothing new in the engine or on chain.** Two things would need a redeploy,
  and both are rejected for this cup:
  - a mines climate with storms (the climates are frozen in `course`)
  - carts that carry the ball physically (the physics has no moving bodies)

  Each is replaced with what exists: vents placed in the hole, and a timed
  tunnel that the client animates as a ride.
- **Every hole fits the chain's limits with room to spare.** Golf checks two
  bounds when a hole is published. The first is the room a commit's first shot
  keeps in the hole's dearest weather, which must be at least `minShotWork`,
  800,000 work units. Each planned hole keeps 866K to 977K, so +66K to +177K
  over that floor. For comparison, mountain/7 keeps +39K. The second is the
  heaviest-shot bound, which must stay under 1.3e9; the planned holes reach
  1.238e9 to 1.251e9.
  - The heaviest modelled shot is 0.55 of `MaxWork`, on the Mother Lode, with
    a full 120-substep roll-on.
  - The main design rule behind these margins: an untimed wall costs about
    6,150 units of that room (100 per puddle try, times 60 tries, plus its
    set-up). A timed wall costs 150 and a pulse wall 850. So the long lanes
    are edged by the void (an `Outside` hazard polygon) or by timed pieces,
    not by rails.
- **Every hole stays finishable at par in every weather.** Par is the solver's
  robust stroke count plus one, taken as the worst over calm, wind and rain,
  and every hole keeps a route that is safe in any weather.
- **Unlocked by the four cups at par.** That is the King gnome's condition.
  The unlock happens in the client, as a sign on the door rather than a lock
  (see §7). Finishing the Mines earns the Miner gnome (helmet and headlamp),
  and finishing it at par earns the **Mother Lode** badge.
- **Effort: about 50 to 60 dev-days**, in three phases:
  - holes and pars
  - the world and its set pieces
  - wiring, rewards, SEO and trailer

  The largest item is the scene (`mines.ts`, about 2,500 lines, on the scale
  of `mountain.ts`).

## Context

**The four cups are finished and fair, but not deep.** Their hardest holes
have a robust plan of 3 strokes. The mountain's hardest are Avalanche
(mountain/9, par 4) and The Summit (mountain/18, par 4). A player who has
finished all four at par has seen every mechanic the engine offers used once or
twice, one at a time. An expert cup is what keeps them.

**A hole is data (ADR-002).** A course hole is a GG1 string that the owner
publishes into a slot (`mines/7`). The slot's world is the hole's world, and a
new world needs nothing on chain:

- `isWorld` accepts 1 to 16 letters `a-z`.
- `worldRank` puts it fifth, after the mountain: golf's `worlds` names it.
- The hub gives it a card, titled `cupName("mines")`, which is `"Crystal Mines"`.
- The course ranking counts it: it adds up every current course hole, each
  against its par.

**What is frozen with the deployed packages:**

- **The format's limits.**
  - At most 160 walls, 32 posts, 32 zones and 16 pulses.
  - 64 points in a polygon, 512 in all.
  - 60 substeps, a board side of 96, a cup radius of 2 at most.
  - Timings with `Every` up to 4096.
  - At most 32 KB of data.
- **The climates.** `course.climates` is unexported. A world that isn't listed
  gets the garden's: clear 55, wind 20, rain 15, fog 10. So the mines can
  never get a storm or snow. A mines climate would mean a new `course` and a
  new `golf`: a redeploy, and a new weather for every version id (ADR-002,
  Consequences).
- **The physics.** Pieces don't move and carry nothing. A timed bar comes and
  goes, and pushes a ball out of it without giving it any speed. A zone moves
  the ball only as a tunnel (keeping its velocity), as a hill, as air, or
  back to where the stroke was played from (a hazard).
- **Golf's page table.** `worlds` in `golf/data.gno` names five cups, the
  mines last, as "Crystal Mines" (added before the deploy).

**What golf checks when a hole is published.** From `golf.gno`, and restated
here because they shape every hole:

```
shotBound = 10M + 150K × walls + 1000 × (MaxWork + MaxWorkStep)       + pulse set-up
          ≤ maxShotGas (1.3e9)
worstGas  = decode (6M + 4K × bytes) + 1000 × WorstForecastWork
          + 10M + 150K × walls + pulse set-up (700K a pulse wall, 200K a pulse post)
          + 1000 × (MaxWorkStep 225,000 + minShotWork 800,000)
          ≤ workBudget (1.4e9)
WorstForecastWork = 8,000 + 5 × zones
                  + 60 tries × (35 + 22 × posts + Σ zone tests + 100 × untimed walls)
    zone test: 20, plus 16 per polygon point for a hazard, tunnel, loop or skinned Surface
```

The worst forecast is a storm's, with every one of its 60 puddle tries
failing. It is charged whatever world the hole is in, even though a mines hole
never gets a storm. Solving `worstGas` for the room left to the first shot
gives:

```
room = 1,400,000 − 225,000 − [ 6,000 + 4·bytes + WorstForecastWork + 10,000 + 150·walls + setup/1000 ]   ≥ 800,000
```

This model reproduces the documented rooms exactly: 839,278 on mountain/7 and
1,115,396 on town/11, decoded from `data/holes.txt`.

An untimed wall costs 6,150 units of room. Every other piece is cheap by
comparison:

| Piece | Room it costs |
|---|---|
| timed wall | 150 |
| pulse wall | 850 |
| post | 1,320 |
| plain zone | 1,200 |
| polygon zone | 1,200 + 960 per point |

The course's railed holes carry 28 to 48 walls. **A mines hole keeps its
untimed walls at 44 or fewer, edges its long stretches with the void, and uses
timed pieces freely.**

**What the client costs (surveyed in `web/`).** A hole in an unknown world
loads today, but it is dressed and labelled as the Garden Cup:

- `worlds.ts:76,82` falls back to the garden.
- `Worlds.tsx:26` falls back to `WORLDS[0]`.

The cups are listed by hand in `card.ts` (`CUPS`, `CUP_NAMES`, `cupTotals`,
`UNLOCKS`), in `Worlds.tsx` (`TAGS`, `Emblem`), in `Title.tsx` (`CHORES`,
`Hat`, `guessWorld`) and in `Golf.tsx:1967`. They are also in the CSS (skies,
loaders, curtains), in `media/og/og.mjs`, in `media/promo`, in the title
tables and in the tests.

There are no real lights, shadows or post-processing. The scene has one
hemisphere light and one sun, toon materials with ink outlines, and additive
glow sprites. Glows are batched into one `Points` object, as the town does at
night.

## Decision

### 1. A fifth world, published as data

- **World `mines`, slots `mines/1` to `mines/18`.** The client calls it "The
  Crystal Mines" and gnoweb "Crystal Mines".
- **Every hole is written like the others.** It is a hole realm under
  `gno.land/r/gnogolf/mines<N>`, which is source only and never deployed:
  - `author.Fit` with a margin of 1.5
  - Friction 0.87, Radius 0.5, Bounce 0.85
  - `fingerprint.Check`, which prints its data line
- **Publishing.** The owner publishes the 18 lines with
  `scripts/publishdata.sh`.
- **The data goes on chain only after the client that knows `mines` is live.**
  Before that, a mines hole would be dressed as the garden and named "Garden
  Cup".
- **The cup's holes are course holes.** They count in the course ranking like
  any other; see Consequences.

### 2. Hard for several reasons at once

The mines' rule: **every hole has one signature idea no other cup has, and
stacks at least three layers** from the list below.

| Layer | What it asks of the player | Engine |
|---|---|---|
| Precision | a lag onto a small pad, a narrow bridge, a bank off a kicking wall, a smaller cup | geometry, `CupRadius` 1.1 and 1.0 on holes 13 to 18 |
| Tick clock | when to let go | walls and zones with `Every/On/Phase` within a stroke |
| Stroke clock | which stroke you arrive on | `course.Pulse`: periods 2 and 3, and one-way pulses (below) |
| Route choice | a shortcut that saves 1 or 2 strokes against a safe way round | two routes on the board, the safe one weather-proof |
| Weather | draught, seepage, dust (§3) | `Shelter`, surfaces skinned `ice`, lanes railed where puddles should fall |

**Three clocks, one of them new.** The tick and the stroke clocks are used by
the other cups, one at a time. The mines add the **one-way pulse**. With
`Every = 4096` and `On = Phase = 4096 − k`, a piece is absent on strokes 0 to
k−1 and present from stroke k to the end of any round:

```
present(s) = (s + Phase) % Every < On
k = 2:  s=0 → 4094 < 4094? no   s=1 → 4095? no   s=2 → 0 < 4094 yes … s=4093 → 4091 yes
```

That is a gallery that collapses behind you. `Decode` takes it: `On ≤ Every`
and `Phase ≤ Every−1`. A rockfall that lands on a resting ball never traps it.
`UnstickIn` pushes the ball out through the rock's nearest side, and never
across the hole's own walls.

**The curve.**

- Holes 1 to 5 are hard, par 4: two layers of the list, plus the signature.
- Holes 6 to 12 are harder, par 5: a second clock or a second hazard stacks
  on the first.
- Holes 13 to 17 are very hard, par 5: a 1.1 cup, and three or four layers
  that all bite.
- Hole 18 is the boss, par 6, with a 1.0 cup. It has three acts and all three
  clocks.

### 3. Weather underground

The mines get the garden's climate, since the table is frozen. In the client
each kind of weather is re-dressed for a cave, and each hole is built so that
the weather changes the right shot:

| Kind (chance) | On chain | In the mines | Where it bites |
|---|---|---|---|
| clear (55) | nothing | still air, lanterns steady | |
| wind (20) | a board-wide `Capped` push, 0.08 to 0.15, capped at `Shelter` | the **draught**, the mine's ventilation: dust streaks, lanterns swinging, the rope bridge creaking | every rail-less stretch. `Shelter` is the knob: 0 (full) in the shafts (holes 1, 8, 17), 0.05 to 0.06 on bridges and ledges, 0.03 in the deep chambers |
| rain (15) | the green 2.5% quicker, zones skinned `ice` 6% quicker, and 2 to 4 slow puddles (scale 0.6) inside the railed outline, off hazards | **seepage**: drips from the vault, crystal floors wet. A puddle next to lava is drawn as a steaming pool | crystal floors (skinned `ice` on holes 5, 13 and 18), railed rims beside lava (7, 13, 18), and the banks of hole 17 (tuned to still hold a resting ball in the rain, see there) |
| fog (10) | nothing in the physics | **dust haze**. The client already cuts the aim dots to 7 units in fog (`aim.ts:274`) | every long shot. The dark galleries (2, 15) cut the dots in any weather (§6) |

- **Storms and snow never reach the mines.** Their play (gusts) is built into
  the holes instead as **vents**: timed `Air` slopes, visible and always
  there, which a player can learn. They are on holes 10, 12 and 18.
- **A rail-less lane gets no puddles.** Puddles need the even-odd outline of
  the untimed walls. So the rain is designed onto the railed rims, and the
  wind onto the rail-less spans.

### 4. The gas rules each hole is held to

- **Untimed walls: at most 44.** A long stretch is edged by the void: a
  `Hazard` with `Outside` set, polygon lane of at most 36 points. Or it is
  railed in timber on one side only.
- **The first shot's room: at least 840K** in the dearest weather. That is 40K
  over the floor, mountain/7's margin.
- **The heaviest shot is measured before publishing, not only modelled.**
  - The adversarial search that found the course's 0.74 is run over angle,
    power, tick, weather and start.
  - It is joined by a `z_worst_shot`-style filetest per hole with long
    roll-on (holes 6, 11, 14, 17 and 18).
  - Publishing refuses a hole over the limits anyway, so a mistake shows up
    at publish, never on a hole that is live.
- **Commits.** A round on a long hole may take two commits, on the Mother
  Lode two or three. `adena.ts` already splits a round ("commit the first N,
  then the rest").

| # | Hole | Board | Walls: untimed + timed + pulse | Posts | Zones | ~Bytes | Room (over the 800K floor) | Heaviest shot, modelled |
|---|---|---|---|---|---|---|---|---|
| 1 | The Pithead | 72×26 | 38 + 0 + 0 | 3 | 5 | 2,960 | 893K (+93K) | 0.09 |
| 2 | Glowworm Gallery | 66×22 | 34 + 0 + 0 | 6 | 4 | 2,780 | 916K (+116K) | 0.09 |
| 3 | The Rail Yard | 78×24 | 30 + 12 + 0 | 2 | 5 | 3,380 | 931K (+131K) | 0.10 |
| 4 | The Chasm | 84×20 | 26 + 0 + 0 | 2 | 5 | 2,690 | 943K (+143K) | 0.13 |
| 5 | The Geode | 44×42 | 28 + 0 + 0 | 5 | 2 | 2,240 | 959K (+159K) | 0.09 |
| 6 | The Stamp Mill | 86×22 | 36 + 16 + 0 | 3 | 5 | 3,850 | 900K (+100K) | 0.34 (roll-on) |
| 7 | The Lava Tide | 70×34 | 32 + 0 + 0 | 0 | 7 + 2 pulse | 3,300 | 904K (+104K) | 0.14 |
| 8 | The Cage | 60×44 | 42 + 8 + 0 | 2 | 3 + 4 pulse | 3,830 | 868K (+68K) | 0.10 |
| 9 | The Collapsing Gallery | 90×20 | 40 + 0 + 12 | 4 | 4 | 3,560 | 868K (+68K) | 0.09 |
| 10 | The Geysers | 64×36 | 36 + 0 + 0 | 2 | 9 | 3,120 | 902K (+102K) | 0.10 |
| 11 | The Corkscrew | 56×48 | 40 + 0 + 0 | 2 | 7 | 3,190 | 879K (+79K) | 0.36 (roll-on) |
| 12 | The Steam Vents | 88×22 | 22 + 0 + 0 | 0 | 9 | 2,830 | 957K (+157K) | 0.16 |
| 13 | The Lava Fall | 80×28 | 34 + 0 + 0 | 2 | 7 | 3,140 | 899K (+99K) | 0.12 |
| 14 | The Mine Cart Run | 92×34 | 42 + 0 + 0 | 2 | 7 | 3,300 | 866K (+66K) | 0.36 (roll-on) |
| 15 | The Stalactite Hall | 72×40 | 26 + 24 + 0 | 16 + 6 pulse | 3 | 4,480 | 942K (+142K) | 0.09 |
| 16 | The Strongroom | 64×40 | 38 + 0 + 8 | 6 | 2 | 3,190 | 885K (+85K) | 0.08 |
| 17 | The Great Shaft | 80×60 | 24 + 0 + 0 | 4 | 8 | 2,460 | 977K (+177K) | 0.37 (roll-on) |
| 18 | The Mother Lode | 96×56 | 34 + 8 + 8 | 6 | 12 + 2 pulse | 4,910 | 867K (+67K) | 0.55 (roll-on) |

- **Shot bound:** 1.238e9 to 1.251e9 against 1.3e9.
- **Data:** at most about 5 KB against 32 KB.
- **How the room is computed:** exactly as golf does, from the piece counts.
- **How the heaviest shot is modelled:** a full shot at 2.2 moves a substep.
  Each move looks at every zone (the rain's six included, 1.5 checks each)
  and at about 12 walls or posts in the broad phase. It pays for the polygon
  edges of the zones whose box holds the ball, and a contact every third
  move. The substeps are the hole's own plus 10, or plus the full `MaxRollOn`
  of 120 where an untimed hill is steeper than the drag. That roll-on case is
  a bound, not a typical shot. The course's heaviest real shot is 0.44.

### 5. Pars, and finishable at par in every weather

- **The procedure extends the one in [phase5-pars.md](../docs/design/phase5-pars.md).**
  - The native solver runs each hole in calm, with a budget of 60 to 120 s,
    since the boards are long.
  - The robust plan is then replayed in the weathers a mines hole can get:
    - **Rain**, in 10 periods whose forecast for `mines/<n>/v1` is rain. The
      puddle draws differ from one period to the next.
    - **Wind at the hole's cap**, from 8 directions. The cap is `Shelter`,
      or 0.15 where `Shelter` is 0.
    - **Fog**, which is calm to the physics.
  - **Par is the most strokes any of these takes, plus one.** Where rain or
    wind breaks the robust plan, the solver looks for a plan that survives
    it, or the par goes up.
  - The plans and their periods go into `scripts/hole-bests.json`, as for
    the course.
- **Every hole keeps a weather-proof route.** It is railed, or sheltered, or
  both, and takes par − 1 strokes at worst. The shortcut is the exposed way,
  and in the wrong weather it is the wrong choice. That is the intended
  decision, not an accident.
- **Timing never decides par alone.** The release tick is part of a plan
  (`angle,power,tick`) and the solver searches it. Every stroke-clock piece
  has a route that works whatever stroke you arrive on (the lava tide's rim,
  the lift's ladder, the vault's second door, the collapse's side stopes).

### 6. The world: art direction

The same flat-toon look as the other worlds: `MeshToonMaterial` in three bands
and ink outlines (the inverted hull), cute and chunky. The one difference is
that the light comes from inside the scene: lanterns, crystals and lava, never
the sky.

**Palette.** Dark around a lit lane. The lane must read at a glance, so the
darkness lives in the vault and the walls, never on the carpet.

| Role | Colour | Use |
|---|---|---|
| vault (the "sky") | `#15122b` to `#2a2350` | the cave dome, far walls, CSS sky |
| rock | `#3b3450` basalt, `#5a4638` umber | walls, berms, boulders |
| timber | `#9a6536`, iron `#4b4f5c` | props, sleepers, kerbs, rails |
| carpet (the green) | `#2f8a73`, lit edge `#49b08f` | the lane, as the gnomes lay it down here |
| crystal | cyan `#5ff3ff`, amethyst `#b27cff`, rose `#ff8fc8` | glowing clusters, bumpers, veins |
| lava | `#ff4d1a` to `#ffb23b`, crust `#3a1a14` | lakes, falls, the rim light on the rock |
| lantern | `#ffcf6b` | lantern strings, pools of warm light |
| ink | `#1a1320` | outlines, as the other worlds use |

**Lighting, with no real lights.** A new time of day, `cave`, in `camera.ts`'s
`TIMES`, forced for the `mines` world (`timeOf` sets day, dusk or night by hole
number today):

- A dim violet hemisphere and a soft warm key from above, as if from the
  lantern strings.
- Crystals and lava are unlit (`MeshBasicMaterial`) with an animated gradient,
  plus additive glow sprites. All of them are batched into one `Points`
  object, as the town does at night.
- The light pools under the lanterns and the lava's rim light are baked in as
  vertex colours on the merged static meshes (`bake.ts`), so they cost
  nothing per frame.
- The headlamp is an additive cone decal on the ground. It hangs from the
  gnome's root, not its spinning body (`gnome.ts:322`), and follows the aim.
  It is not a `SpotLight`, which would add a light to every toon shader.

**Set pieces** (drawn by skin, like the mountain's lift, avalanche and serac):

- the pithead's headframe with its turning wheel, and the cage
- rails and carts. This reuses the tram code (`course.ts:853-1033`: it comes
  out of a portal, creeps through its window and leaves), widened from
  `skin === "tram"` to carts, without the overhead wire.
- the rope bridge over the abyss
- the stamp mill with its conveyor and hopper
- the lava tide and its basalt stepping stones
- the lift tower with three landings
- timber props that snap
- geysers with steam columns
- the corkscrew ore chute
- the steam vents
- the twin lava falls
- the cart ride's rail spline, trestle and portals
- stalactites that drop
- the vault door with its dial
- the cable car over the Great Shaft
- the Heart crystal

**Ambient life:**

- Gnome miners (the `gnomelet` prop) swinging picks and pushing barrows.
- Carts rolling on background loops.
- Bats in flocks, bursting out when a ball crosses a bridge.
- Glowworms twinkling on the vault, as `Points`.
- Dripping water with ripple rings, and steam wisps.
- Sparks at the stamp mill.
- A canary in its cage at the pithead.
- A mine pony asleep in its stall, the mines' sleeping cat.

**Sky and background.** A dome of rock with stalactites, crystal veins and
glowworms. Openings into other galleries show lantern strings and a far lava
glow, which gives depth. There is no horizon, and the camera never shows the
edge of the dome.

**Emblem and hat.**

- **The cup's emblem** (`Worlds.tsx` `Emblem`): a crossed pick and lamp over a
  faceted crystal.
- **The loader's hat** (`Title.tsx` `Hat`): a miner's hard hat with its lamp
  lit.
- **The card's tag:** "Experts only".
- **The card's still and clip:** the cart ride (hole 14).
- **The title hole** (`title-holes.json`): The Geode (hole 5), compact and
  glowing.

**Readability rules for a dark scene:**

- The carpet is the brightest thing on the board, and rails are outlined in
  ink with a warm edge.
- Every hazard glows along its edge: lava orange, the void a faint violet
  rim.
- Timed pieces keep the dashed outline shown while aiming (`aim.ts`
  `ghosts`).
- The Low tier drops glow sprites past 4 units off the board (as it drops
  outlines), and lifts the ambient light by a step.

**Dark galleries (holes 2 and 15).**

- Only the headlamp, the glowworms and the crystals light the lane.
- **Client-only rule:** there, the aim dots stop at the headlamp's reach: 7
  units in any weather, and 4 in fog. That is the fog rule already in
  `aim.ts`.
- The chain does not care, and no chain rule is broken.
- It is what makes those two holes hard in assisted mode too.

### 7. Unlock, gnome, badge

- **The unlock.** The cup card is boarded up with a padlock and the four cups'
  medals, and shows "3 of 4 cups at par". It opens when the four classic cups
  are finished at par or under, which is the King gnome's condition. When it
  opens, a short cutscene plays: the boards burst and the lanterns come on
  down the incline.
  - The lock is the client's, like every gnome (`card.ts`: "Front-only").
  - The chain plays any published hole for anyone, and a mines round played
    through gnoweb's Launch form counts like any other. It is a sign on the
    door, not a lock.
- **The slam.** The slam and the King gnome stay the four classic cups.
  `cupTotals` builds the slam from every cup the chain has, so `mines` is
  left out of it explicitly. Otherwise the King would move behind the expert
  cup.
- **The Miner gnome** (`UNLOCKS.miner`, `cup: "mines"`, "Finish the Crystal
  Mines"):
  - It uses the existing `helmet` feature (`gnome.ts:141`), painted yellow.
  - It needs a new `lamp` flag: a lamp mesh on the helmet's brim, and a glow
    sprite and the cone decal hung from `root`.
  - It carries the lit headlamp in every world.
- **The badge "Mother Lode"** ("The Crystal Mines at par or under", family
  `skill`). This deviates from the backlog, which gave both the gnome and the
  badge for finishing at par. On an expert cup, par is a bar few will reach,
  so the gnome goes with finishing and the badge with par. Art nobody unlocks
  is wasted art.

### 8. The 18 holes

**Legend for the sketches** (not to scale; the tee is on the left unless
drawn otherwise):

```
#  rail (untimed wall)            :  rail-less edge over the void or lava
~  lava        X  shaft/pit/bin    ,  rubble or drip pool (slow)
T  tee         U  cup              o  stalagmite/post   *  crystal bumper (kicks)
[A]  tunnel mouth (cage, cart, geyser, chute) and A' its exit
|  timed bar (cart, stamp, door, drop, gate)   !  pulse piece (per stroke)
> < ^ v  hill, pointing downhill   w  vent (timed air)   = bridge / causeway
```

**Overview.** The rating is out of 10; the hardest mountain hole is about 5
on this scale.

| # | Name | Par | Board | Cup | Signature idea (unique to the cup) | Clocks | Rating |
|---|---|---|---|---|---|---|---|
| 1 | The Pithead | 4 | 72×26 | 1.2 | a timed cage over an open shaft, "park it in the cage" | tick | 6 |
| 2 | Glowworm Gallery | 4 | 66×22 | 1.2 | the dark: kicking crystals and a flooded sump, seen by headlamp | none | 6 |
| 3 | The Rail Yard | 4 | 78×24 | 1.2 | three cart tracks on three periods, a ledge green over the void | tick | 6.5 |
| 4 | The Chasm | 4 | 84×20 | 1.2 | a rail-less rope bridge that sways, in the draught | tick | 7 |
| 5 | The Geode | 4 | 44×42 | 1.2 | walls that kick: every hard bank comes back faster | none | 7 |
| 6 | The Stamp Mill | 5 | 86×22 | 1.2 | a conveyor no ball can stop on, under a wave of stamps | tick | 7 |
| 7 | The Lava Tide | 5 | 70×34 | 1.2 | the lava rises with your stroke count, a period of 3 | stroke | 7.5 |
| 8 | The Cage | 5 | 60×44 | 1.2 | a lift that stands at a different level on each stroke | stroke + tick | 7.5 |
| 9 | The Collapsing Gallery | 5 | 90×20 | 1.2 | one-way pulses: the gallery closes behind a slow player | one-way | 8 |
| 10 | The Geysers | 5 | 64×36 | 1.2 | three geysers on three periods: park and fire, or chain them | tick | 8 |
| 11 | The Corkscrew | 5 | 56×48 | 1.2 | two loops in series into a jump over lava | none | 8 |
| 12 | The Steam Vents | 5 | 88×22 | 1.2 | a travelling wave of vents to ride, and boosters that throw | tick | 8.5 |
| 13 | The Lava Fall | 5 | 80×28 | 1.1 | two lava falls on coprime periods, a rail-less basalt bridge | tick | 8.5 |
| 14 | The Mine Cart Run | 5 | 92×34 | 1.1 | the cart ride: two carts, one to the green, one to a siding | tick | 8.5 |
| 15 | The Stalactite Hall | 5 | 72×40 | 1.1 | 16 stalagmites in the dark, bats per stroke, drops per tick | stroke + tick | 9 |
| 16 | The Strongroom | 5 | 64×40 | 1.1 | two vault doors on periods 2 and 3, a slick gold floor | stroke | 9 |
| 17 | The Great Shaft | 5 | 80×60 | 1.1 | a ledge round a bottomless shaft, banked toward it, a cable car across | tick | 9.5 |
| 18 | The Mother Lode | 6 | 96×56 | 1.0 | the boss hole: cart or collapse, tide, then the Heart | all three | 10 |

Values below (`Vec`, `Every/On/Phase`, sizes) are the design's starting
points. The solver pass (§5) tunes them, and the numbers of pieces are those
budgeted in §4.

---

#### 1. The Pithead (par 4, 72×26, Shelter 0)

```
 ########################################################
 #T  the pithead deck (daylight from the shaft)  [C] XXX#   C: the cage, XX: the open shaft
 #######  #############################################
       #  #  the man-way (incline, rubble on the bends)
       #  v,         ###################################
       #   v    ,    #    lower gallery    o    ,    U  #
       ####  v  >  > C'     o           *              #
          ##############################################
```

- **Signature:** the cage is a timed tunnel (`Every 16, On 5`, round, r 1.3)
  standing on the deck. Behind it is the open shaft, a hazard 3 wide.
  - Arrive while the cage is there and you drop to the lower gallery,
    keeping your speed.
  - Arrive while it's away and you roll into the shaft, back to where you
    played.
  - Stop in the cage and it takes you down at rest, whatever the tick: a
    ball at rest in a timed tunnel meets it.
- **Layers:**
  - Precision: the lag, with the shaft behind.
  - Timing: roll through at speed to come out running toward the cup.
  - Route: the man-way incline down the left. It is railed, with a 0.1 hill
    and rubble on its bends (scale 0.5), and is a stroke longer.
  - Weather: the full draught in the shaft, wind 0.08 to 0.15. It bends the
    30-unit lag along a rail-less deck edge. Rain leaves puddles on the
    man-way.
- **Wow:** the cage plunges with the ball in it and the camera drops down the
  shaft, lanterns streaking past. The headframe's wheel turns overhead.
- **Par route:** lag into the cage (1), long shot down the lower gallery (2),
  putt (3). The man-way also makes 3 in calm and 4 in the worst weather.
- **Pieces:** 38 walls, the cage (timed tunnel), the shaft (hazard), 2 rubble
  zones, the incline, 3 posts.

#### 2. Glowworm Gallery (par 4, 66×22, Shelter 0.05)

```
   #####/\####/\######/\#####          jagged rock walls: a bank never runs true
 #T      *        o     ,,   \/\##
  ###/\##   ###/\##  *     XX     ###      XX: the sump (flooded winze)
        #####     ###   *     ####  U #
                     ####/\####/\######
```

- **Signature:** the dark. Only glowworms, crystals and the headlamp light the
  gallery, and the aim dots stop at the lamp's reach (§6).
  - The walls are a jagged outline of 34 points, like the blowhole's cliff.
  - Four crystal bumpers (`Bounce 1.3`, skin `crystal bumper`) kick,
    unseen until the lamp finds them.
  - A round hazard, the sump, lies at the second bend.
- **Layers:**
  - Precision: banks off facets.
  - Memory and reading: the dark.
  - Route: inside the sump for one stroke less, round it for safety.
  - Weather: rain puts drip pools (skinned surfaces, 0.6) and puddles on the
    lane, and fog shortens the dots to 4.
- **Wow:** glowworms light up in a wave along the vault as the ball passes,
  and each crystal chimes on its hit, the gallery answering in echoes.
- **Par route:** three strokes on the outside of the sump, off the smooth
  facets only. The solver checks that none of them relies on a bumper's
  kick.
- **Pieces:** 34 walls, 6 posts (4 of them kicking), 2 drip pools, the sump,
  a dip.

#### 3. The Rail Yard (par 4, 78×24, Shelter 0.06)

```
 ######################################################
 #T     |      ,,,  |      ,,,     |      :::::::::::  #
 #      |  [O] ,,,  |      ,,,     |     : ledge  U :  #   O: the ore chute, under track 2
 #      |      ,,,  |  O'  ,,,     |      :::::::::::  #
 ######################################################
       track 1    track 2         track 3      void behind the cup
```

- **Signature:** three tracks cross the lane, with a cart on each, drawn with
  the tram code: in from a portal, creeping through, out.
  - The carts are timed bars 3 thick:
    - track 1: `Every 16, On 6`
    - track 2: `Every 12, On 5`, running the other way
    - track 3: `Every 20, On 8`
  - Between the tracks, ballast (scale 0.7) slows the ball, so its crossing
    takes long enough for a cart to come.
  - The green is a ledge with the void behind it: an `Outside` hazard of
    10 points.
- **Layers:**
  - Timing: three periods, one release.
  - Precision: pace, stopping on a ledge with the void behind.
  - Route: the ore chute, a tunnel from a side pocket under track 2 to a
    rubble pile. It is safe and slow.
  - Weather: wind on the ledge, rain puddles in the ballast strips'
    margins.
- **Wow:** carts full of glowing ore rattle across, and a near miss throws
  sparks.
- **Par route:** to before track 2 (1), through tracks 2 and 3 (2), putt (3).
  The chute gives the same 3 without the timing.
- **Pieces:** 30 walls, 12 timed walls (3 carts), 2 buffer posts, 3 ballast
  zones, the chute, the void.

#### 4. The Chasm (par 4, 84×20, Shelter 0.06)

```
 ####################                          ##############
 #T   ,,       o  = = = = = = = = = = = = = = o          U  #
 ###   ########::::::::::::::::::::::::::::::::########    ##
   #  the old drift (railed, rubble), round the chasm        #
   #####################################################  ##
```

- **Signature:** a rope bridge 2.6 wide and 28 long over the abyss, with no
  rails. It is the lane gap in an `Outside` void polygon of 28 points.
  - It sways: two timed hills cover it, `Vec (0, ±0.11)` with
    `Every 24, On 12` and phases 0 and 12. The value 0.11 stays under
    `MinRamp`, so a sway never launches the ball.
  - A rope post at each end narrows the way on.
- **Layers:**
  - Precision: the width.
  - Timing: the sway.
  - Weather: the draught across the chasm, capped at 0.06, adds to the
    sway.
  - Route: the old drift round, which is railed, sheltered and a stroke
    longer.
- **Wow:** the bridge swings, bats burst out from under it, and far below
  the lava glows. The camera looks down through the planks.
- **Par route:** through the drift in 3, in any weather.
- **Pieces:** 26 walls, 2 posts, the void, 2 sway hills, 2 rubble zones.

#### 5. The Geode (par 4, 44×42, Shelter 0.03)

```
            ###*###*###
        *##/           \##*          *##: facets that kick (skin "crystal bumper", Bounce 1.25)
      ##      crystal ice   ##       ###: dull rock facets (Bounce 0.6)
     *         *  U  *        *      the cup ringed by a druse: 3 kicking posts
      ##          ,         ##
        *##\_____    ____/##*
               T  crack
```

- **Signature:** walls that kick.
  - Half the geode's 24 facets are bumper walls: skin `crystal bumper`,
    `Bounce 1.25`. They play at 1.25 through `Kicks`, and no course hole has
    one. A hard bank comes back faster than it went in.
  - Under `RestSpeed` (0.35 into the wall) a contact is a resting one: a
    soft bank off a crystal behaves.
  - The floor is crystal, a Surface skinned `ice` at 1.12.
- **Layers:**
  - Precision: pace on ice.
  - Energy management: every kicking bank adds.
  - Weather: rain makes the ice 1.19 (`WetIce`).
  - Route: straight at the druse's gap, or round off the dull facets.
- **Wow:** each crystal rings a note of a pentatonic scale, the geode glows
  brighter with every hit, and holing makes it resonate.
- **Par route:** out of the crack (1), a soft bank off a dull facet (2),
  through the druse (3).
- **Pieces:** 28 walls (12 kicking), 5 posts (3 kicking), the ice, rubble at
  the crack.

#### 6. The Stamp Mill (par 5, 86×22, Shelter 0.05)

```
 ##########################################################
 #T  ,   | | | |   (stamps)                                  #
 #   >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>[H]   ,,    o  #   H: the hopper, H' its chute's end
 #   XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX    H'     U   #   X: the ore bin
 # o  walkway (2.2 wide, props)  o          o                #
 ##########################################################
```

- **Signature:** a conveyor no ball can rest on. It is an untimed hill of
  `Vec (0.26, 0)` over a 40-unit belt. The drag holds a ball only up to
  0.2186, so the belt always carries it on to the hopper (roll-on).
  - Four stamps come down across the belt in a wave: timed bars with
    `Every 14, On 3` and phases 0, 3, 7 and 10.
  - A stamp that lands on the ball pushes it out through the nearest side:
    onto the walkway, or into the ore bin (a hazard).
  - The hopper is a tunnel to the lower floor, keeping the belt's speed,
    onto rubble.
- **Layers:**
  - Timing: the stamps' wave against the belt's speed.
  - Route: the belt, free distance with risk, or the walkway, narrow with
    three prop posts.
  - Precision: coming out of the hopper onto rubble, then the cup.
  - Weather: rain quickens the walkway, wind nudges the ball across the
    belt.
- **Wow:** the stamps pound with dust and sparks, and the ball rides the
  belt past them like ore.
- **Par route:** the walkway in 4 (the belt makes 2 to 3 when timed).
- **Budget:** the belt's roll-on makes it one of the heavy holes, modelled at
  0.34, and is measured before publish (§4).
- **Pieces:** 36 walls, 16 timed walls (4 stamps), 3 posts, the belt, the
  bin, the hopper, 2 rubble zones.

#### 7. The Lava Tide (par 5, 70×34, Shelter 0.05)

```
 ##############################################################
 #  T   ,     rim path (railed outside, lava inside)            #
 #   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~   #
 #   ~~~~  = ~ = ~ =!~ =!~ = ~ = ~ = ~ =  causeway  ~~~~~~~~~   #
 #   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~   #
 #                             rim path                  U     #
 ##############################################################
```

- **Signature:** the lava tide. The lake's level follows your stroke count,
  with a period of 3, through two pulses of hazard zones (`Every 3, On 1`):
  - Low tide on strokes 0, 3, 6…: every basalt stone dry.
  - Mid tide on strokes 1, 4…: the middle two stones drowned (Phase 2).
  - High tide on strokes 2, 5…: the whole causeway drowned (Phase 1).

  The stones are 3 wide, the lava between them 1.6 (more than `MaxMove`, so
  a rolling ball can't skip a gap). No other cup has a hazard on a period of
  3.
- **Layers:**
  - The stroke clock: plan to reach the causeway on a low-tide stroke.
  - Precision: stone to stone at pace.
  - Route: the rim, railed on the outside and open to the lava on the
    inside. It is 2 strokes longer.
  - Weather: rain puddles fall on the rim, drawn as steaming pools, and slow
    the long rim shots.
- **Wow:** the lake breathes with each stroke, rising in a surge of glow,
  and the stones hiss and steam as it falls back.
- **Par route:** the rim in 4 (the causeway, taken on stroke 0 or 3, makes
  3).
- **Pieces:** 32 walls, 2 lava polygons (14 points each), 4 gaps, rubble, 2
  pulses of one hazard each.

#### 8. The Cage (par 5, 60×44, Shelter 0)

```
 #################################
 #T   level 1          |[1]  [L]##     1, 2: the lift's landings (a pulse picks which)
 ############################ X ##     L: the ladder (fixed tunnel to level 2, L')
 #   level 2    L'     |[2]     ##     |: the cage doors (timed)
 ############################ X ##     X: the open shaft where the cage is not
 #   level 3 1'2'      o     U  ##
 #################################
```

- **Signature:** a lift that is at a different landing on each stroke. The
  levels are three galleries, drawn stacked round the shaft. Two pulses with
  `Every 2`, each holding a tunnel and a hazard:
  - Even strokes: the cage is at level 1. Its mouth there is a tunnel to
    level 3, and level 2's mouth is the open shaft.
  - Odd strokes: the cage is at level 2 and level 1's mouth is the shaft.
  - The cage doors are timed bars across each mouth (`Every 12, On 6`,
    phases 0 and 6): a moving ball must also pass them when they are open.
  - A ball at rest in the open cage rides it down.
- **Layers:**
  - The stroke clock: which landing.
  - Tick: the doors.
  - Precision: lagging into a mouth with the shaft behind.
  - Route: the ladder (a fixed tunnel from level 1 to level 2), always
    there and slower.
  - Weather: the full draught blows down the shaft landings.
- **Wow:** the cage rattles between levels, the counterweight passing it,
  and the camera rides down with the ball.
- **Par route:** the ladder (1), the level-2 landing on an odd stroke (2),
  approach (3), putt (4).
- **New in the client:** the three levels drawn at three heights (the scene's
  terrain raised per rectangle). The fallback is side by side, with the
  shaft drawn between them. See §9.
- **Pieces:** 42 walls, 8 timed walls (doors), 2 posts, the ladder, 2 rubble
  zones, 2 pulses of a tunnel and a hazard.

#### 9. The Collapsing Gallery (par 5, 90×20, Shelter 0.05)

```
 ##########################################################################
 #T     ,     o   !1     o   ,      !2      o       ,        !3    U       #
 ####   ###########   ###########   ##########   ##########   ####      ##
    #  side stope A  #  side stope B  #                                     #
    ###################################                                   
```

- **Signature:** one-way pulses (§2). Each rockfall is a bar across the
  gallery:
  - !1 at x=30 from stroke 2
  - !2 at x=55 from stroke 3
  - !3 at x=78 from stroke 4. It leaves a 3-wide gap on the far side: the
    last approach narrows.

  A slow player finds the direct gallery closed and detours through the side
  stopes, which are railed, always open and cost 1 or 2 strokes. The client
  shows the next collapse's cracks and dust one stroke ahead: it reads
  `Extras(hole, stroke+1)`.
- **Layers:**
  - Pace: the fewer strokes, the more gallery.
  - Precision: two long shots down a kinked, rubble-strewn gallery.
  - The clock: one-way, so it can't be waited out.
  - Weather: rain puddles in the long straight.
- **Wow:** props snap, rock crashes down in dust and the camera shakes. The
  miners run.
- **Par route:** past x=30 (1), past x=55 (2), to the approach (3), putt (4).
  One detour costs 1.
- **Pieces:** 40 walls, 4 prop posts, 3 rubble zones, a kink incline, 3
  one-way pulses (a bar each).

#### 10. The Geysers (par 5, 64×36, Shelter 0.04)

```
 ####################################################
 #                               terrace 3   o   U  #
 ######################## ~hot~ #####################
 #              terrace 2    [G3]    w w            #   G: geysers (timed tunnels) to the terrace above
 ######### ~hot~ ####################################   ~hot~: hot springs (hazards)
 #T    ,     [G1]   w      [G2]          ,          #   w: steam vents (timed air)
 ####################################################
```

- **Signature:** three geysers on three periods: timed tunnels with
  `Every 10`, `13` and `16`, each `On 3`. Each throws the ball up to the next
  terrace, keeping its speed. There are two ways to play them:
  - **Park and fire.** Stop on a geyser and it fires you at the end of the
    stroke, whatever the tick, landing at rest. That is one terrace a
    stroke.
  - **Chain.** Roll through a geyser as it spouts, and come out running
    toward the next one in the same stroke.

  The blowhole throws once; nothing on the course chains.
- **Layers:**
  - Precision: the park, on round pads of r 1.3 ringed by hot springs.
  - Timing: the chain.
  - Route: the two techniques.
  - Weather: vents on terraces 1 and 2 (timed `Air`, `Vec 0.2` across,
    `Every 8, On 3`) push the ball sideways, and puddles land on the railed
    terraces in the rain.
- **Wow:** steam columns and the ball riding them up, and a chain of three
  in one stroke for the trailer.
- **Par route:** park 1 (1), park 2 (2), park 3 (3), putt (4).
- **Pieces:** 36 walls, 2 posts, 3 geysers, 3 hot springs, 2 vents, rubble.

#### 11. The Corkscrew (par 5, 56×48, Shelter 0.03)

```
 ##############################################
 #T          [LOOP A] ..... A'                 #
 #   stairs      v        v  downhill  (0.12)  #
 #   (railed,    v        [LOOP B] ..... B'    #
 #   switchback) v               > > kicker ~~~~ lava ~~~~  ,landing,   U
 ##############################################
```

- **Signature:** two loop-the-loops in series, then a jump.
  - **Loop A** (`Scale 2.4`) sends you round to a lower track, keeping 0.8 of
    your speed. A full stroke starts at 4.44 and loses 0.224 a substep, so
    A's mouth stands about 25 from the tee.
  - A downhill of 0.12, below the drag so a stopped ball holds, feeds
    **loop B** (`Scale 2.0`).
  - B's exit leads onto a **kicker** (`Vec 0.35`, like the crevasse jump).
    It takes off when `vu² > 0.5` and flies `2·vu²·tanθ`: 3 units at
    `vu = 2`, over a lava channel 2.4 wide.
  - Too slow at a mouth and you fall back. More than 25° off and you fall
    off the side, put down 1.5 in front.
- **Layers:**
  - Pace: two speed gates and a jump.
  - Angle: 25° entries.
  - Route: the stairs, a railed switchback that is 2 strokes longer.
  - Weather: the jump in the draught (0.03 is sheltered: it never decides
    alone).
- **Wow:** the ball corkscrews along a glowing ore chute with the camera
  riding with it, then leaps the lava in a shower of sparks.
- **Par route:** the stairs in 4 (the chute makes 2).
- **Budget:** the downhill's roll-on, modelled at 0.36 (§4).
- **Pieces:** 40 walls, 2 posts, 2 loops, the downhill, the kicker, the
  channel, 2 rubble zones.

#### 12. The Steam Vents (par 5, 88×22, Shelter 0.05)

```
 ##################################################################
 #T   ,    w1     w2     w3     w4     w5    >>b1>>   >>b2>>   U   #  (the rock wall above)
 ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::  the void below: no rail
```

- **Signature:** a travelling wave of vents on a ledge with no rail on the
  void side (an `Outside` polygon of 36 points).
  - **The vents.** Five vents push toward the void: timed `Air`, uncapped,
    `Vec (0, 0.3)`, `Every 15, On 4`, placed 6 apart at phases 0, 3, 6, 9 and
    12. So the gap between blasts travels at 2 units a substep. A ball
    released on the right tick at the right pace rides the gap for three
    vents. It slows at 0.224 a substep, so the last two vents need a second
    shot.
  - **The boosters.** Two vents point along the ledge (`Vec (0.3, 0)`,
    `Every 15, On 5`). Uncapped air speeds the ball up, up to `SpeedCap`.
    Catch them and you're thrown to the green; mistime them and they are
    just a push.
- **Layers:**
  - Timing: the wave.
  - Pace: riding it.
  - Route: boosters or not.
  - Weather: the wind adds to or cancels the vents' push. It is capped (it
    only bends), capped again at 0.05, and every stroke over the void feels
    it.
- **Wow:** the mountain breathes. Columns of steam fire in a wave along the
  cliff, and the ball runs the gap.
- **Par route:** one vent-gap at a time, stopping in the lee of the rock
  ribs between vents: 4.
- **Pieces:** 22 walls, the void, 7 timed air zones, rubble.

#### 13. The Lava Fall (par 5, 80×28, cup 1.1, Shelter 0.05)

```
 ###################################################################
 #T    ,     ~F1~   ~F2~      [adit]                               #
 #           ~  ~   ~  ~   ~~~~~~~~~~~~~~ river ~~~~~~~~~~          #
 #           ~  ~   ~  ~   ~~~~~~~~ = = = = = ~~~~~~~~~~~   ice  U  #   = : basalt bridge, rail-less
 ###########~~~~~~~~~~~~#####~~~~~~~~~~~~~~~~~~~~~~~~~~~######   ####
```

- **Signature:** two lava falls on coprime periods. They are timed hazards 2
  wide across the gallery: F1 `Every 14, On 8`, F2 `Every 9, On 5`, 6 apart.
  The windows that pass both line up only a few ticks in each 126.
  - The serac fall has three falls on one period.
  - Beyond the falls, a rail-less basalt bridge 2.5 wide crosses the lava
    river at a slant. The river is a hazard polygon of 18 points with the
    bridge cut out of it.
  - The green is crystal (`ice`, 1.1) round a 1.1 cup.
- **Layers:**
  - Timing: two periods.
  - Precision: the slanted bridge, and a smaller cup on ice.
  - Route: the adit, a tunnel from a side mouth to a rubble alcove past
    both falls, which is 2 strokes longer.
  - Weather: rain puddles on the rim by the falls, drawn as steam, and wet
    ice on the green (1.17).
- **Wow:** lava pours from the vault in two curtains, the ball threads the
  gap with sparks on both sides, and the droplets glow.
- **Par route:** the adit (1), the alcove to the bridge's foot (2), over the
  bridge (3), putt (4).
- **Pieces:** 34 walls, 2 posts, 2 timed falls, the river, the adit, 2
  rubble zones, the ice.

#### 14. The Mine Cart Run (par 5, 92×34, cup 1.1, Shelter 0.03)

```
 ##########################################################################
 #T   [RED] ==track==>  XX runaway pit                                      #
 #    [BLUE] ==track==> (to the siding: BLUE', a dead-end rubble bay)       #
 #  , the long drift (railed, three bends)  ,            RED'>,buffer,   U  #
 ##########################################################################
```

- **Signature:** the cart ride. Two stations stand on the tee's platform:
  - **The red cart** (a timed tunnel, `Every 20, On 5`) goes to the main
    line's end, the buffer stop by the green. The ball keeps its speed onto
    rubble (0.5).
  - **The blue cart** (`Every 20, On 5, Phase 10`) goes to a siding, a
    dead-end rubble bay far from the cup.
  - A ball that misses both rolls down the track, a hill steeper than the
    drag, into the runaway pit (a hazard).
- **The ride itself** is the client's (§9). It carries the ball in the cart
  along a rail spline, about 2.5 s: through a crystal cavern, over a
  trestle above the lava lake, and through a portal. The chain records a
  tunnel jump. The ride is decoration, and the replay pauses the ball's
  clock for it.
- **Layers:**
  - Timing: which cart is in.
  - Precision: the stations are 1.3 across, with the pit behind them.
  - Route: red, blue (a mistake), or the long drift (railed, three bends,
    rubble, 3 strokes).
  - The cup: 1.1 on the last putt.
  - Weather: rain on the drift.
- **Wow:** **the** trailer shot. Nothing in the other cups rides.
- **Par route:** the drift in 4.
- **Budget:** the track's roll-on, modelled at 0.36 (§4).
- **Pieces:** 42 walls, 2 buffer posts, 2 timed tunnels, the track, the pit,
  3 rubble zones.

#### 15. The Stalactite Hall (par 5, 72×40, cup 1.1, Shelter 0.03)

```
 ####################################################
 #T  o   o  !b  o    o   |   o    o  !b   o    ,    #   o: stalagmites (16 posts)
 #     o   |  o   ,   o    o   !b   o   |   o       #   !b: bats (pulse posts, 3 perches)
 #  o    o    o   |  o    ,    o    o     o     U   #   |: stalactites dropping (timed bars)
 ####################################################
```

- **Signature:** both clocks at once in the dark, round the densest posts on
  the course.
  - 16 stalagmite posts (r 0.6 to 0.9, `Bounce 0.6`). The Nursery has 7.
  - Bats: three pulses, `Every 3, On 1`, of two posts each. The flock sits
    at a different perch on each stroke of three.
  - Stalactites drop within the stroke: six bars 1×1, `Every 18, On 6`,
    each on its own phase. The client draws each one falling from the vault
    before it stands, then crumbling.
- **Layers:**
  - Precision: threading posts.
  - The stroke clock: the bats move your line.
  - The tick clock: the drops.
  - The dark: dots to 7 (§6).
  - The cup: 1.1.
  - Weather: drip pools (3, scale 0.6) and puddles in the rain, dust in the
    fog.
- **Wow:** the headlamp sweeps a forest of stone, bats burst up, and a
  stalactite shatters beside the ball.
- **Par route:** the widest lanes between posts, which no bat perch or drop
  covers: 4.
- **Pieces:** 26 walls, 24 timed walls (drops), 16 posts, 6 pulse posts, 3
  drip pools.

#### 16. The Strongroom (par 5, 64×40, cup 1.1, Shelter 0.03)

```
 ##############################################
 #T        ,        #        LEFT DOOR !L       #
 #                  #    ------------------     #
 #   the gnomes'    #   gold floor   *  *       #
 #   counting room  #      *    U       *       #
 #                  #    ------------------     #
 #                  #       RIGHT DOOR !R       #
 ##############################################
```

- **Signature:** a vault on a stroke calendar. Two doors on two routes are
  pulse bars:
  - the left closed on strokes ≡ 2 (mod 3): `Every 3, On 1, Phase 1`
  - the right closed on odd strokes: `Every 2, On 1, Phase 1`

  Whatever stroke you arrive on before par, at least one door is open. Both
  are closed only on stroke 5, a sixth stroke, past par. The vault's dial,
  drawn from `Extras` for the next strokes, shows which one.
  - Inside, a floor of gold coins is slick: a Surface skinned `gold` at
    1.15, not `ice`, so the rain leaves it be.
  - Six jewel bumpers (skin `jewel bumper`, so they kick) stand round the
    1.1 cup.
- **Layers:**
  - The stroke clock: which door.
  - Route: left or right.
  - Precision: pace on a slick floor among kicking jewels, into a smaller
    cup.
  - Weather: rain puddles in the counting room, and the draught.
- **Wow:** the great round door rolls aside with its bolts, and the ball
  rolls into a room of gold.
- **Par route:** into the counting room (1), through whichever door is open
  (2), approach (3), putt (4).
- **Pieces:** 38 walls, 6 posts, the gold floor, rubble, 2 pulses of one bar
  each.

#### 17. The Great Shaft (par 5, 80×60, cup 1.1, Shelter 0)

```
              ######################
          ####   *    ledge    *    ####
       ###   :::::::::::::::::::::::   ###
      #  T  :                        :  U #        the ring ledge, 5 wide
      #  [K]:     the bottomless     :K'  #        K: the cable car (timed tunnel across)
      #     :        shaft           :    #        banks lean toward the shaft (0.17)
       ###   :::::::::::::::::::::::   ###
          ####   *             *    ####
              ######################
```

- **Signature:** a ring ledge round a bottomless shaft. It is railed on the
  outside, and the inside edge is open: a round hazard, an ellipse with no
  polygon, so it is cheap.
  - **The banks.** The ledge is banked toward the void by four hills
    (`Vec 0.17`, pointing at the centre). They bend every rolling ball toward
    the edge. 0.17 is under the drag even in the rain: the rain's Crr is
    0.181 against the bank's 0.17 over cos θ, which is 0.173. So a ball that
    stops on the bank holds, wet or dry.
  - **The cable car.** A timed tunnel (`Every 24, On 6`) at the tee's
    platform crosses the shaft to the cup's side, keeping speed.
  - **Four crystal bumpers** stand on the ring.
- **Layers:**
  - Precision: pace along a curve that leans toward the drop.
  - Route: the north arc (bumpers), the south arc (a longer bank), or the
    car (timing).
  - Weather: the full draught up the shaft, at no shelter. On this hole the
    wind is the whole story: it bends every arc, and the solver checks the
    par route from all 8 directions.
  - The cup: 1.1.
- **Wow:** the cable car swings out over the abyss, and the camera looks
  straight down the shaft into the faint violet deep.
- **Par route:** round the south arc in 4, staying to the rail.
- **Budget:** the banks' roll-on, modelled at 0.37 (§4).
- **Pieces:** 24 walls, 4 posts, the shaft, 4 banks, the car, 2 rubble zones.

#### 18. The Mother Lode (par 6, 96×56, cup 1.0, Shelter 0.03): the boss hole

```
 ACT I (west)                 ACT II (centre)                   ACT III (east)
 ####################   #########################   ##############################
 #T  [RED CART] ====>|  #  ~~~~~~~~~~~~~~~~~~~~~~ #   #   *##/  the Heart  \##*      #
 #   XX runaway      |  #  ~~ = ~ =!~ =!~ = ~~~~~ #   #  *     *  (U) *     *        #
 #  the drift  !1  !2 ==>  ~~~~~~~~~~~~~~~~~~~~~~ ==> #   |gate|    [G]  geyser pad  #
 #  (one-way pulses)    #  rim path (railed)      #   ##############################
 ####################   #########################
```

The boss hole. Every clock at once, one after another. The board uses the
format's widest side (96), and the cup is the course's smallest (1.0: it takes
a ball crossing its middle at 1.5 a substep, against 1.9 for a 1.2 cup).

- **Act I, the station.**
  - The red cart (a timed tunnel, `Every 20, On 5`) rides to the start of
    Act II, keeping speed. Miss it and the runaway pit catches you.
  - Or take the drift, which collapses behind you. Two one-way pulses, from
    stroke 2 and from stroke 3, close its middle and its end. Walked early it
    is safe; late, the way is shut and you must take the cart.
- **Act II, the tide.** The lava tide of hole 7, shorter: 3 stones on a
  period of 3 (two pulses). The rim path, railed and puddled in the rain, is
  the safe way.
- **Act III, the Heart.**
  - A crystal chamber whose facets kick: 10 of the walls are bumper walls.
  - A 1.0 cup at the centre of a druse of kicking posts.
  - Two ways in:
    - a slot guarded by crystal gates (timed bars, `Every 12, On 6`)
    - the geyser pad (a timed tunnel). Park on it and it fires you into the
      chamber at rest.
- **Layers:** all of them. The tick (the cart, the gates), the stroke (the
  tide), the one-way clock (the drift), kicking walls, the smallest cup, and
  crystal floor in the rain (`ice`).
- **Wow:** the finale. Holing lights the Heart, and the light runs out
  through the veins of every gallery. The camera pulls back over the three
  acts while the miners cheer and the carts ring their bells: a 4 s outro,
  and the cup's trailer ending.
- **Par route** (5 strokes, par 6):
  1. down the drift, early
  2. out of the drift to the rim
  3. round the rim onto the geyser pad (park)
  4. fired into the chamber at rest; approach through the druse's widest
     gap
  5. the putt
- **Budget:** the tightest hole, at +67K over the floor, from 34 untimed
  walls, 12 zones and 4 pulses. Its roll-on is modelled at 0.55. A seventh
  pulse or ten more rails would take it under 40K, so the boss's extra
  dressing is scenery, not pieces.
- **Pieces:** 34 walls, 8 timed walls (gates), 8 pulse walls (collapse), 6
  posts, 2 timed tunnels (cart, geyser), the pit, 2 lava polygons of 12
  points, 4 gaps, 3 rubble zones and ice, 2 tide pulses.

### 9. What is reused and what is new

**Engine and chain: nothing new.** The cup uses these, all deployed:

- timed walls, zones, tunnels and hazards
- pulses of walls, posts and zones, one-way ones included
- `Outside` hazard polygons
- loops, kickers, hills steeper than the drag (roll-on)
- uncapped timed air
- bumper walls and posts
- `Shelter`, `CupRadius` 1.1 and 1.0, and substeps up to 36 (the course uses
  30 at most)

Two things were considered and not taken, since each needs a redeploy:

- a mines climate (a storm in the mines, dust falls as weather)
- kinematic pieces that carry a ball (a ridden cart)

**Client:**

| Item | Reused | New |
|---|---|---|
| World module `mines.ts` | the module contract (`base`, `edging`, `berms`, `decor`, `piece`, `extras`), `bake.ts`, `props.ts` (`gnomelet`), the batched glow `Points` | the whole dressing: vault dome, rock, timber, carpet, crystals, lava, lanterns, about 2,500 lines |
| Cave lighting | `setLighting`, the fog colour | a `cave` entry in `TIMES`, forced for `mines`; baked light pools; the headlamp decal |
| Carts (holes 3, 14, 18) | the tram (`course.ts:853-1033`): portals, creep, tandem, clipping in tunnels | the skin filter widened from `"tram"`, and the cart body, without the wire |
| Timed bars (stamps, doors, gates, drops) | `timedPieces` (pivot, `scale.y` easing), the dashed outlines | per-skin looks: stamp, vault door, stalactite fall |
| Tunnel transits: cage, geyser, cable car, cart ride | replay's tunnel path ("down the mouth, along the tube, out of the exit pipe", `replay.ts:313`) and the blowhole's throw | a per-skin ride curve from the world (drop, column, cable, rail spline), and the replay pausing the ball's clock during the ride |
| Loops (hole 11) | the castle tube's ridden loop (`replay.ts:168`) | the ore-chute look |
| Pulse pieces (tide, lift, collapse, bats, doors) | `buildExtras`, and a world's `extras()` claiming skins (as town10's bridge) | a look-ahead: reading `Extras(stroke+1)` and `(+2)` to draw warnings (cracks, the tide gauge, the vault dial, the lift's indicator) |
| Smaller cups | `cupR` is already in the chain's hole JSON (`state.gno:56`) | the client draws and tests the cup at `cupR`, not the constant `CUP_R = 1.2` (`terrain.ts:27`) |
| Levels (hole 8) | terrain heights | raising rectangles of the board per hole. The fallback, which is shippable, draws the levels side by side with the shaft between |
| Dark galleries | the fog clip of the aim dots (`aim.ts:274`) | the clip applied by the world for skins or holes marked dark |
| Weather | `weather.ts`, `BITS_OF`, `weatherLooks` | mines looks: drips instead of rain from a sky, dust in the draught, puddles by lava as steam |
| Cup wiring | `CUPS` and everything driven by it (cards, `nextCup`, title rotation, `/h/` pages, sitemap) | `CUPS`/`CUP_NAMES`/`cupTotals` (the slam without `mines`), the lock on the card, `TAGS`, `Emblem`, `Hat`, `CHORES`, `guessWorld` (two places), CSS skies, loaders and curtains, the title hole and its stills and clips, `og.mjs`'s names, the tests |
| Miner gnome and badge | `UNLOCKS`, `helmet` | the `lamp` flag, the glow on `root`, the "Mother Lode" badge |

### 10. Build plan and effort

Estimates are for one developer with Claude, on the pace of the four cups.

| Phase | Work | Days |
|---|---|---|
| **A. Holes and pars** | 18 hole realms (source, fingerprint, data line) | 11 to 14 |
| | solver: calm, then rain and wind replays; `hole-bests.json` | 3 to 4 |
| | gas probes: a worst-shot filetest on the roll-on holes, the adversarial search, a local-chain `Publish` of all 18 | 2 |
| **B. The world** | `mines.ts` base: vault, rock, timber, carpet, crystals, lava, lanterns, cave light, weather looks | 8 to 10 |
| | set pieces: headframe and cage, carts, bridge, stamp mill, tide, lift, props, geysers, chute, vents, falls, cart ride, stalactites, vault, cable car, Heart | 9 to 12 |
| | rides and look-ahead warnings, levels (or their fallback), dark galleries, `cupR` | 3 to 4 |
| | ambient life: miners, bats, glowworms, drips, steam, sparks, canary, pony | 2 |
| **C. Wiring and launch** | cup wiring, the lock and its cutscene, the Miner gnome, the badge, tests | 4 to 5 |
| | SEO: the 18 `/h/mines-N/` pages come from `holes.txt`; `/h/mines/`, 18 OG images (`og.mjs`), the sitemap | 1 |
| | cup-card clip, title stills, trailer shots (cage drop, cart ride, tide surge, collapse, geyser chain, corkscrew, bridge sway, the Heart) | 3 |
| | perf and readability pass on a mid-range Android and an iPhone, Low tier | 3 |
| **Total** | | **49 to 60** |

**Order.**

1. Phase A first. It needs no client, and its pars and budgets are the cup.
2. Then the base world with generic looks, and every hole played internally
   on the local chain.
3. Then the set pieces, most visible first: the cart ride, the tide, the
   cage, the Heart.
4. **Publishing is last.** The client ships first, then the owner publishes
   the 18 lines.

## Consequences

- **The course ranking grows from 74 to 92 holes.** The course ranking adds up
  every current course hole, and golf's page table can't set a cup apart
  without a redeploy.
  - A player who never goes down the mines drops behind one who does, since
    most holes come first.
  - This is intended: the mines are what the top of the board plays.
  - The client can still show a Mines-only board from the per-hole boards (an
    open question below).
- **The mines' par (86) is a third more than a classic cup's.** Its average
  per hole is 4.8, against 2.9 to 3.1.
  - **The general ranking weighs them by their par.** After its holes, a
    standing ranks by its score against par: each best's strokes less its
    hole's par, added up. A mines hole at par counts 0, as a garden hole at
    par does, so the mines' pars don't sink a total of strokes, and a stroke
    over par costs the same anywhere. (Decided 2026-09-29, with the owner,
    before golf was frozen: ranked by strokes, 18 holes at par 86 would have
    weighed a third more than any other cup.)
- **The hub card on gnoweb says "Crystal Mines"**, and the hub lists the mines
  after the mountain (golf's `worlds` puts them fifth, before any world it
  does not name, `extras` included).
- **The weather is gentler than the mountain's**, since a mines hole never gets
  snow or a storm. The difficulty the owner asked for comes from the holes'
  own vents, clocks and void, not from the sky. It is always visible, and so
  learnable.
- **Each hole's weather follows its version id** (ADR-002). Fixing a hole
  after launch archives its board, as for every cup.
- **The client grows by one world module.** `mines.ts` is lazy-loaded like
  island, town and mountain (`worlds.ts:66`), so players who never unlock it
  never download it.

## Alternatives considered

- **A night or volcano variant of the mountain's scene, to ship sooner.** It
  was rejected: the owner wants the other cups' level of finish, and the
  mountain's set pieces (lift, bobsleigh, snow) say "mountain" in every
  frame. It stays the fallback if Phase B slips: the holes of Phase A are
  playable in any dressing.
- **A mines climate (storms, dust falls) in a new `course`.** It was
  rejected: it means redeploying `course` and `golf`, and new weather for every
  version. The holes' own vents give the gusts, visible and learnable.
- **Carts that carry the ball** (a kinematic wall with a velocity). It was
  rejected: it needs a physics v2 and a new format. The timed tunnel plus the
  client's ride is the same moment on screen, and replays exactly.
- **Darkness in the physics.** It is not a thing: the chain has no view. The
  dark is the client's, like the fog, and applies the same to every player of
  this client.
- **Community holes (`PublishMine`) for the expert cup.** It was rejected: a
  cup is course holes, with the owner's slots, the ranking, and the pars
  solved.
- **Ranking the mines apart.** It needs golf's page table or a new ranking
  on chain, so a redeploy. It is deferred to a golf v2 (with ADR-004's duel
  records). The client can show a Mines-only board meanwhile.

## Risks

- **Gas.**
  - The room and the bounds are computed exactly and hold with at least 66K
    to spare.
  - The shot costs are modelled, not measured. The four roll-on holes (6,
    11, 14, 17) and the Mother Lode are measured before publishing (§4).
  - `Publish` refuses a hole over the limits, so a mistake shows at publish.
  - Rounds on long holes take two commits more often, which the client
    already handles.
- **Too hard.**
  - Every hole's par is the solver's robust count plus one in the worst
    weather, and keeps a safe route.
  - 3 to 5 human experts play the 18 on a local chain before publish. A hole
    whose par route nobody finds within 20 tries gets an easier route or
    a higher par.
- **Too many clocks to read.**
  - Every stroke-clock piece shows its next states: the tide gauge, the lift
    indicator, the vault dial, the cracks.
  - Timed pieces keep their dashed outlines.
  - The HUD names the signature in one line on the first visit ("The lava
    rises with your strokes").
- **Mobile performance in a dark, glowing scene.**
  - No real lights: glows batched into one `Points`, light pools baked, the
    headlamp a decal.
  - The Low tier drops far glows and outlines.
  - Measured on a mid-range Android before launch: frames under 20 ms, or
    Auto drops to Low.
- **Readability in the dark.**
  - The carpet is the brightest surface, and hazards glow on their edges.
  - Lava and crystal differ in shape as well as colour (flowing crust
    against faceted clusters) for colour-blind players.
  - The Low tier raises the ambient light a step.
- **Order of release.** A mines hole published before the client knows the
  world shows as the garden, named "Garden Cup". So the client ships first.

## Open questions

- A Mines-only board in the client (from the 18 holes' boards), or the
  course board only?
- Should the cup card show the Mines to players who haven't unlocked it (a
  teaser, boarded up), or hide it until the four cups are done? The design
  says show it, since it is the carrot.
- Two gnomes per cup, like garden, island and town (a Prospector for
  finishing, the Miner at par)? Or one, as above?
- Should `extras` sort after the mines on the hub? That needs golf's page
  table, so it waits for a golf v2 with the rest.
