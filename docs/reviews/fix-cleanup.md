# Client cleanup (PLAN F), 2026-09-25

Scope: `web/` (lib, components, app), the lint config, and the media scripts (`media/camera/*.mjs`, `media/promo/render.mjs`). The main source was `deep-code-js.md`: its delete list first, then its consolidation plan, re-derived from the current code. Nothing was committed.

## Line counts

| | before | after |
|---|---:|---:|
| `lib/engine.js` | 2620 | 1188 |
| `lib/engine/` (camera, aim, replay, probes: new) | 0 | 1418 |
| `app/globals.css` | 2123 | 2025 |
| `lib/scene/course.js` | 1538 | 1259 |
| `lib/scene/zones.js` | 1111 | 976 |
| `lib/scene/bake.js` (new) | 0 | 228 |
| the web client (`lib`, `components`, `app`: js, jsx, css) | **22376** | **21975** |
| the media scripts (camera ×3, promo/render, plus the new `media/lib/cdp.mjs`) | 456 | 467 |

Every other file moved by a few lines; the per-file table is at the end. `!important` in globals.css went from 45 to 17.

## How behaviour was held identical

Each step ended with `nice -n 20 npx eslint .` clean and a smoke run: one headless Chrome with its own profile, killed by PID. The smoke run:
- goes title → cups → picker → a hole, and replays a keyboard shot;
- then, with `?camlog`, shoots on hole1, on island7 twice (through the castle tube with `0,5`, and rolled back from its mouth with `0,3`), on town1 and on mountain5;
- then loads the dev win card (`?won`);
- and finds no console error or warning.

Three comparison harnesses, all in the scratchpad, ran against a copy of HEAD served on its own port:

- **Terrain.** The green, the rough cells (in order) and the heights on a 0.4 grid, for all 74 holes: identical.
- **The course as built.** A new `?camlog` probe, `fingerprint()`, gives each top-level piece of the course its vertex count, a vertex sum in local space, a colour sum and a transparency count.
  - It was compared on 8 to 12 holes per step, covering every world, every surface skin, the movers and the fades.
  - The only differences were ones HEAD also shows against itself: animated vertices on the mountain and the island, and fades caught mid-change.
  - One real difference showed up, on hole7's grass edge. It came from computing the segment distance as `x - (a + u·d)` instead of `x - a - u·d`, and the shared helper now uses the second form, so hole7 is identical again.
- **CSS.** Every element's computed style, in 9 states, at 4 viewports, with and without reduced motion. The states are title, cups, picker, hole, aiming, menu, leaderboard, Adena sheet and win card.
  - Before and after the CSS work, the only differences are the two intended ones: `color-scheme: light`, and the fixed dead selector.
  - Two captures of the unchanged page differ only in the forecast's "for N min" width. That is the noise floor.

## 1. Deleted

**The loop-the-loop track and its open-loop replay** (no hole uses the `loop-the-loop` skin):
- zones.js: `LOOP_R`, `loopFrame`, `loopTrack` and its `ZONE_DRAW` entry;
- course.js: `loopStrips`, `isLoop`, `loopRects`, `inLoopStrip`, the loop strips in `openings` and the loop box in the rough's `built` list;
- engine: `rideLoop`, `flewOff`, and every `userData.open` / `userData.top` branch.

island7's closed castle tube is kept. It is a `kind === "loop"` zone ridden as a tunnel, with the roll-back climb, and both of its paths ran in the smoke test.

**Self-checks** (`demo()` never ran): terrain, card, cause, and chain's `demoEndpoint` / `demoPull`, and adena's `demoSplit`.
- All six passed on HEAD. They were moved out to a scratch script that imports the modules.
- They still pass on the final code. `parOf` now takes the hole, so the card check builds holes that carry their `par`.

**Exports nobody imports:**
- `isShared`, the `hull` export;
- scene.js's 11 dead re-exports;
- garden's re-export of `seeded`, `ISLAND` and `GRASS`;
- course's `mergeByMaterial` alias;
- `export` dropped where only the file itself uses the name: `ensureNetwork`, `MAX_GAS`, `CUPS`, `refusal`, `allowedHost`, `PULL_SHARE`, `PREVIEWS`, `GAPS`, `WORLDS`, `mounds`;
- Golf.jsx's `holeLink` export and its always-empty `base` parameter.

