# Web client deep code review (2026-09-24)

Scope: `web/components/*.jsx`, `web/app/*.jsx`, `web/app/globals.css`, `web/lib/*.js`,
`web/lib/scene/*.js`, `media/promo/render.mjs`, `media/camera/*.mjs`, `scripts/botcheck.mjs`.
This is a review only; nothing was edited. Line numbers are from the current working tree,
which has uncommitted edits in `engine.js`, `cause.js` and `course.js`. Re-check them before
cutting.

Effort: **S** is under an hour, **M** is half a day, **L** is a day or more.

## TL;DR

- **Lint.** `npx eslint .` passes with 0 errors and 0 warnings, but the config hides a
  lot:
  - `varsIgnorePattern: "^[A-Z]"` hides unused capitalised locals. `ISLAND` in
    course.js:8, `Z1` in town:818 and `W`/`H` in island:248 and mountain:997 are all
    unused.
  - `media/` and `scripts/` are never linted.
  - The hooks rules are on (rules-of-hooks error, exhaustive-deps warn), but plugin
    v5.2 has none of the v6 render-purity rules. Those rules would have caught the
    render-time side effects in Golf.jsx.
- **Dead code.** The loop-the-loop track (zones, course and engine) is dead. No hole
  uses the skin `"loop-the-loop"`, and island7's `physics.Loop` zone has the skin
  `"castle tube"`, which is drawn by `castleSlide`. That is about 330 lines to delete;
  see the delete list.
- **Top real problems:**
  - A re-render storm: `onChange: setS` rebuilds a 35-field object on every
    `publish()`.
  - Import cycles through course.js.
  - About 12 copies of segment distance and 8 copies of the timed-phase test.
  - 4 merge helpers and 4 canopy-fade variants.
  - An append-only tail in globals.css with 44 `!important`.
  - Engine test probes (`?camlog`) shipped in the public game API.
- **Old review.** Of the 68 items: 40 are fixed, 1 is obsolete, 18 are partly fixed and
  9 are still open (table at the end).

---

## 1. Ranked findings

### P1: behaviour, performance or maintenance risk

**1. Re-render storm: `onChange: setS`** (components/Golf.jsx:198, lib/engine.js:109-148). M
- **Problem:** Every `publish()` builds a new object and re-renders the whole 780-line
  `Golf` tree, with no bail-out. `publish()` runs:
  - on every power-bar step,
  - on every cause label,
  - on every frame of `demo()` (engine:2219),
  - from the 300 ms watchdog (engine:738-741).

  The object also recomputes `inWorld()` twice and a `worlds` reduce over the whole
  list (engine:113-121).
- **Knock-on effects:**
  - The tab-title effect (Golf.jsx:123-150, deps `[s, playing]`) tears down its
    `setInterval` and its `visibilitychange` listener on every publish. During a roll
    that publishes more often than every 140 ms, the title never animates.
  - The deps-less effect at :167 re-parses localStorage on every render.
  - The `popstate` effect at :400 re-subscribes on every render.
- **Fix:**
  - In the engine, keep the last published snapshot and call `onChange` only when a
    shallow compare differs. Cache `worlds` and `holes` per `g.list` / `g.world`.
  - In React, put the hot fields (`power`, `aiming`, `flash`, `cause`) in a separate
    `useSyncExternalStore` slice that only the aim bar and Weather read. Narrow the
    title effect's deps to `[holeId, s?.flying, s?.holed, s?.aiming, s?.strokes, playing]`.
  - Delete the watchdog; see item 9.

**2. Import cycles through course.js** (course.js:9-13, zones.js:10, garden.js:18, gnome.js:5,
worlds.js:24). M
- **The cycles:**
  - course ↔ zones (zones imports `drape`, `fromWorld`, `gapWater` and `DECK`)
  - course → garden → course (`look`, `weatherLooks`)
  - course → worlds → garden → course
  - gnome → course, for `bake`. This pulls the whole course graph into the gnome
    picker.

  Island, town and mountain also import `mergeByMaterial`, `look` and `weatherLooks`
  from course. The comment at garden.js:18 even admits the cycle.
- **Fix:**
  - Create `lib/scene/bake.js` for `bake` (drop the `mergeByMaterial` alias at
    course:1404), `look`, `weatherLooks`, and the merge helpers from item 5. It should
    depend only on materials.js.
  - Move `drape` to materials.js, and `fromWorld`, `gapWater` and `DECK` to worlds.js.
  - Make garden's `rough` a function of `s`, the way `green` already is, so course.js
    stops importing `roughOf` (course:366, :475).

**3. Engine test hooks shipped in the game API** (engine.js:277-279, :486-493, :691-695,
:2288-2347; Golf.jsx:203). M
- **Problem:** Eleven probe methods are returned from every `createGame()`, about 60
  lines: `camLog`, `camAim`, `sightProbe`, `inView`, `camHeading`, `camInner`,
  `lensFill`, `lensWho`, `pullState`, `camPose`, `fakeWin`.
  - `camLog` and `lensWho` are closure state that exists even without `?camlog`.
  - `window.__g = g` is never deleted in the cleanup at Golf.jsx:229, so a destroyed
    game stays reachable after a remount.
  - The comment at :692 lists `classicTurn`, which no longer exists.
- **Fix:** Use the same pattern as promo. Put the probes in `lib/camlog.js` with an
  `attach({ camera, scene, ball, g, … })` that only runs when `?camlog` is set, and
  have it set `window.__g` itself. In Golf's cleanup, add `delete window.__g`.
  `media/camera/*.mjs` keep working.

**4. Engine god closure** (lib/engine.js, 2387 lines in one `createGame`). L
- **Problem:** The section banners already mark the seams:
  - rendering (150-240)
  - camera and follow (240-700, about 460 lines)
  - loading and weather (806-1001)
  - aim input (1003-1220)
  - shot and preview (1220-1612)
  - replay animations (1614-2105)
  - public API (2155-2386)
