# 3D performance review of the web client (2026-09-24)

Scope: `web/lib/engine.js`, `web/lib/scene/*.js`, `chase.js` and `promo.js`. This is a review only: no code was changed. Line numbers are for the working tree on the date above.

## How it was measured

- **Setup.** One headless Chrome (`--use-angle=metal`, `nice -n 20`, its own profile, killed by PID after each run). The window was 1440×900 at deviceScaleFactor 2, so the canvas is 1800×1125 at the engine's 1.25 pixel-ratio cap. The target was the dev server on `:3300`, with `?play&camlog&hole=…`.
- **Draw calls and triangles.** Counted by wrapping the `draw*` calls of WebGL2. `renderer.info` and a scene census were read through the `__THREE_DEVTOOLS__` hook.
- **Timings.**
  - GPU time comes from `EXT_disjoint_timer_query_webgl2`, one query per drawn frame.
  - CPU time is the rAF callback.
  - Idle fps is the number of frames drawn in 2 s with no input.
  - Load time was profiled with CDP `Profiler`.
- **Run length.** About 6 minutes of headless time in total. No chain reads were needed.

### Per-hole numbers (median; the p95 is in brackets where it differs)

| hole | Classic calls / k-tris | Far | Third | GPU ms (C/F/T) | CPU ms | idle fps |
|---|---|---|---|---|---|---|
| town18 | 46 / 191 | 71 / 197 | 47 (68) / 190 | 1.35 / 1.56 / 1.27 | 0.6–0.7 | **60** |
| mountain10 | 59 / 91 | 85 / 95 | 64 (80) / 90 | 0.80 / 0.84 / 0.88 | 0.4–0.5 | **60** |
| island7 | 50 / 148 | 75 / 153 | 38 (43) / 146 | 0.98 / 1.08 / 0.87 | 0.5 | 20 (Third: 32) |
| hole20 (garden) | 51 / 108 | 90 / 111 | 73 (87) / 110 | 1.10 / 1.12 / 1.07 | 0.4–0.5 | **60** |
| hole1 (reference) | 23 / 91 | 34 / 91 | 33 / 91 | 1.02 / 0.97 / 1.08 | 0.3–0.4 | 20 |
| hole1 + `weather=rain+fog+storm+wind` | 29 / 96 | – | 40 / 97 | 1.29 / – / 1.32 | 0.5 | 30 |
| town18, phone (390×844, DPR 3 → 1) | 53 / 192 | – | – | 0.75 | 0.7 | 60 |

### Other results

- **Hole switches.** Measured in one page: town18 → mountain10 → island7 → hole20 → town18, with GC forced after each.
  - Geometries: 68 / 65 / 58 / 68 / 68.
  - Textures: 7 / 6 / 6 / 10 / 8.
  - Programs: 27 / 49 / 49 / 48 / 45.
  - JS heap: 102 / 85 / 97 / 93 / 109 MB.
  - **There is no leak.** The disposal work from the older review holds.
- **Load.** A `__g.load()` including the chain fetch takes 126–287 ms. Profiled, the town18 build breaks down as follows:
  - `buildHole` takes 203 ms, of which `bake` is 97 ms (mostly `clone`, `toNonIndexed` and `applyMatrix4`).
  - `decor` (town) takes 44 ms, `groundMesh` 19 ms, `wallPieces` 14 ms and `roughScenery` 14 ms.
  - On the first load, long tasks reach 216–225 ms.

**The big picture.** On this Mac a frame costs about 1–1.6 ms of GPU and under 1 ms of CPU. What heats the laptop is not the cost of a frame. It is **how many frames are drawn**: three of the four heavy holes draw at the full display rate while the player does nothing. Next come main-thread stalls (shader recompiles and bakes), then vertex load on phones.

---

## HIGH

