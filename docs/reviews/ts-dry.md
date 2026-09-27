# Web client: DRY and code health (strict TS, 8ff9be6)

Scope: `web/lib`, `web/components`, `web/app`, the built `out/` from the clean
checkout (its `lib/` and `components/` are byte-identical to the working tree),
and the realm constants in `gno.land/r/gnogolf/golf/*.gno` and
`gno.land/p/gnogolf/course`. This is a read-only review: no code was changed.

The items are ranked by payoff, which here means correctness risk removed, then
lines removed, then bytes saved. Every merge below stays inside shared modules
(`terrain.ts`, `materials.ts`, `pieces.ts`, `chain.ts`, `engine/*`). None of them
makes one world import another.

---

## 1. The chain's rules are copied into the client with no drift check. All but one agree today.

| Rule | Realm | Client copies | Status |
|---|---|---|---|
| Shots per commit | `golf.gno:44` `maxShots = 12` | `adena.ts:199` `MAX_LIST = 12` | agrees |
| Strokes per round | `golf.gno:801` `maxRoundStrokes = 60` | `engine.ts:60` `MAX_SHOTS = 60` (the name is wrong: it holds maxRoundStrokes, not maxShots) | agrees |
| Work model | `golf.gno:607-611` 1.4e9 / 10e6 / 150e3 / 1.2e6 / 15e3; `add()` at `:660` | `adena.ts:198-200` `WORK`, `workOf` | agrees, same formula |
| `next()` cut rule | `golf.gno:653-656` (played > 0 && spent+most > budget) | `adena.ts:213` | agrees |
| Weather period | `weather.gno:18` `PeriodSeconds = 5*60`; accepts p or p-1 (`weather.gno:61`, `golf.gno:719`) | `engine.ts:628` `PERIOD_MS = 300e3`, `Golf.tsx:171` `PERIOD_MS = 300*1000`, `saveBy` `(p+2)*PERIOD` at `Golf.tsx:173` | agrees; two copies |
| Max power | `golf.gno` `maxPower = 10.0` | `engine/aim.ts:13` `MAX_POWER`, `chain.ts:379` default `maxPower = 10`, `aim.ts:59` a literal `10` twice in `proPower` | agrees; three copies |
| Par | `course.gno:69` 1..19, else 3; `data.gno:245` | `card.ts:12` `parOf` defaults to 3 | agrees (no upper bound needed: the chain always sends par) |
| Gas ceiling | comment at `golf.gno:600-606`: Adena simulates at 2e9 | `adena.ts:231` `MAX_GAS = 1.9e9` | agrees |
| Forecast gas | `golf.gno:602-603`: "up to 0.17e9 measured, in the rain on the lane holes" | `adena.ts:233` `FORECAST = { rain: 100e6, storm: 150e6 }`; comment at `:222-224` says rain ~90M | **drift**: the two measurements disagree |

The forecast figure matters for the gnokey path only. `gnokeyPlan` passes
`-gas-wanted` straight from `gasOf` (`adena.ts:372`). Adena re-simulates and sets
its own fee. The shot work model over-asks by 1.2x to 1.6x, so a rain commit
probably still fits. But one of the two comments is stale. Re-measure one rain
lane hole and fix whichever figure is wrong.

**Merge:**
- Put one `export const RULES = { maxShots: 12, maxRoundStrokes: 60, periodMs: 300e3, maxPower: 10, work: {...} }` in `chain.ts`. It already owns `period()`, and nothing it imports would form a cycle.
- `adena.ts`, `engine.ts`, `engine/aim.ts` and `Golf.tsx` import it.
- Rename `engine.ts:60` to `maxRoundStrokes`.
- Add one runnable check, a `selfcheck` npm script. Node 22.12, installed here, already runs these files with `--experimental-strip-types`, and I ran it: `demoSplit()` and `demoCard()` both return "ok". The check regex-reads `golf.gno` and `weather.gno` for the constants above and asserts they equal `RULES`.

**Risk:** low. It only renames constants and moves them. Without the check,
the next change to the realm drifts silently: the client's split then sends a
commit the chain refuses.

## 2. The title's timed pieces run about 14x faster than the game's

- The game advances its clock at `engine.ts:384`: `clock += elapsed * (reduced ? 1.5 : 3.5)`, which is 3.5 ticks a second.
- The title sets `STEP_MS = 72 / 3.5` at `scene/title.ts:28` and computes `clock = now / STEP_MS` at `:246`. That is 1000 × 3.5 / 72, about 48.6 ticks a second.
- The comment on that line says "at the game's idle pace (engine: 3.5 substeps a second)". The math does not match it.