**Dead code:**
- the two unreachable `return g` in zones;
- the `W2`/`H2` aliases in terrain;
- `dist_` and the doubled comment in the engine;
- the HUD watchdog (`told`). Publish is diff-based now, and every path that changes the aim publishes.
- the engine's own `worldOf`, replaced by card.js `cupOf` everywhere, promo included;
- Golf's `wx`, which rebuilt the engine's fake weather and dropped snow. The HUD now reads `s.weather`.
- `i0`;
- the always-false `onLip` branches in mountain;
- island's `void rand`;
- town's one-item loop and its `long ? 0.2 : 0.2`;
- zones' unused handler context (`inside`, `onGreen`).

**CSS:**
- the unused classes: `.boards__soon`, `.boot__ball`, `.load__hat`, `.real__close`, `.sock__on`, `.sock__on--w`, `.sock__off`, `.weather__sock`, `.title__tee`, `.title__golf`, `.title__dimple` and `.title__small`;
- `.power span`'s `--p`, which is never set (the bar's width is inline);
- the dead `.stamp` phone rule, which a later rule always overrode;
- the 640 px `.pick__canvas`, which the 820 px rule always overrode.

**Lint.**
- **Config.**
  - The config moved to the repo root (`eslint.config.js`), with its plugins resolved from `web/node_modules`.
  - `varsIgnorePattern: "^[A-Z]"` and `args: "none"` are gone. Unused params are now `after-used`, with `_` for a deliberate one.
  - JSX usage is marked by an 8-line local rule, `jsx/uses-vars`, instead of a new dependency.