### H1. Holes with timed pieces never go idle: they draw at the full display rate forever
- **Where:** `web/lib/engine.js:717`. The `busy` test ends with `|| everyOf() > 0`.
- **What is wrong:** any hole with a timed wall, post or zone is "busy" all the time, so the 30/20 fps idle cap (`:711`) never applies. The pieces glide only during the `EASE` part of each substep (`course.js` `timedPieces`, `EASE = 0.3`), and the clock runs at 3.5 substeps a second.
- **Impact (measured):**
  - town18, mountain10 and hole20 idle at **60 fps**. hole1 and island7 idle at **20 fps**. That is 3× the frames at rest.
  - On the laptop's 120 Hz ProMotion screen it is **120 fps, 6×**.
  - 20 of the 74 hole realms have timed pieces.
- **Fix:** take `everyOf() > 0` out of `busy` and let timed holes use `IDLE_MS` (30 fps), which is plenty for a 0.3-substep glide. If glides look choppy, count the hole as busy only while a piece is gliding, that is while `frac(clock)` is within `EASE` of a boundary.
- **Effort:** XS (one line).

### H2. Busy frames are not capped: 120 fps on a 120 Hz display
- **Where:** `web/lib/engine.js:717-719`. The throttle only runs when `!busy`.
- **What is wrong:** aiming, the replay, camera easing and confetti draw on every rAF tick. On ProMotion MacBooks and 120 Hz phones that is 120 fps.
- **Impact (estimated):** twice the GPU and CPU work during play, with no visible gain for a toon-shaded putting game. Headless Chrome runs at 60 Hz, so this was not measured directly.
- **Fix:** cap busy frames at 60 fps as well: `if (now - last < (busy ? 1000 / 60 : …) - 2) return;`. The `-2` keeps 60 Hz displays at their full rate.
- **Effort:** XS.

### H3. Fog and the lightning light change the shader programs: 200–300 ms stalls when the weather turns
- **Where:**
  - `web/lib/scene/weather.js:271-278`: `setFog` sets `scene.fog = new THREE.Fog(…)` and resets it to `null`.
  - `weather.js:234-235`: the bolt `HemisphereLight` lives inside `group`, which is hidden when there is no weather (`:306`).
- **What is wrong:** fog on or off, and the hemisphere-light count, are both part of three's program key. Each change recompiles every lit and fogged material in the scene, synchronously, on the next frame. `renderer.compile` at load (`engine.js:865`) only covers the weather of that moment. `freshWeather()` (`engine.js:918`, called at `:990`) and a stroke's extras (`applyWeather(ex.zones)`) can switch either one in the middle of a session.
- **Impact (measured):**
  - Fog switched on: 16 new programs and a **317 ms** frame (town18); 22 programs and **219 ms** (island7).
  - Weather group shown, which adds the bolt light: 12 new programs and **36 ms** (island7).
  - On a phone, expect over 1 s.
- **Fix:**
  - Keep a `Fog` on the scene at all times. For "no fog", push it out of reach (for example near 1e5, far 1e6) and move `near`/`far` in `view()`.
  - Add the bolt light to the scene itself, outside the toggled group, so the light count never changes. Or drop it and add the flash to `scene.userData.lights.sky.intensity`.
- **Effort:** XS–S.

## MEDIUM

### M1. The bake leaves thousands of empty groups that are walked every frame
- **Where:** `web/lib/scene/course.js:1312`. The code runs `for (const o of taken) o.parent.remove(o)`, which removes the meshes but keeps their (now empty) parent groups.
- **Impact (measured):**
  - town18 has 1909 objects: 1777 are empty groups and 68 draw.
  - island7 has 673 empty groups out of 825 objects.
  - `scene.updateMatrixWorld()` costs 0.18 ms out of the 0.27 ms of `renderer.render` on town18, about 65% of the render CPU. The projection pass also walks these groups.
  - Estimate: about 1 ms a frame on a mid phone.
- **Fix:**
  - After `bake(root)`, prune the empty groups bottom-up: remove any non-live group with no children.
  - Set `matrixAutoUpdate = false` on what remains static; baked meshes are already in course space.
- **Effort:** S.