**Fix:**
- Export `IDLE_TICKS_PER_S = 3.5` (and the reduced-motion 1.5) from `engine/replay.ts`, next to `MS_PER_STEP`.
- Use it at `engine.ts:384`, and set `STEP_MS = 1000 / IDLE_TICKS_PER_S` in the title.

**Risk:** this is visible. The mill's sails and the tram on the title slow down
to the in-game pace. If the fast spin was tuned by eye, keep it and correct the
comment instead. Either way, one of the two is wrong now.

## 3. Hand-built BufferGeometry: 8 grid heightfields and 35 attribute blocks

This pattern is copied in 8 places: fill `pos`/`col` over an `(nx+1)×(nz+1)` grid,
emit quads `idx.push(a, d, b, b, d, e)` behind a keep test, then build the geometry.
- `course.ts:576`, `garden.ts:934`, `island.ts:292`
- `mountain.ts:133`, `:818`, `:1529`, `:1660`, `:1767`

On top of that, the five-line tail (`new BufferGeometry`, `position`, `color`,
`setIndex`, `computeVertexNormals`) appears 35 times: course 6, garden 3,
island 6, mountain 17, zones 2, weather 1.

**Merge:** add two helpers to `materials.ts`, next to `drape`:
- `geoOf(pos, idx, col?)`, which builds the geometry and computes the normals. This covers all 35 sites.
- `gridGeo(nx, nz, vert(i, j, out) → void, keepQuad?(a, b, d, e, i, j) → boolean)`, built on `geoOf`. This covers the 8 grids.

This removes about 150 lines. Each world keeps its own height and colour
functions, so no world depends on another.

**Risk:** low. The winding (a, d, b / b, d, e) is the same at every site. Check
with the existing probe: the course fingerprint (`engine/probes.ts:140`, vertex
sums per top-level piece) on one hole per world, before and after.

## 4. The dev hooks ship in production and are gated only at runtime

What is in the built `out/`:

| Hook | In the bundle? | Gate |
|---|---|---|
| `?titlebake` / `window.__titleStill` (`Title.tsx:312`) | **no, tree-shaken** (`NODE_ENV` check) | build time |
| `?promo` / `window.__promo` (`lib/promo.ts`, 483 lines) | yes, chunk 144 | runtime: `promo.ts:80`. In production it runs only when the URL has both `?promo` and `?camlog` |
| probes (`engine/probes.ts`, 191 lines: `fakeWin`, `ballLift`…) | yes, chunk 144 | runtime: `engine.ts:1310` |
| `window.__g` (`Golf.tsx:449`) | yes | runtime `?camlog` |
| `window.__title`, `__titleFilm` (`Title.tsx:283`) | yes | runtime `?camlog` |
| `window.__soundLog` (`feel.ts:175-176`) | yes, page chunk | runtime `?camlog` |
| `?shot/?play/?demo/?weather/?world` (`Golf.tsx:71-73`) | yes | honoured in production whenever `?camlog` is present |

This is not a security problem. The chain re-simulates every shot and Adena
signs every save. So `?camlog&weather=storm` changes only what the player sees.

The cost is bytes. `promo.ts` and `probes.ts` together are about 10 KB of the
60 KB (gzip) gameplay chunk, and every player downloads them.

**Fix:**
- In `Golf.tsx`, when the URL has `?promo`, run `await import("@/lib/promo")` before `createGame`. The engine then reads a `promo` stub (`{ on: false, camera() {}, attach() {} }`) unless the module has registered itself.
- In `engine.ts:1310`, load the probes with `import("./engine/probes")` and have the API expose `ready: Promise`.

**Risk:** medium.
- `promo.install()` patches `requestAnimationFrame` and `setTimeout` at module load, so it must finish before the engine's first frame. That is why it has to be awaited before `createGame`.
- The scripts in `media/camera/*.mjs` that read `window.__g.camLog` straight after load must wait for `ready`.
- Skip this item if 10 KB does not matter to you. Everything is correctly gated today.

## 5. Stale comments left by the JS → TS migration (mechanical, zero risk)

**71 references to `.js`/`.jsx` files that no longer exist**, in 19 files, for example:
- `engine.ts:8-10,136,139,538`
- `scene/island.ts` ×16, `scene/town.ts` ×10, `scene/props.ts` ×8, `scene/mountain.ts` ×7
- `engine/probes.ts:3` ("Golf.jsx"), `course.ts:128` ("web/lib/promo.js")
- `app/globals.css:11,1969` ("components/ui.jsx")
- `adena.ts:393` "node lib/adena.js's demoSplit()", a command that no longer runs