- **Fix:** Split it along those banners into modules:
  - `lib/follow.js` gets the chase camera: `thirdTarget`, `keepClear`, `clearHeading`,
    `occluded`, `firstHit`, `segHit`, `wallHug` and the springs. It takes
    `{ g, ball, ground, wallOn }`.
  - `lib/replay.js` gets `replay`, `flightsOf`, `through`, `climbBack`, `splashDown`,
    `sinkPoint`, `fly` and `fallTo`.
  - Each module is a factory that receives the shared context.
  - Do it after the delete list (loops) and item 6 (geometry helpers), so less code
    moves.

**5. Four merge helpers, two of them fragile.** M
- **The four:** `bake` (course.js:1273), `mergeLive` (town.js:479), `mergedMover`
  (island.js:993) and `compact` (mountain.js:38). `props.fence` (props:266) also
  strips attributes by hand.
- **Why fragile:** `bake` merges in world space, so it is only correct under an
  identity root. `mergeLive` detaches the group and resets its matrix first.
  `mergedMover` and `compact` do not; they work only because they are called before
  the group is placed.
- **Fix:** Give `bake(root, { space: "local" })` in the new `bake.js` a local-space
  option (it is `mergeLive`), and delete the other three. Old item 21.

**6. Geometry helpers re-implemented about 25 times.** M overall, S each
- **Closest point on a segment, or segment distance: about 12 copies.** terrain:57
  `segDist`, course:148, :334, :645, zones:517, mountain:1110, :1143, :1384,
  island:1281, engine:499-502 (`wallHug`), :614-617 (`keepClear`) and :1626-1631
  (`sinkPoint`, over polygon edges).
  **Fix:** Export `closest(x, z, a, b) → { x, z, u, d }` and `segDist` from
  terrain.js.
- **Timed-on test `((k+phase)%every+every)%every < on`: 8 copies.** cause:23,
  course:808, zones:1097, weather:351, engine:527, mountain:2146, :2333, island:1971.
  **Fix:** Export `onAt(z, tick)` from terrain.js.
- **Point in polygon: 3 copies.** `terrain.inPoly` (exported, but no outside caller),
  `course.js:210-215` (`polyCuts.inside`) and `town.js:1210 insidePoly`. The ellipse
  test is also re-done at course:354 and zones:477, and terrain:285 / :306
  re-implement the rectangle test.
  **Fix:** Use `inPoly` / `inZone`.
- **Ray against circle, for posts: 3 copies in the engine.** `occluded` (:545-549),
  `firstHit` (:572-577) and `keepClear` (:644-649). `keepClear` :635-650 is a verbatim
  copy of `firstHit` (with `p.c || p.at || p.pos` against `p.c` elsewhere).
  **Fix:** Call `firstHit(ox, oz, C.x, C.z)`, and add `rayCircle()` next to `segHit`.
- **Smoothstep: 5 copies.** terrain:55, garden:863, island:79, mountain:72 and
  mountain:1966.
  **Fix:** `THREE.MathUtils.smoothstep(v, 0, 1)`, or one export from common.js.
- **Grid cell bounds check `a>=0&&b>=0&&a<nx&&b<nz`: 6 or more copies** in course.js
  and 4 in terrain.js.
  **Fix:** Add `t.inGrid(i, j)`.
- **4-neighbour flood fill: 3 copies in terrain.js** (:194, :212, :231), plus the BFS
  in `courseField` at engine:299-316. `courseField` also hard-codes `CELLS = 0.5`
  instead of importing `CELL`.
  **Fix:** One `flood(seedCells, pass)` helper in terrain.js. The engine imports
  `CELL`.

**7. Canopy fade: 4 implementations** (materials.js:282-311 is the shared one). M
- **The copies:**
  - garden.js:483-492 hand-copies `fadeLoop` and leaves its materials transparent for
    good (old item 28).
  - mountain.js:1066-1072 sets `transparent` and `opacity` by hand instead of calling
    `setFade`.
  - The fadeable ink hull is built 3 ways: island:857 `fader`, mountain:951
    `inkFade`/`fadeMats` and town:493-494 `fadeable(piece, points)`.
  - Town imports `fadeable as fading` and then defines its own `fadeable`, a name
    clash.
  - island:856 uses `MeshToonMaterial` without `gradientMap`, so arch palms shade
    differently from every `flat()` palm.
  - Every caller passes `{ min: 0.22 }`, but the default is 0.25.
- **Fix:** In materials.js:
  - add `ownFade(piece) → mats` and `fadeHull()`;
  - give `fadeLoop` a live-position item (`{ obj }`) so garden can use it;
  - set the default `min` to 0.22;
  - carry a `base` opacity for ice.

**8. globals.css tail is an append-only patch log** (lines ~1519-2108). M
- **Problem:** 44 `!important`. Some examples:
  - `.title__facts li` is defined 5 times, `.title__burst` 5 times (with a trail of
    colour changes in the comments), `.title__hat` 3 times.
  - `.worlds__list` `grid-template-columns` appears in 7 places, with breakpoints at
    860 and 700 that disagree.
  - `.pick__canvas` has `!important` at 1549, 2039 and 2040.
  - More than 20 other blocks are doubled: `.aimset*`, `.round`, `.boards`,
    `.sheet__in`, `.note`, `.stamp`, `.btn`…
  - The selector at **2035** is broken: `.aimset--compact .aimset--compact .aimset__help`
    never matches.
- **Fix:**
  - Fold each final value back into its original rule and delete the override.
  - Drop every `!important` except the reduced-motion one (1551).
  - Fix the 2035 selector.
  - Verify with a before/after `media/camera/pressshot.mjs` run.

**9. HUD watchdog** (engine.js:106-108, :738-741; old item 54). S
- **Problem:** "The HUD's aim was stale, told again" papers over publish not being
  called.
- **Fix:** Once item 1 makes publish diff-based, delete `told` and the frame check.