### M2. Merged meshes cover the whole island, so frustum culling never helps
- **Where:** `web/lib/scene/course.js:1273-1345`. `bake` makes one mesh per material signature for the whole course.
- **What is wrong:** the largest meshes have bounding radii of 73–112 units (the census `bigs`: 196k vertices for town18's toon mesh at r = 78). All of them are always inside the frustum. Third (FOV 58, `far` 80, `engine.js:399`) draws the same 190k triangles as the whole-course Far view.
- **Impact (estimated):** cutting the merge into tiles would draw 30–50% fewer triangles in Third and about 20% fewer in the Classic follow view, for a few more draw calls on the largest buckets only.
- **Fix:** in `bake`, add a coarse tile to the bucket key, for example a 3×3 grid over `islandBox`, chosen from each piece's world-space centre. At minimum, split "board" from "decor outside the board". Limit this to buckets over about 10k vertices.
- **Effort:** M.

### M3. The ink hull doubles the vertex work (28–35% of all triangles)
- **Where:** `web/lib/scene/materials.js:62-83` (`pushHull`, `hullOf`) and `drawn()` (`:193`). Every inked solid is drawn again as a back-face hull.
- **Impact (measured):** hull and swaying-hull triangles make up the following share of what draws:

  | hole | hull k-tris | total k-tris | share |
  |---|---|---|---|
  | town18 | 62 | 189 | 33% |
  | island7 | 51 | 145 | 35% |
  | hole20 | 32 | 106 | 30% |
  | mountain10 | 25 | 89 | 28% |

  The hull shader is cheap, so this costs vertex throughput. That matters on phone GPUs, not on this Mac.
- **Fix:** a hull level of detail. In `bake`, drop hull pieces whose world position is more than N units from the board rectangle; they are about a pixel wide there. The far hills already skip ink (`garden.js` `puffs(far, false)`). Make it a tunable, and use the phone tier from M7 to widen it.
- **Effort:** M.

### M4. The hole build, bake and shader compile block the main thread
- **Where:**
  - `web/lib/scene/course.js:1301-1330`: per piece, `geometry.clone()` then `applyMatrix4`, then a colour array, then `toNonIndexed` for mixed buckets, then `mergeGeometries`, which copies everything again.
  - `web/lib/engine.js:865`: the synchronous `renderer.compile`.
- **Impact (measured):** town18 `buildHole` takes 203 ms, of which `bake` is 97 ms. First-load long tasks reach 216–225 ms. A session reaches 45–49 programs, 21–25 of them `MeshBasicMaterial` variants, so first visits compile more. Estimate: 0.8–1.2 s freeze on a mid phone.
- **Fix:**
  - Two passes in `bake`: first count the vertices and indices per bucket, then write each piece's transformed position, normal, colour and `swayFoot` straight into preallocated typed arrays. Drop the `clone` and the double copy, and index the non-indexed pieces yourself instead of calling `toNonIndexed` on the whole bucket.
  - Replace `renderer.compile(scene, camera)` with `await renderer.compileAsync(scene, camera)` (available in r169), which uses `KHR_parallel_shader_compile`.
- **Effort:** M.

### M5. Chimney smoke costs 4 transparent draw calls and 4 materials per chimney (older item 11, still open)
- **Where:** `web/lib/scene/props.js:412-425`, which makes a new `MeshBasicMaterial` per puff because each puff has its own opacity. It is used by `props.js:190`, `pieces.js:655` and `mountain.js:443`.
- **Impact (measured):** hole20 draws 16 puff meshes, about a third of its 51 Classic draw calls. mountain10 draws 4. They are also sorted and blended every frame.
- **Fix:** one `THREE.Points` (or one `InstancedMesh`) for every puff of a hole, collected in `state` the way `town.js:938-948` already merges the lantern glows, with per-point alpha through a 4-component `color` attribute (`vertexColors`). That is 16 draws down to 1.
- **Effort:** S.

### M6. When a hole has wear, a full-board transparent plane is drawn every frame (older item 19, partly fixed)
- **Where:** `web/lib/scene/course.js:1223-1250`, which builds `PlaneGeometry(W, H, W * 2, H * 2)` draped over the ground, with `transparent`, opacity 0.55, and `live`, so it is never baked.
- **What is wrong:** the plane is now hidden on a pristine green (`:1244`). With any wear at all, though, it is one extra blended layer over the whole lane, and the texture is painted only once per build.
- **Impact (estimated):** 24.6k triangles on a 70×44 board (town18, +13%), plus one full-lane blend per frame. Not seen locally, because the local chain has no wear.
- **Fix:** wear is static for a load. Write it into `groundMesh`'s per-cell vertex colours: mix `C.wear` in by the cell's counter. That removes the mesh, the canvas and the texture.
- **Effort:** S–M.

### M7. Phones have no way to degrade
- **Where:**
  - `web/lib/scene/camera.js:6`: `maxDpr` is 1 for a coarse pointer.
  - `web/lib/engine.js:159-172`: the slow-frame probe can only lower `dprCap` to 1.
- **What is wrong:** on a phone the probe cannot do anything, because the pixel ratio is already 1. MSAA, hulls, all decor, 190k triangles and the 20/30/60 fps rates are the same on every device. The phone run measured 53 draws and 192k triangles on town18, the same as the desktop.
- **Fix:** a second tier for when the median frame is still over 20 ms at a pixel ratio of 1:
  - a pixel ratio of 0.8;
  - busy frames capped at 30;
  - the hull and decor distance cut from M3.

  Record the tier in `localStorage` so the next visit starts with it.
- **Effort:** S–M.

## LOW

### L1. Confetti: 70 meshes, so 70 extra draw calls at the moment of holing out
- **Where:** `web/lib/scene/fx.js:74-86`. The geometries and materials are shared, but there is one `Mesh` each. `makeSplash` (`:31-50`) adds 13 more draws.
- **Impact (estimated):** 70 extra draw calls for 3.6 s on top of 50–90 draws, while the camera is also easing.
- **Fix:** two `InstancedMesh` (hats and petals) with `instanceColor`, written in `step()`.
- **Effort:** S.

### L2. Transparent meshes are still drawn at opacity 0
- **Where:**
  - `web/lib/scene/island.js:148-150` and `:178-189`: the three foam crests (2.2k triangles each) and the swash reach opacity 0 on every wave cycle.
  - `web/lib/scene/mountain.js:1023` and `:1075`: 12 spark sprites at `sin^6` opacity, near 0 most of the time.
  - `web/lib/scene/weather.js`: the gust lines are handled already.
- **Impact (measured):** one crest was captured at `o0.00` in the census (island7). A dozen or more blended draws cost nothing visible.
- **Fix:** add `m.visible = m.material.opacity > 0.01` in the same `animate` callbacks.
- **Effort:** XS.

### L3. Weather overdraw
- **Where:** `web/lib/scene/weather.js:176-184`, 16 fog banks and 10 storm clouds as camera-facing blended planes.
- **Impact (measured):** full storm, rain, fog and wind together raise GPU time from 1.02 to 1.29 ms (+26%) and add 6–7 draws; the hole idles at 30 fps instead of 20. In Third view the low banks (y 0.6–2.2) come close to the lens and fill the screen.
- **Fix:** fade each bank by its distance to the camera, and hide it within about 4 units. Alternatively, use fewer and larger banks in Third.
- **Effort:** S.

### L4. Garden giants use their own fade and stay transparent; the motes are baked still
- **Where:**
  - `web/lib/scene/garden.js:437`, `:466` and `:484-491`: the head and petal materials are `transparent: true` at all times, so they are always sorted and blended, even at opacity 1. This is older item 28, still open for the garden.
  - `garden.js:537-543`: the 24 pollen motes are not marked `live`, so `bake` merges them where they stand, and the `animate` callback moves meshes that are no longer in the scene.
- **Fix:**
  - Use `fadeable`, `setFade` and `fadeLoop` from `materials.js`, which switch transparency on only below 0.99.
  - Mark the motes group `live`, or delete their animation.
- **Effort:** XS.

### L5. Per-frame allocations that remain (older items 34 and 55)
- **Where:**
  - `web/lib/scene/garden.js:196`: `curve.getPoint(u)` and `curve.getTangent(u)` allocate two `Vector3` per foam fleck per frame.
  - `web/lib/engine.js:1671`, `:1725`, `:1729` and `:1808`: `tube.getPoint` and `tube.getPointAt` allocate every frame during a tube ride.
  - Everything else checked (weather, cause, camera, aim, the mountain lifts) now writes into scratch objects.
- **Fix:** pass target vectors: `curve.getPoint(u, _p)` and `tube.getPointAt(u, ball.position)`.
- **Effort:** XS.

### L6. Program-cache and bake keys are built from `extra.length`
- **Where:** `web/lib/scene/materials.js:71` (`"hull" + w + extra.length`) and `:133` (`"sway" + extra.length`). Both are also used as `userData.hook`, which is the bake bucket key.
- **What is wrong:** two different vertex snippets of the same length would share one program and one merged mesh, and the second would silently draw with the first one's shader. There is no collision today (the extras are 0 and 33 characters long). It is a trap for the next hook.
- **Fix:** key on the string itself: `"sway" + extra`.
- **Effort:** XS.

### L7. The idle 20 fps never ends
- **Where:** `web/lib/engine.js:711-719`.
- **What is wrong:** a calm hole with nobody at the keyboard still draws 20 full frames a second for the sway. That is about 20–27 ms of GPU per second here, and far more on a phone. Third view on island7 idled at 32 fps, because `settled` never becomes true there.
- **Fix:** after about 20 s with no input, drop to 10 fps or less, or stop drawing until the next pointer or key event.
- **Effort:** XS. It is a design call, since the garden would stop breathing.

## Checked and fine
- **Raycasts.** No per-frame raycasts. The camera's sight test is analytic (`occluded`, `lineClear`, `engine.js:515-560`), run every 2nd, 3rd or 10th frame. The only `Raycaster` use is the ray-plane test on the pointer, plus the `?camlog` probes.
- **Shadows and lights.** No shadow maps. There are 2 lights, plus the bolt (see H3).
- **Renderer setup.** `powerPreference: "low-power"`, no stencil, a pixel ratio of 1.25 on desktop and 1 on phones.
- **Materials and shaders.** The sway and hull `onBeforeCompile` hooks share 1–2 programs each (`toon|sway0`, `basic|sway33`, `basic|hull0.055`). The island's sea swell now uses uniforms (a single `swell` program).
- **Disposal.** Clean across hole switches (see above). `SNOW_2SIDE` (`mountain.js:30`) is not `share()`d at module level but is wrapped at every use (`:1805`, `:1925`), so it is fine.
- **Weather updates.** Fill buffers by index and skip hidden batches (older items 13, 14 and 15 are fixed).

## Status of the older review (`docs/reviews/js-review.md`), performance items only

| # | status |
|---|---|
| 4, 5, 6, 7, 9, 10, 12, 13, 14, 15, 16, 17, 20, 21, 22, 27, 29, 40, 41, 42, 43, 50, 53 | fixed |
| 11 chimney smoke | partly: the geometry is shared, but there are still 4 materials and 4 draws per chimney (M5) |
| 18 `blob` texture duplicates `glowTex` | open (minor; `blob` is also not sRGB) |
| 19 wear overlay | partly: hidden when pristine, otherwise a full-board blended plane (M6) |
| 28 fades and transparency | fixed in town, island and mountain; open for the garden giants (L4) |
| 34 / 55 per-frame allocations | mostly fixed; garden foam and the tube ride remain (L5) |
| 44 powerPreference | changed to `"low-power"` |
| 62 `onChange: setS` re-renders all of Golf.jsx on every publish | open (`components/Golf.jsx:198`, no `memo`); publish is now throttled to power-bar steps (53) |

## Top 5 by impact per effort

1. **H1:** timed holes idle at 30 fps, not 60/120. One line; about 3–6× fewer frames at rest on 27% of holes.
2. **H2:** cap busy frames at 60 fps. One line; halves the work during play on 120 Hz screens.
3. **H3:** a constant fog and light setup. A few lines; removes 200–300 ms stalls (desktop) when the weather turns.
4. **M1:** prune the empty groups after the bake. A small change; about 65% of the `renderer.render` CPU on town18, more on phones.
5. **M5:** all chimney smoke in one draw. A small change; up to 16 draws down to 1 (a third of hole20's calls).