One sed pass fixes all of them: `\b(\w+)\.jsx?\b` → `.ts`/`.tsx`. Skip the
`three/examples/...js` imports and the `.mjs` tools.

**Doc comments cut off from their function.** The migration placed a type
between a JSDoc and the function it documents. Move the type above the comment
at each of these:

| File:line | Detached doc belongs to |
|---|---|
| `chain.ts:328-336` | Two docs stacked above `safeEndpoint`: the first belongs to `shotOf` (`:388`), the second to `pullShot` (`:379`) |
| `chase.ts:5` | `behind()`, not the `Chase` interface |
| `adena.ts:326-332` | `gnokeyPlan`, not `SaveRound`; the comment at `:221-228` mixes the gas note with `feeFor` |
| `card.ts:135-136`, `:150-153` | `cupTotals`, `Unlock`: two docs stacked each time |
| `course.ts:790-799` | `tramLines` (`:829`), not `Tram` |
| `materials.ts:353-358` | `fadeLoop`, not `FadeItem` |
| `bake.ts:224-231` | `weatherLooks`, not `look` |
| `mountain.ts:1876-1880` | `liftTrain`, not `LiftPlan` |
| `mountain.ts:406-407` | Two docs for `chalet`; the first is out of date |
| `mountain.ts:32-36` | Three comments whose order no longer matches `DRIFT_OPAQUE`, `SNOW_2SIDE`, `SNOW` below them |
| `Title.tsx:26-27` | "What the gnomes are up to" appears twice |

**The self-checks never run.** `demoSplit` (`adena.ts:394`), `demoCard`
(`card.ts:178`) and `demoThird` (`engine/aim.ts:32`) are tree-shaken, and no
script calls them.
- They use `console.assert`, which only logs, and then return "ok" whatever happened.
- **Fix:** make them throw, and wire them into the `selfcheck` script from item 1. `adena.ts` and `card.ts` run under Node type-stripping as they are. `aim.ts` pulls in three, so leave it out or delete it.

## 6. Small geometry helpers that belong in `terrain.ts`

| What | Where | Merge | Risk |
|---|---|---|---|
| Nearest point on a polygon's edge (the `closest()` loop over `P[k], P[(k+1)%n]`) | `course.ts:338-343`, `engine/replay.ts:181-186` | `nearestOnPoly(x, z, poly)` in `terrain.ts` | none |
| A zone's centre and half-sizes, computed inline | 19 sites: `zones.ts:90-91,101,173,190,383,427,466,532,546,759,828`, `town.ts:1203-1204,1233`, `mountain.ts:1296`, `replay.ts:199,204` | `boxOf(z) → { cx, cz, hx, hz, w, h }` | none |
| Ellipse test `hypot((x-cx)/hx, (y-cy)/hy)` | `terrain.ts` (`inZone`, `inset`), `zones.ts:532`, `replay.ts:205`, `mountain.ts:1512` | `ellipseR(q, x, y)` beside `inZone` | none |
| `smoothstep` re-typed | `scene/title.ts:86`, `promo.ts:440` | import `terrain.smoothstep` | none (their inputs are already clamped) |
| `nearWall` re-implements `wallDist` | `mountain.ts:1111` | `wallDist(x, z, s.walls) < r + 0.6` | none |
| `angDiff` twice | `engine/aim.ts:24`, `engine/camera.ts:112` | export from `aim.ts`, or move to `terrain.ts` with `mod` | none |
| **Gap depth `-7` hard-coded 4 times** | `course.ts:241` `CREVASSE_Y`, `zones.ts:292` `D`, `mountain.ts:1640` `D`, `mountain.ts:1744` `CLIFF_Y` | `export const GAP_Y = -7` in `worlds.ts`, next to `DECK` | none. These values must agree: the ground mesh's gap sides (`course.ts:420`) have to meet the crevasse walls drawn in zones and mountain |
| Sea level `GRASS - 0.9` twice | `island.ts:54` `SEA`, `worlds.ts:104` `gapWater` fallback | keep both, but say in the comment that they are equal on purpose, or derive one from the other | none |

## 7. Shared scene builders (without coupling the worlds)