**10. Render-time side effects in Golf.jsx.** S each
- **The cases:**
  - :84 calls `setTimeout(setLinkNote)` inside a `useState` initialiser. StrictMode
    runs it twice.
  - :154 calls `setPars(holesList)`, which mutates lib/card.js module state during
    render.
  - :362 and :423 write refs during render.
  - `unlocked()` (:160) JSON-parses localStorage on each call; Picker calls it 5 times
    per render (:1015-1028).
- **Fix:**
  - Move `setLinkNote` into the cfg effect.
  - Call `setPars` in an effect, or pass `holes` to `parOf`.
  - Read `earned` once into state.
  - Replace the ref writes with a `useLatest` or `useEffectEvent`.

**11. Timers and fetches without cleanup** (old item 65). S
- **Timers not cleared:**
  - `goTo` 380 ms (:113)
  - the demo's 2600 ms (:183)
  - `cfg.won` and `cfg.shot` (:220, :224). These reach `g` after `destroy()`.
  - `within()` (:306), whose rejection timer always runs to 4 s
  - Share `copied` (Share.jsx:48) and Friends `copied` (:1438)
  - engine `mood.joy` setTimeout (engine:1299)
- **Fetches that set state after unmount:** :245 `chainId().then(setChainName)` and
  :307-315 (a stale balance can land for the previous account).
- **Fix:** Keep the timer ids and clear them in cleanup, and add a `live` flag to the
  fetches, as Standings does (:1228).

**12. Standings ignores the aim mode** (Golf.jsx:1229). S
- **Problem:** `leaderboardOf(chain)` always uses `"assisted"`, so a Pro player sees
  their assisted rank.
- **Fix:** Pass `aim` in.

**13. `?rpc=` accepts any https host** (chain.js:138-145; old item 1). S
- **Problem:** A crafted `?rpc=https://evil` still reaches Adena `AddNetwork`.
- **Fix:** Allow only the defaults, `NEXT_PUBLIC_*` and localhost, or ask before
  connecting.

### P2: DRY and structure

**14. The world `decor()` god functions:**

| Function | Lines | Size |
|---|---|---|
| garden `decor` | 648-849 | 202 |
| island `decor` | 1263-1532 | 270 |
| town `decor` | 813-970 | 158 |
| mountain `decor` | 1131-1350 | 220 |
| mountain `piece` | 2359-2571 | 213 |
| island `blowhole` | 1839-2028 | 190 |
| mountain `base` | 85-233 | 149 |
| town `piece` | 1591-1731 | 141 |

- **Fix:**
  - The `taken/free/reserve/put` placer is pasted into all four `decor()` bodies
    (garden:659, island:1271, town:821, mountain:1139). Move it to `placer(margin)`
    in common.js. That alone shortens each by 20-30 lines.
  - Extract the mountain lane lift (:1281-1341) as `laneLiftStations()`.
  - Turn the mountain `piece` ice and drift branches into a table, like town's
    `PLAZA_GROUND`.
  - Effort: M per world.

**15. `zones.draw_surface`** (zones.js:461-731, 270 lines). M
- **Problem:** `zoneDetail` is now a 12-line table (old item 39 is fixed), so the bulk
  moved into `draw_surface`.
- **Fix:** Split fountain, canal, puddle, soil, bed, ice and sand into `ZONE_DRAW`
  entries.
- **Also in zones.js:**
  - Rename the `draw_*` functions to camelCase, to match `deckGap`, `moonBridge` and
    `seesaw`.
  - Drop the draw_gap special case at :167.
  - Drop `inside` and `onGreen` from the handler context bag (they are unused at
    :349, :399, :439, :461 and :797, and `onGreen` is `t.onGreen`).
  - Remove the unreachable second `return g;` at :436 and :458.

**16. course.js long functions.** M
- **The functions:** `groundMesh` (248-461, 213 lines), `wallPieces` (875-1046, 171)
  and `roughScenery` (468-622, 155).
- **Fix:**
  - Extract `barPiece` (:923-1002) and `kerbRuns` from `wallPieces`.
  - Make the skin colour a table in `groundMesh`.
  - Compute the world data once at the top of `buildHole`:
    `const W = worldOf(s), G = greenOf(s), open = openCells(s, t)`. Today:
    - `worldOf(s).green` is read 4 times (:277, :292, :301, :368), with fallbacks that
      have drifted: 0x60ab96, 0x62ae98 and [0x60ab96, 0x5aa38e];
    - `ownSea` 3 times (:47, :342, :480);
    - the open-cell test 3 times (:319, :350, :481).

**17. Grid to BufferGeometry builder: 6 or more copies.** M
- **The copies:** garden:896-918, island:251-291, mountain:117-137, :143-163,
  :1613-1643, :1755-1829, :1858-1882 and :795-814.
- **Fix:** Add `gridMesh(nx, nz, vertex(i, j) → [x, y, z, rgb], keep?)` to
  materials.js. Within mountain, also extract `strataWall()` and `cornice()`
  (:1777, :1909).

**18. Zone footprint laid on the ground: 3 copies.** L
- **The copies:** island `footprint`/`polyGeometry` (:1716-1762), town
  `outlineOf`/`sheet`/`patch` (:1203-1251) and mountain `overlay` (:1600).
- **Fix:** One `zoneSheet(z, t, mat, { lift, uvTile, colorFn, mask })` next to `drape`.

**19. Constants defined twice or drifted.** S
- **The duplicates:**
  - Crevasse depth: `CREVASSE_Y = -7` (course:237) and `D = -7` (zones:265).
  - `ROOF_Y - 3.2` at course:90 and pieces:630.
  - Plank tones at course:306 and zones:191 / :195.
  - SAND is 0xe0bd7e (zones:769) but 0xe9cf97 (pieces:231).
  - Stone greys 0xb9c2bd / 0xa5aea9 appear 11 times.
  - Ice and earth sides at course:240 and zones:268.
- **Fix:** Put them in `C` (materials.js), and export `CREVASSE_Y`, `STREET_Y` and
  `PLANKS`.