- **What surfaced was fixed:**
  - the unused `ISLAND`, `Z1` and `W`/`H` (×2);
  - the unused params (`rigTarget`'s `dt`, `sandcastle`, `coconutPile`, `wreck`, `cableCar`, `waterMask`, a `zz`).
- **Coverage.**
  - `npm run lint` (from `web/`) also lints `media/promo`, `media/camera`, `media/lib` and `scripts/*.mjs`, with node globals. They were clean.
  - `npx eslint .` in `web/` still lints the client alone.

## 2. Shared geometry (`lib/terrain.js`)

**The helpers:**
- `closest(x, z, a, b)`: the nearest point `{ x, z, u, d }`, as one reused object, so there is no allocation in the camera's per-frame tests;
- `segDist`, `wallDist`, `segHit`, `rayCircle`;
- `mod`;
- `there(i, every, on, phase)`, a copy of field.gno's `there()` that is sign-safe and treats "untimed" as always there;
- `onAt(q, tick)`;
- `smoothstep`;
- and, on the terrain itself, `t.inGrid(i, j)` plus a local `flood` for its three flood fills.

**Replaced:**
- **Segment distance:** 11 copies, in course ×3 and its local `segDist`, zones, mountain ×3, island, and the engine's `wallHug`, `keepClear` and `sinkPoint`.
- **The timed test:** 9 copies, in the engine's `wallOn`, course's timed pieces, cause, weather, mountain ×3, zones and island.
- **Point in polygon:** `polyCuts.inside` and town's `insidePoly`, now `inPoly`.
- **Ray against a post:** 3 copies. `keepClear`'s pasted copy of `firstHit` is now a call to it.
- **Smoothstep:** 5 copies, and course's two inline ones.
- **Grid bound checks:** 6 in course, 4 in terrain, and the engine's BFS. The engine also imports `CELL` instead of hard-coding it.

## 3. The import cycles: `lib/scene/bake.js`

- **What moved there:** `bake`, `look` and `weatherLooks`, with the merge internals (`mergeInPlace`, `mergeByCopy`). The module depends on materials.js alone.
- **Moved elsewhere:** `drape` went to materials.js, and `fromWorld`, `gapWater` and `DECK` to worlds.js.
- **Result:** the four cycles (course ↔ zones, course → garden → course, course → worlds → garden → course, and gnome → course) are gone. A cycle finder over the static imports reports none; HEAD had four.

## 4. One fade helper, one merge helper

**Merge.**
- `bake(root, { board, local })` is the only merge. `local` is town's old `mergeLive`: it merges in the group's own frame and puts the group back as it was set.
- island's `mergedMover`, mountain's `compact` and town's `mergeLive` are now one-line uses of it. The course fingerprints of the movers (boats, the ship, the runner, chairs and cabs, the tram) are identical.
- It stays in `bake.js`, not in materials.js: it needs the bake's machinery, and materials.js is what bake.js builds on.

**Fade.** In materials.js:
- **`ownFade(piece)`** clones a piece's materials into fadeable ones, with one fadeable outline. It was mountain's `fadeMats` and town's `fadeable`, a name that also clashed with the `fadeable as fading` import.
- **`fadeHull()`**.
- **`setFade`** now keeps a see-through material (`userData.base`, the ice) see-through at base × fade. That was mountain's per-frame ice wrapper.
- **`fadeLoop`:**
  - takes a live `{ obj }` item, whose position is read each call;
  - defaults to `min: 0.22`, the value every caller passed;
  - the garden keeps its 0.25 explicitly.

**The garden's canopy.**
- In the reviewed tree, the garden hand-copied `fadeLoop` and left materials transparent. At HEAD it already used the shared loop, through a wrapper.
- It now hands `fadeLoop` live items and has no wrapper.
- `setFade` turns transparency off at 0.99. The loop gives exactly 1 when clear, and a value within 0.005 of 1 is already opaque, so no fadeable material stays transparent at opacity 1.

## 5. World helpers (`lib/scene/common.js`)

- `placer()` (`free` / `reserve`), used by the four `decor()` bodies.
- `onGround` (town and mountain had a copy each).
- mountain's `edgeRocks(W, H, seed)`: edging draws the rocks, and decor keeps off them. Decor used to replay edging's RNG by hand.

## 6. The splits

**zones.js.**
- `draw_surface` is now `drawSurface`: the patch, the deck's planks and the bank's ink.
- A `SURFACE_DETAIL` table sends each kind to its own function, with the same precedence as the old else-if chain: `waterDetail` (which calls `fountainBasin` and `canalEdges`), `puddleDetail`, `soilDetail`, `bedDetail`, `iceDetail` and `sandDetail`. The RNG order is unchanged.
- The `draw_*` functions are camelCase now.
- The `draw_gap` special case in `zoneDetail` is gone.

**course.js.**
- `wallPieces` lost `barPiece` (a four-wall bar: a timber, a gate, a tram, a world's own) and `kerbRuns` (a kerb cut at gaps and inlets).
- `groundMesh` reads the world's green once, instead of calling `wg(s)` up to three times per cell.

**The engine.** `createGame()` is now wired from four factories, each handed the engine's live state as one object `E`. `E` uses getters for what changes (`ball`, `dragging`, `shot`, `clock`, `cut`, `mode`, `strokeZones`).
- **`lib/engine/camera.js`:** the whole camera controller, meaning the rig and third-person targets, the springs, the collision tests, the course field, the tube clearance and the hover lean.
- **`lib/engine/replay.js`:** replaying a path. That covers rolling, the ramps' flights, tunnels and tubes, the roll-back climb, the splash, the slopes' glow, and the jump tests the aim dots also use.
- **`lib/engine/aim.js`:** the preview: debounce, cache, cancel, the dots' morph, tint, fog clip and `strokeFrom`.
- **`lib/engine/probes.js`:** the `?camlog` hooks.
- **engine.js keeps:** the state and `publish`, the frame loop and graphics tier, loading, the weather, the clock, input, and the shot.
- **Also in this pass:** `endPull()` replaces five copies of the end-of-pull sequence, and `clipPath()` replaces the two path clips.

**The public API is unchanged.** The probes are attached only for a page with `?camlog`, or with a new `hooks` option. Golf passes `hooks` for a dev `?won`, whose `fakeWin` is a probe now. The production check is below.

## 7. React

- **Standings.**
  - It showed a Pro player their assisted rank. It now takes a `mode`: the round's on the win card, the chosen one in the scorecard sheet.
  - The scorecard sheet's `Leaderboard` also defaulted to assisted, and now gets the mode.
- **`setPars` during render** (it mutated module state) is gone. `parOf(h)` reads the hole's own `par`, and `parHere(s)` gives the par of the hole being played.
- **`earned()`** (JSON from localStorage) is read once per render instead of once per `unlocked()` call; the picker made 5 calls.
- **Smaller dedupes:**
  - the "saved on-chain" test ×5 is now `onChain`;
  - `choresOf` is called once in the curtain;
  - a `shortAddr` replaces three copies of the 8…4 address.
- **What D had already done:** the other leftover effects (the timers, the `live` flags, `useConfig`, the tab title).

## 8. CSS

- **The stacked title overrides are folded into their rules.** They covered `.title__facts` (li, b, svg), `.title__word`, `.title__burst` and `.title__hat`, `.title__art` and `.btn--cta`, and each final value is kept.
- **Also folded:**
  - `.worlds__list` grid columns: one rule per breakpoint, instead of 7 places;
  - `.pick__canvas`;
  - `.adena`, `.adena--on` and `.timed`: the paper look moved into the base rules;
  - `.round--x`, `.round--back`;
  - `.world__me`, `.worlds__list > li`;
  - `.weather__say`, `.lightning`, `.boards`;
  - `.cup__hole`, `.cup__hole--done`, `.drawer__cup`;
  - `.aimset` and `.aimset--compact`: a later `.aimset` rule always won over the compact one's `display: flex`, so the compact switch is a centred grid, as it rendered;
  - `.stamp`, `.stamp--ace`, the scorecard's par row;
  - `.btn` (min-height), `.screen` (align-content).
- **`!important`: 45 → 17.**
  - **Kept:** the reduced-motion rule, and the toast's, which has to beat it.
  - **Kept:** the CTA's font-size, padding and radius. It is also a `.btn--play`, and `.screen .btn--play` outranks it.
  - **Kept, untouched:** the 12 in the older base rules, since each one beats a more specific selector.
- **The dead selector** `.aimset--compact .aimset--compact .aimset__help` is now `.aimset--compact .aimset__help`. The picker's help line is 11 px and centred, as that rule meant.
- **Tokens:**
  - one `:root`;
  - `--ink-rgb`, so the 17 `rgba(20,65,52,…)` are now `rgba(var(--ink-rgb), …)`;
  - `var(--ring)` for the 9 `outline: 3px solid var(--hat)`;
  - `var(--shadow-btn)` for the 7 `box-shadow: 0 4px 0 var(--ink)`.
- **`color-scheme: light`** on `:root`.

## 9. The media scripts: `media/lib/cdp.mjs`

- **What it is:** one helper, `launch({ width, height, mobile, dir, args })` → `{ send, ev, js, errors, kill }`, plus `chainUp()`. It is render.mjs's robust version:
  - the port is read from `DevToolsActivePort`;
  - errors reject;
  - Chrome is niced and killed by PID.
- **Settings:** `CHROME`, `APP`, `RPC` and `OUT` can be set from the environment. The `$HOME/Server/…` paths are gone; outputs sit next to the scripts.
- **Who uses it:** camsuite, pulltest, pressshot and render. pressshot's `chainUp` now has a timeout.
- **`.gitignore`:** `media/` is ignored except the promo, so `!media/lib/` was added. render.mjs is tracked and now imports the helper.

## The final checks

- **Lint.** `nice -n 20 npx eslint .` in `web/` is clean, and so is `npm run lint` (with the media and script folders).
- **Self-checks.** The six moved self-checks pass.
- **camsuite** (12 holes): 9 of 12 pass on the first run: hole1, hole2, hole20, hole14, island1, island2, town1, town18 and mountain10.
  - **hole3 and mountain5 fail the same way on HEAD.** Each has one "lens" frame (decor within 2 of the lens), at the same moment of the replay. The same harness was run against a HEAD copy served on another port, so these are not regressions.
  - **island7 is flaky.** It failed once on the turn rate (142°/s against a limit of 125) and passed twice after, at 70 and 76. HEAD gives 76.
  - **hole3 is flaky too.** It once had no rest frame after the stroke inside the window.
  - Chrome now runs niced, so these timing checks see fewer frames under load.
  - **A stall.** One run hung on island1 inside a single CDP call, after the page had reloaded itself mid-run, and was killed; the rerun passed. A per-hole timeout in camsuite would make this visible.
- **pulltest** (town1 and island7: Classic and Third, mouse and touch): 8 of 8 pass: the power comes back to 0, and letting go at the start shoots nothing.
- **Production build.**
  - `next build` ran in a scratch copy, so `web/out` and the dev server's `.next` were untouched. It compiles and exports.
  - Served statically with `?rpc=` pointing at the local chain:
    - without `?camlog` there is no `window.__g`;
    - `?play` and `?won=2` are ignored: no win card, and the linked hole opens its picker;
    - with `?camlog` the hooks answer (by design, for the camera rigs), and a shot replays with no console error.

## Left as they are, and why

- **The island's arch palms have a real bug.**
  - They draw no outline: three's `clone()` drops the hull's shader push (`onBeforeCompile`).
  - Their toon material also has no gradientMap, unlike every other palm.
  - The fix is `fadeHull()` and flat()'s bands, but it changes the picture, so it is left for a decision (marked in island.js).
- **Hand-rolled hashes** (`themeOf`, `hh`, `canopyOf`) were not replaced by `seeded`: that would redraw which theme or canopy each hole gets.
- **The two `doorway`s (town, mountain)** differ in size, colour and the snow. A parameterised one would be longer than the two copies.
- **Not done:**
  - `groundMesh`'s skin colours as a table: the branches carry logic, not just colours;
  - `gridMesh`, `zoneSheet` and the `decor()` splits: L items, and not part of this pass;
  - `useEffectEvent` for the latest-value refs: eslint-plugin-react-hooks 5 does not know it;
  - `useId` in Worlds' clip paths: two emblems of one cup clip to the same circle, so the id clash is harmless.
- **HEAD commit note.** My `git mv web/eslint.config.js eslint.config.js` staged the rename. Another session's commit, 86d123e ("Update hole bests…"), picked it up with the old content. The new config is in the working tree, unstaged like everything else.

## Per-file line counts

| file | before | after |
|---|---:|---:|
| `web/app/globals.css` | 2123 | 2025 |
| `web/components/Golf.jsx` | 1916 | 1918 |
| `web/lib/adena.js` | 255 | 243 |
| `web/lib/card.js` | 112 | 100 |
| `web/lib/chain.js` | 274 | 255 |
| `web/lib/engine.js` | 2620 | 1188 |
| `web/lib/engine/aim.js` | 0 | 249 |
| `web/lib/engine/camera.js` | 0 | 500 |
| `web/lib/engine/probes.js` | 0 | 121 |
| `web/lib/engine/replay.js` | 0 | 548 |
| `web/lib/promo.js` | 403 | 404 |
| `web/lib/scene.js` | 16 | 15 |
| `web/lib/scene/bake.js` | 0 | 228 |
| `web/lib/scene/cause.js` | 165 | 152 |
| `web/lib/scene/common.js` | 19 | 33 |
| `web/lib/scene/course.js` | 1538 | 1259 |
| `web/lib/scene/garden.js` | 947 | 941 |
| `web/lib/scene/island.js` | 2195 | 2183 |
| `web/lib/scene/materials.js` | 319 | 355 |
| `web/lib/scene/mountain.js` | 2625 | 2562 |
| `web/lib/scene/pieces.js` | 659 | 658 |
| `web/lib/scene/town.js` | 1779 | 1742 |
| `web/lib/scene/weather.js` | 503 | 504 |
| `web/lib/scene/worlds.js` | 42 | 60 |
| `web/lib/scene/zones.js` | 1111 | 976 |
| `web/lib/terrain.js` | 348 | 349 |