- **`edging(box, seed)` reconstructs the board from the box.** Four sites compute `box.max.x - ISLAND.x, box.max.z - ISLAND.front`: `island.ts:210`, `town.ts:142`, `mountain.ts:253`, `mountain.ts:371`. Yet the only caller, `course.ts:49`, already has `s`.
  - **Fix:** change `World.edging` to `(s, box)` in `worlds.ts:52`, all four worlds and `course.ts:49`.
  - **Risk:** low. The random seeds stay the same, because `seed` is `s.hole`.
- **`doorway(out)` is written twice with the same shape.** `town.ts:967` and `mountain.ts:1584` differ only in scale (0.75 vs 0.62), the wood colours, and mountain's snow slab.
  - **Merge:** move one `doorway(out, r, wood, woodDark)` into `pieces.ts`, next to `MOUTHS`. Mountain adds its slab after the call.
  - **Risk:** low; check it with the fingerprint probe.
- **Three names for `bake(g, { local: true })`:** `island.ts:1001` `mergedMover` (which also sets `live`), `mountain.ts:44` `compact`, `town.ts:480` `mergeLive`.
  - **Fix:** export one `bakeLocal` from `bake.ts`. Island keeps its one-line `live` wrapper.
- **The polygon-offset "lies on top" material, rebuilt six ways.** Island names it `onTop` (`island.ts:28`). The same pattern appears at `course.ts:1456`, `town.ts:1199`, `town.ts:1214`, `garden.ts:145`, `garden.ts:148`, `props.ts:225-226`.
  - **Merge:** move `onTop(mat, k, units = 4)` to `materials.ts`. The props and garden sites use units = 2k, so the parameter keeps them exact.
  - **Merge:** move island's `dside`/`flatTop` caches (`island.ts:29-43`) there too, as `flat2(color)`. There are 18 `flat(c, { side: DoubleSide })` sites. The bake already groups materials by signature (`bake.ts:55-62`), so this does not change draw calls. It leaves one code path instead of an island-only one.
  - **Risk:** none.
- **Decor frame arithmetic.** `X0/X1/Z0/Z1 = ±ISLAND.* ∓ 0.8` is written out at `garden.ts:679-680`, `mountain.ts:1105-1106` and `town.ts:796-797`.
  - **Merge:** a `plotOf(s)` in `common.ts`. The payoff is low.
  - **Do not** unify the `onBoard` margins (1.2 on the island, 0.8 on the mountain, 1.9 in town). They are tuned per world.

**Not recommended — the lane-piece drawings in `pieces.ts` that a world already overrides:**
- Island's `piece()` overrides `palm, coral, outcrop, buoy, crab, driftwood` (posts) and `driftwood` (bar).
- Town's `piece()` overrides `lamp, house, clock, gnome statue, roundabout, chimney` (posts) and `tram, clock hand, stall, awning` (bars).
- Their `POSTS`/`BARS` versions in `pieces.ts:390-400,535` are reached only when a hole of *another* world uses that skin. GG1 skins are free strings (`course/data.gno:18,38`), so community holes can do this.
- Merging would either pull island and town into the main bundle, or change how existing community holes look.
- **Suggestion:** say in the `pieces.ts` header that these are the cross-world fallbacks, on purpose. That costs one line instead of about 3 KB gz in the main scene chunk.

## 8. Small duplicates outside the scene

| What | Where | Merge |
|---|---|---|
| The list of hot snapshot fields, which must be the same on both sides | `engine.ts:147` `HOT`, `Golf.tsx:106` `HOT` | export `HOT` from `engine/types.ts` |
| Error to text | `engine.ts:56` `errText`, `Golf.tsx:50` `messageOf`, `adena.ts:257` inline | one `errText` in `chain.ts`, next to `errorKind` |
| Two address shorteners | `Golf.tsx:239` `short` (4…3), `:241` `shortAddr` (8…4) | keep one |
| The cup list, three times | `card.ts:132` `CUPS`, `Title.tsx:169` `SCENES`, `Worlds.tsx:14` `WORLDS` ids | export `CUPS` from `card.ts`. It has no three.js import, so `Title.tsx` stays free of three |
| GPU sniffing, copy-pasted | `engine.ts:247-255`, `scene/title.ts:192-199` (with a comment "kept apart") | `weakGpu(renderer)` in `scene/camera.ts`, next to `makeRenderer`, which both files already import |
| Reduced-motion test | `engine.ts:654` `reduced` duplicates `motion` from `materials.ts:106`, which `engine.ts` already imports | `const reduced = !motion` |
| Weather skin list | `engine.ts:84` is a literal copy of `WEATHER_SKINS` (`scene/weather.ts:22`) | import it |
| Gnome head height `0.7` | `engine/camera.ts:476`, `engine/probes.ts:41` ("the same test the camera uses") | export it with the camera |
| URL building for `vm/qeval`, three times, and the `("…" string)` unwrap twice | `chain.ts:141-142`, `149-150`, `291` | one `vmQuery(realm, expr)` |