**20. Seeded randomness re-implemented.** S
- **The copies:** `common.seeded` is canonical, but there are hand-rolled string
  hashes at garden:56 (`themeOf`), garden:707 (`hh`) and mountain:984 (`canopyOf`).
  promo.js:58-63 installs its own mulberry32 `Math.random`, and promo.js:136 uses a
  sin-hash.
- **Fix:** Use `seeded(id)()` in the worlds. Promo can keep its global override but
  build it from `seeded("promo")`.

**21. Engine internals repeated.** S each
- **"End the pull" sequence** (`dragging = g.aiming = false; dropAim(); publish()`):
  5 copies, at :1150-1152, :1161-1163, :1183-1185, :1188-1190 and :2227-2229, plus
  a variant at :2354. **Fix:** `endPull()`.
- **"Show the shot"** (`g.facing`, `g.power`, `creak`, `band`, `aim.visible`,
  `preview`, `bandTo`, `placeBall`): 3 copies, in `onMove` :1110-1118, `onKey`
  :1198-1205 and `demo` :2213-2218. **Fix:** `showShot()`.
- **Live zone list** (`[...g.s.zones, ...forecast zones, ...strokeZones]`): 3 copies
  (:907, :1556, :2036), plus a superset at :941. **Fix:** `liveZones()`.
- **Path truncation**: `fogged` (:1598-1608) repeats the tail of `previewPath`
  (:1587-1593). **Fix:** `clipPath(path, len)`.
- **Ease-out**: `1 - Math.pow(1 - t, 3)` at :728 and :770, and `ease`/`back` in
  promo.js. **Fix:** Put the easings in common.js, or leave them (low value).

**22. `worldOf` means two things, and the default is spelled out 10 times.** S
- **Problem:** `scene/worlds.js worldOf(s)` returns a module. `card.js:18` and
  `engine.js:2120` define `worldOf(h)`, which returns a string, identically. The
  `h.world || "garden"` default is also written inline 8 more times: engine:119,
  :858, :2147, promo:178, :181, course:76, Golf.jsx:385, :452 and :958.
- **Fix:** Rename the string version to `cupOf(h)` in card.js, import it everywhere,
  and delete the engine copy.

**23. React duplication** (old item 67). S each
- `wx` (Golf.jsx:417-419) rebuilds the fake weather that the engine's `faked()`
  already publishes, and it drops `snow`. **Fix:** Delete `wx` and use `s.weather`.
- `guessWorld` is at Title.jsx:137-142 and inline at Golf.jsx:822. **Fix:** Export it
  and use it at both.
- The "saved" check `record && record.hash !== undefined && !record.error` appears at
  :659, :683 and :698. **Fix:** One const.
- `choresOf` is called twice in one expression at :751.
- Close and back SVGs:
  - Golf.jsx:507 draws its own X instead of using `ui.CloseX`.
  - The back arrow is copied at Golf.jsx:1007 and Worlds.jsx:127.

  **Fix:** Add a `BackButton` to ui.jsx.
- Address truncation has 5 variants (:51, :1369, :1429, :1481, :1580). **Fix:**
  `shortAddr()` in ui.jsx. The module-level `short` (:51) is also shadowed by a local
  `short` at :685.
- The leaderboard row markup is copied 3 times (:1397, :1524, :1578). **Fix:** One
  `<Row>`.
- localStorage key access is scattered: `gnogolf.gnome` is read 4 times (:189, :464,
  :946, :966) and `adenaOff` 3 times. **Fix:** A tiny `store.get/set/del` helper with
  a try/catch, in lib/card.js next to the card's own `save`/`loadCard`.
- `i0` is still there (:1065).
- Worlds.jsx:23 builds the clipPath id as `w-${id}`, which collides when two emblems
  of the same cup are mounted. **Fix:** `useId()`.

**24. Golf.jsx is 1610 lines.** L
- **Fix:** Extract the hooks `useWallet()` (:172-347), `useAddressBar()` (:373-415)
  and `useTabTitle()` (:121-150). Move Boards, Friends, Leaderboard, Standings,
  `useFlags`, `leaderboardOf`, `ComingSoon` and `FlagMark` (:1209-1596) to
  `components/Boards.jsx`, Stamp and Scorecard to `components/Card.jsx`, and the
  friends storage (:1325-1345) to lib/card.js.
- **Also:** `useConfig` (:17-43) runs in an effect even though Golf is `ssr:false`.
  **Fix:** `useState(readConfig)`, which drops 8 `cfg &&` guards.

**25. Media scripts: the CDP client is copied 4 times.** S
- **Problem:**
  - pulltest, camsuite, pressshot and render each launch Chrome and hand-roll a
    `send`/`ev` over the websocket.
  - `chainUp` is copied (camsuite:25-35, pressshot:34).
  - Paths are hard-coded (`/Applications/Google Chrome.app`,
    `$HOME/Server/gnoland/...`).
  - pressshot's `chainUp` has no timeout.
- **Fix:** Add `media/cdp.mjs` exporting `{ launch, chainUp }` (render.mjs's version
  is the most robust: `DevToolsActivePort`, error rejects). Make the paths env
  overridable.
- **Also:**
  - render.mjs:40-48 copies the Title.jsx logo SVG by hand, and render.mjs:95
    `ALL_GNOMES` duplicates `GNOMES` in gnome.js; both will drift.
  - botcheck.mjs already reuses `lib/chain.js`. It is the good example.

**26. chain.js decode duplicated** (chain.js:37-50). S
- **Problem:** `qstr` and `qeval` repeat the hex encoding and the typed-result slice.
- **Fix:** `qeval = async (e, ms) => JSON.parse(await qstr(REALM, e, ms))`.
- **Also:** `chainId` (:75) has no timeout and no `res.ok` check. **Fix:** Route it
  through `query()`.

**27. feel.js white-noise buffer written twice** (feel.js:52-54, :138-139). S
- **Fix:** One `whiteNoise(a, secs)`. Also rename feel's module `mood` to `weatherNow`
  to end the clash with the engine's `mood` (old item 56).

**28. Promo ships in the main bundle** (lib/promo.js, 402 lines, imported by engine.js:20). S
- **Problem:** The `?promo` check is cheap, but the code (and its 40-line CSS string)
  is always downloaded.
- **Fix:** `if (promo flag) import("./promo.js")`. The attach call can wait for it.
- **Also:** `piecesOf` (promo:147-155) relies on `buildHole` putting its children in a
  fixed order ("7" ground children), and nothing in course.js says so. Add a comment
  in `buildHole`, or tag the children with `userData.kind`.

### P3: hygiene, naming, comments

**29. Stale, detached or stacked comments.** S
- **engine.js:**
  - :674-675: the same comment line twice.
  - :863 "the garden's foliage … lean with the wind" sits above `newRound()`.
  - :1048-1049: stacked.
  - :1221-1222: blank lines.
  - :1356-1364: a doc block plus two stacked paragraphs.
  - :1465-1474: two paragraphs saying the same thing.
  - :1528: an orphan ("The kind of jump…").
  - :1530: the `windy` doc sits above `tilting`.
  - :1894: the `replay` doc sits above `flightsOf`.
  - :2058-2059: stacked.
  - :2109-2111: stacked.
  - :1435: mis-indented.
  - :595 `const dist_ = dd;`: a pointless alias.
- **chain.js:**
  - :86: "What a shot would do" documents the removed `simulate`.
  - :103: the `holeLeaderboard` doc is detached from :118.
  - :124-132: the `shotOf` and `pullShot` docs sit above `safeEndpoint`.
- **adena.js:139-145:** two gas comments stacked (the "a third of headroom" is 1.35,
  and the fee is 1.5 more).
- **terrain.js:22-26:** the `inZone` doc sits above `airy`.
- **course.js:** :27-30, :104-112, :1257-1263, :1339-1343 and :1380-1389 (each doc
  sits one symbol off).
- **zones.js:13-17**, **fx.js:10**: same problem.
- **state.js:6:** the `tubes` comment should say "tunnel or tube zone". `ghosts` is
  missing from the state doc.
- **worlds.js header:** missing `decor.userData.weather`, `look`, and the garden-only
  `roughOf`.
- **island.js:** :1545-1546 mentions a lighthouse loop that zones.js no longer has;
  :2050 says "tube or track" (the track is dead); :540 is a stub ("// it turns ").
- **mountain.js:** :396-397 stacks two docs.
- **town.js:** :1219 documents an `over` parameter that does not exist.
- **Weather.jsx:3-9:** mentions a windsock that is no longer drawn.
- **Title.jsx:** :7-9, :59-67 and :132-136 are stacked.
- **Golf.jsx:** :49 is an orphan; :1053-1056 has contradictory `holeNumber` docs;
  :1209-1216 is detached.
- **globals.css:** :1995 says "two tabs" (there are three), plus :1618-1633.

**30. Missing "why" comments on the tricky parts.** S
- **Chain sync:** Add one paragraph at `load()` / `newRound()` explaining `round` vs
  `cut` vs `loads`. Three different cancellation tokens protect async work (hole
  switch, replay safety cut, load ticket), and today you have to infer that from 20
  call sites.
- **Tick timing:** `clock` runs at 3.5/s idle (engine:746) but is driven as
  `tick0 + i + raw` in the replay (:2060). One comment should state the contract:
  the chain's tick = path index; `every` wraps at `everyL`; the preview is re-asked
  when `tickNow()` changes.
- **Camera states:** `camState()` (:254) has five states, `thirdTarget` takes
  `dt, state`, and the spring gains depend on `urgent`. The rig shape
  `{ target, dist, ox, oy }` is never documented. Add a typedef line in camera.js and
  a state table at :240.

**31. Unused locals and params** (all hidden by the lint config; see §4). S
- **Locals:** course.js:8 `ISLAND`; island:248 `W`, `H`; mountain:997 `W`, `H`;
  town:818 `Z1`; mountain:221-223 `onLip`, which is always false, so both branches
  are dead.
- **Params:** engine:405 `rigTarget(dt)`; island:598 `rand`, :1223 `rand`, :2060 `s`,
  :1524 `bank`; mountain:648 `H`, :2567 `zz`; props:414 `i`; zones:119 `s`, and the
  zones handlers from item 15.
- **Pointless code:** island:2097-2098 `const rand = …; void rand;`; town:859-861 is
  a one-item loop with dead branches; town:1189 `long ? 0.2 : 0.2`.

**32. CSS tokens and dark mode.** M
- **Tokens:**
  - There are only 6 colour tokens, against 189 hex literals (120 distinct).
  - `rgba(20,65,52,…)` (ink with alpha) appears 17 times.
  - `outline: 3px solid var(--hat)` appears 9 times although `--ring` exists.
  - `0 4px 0 var(--ink)` appears 10 times although `--shadow-btn` exists.
  - `var(--wood, #c99a63)` points at a token that was never defined.
  - There are two `:root` blocks (2 and 2065).
  - z-index goes up to 10 with no scale.
- **Dark mode:** There is no `prefers-color-scheme`. The page is light by design, but
  without `:root { color-scheme: light }` the native controls (the friends input,
  scrollbars) render dark on a dark OS. **Fix:** Add it (S).
- **Unused classes:** `.boards__soon`, `.boot__ball`, `.load__hat`, `.real__close`,
  `.sock__on`, `.sock__on--w`, `.sock__off`, `.weather__sock`, `.title__tee`,
  `.title__golf`, `.title__dimple` and `.title__small`. `.power span`'s `--p` is
  never set.

**33. Hole ids hard-coded in world code.** M
- **Where:** garden.js:52 `THEME`, island.js:2191 (`island8/9/10`), town.js:951 and
  :1773 (`town10`).
- **Fix:** These should come from chain skins or state flags. A new hole id silently
  loses its dressing today.