## 9. Dead code

- `easeRig` (`scene/camera.ts:215-221`) has no callers. Delete it.
- The `|| 60` default path length in `workOf` (`adena.ts:200`) is never used. `g.pts` is filled in step with `g.shots` (`engine.ts:694,987-988`). Drop the default, or make it `maxPath = 512` from the realm (`golf.gno:802`) so the estimate stays safe.
- Exports that nothing imports, so the `export` keyword can go:
  - `adena`: `Work`, `commitsOf`, `SaveRound`; `card`: `CardHole`, `migrate`; `chain`: `REALM`, `ChainError`
  - `aim`: `DEAD`; `camera`: `isPortrait`; `course`: `Tram`, `TramLine`, `tramLines`, `tramAt`
  - `data`: `ObjData`, `MatData`, `CourseData`; `fx`: `Splash`; `island`: `BLOWHOLE_MOUTH`; `materials`: `pushHull`, `fadeHull`
  - `pieces`: `PostFn`, `BarFn`; `terrain`: `Seg`, `edgesOf`; `types`: `RoundRow`
  - `Golf.tsx`: `loadFriends`, `saveFriends`, `addFriend`; `ui.tsx`: `CloseX`
  - This is harmless, because webpack drops them. Remove them only if you want the public surface to say what is really shared.
- `SOON = true` (`Golf.tsx:1670`) is a launch toggle, not dead code. Leave it.
- No `console.log`, `debugger`, `TODO` or `if (false)` anywhere in `lib/`, `components/` or `app/`.

## 10. Bundle weight

Measured in `out/_next/static/chunks`:

| Chunk | Raw | Gzip | What it is | When it loads |
|---|---|---|---|---|
| `5845de39` | 550 KB | 135 KB | three.js | with the game or the title scene (lazy) |
| `framework` | 219 KB | 69 KB | React | first paint |
| `144` | 169 KB | 60 KB | `Golf.tsx` 23 KB, `engine/camera` 8, `promo` 8, `engine` 7, `replay` 5.5, `chain` 4.5, `adena` 4.4, `aim` 3.5, probes about 2.5 (gzip estimated per source file) | the game |
| `529` | 164 KB | 59 KB | scene core: `course` 17, `zones` 13, `garden` 11, `pieces` 6.6, `props` 6.4, `weather` 6.3, `terrain` 4.9, `gnome` 4.2, `materials` 4.1 | the game or the title scene |
| `polyfills` | 113 KB | 40 KB | `noModule`: modern browsers never load it | – |
| `main` | 128 KB | 37 KB | Next runtime | first paint |
| `125` / `379` / `310` | 59 / 51 / 38 KB | 21 / 18 / 13 KB | mountain / island / town | on demand (`worlds.ts:66-70`), as designed |
| `870` | 17 KB | 5 KB | `scene/title.ts` and `title-holes.json` | the title |

- **three is not "imported whole".** The 28 `import * as THREE from "three"` lines use only static member access, and there is no `THREE[...]` anywhere. So webpack 5 tree-shakes them already: `AnimationMixer`, `ObjectLoader`, every loader and the audio classes are all absent from the chunk.
  - What remains is `WebGLRenderer` and its shader chunks. That is the floor for this renderer, and named imports would save nothing.
  - Moving to `three/webgpu` or another renderer is the only lever left, and it is not worth it here.
- **The first paint does not carry three.** It loads framework, main, `391` and the 26 KB page chunk.
- **Possible cuts, from largest to smallest:**
  1. Load promo and probes only on demand (item 4): about 10 KB gzip off chunk 144.
  2. The world-overridden `pieces.ts` fallbacks (item 7): about 3 KB. I do not recommend this one.
  3. Keep `garden` in the core chunk. It is the default world and the title's first scene.

## Suggested order

1. Items 5 and 6, plus the zero-risk rows of item 8: mechanical, and each can be reviewed in one sitting.
2. Item 1, with the `selfcheck` script. After this, the realm constants cannot drift silently.
3. Item 2: decide which of the title's code and comment is right.
4. Items 3 and 7, checked with the course-fingerprint probe per world.
5. Item 4, only if the 10 KB is worth reworking the capture scripts.