**34. Other.**
- **Mountain edge rocks** (mountain.js:1160-1169): the decor replays `edging`'s RNG in
  lockstep (:356-368) to find its rocks. Any change to `edging` breaks the
  reservations. **Fix:** `edgeRocks(W, H, seed)`, used by both. S.
- **Cache keys built from a length:** `pushHull` (materials:71) and `withSway` (:133)
  key on `extra.length`, so two different hooks of equal length collide. **Fix:** Key
  on the string. S.
- **Per-vertex array:** materials.js:151 `foot.set([x, y, z], i * 3)` allocates an
  array per vertex on every bake. S.
- **Remaining per-frame allocations:**
  - island:979 (the kite spine)
  - garden:196 (`getPoint` / `getTangent` without a target)
  - engine:1670 `tube.getPoint(k)` and `camera.js:132 focusRig` `R()`

  S each.
- **Island shuffle:** island:1431 shuffles with `sort(() => rand() - 0.5)`. It is
  biased but stable per seed, so this is cosmetic.
- **`weather.blob`** (weather.js:55) is a third radial glow texture, not sRGB and not
  shared (old item 18). **Fix:** Fold it into `glowTex`.

---

## 2. Delete list

### A. The loop-the-loop track (confirmed dead)

No hole uses `skin: "loop-the-loop"`. The only `physics.Loop` zone is island7's
(`island7.gno:39`), whose skin is `"castle tube"`; it is drawn by `castleSlide` and
ridden by the tube code. `tube.userData.open` is set only by `loopTrack`, so every
branch that tests it is dead too.

| File | Lines | Symbol |
|---|---|---|
| zones.js | 140 | the `ZONE_DRAW` entry `[(z) => z.kind === "loop" && z.skin === "loop-the-loop", loopTrack]` |
| zones.js | 893-894 | `export const LOOP_R = 3` and its doc |
| zones.js | 896-913 | `export function loopFrame(z)` and its doc |
| zones.js | 915-1048 | `function loopTrack(z, s, t, g)` and its doc (sets `curve.userData.open/top/fall/centre/across/base/pace`) |
| zones.js | 2 | `BALL_R` drops out of the import once loopTrack goes (check nothing else uses it) |
| course.js | 13 | `loopFrame` in the zones import |
| course.js | 156-164, 171-173 | the loop half of the `openings` doc; `for (… isLoop(z)) strips.push(...loopStrips(z))` |
| course.js | 224-235 | `function loopStrips(z)`, `const isLoop` |
| course.js | 584 | comment "(nor under a loop's track…)" |
| course.js | 592-595 | `...s.zones.filter(isLoop).map(…)` inside `built` |
| course.js | 887-888 | `loopRects`, `inLoopStrip` |
| course.js | 889 | `isLoop(q) \|\|` in `cutAny`; the comment "any gap, loop or inlet" |
| course.js | 892-893, 913-916 | the loop comments and the `!inLoopStrip(p)` guard (keep the `caps.set`) |
| engine.js | 1659 | `if (tube && tube.userData && tube.userData.open) return rideLoop(…)` in `through` |
| engine.js | 1686-1753 | `rideLoop()` and its doc |
| engine.js | 1755-1765 | `flewOff()` and its doc |
| engine.js | 1786-1791 | the `if (tube.userData && tube.userData.open) { … }` block in `rollBackAt` |
| engine.js | 1809 | the `tube.userData.open ? 1 :` branch in `climbBack` (keep the pipe scale) |
| engine.js | 1792 | `(tube.userData && tube.userData.top) \|\| 0.5` becomes `0.5` if nothing else sets `top`. `island.js:420` sets `g.userData.top` on a Group, not a curve, so check castleSlide before simplifying |
| engine.js | 2014-2022 | the `flewOff` / `rideLoop(off, …, 0.9, to)` step in `replay` |

Keep `z.kind === "loop"` in `jumpFrom` / `tunnelled` / `rollBackAt`: island7's tube uses
it.

Chain side, outside this scope: `field.gno:16` still lists `loop-the-loop` in the skin
vocabulary, and CLIENT.md and docs/physics.md describe it. Trim them together, or keep
the vocabulary and accept the skin drawing as a plain loop zone.

### B. Other dead code

| File:line | Symbol | Note |
|---|---|---|
| chain.js:160-168 | `demoPull()` | never called |
| terrain.js:320-348, card.js:101-109, cause.js:154 | `demo()` | never called. Wire them into one `npm run check` (`node -e "for (const m of […]) console.log(await import(m).then(x => x.demo()))"`) or delete them. They are cheap, so wire them. |
| materials.js:38 | `isShared` | no caller |
| materials.js:313 | `export … hull` | not imported |
| scene.js:11-16 | re-exports `C, motion, setWind, windNow, timeOf, islandBox, isPortrait, easeRig, mergeByMaterial, loadWorld, worldOf` | nobody imports these through scene.js |
| garden.js:942 | re-export `seeded, ISLAND, GRASS` | leftover from before common.js |
| course.js:8 | `ISLAND` import | unused |
| course.js:1404 | `mergeByMaterial` alias of `bake` | pick one name (see consolidation step 3) |
| zones.js:436, :458 | second `return g;` | unreachable |
| zones.js:2-3 | two imports from `../terrain.js` | merge them; also hoist pieces.js:611-612 and fx.js:8 |
| terrain.js:245 | `W2`, `H2` aliases | inline them |
| engine.js:674 | duplicate comment line | |
| engine.js:595 | `dist_` alias | |
| engine.js:2120 | local `worldOf` | use `cupOf` (item 22) |
| engine.js:106-108, :738-741 | `told` watchdog | after item 1 |
| Golf.jsx:417-419 | `wx` | use `s.weather` |
| Golf.jsx:953 | `holeLink` export, `base` param always `""` | |
| Golf.jsx:1065 | `i0` | |
| island.js:2097-2098; mountain.js:221-223; town.js:859-861, :1189 | dead locals and branches | item 31 |
| globals.css | the unused classes in item 32; the dead rule at 2035 | |
| adena.js:39, :150; card.js:66; chain.js:152; engine.js:28; course.js:239; island.js BLOWHOLE_MOUTH; Golf.jsx loadFriends/saveFriends/addFriend | `export` only; used in-file | drop `export` (or move, item 24) |

Kept on purpose:
- `SOON = true` (Golf.jsx:1286) and its `!SOON` branches: a launch switch.
- `?promo`, `?won`, `?weather` and `?world`: they serve media/ and screenshots.
- The skins drawn but unused by any hole (`stairs`, `ramp`, `ditch`, `castle gate`,
  `warp`): they are in or near the chain vocabulary.

---

## 3. Consolidation plan (order matters)

Each step touches files the next one also touches. Doing them in this order means no
step rewrites code another step will move.

1. **Delete first** (§2A and §2B; S to M). Removes about 330 loop lines from
   zones, course and engine before anything moves. Lint afterwards with the stricter
   config (step 0 of §4) to catch the newly unused imports.
2. **Geometry helpers into `terrain.js`** (S to M). Add `closest`/`segDist`, `onAt`,
   `inGrid` and `flood`, and use `inPoly` (item 6). Then replace the copies in
   course, zones, the worlds, engine, cause and weather. Everything already imports
   terrain.js, so this creates no new edges. Do it before step 3 so the code that
   moves is already short.
3. **Break the cycles with `scene/bake.js`** (M). Move `bake` (with its `space: "local"`
   option), `look` and `weatherLooks` there. Delete `mergeLive`, `mergedMover` and
   `compact` (item 5). Move `drape` to materials.js, and `fromWorld`, `gapWater` and
   `DECK` to worlds.js. Garden's `rough` becomes `(s) =>`. Update the world imports
   once, here.
4. **Fade and material helpers in `materials.js`** (M). Add `ownFade`, `fadeHull`,
   the live-item `fadeLoop` and the 0.22 default (item 7), `gridMesh` (item 17),
   `glowTex(stops)`, `windLean`/`gust`, a cached `flat(color, opts)`, and the new
   `C` colours and constants (item 19). The worlds adopt them. This runs after step 3
   because the worlds' import lines already changed there.
5. **Placer and small world helpers in `common.js`** (S). Add `placer(margin)`,
   `onGround`, `doorway`, `edgeRocks`, `smoothstep`, and use `seeded` in place of the
   hand hashes (items 14, 20). Then split the `decor()` bodies (item 14), which by now
   are 30-60 lines shorter.
6. **Scene module split** (M). Split `zones.draw_surface` into table entries
   (item 15), and split the long course.js functions and hoist the world data
   (item 16). `zoneSheet` (item 18) comes last in this step, since it needs `drape`
   (step 3) and `gridMesh` (step 4).
7. **Engine** (L).
   1. Add `endPull`, `showShot`, `liveZones`, `clipPath` and `firstHit` reuse
      (item 21), and switch to `cupOf` (item 22).
   2. Move the probes to `lib/camlog.js` (item 3), and load promo dynamically
      (item 28).
   3. Make `publish` diff-based and delete the watchdog (items 1, 9).
   4. Split out `follow.js` and `replay.js` (item 4).
8. **React** (M to L). Hot and cold state and the narrowed effects (item 1, the React
   half), render-time side effects (item 10), cleanups (items 11, 12), the helper and
   component dedupe (item 23), then the file split (item 24). Doing the split last
   keeps the diffs of the earlier fixes readable.
9. **CSS** (M). Fold the tail back into its rules, drop the `!important`s, add tokens
   and `color-scheme` (items 8, 32). Screenshot before and after.
10. **Media and chain** (S). `media/cdp.mjs` (item 25) and `qeval` via `qstr` (item 26)
    are independent; do them any time.

---

## 4. Lint and config

- **Result:** `nice -n 20 npx eslint .` exits 0 with no warnings.
- **Coverage of the hooks rules:** `rules-of-hooks` (error) and `exhaustive-deps`
  (warn) are on. There are 3 `eslint-disable-next-line react-hooks/exhaustive-deps`,
  all with a reason (Golf.jsx:234, :1367, :1471).
- **Gaps:**
  1. `varsIgnorePattern: "^[A-Z]"` exists because JSX usage is not seen. It also hides
     every unused capitalised constant. Turned off, it shows 4 real ones (`ISLAND`,
     `Z1`, `W`, `H`) and 20 false positives (components). **Fix:** Add
     `eslint-plugin-react` with only `react/jsx-uses-vars` (or `react/jsx-uses-react`
     off), and drop the pattern.
  2. `args: "none"` hides the unused params in item 31. **Fix:** Use
     `args: "after-used"` with `argsIgnorePattern: "^_"`.
  3. `media/**/*.mjs` and `scripts/*.mjs` sit outside `web/` and are never linted.
     **Fix:** Add a root config, or a `files` entry with `globals.node` for those
     paths.
  4. `eslint-plugin-react-hooks` is 5.2. Version 6's `recommended` config adds the
     compiler-derived rules (render purity, refs during render, setState in effects).
     They would flag item 10.
  5. **Optional:** `no-shadow` (warn). It would catch `short`, `mood`, `ink`, `green`
     and `share` shadowing.
- **No stale TODOs:** there are no `TODO`/`FIXME`/`XXX` markers and no commented-out
  code blocks.
- **Debug hooks:**
  - `?camlog` becomes `window.__g`, plus the probe API (item 3).
  - `?promo` becomes `window.__promo` (by design).
  - The `console.info` / `console.warn` calls in the engine are fine. They are
    user-facing diagnostics.

---

## 5. Old review (docs/reviews/js-review.md): status of the 68 items

**F** is fixed, **P** partly fixed, **O** still open, **X** obsolete.

| # | Status | Evidence / what is left |
|---|---|---|
| 1 | P | `safeEndpoint` (chain.js:138) requires https or localhost but accepts any https host (item 13) |
| 2 | F | `PKG` and `ADDR` checks and `new URL`, chain.js:77-81 |
| 3 | F | `String(r.player)`, Golf.jsx:1481, :1580 |
| 4 | F | `SHARED` and `share()`, materials.js:35-37 |
| 5 | F | materials.js:244 disposes instanced meshes |
| 6 | F | materials.js:264; the course owns the mask (course.js:74) |
| 7 | F | `pushHull` / `hullOf`; the fade-hull variants remain (item 7) |
| 8 | F | `inkSway` is gone |
| 9 | F | `sway(color, { double })`, materials.js:172 |
| 10 | F | fireflies as Points, props.js:29 |
| 11 | P | shared `PUFF_GEO`; still 4 materials per chimney (props.js:415) |
| 12 | F | `SPARK_*` and `GLASS_*` are shared |
| 13 | F | weather.js:388 writes by index |
| 14 | F | weather.js:370 |
| 15 | F | weather.js:190-217 |
| 16 | F | `WEATHER_SKINS` export, weather.js:9 |
| 17 | F | weather.js:463 |
| 18 | O | the `blob` texture is still separate, weather.js:55 |
| 19 | F | course.js:1244 visibility toggle |
| 20 | F | `sawnCylinder` / `sawn`, course.js:686-703 |
| 21 | O | still 4 merge helpers (item 5) |
| 22 | F | `hookId`/`maskId` signature, course.js:1267-1291 (the length key survives in `pushHull`/`withSway`, item 34) |
| 23 | F | `ZONE_COLOR` is gone |
| 24 | P | renamed to `groundMesh`; all three are still long (item 16) |
| 25 | F | `WEATHER` hoisted (course.js:1345); `cutAny` depends on `s`, so it stays |
| 26 | P | `lawnCells`, `plinthsOf` and zones:271 are gone; the loop track is still there, and bigger (§2A) |
| 27 | F | no baked hidden parts in town.js |
| 28 | P | `fadeable` / `fadeLoop` in materials.js; the garden copy and 3 hull builders remain (item 7) |
| 29 | F | uniforms, island.js:120-130 |
| 30 | P | the throwaway `drawn()` is gone; `fader` (island.js:857) still shadows `ink` |
| 31 | O | `town.js:1210 insidePoly` and `course.js:210 inside` duplicate `inPoly` |
| 32 | F | `t.onGreen` (terrain.js:311) is used by course, weather and mountain |
| 33 | P | the helpers are in common.js; the course cycles remain (item 2) and garden still re-exports them |
| 34 | P | mostly gone; island:979, garden:196 and engine:1670 remain |
| 35 | O | the decor() functions and town `piece` are still long (item 14) |
| 36 | F | no `Math.random` in mountain.js |
| 37 | F | town.js:1595 seeds by coordinates |
| 38 | F | garden `streaks` and gnome.js:48 use `texOf`; the garden:184 alpha map stays linear, correctly |
| 39 | F | the `ZONE_DRAW` table, zones.js:139; `draw_surface` is the new offender (item 15) |
| 40 | F | fx.js:146 scratch objects |
| 41 | F | fx.js:6-7 shared geometry |
| 42 | P | the `focusRig` `R()` literal remains (camera.js:132) |
| 43 | F | far is set from the rig, camera.js:89, :118 |
| 44 | X | `low-power` is deliberate, with the reason at camera.js:9-12 |
| 45 | F | worlds.js:37 deletes the failed import in `.catch` |
| 46 | F | "grand slam" everywhere |
| 47 | O | `ghosts` is missing from state.js; the worlds.js doc is out of date; 11 unused scene.js re-exports |
| 48 | F | `load()` calls `newRound(false)` first, so no RPC for the old hole (engine.js:815) |
| 49 | F | `dropAim()` exists; the wider "end pull" sequence is still ×5 (item 21) |
| 50 | F | `destroy()` disposes ball, aim, band, confetti and weather; `cut++` stops the replays (engine.js:2363-2385) |
| 51 | P | `inZone` and `onGreen` are imported; the segment and ray math is re-done (item 6) |
| 52 | P | `AbortSignal.timeout` in chain.js `query`, and the preview race timer is cleared (engine.js:1315); `chainId()` has no timeout |
| 53 | O | `publish()` rebuilds everything; `demo()` publishes per frame (item 1) |
| 54 | O | the watchdog is still at engine.js:738-741 |
| 55 | P | `tube.getPoint(k)` still allocates per frame (engine.js:1670); `rightUp` is per shot (acceptable) |
| 56 | P | `?probe` became `?camlog`, but the probes ship in the API (item 3); stacked comments remain; `fail()` is gone; `mood` is still defined in both feel.js and engine.js |
| 57 | F | `res.ok`, `body.error`, `encodeURIComponent` and a timeout in `query()`; `chainId` bypasses it (item 26) |
| 58 | P | `simulate` is gone; `demoPull` is unused; the detached docs remain; the self-checks never run |
| 59 | F | the listener Set with a real unsubscribe (adena.js:124-137), the `DoContract` guard, `feeFor` once |
| 60 | F | the rain bed stops (feel.js:157-163); `resume().catch` |
| 61 | P | card.js `save()` is deduplicated; `worldOf` is now defined twice plus 8 inline defaults (item 22); the terrain.js doc is still misplaced; `W2`/`H2` remain |
| 62 | O | `onChange: setS` (item 1) |
| 63 | P | the write moved into an effect (Golf.jsx:167); the read in render remains (item 10) |
| 64 | F | `live` guards; the `leaderboardOf` 5 s cache stops the double fetch |
| 65 | P | curtain, slowSign and Loader are cleared; the list in item 11 is not |
| 66 | P | the three disables are documented; the deps-less effects (:167, :240, :400) are not |
| 67 | O | `wx`, `guessWorld`, saved ×3, `choresOf`, X/back SVGs, `short`, `i0` (item 23) |
| 68 | F | `"lint": "eslint ."` with the react-hooks rules (gaps in §4) |

Totals: 40 fixed, 18 partly, 9 open, 1 obsolete.
