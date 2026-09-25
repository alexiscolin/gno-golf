# Web client, TypeScript build: rendering, performance and game quality (2026-09-25)

Scope: `web/` at 8ff9be6 (strict TypeScript), measured against the chain on :26757 with all 74 holes as data.
- Fixes are in the working tree and are not committed.
- The title files (`lib/scene/title.ts`, `components/Title.tsx`, `app/title.css`, `public/title/*`) belong to another pass and were not touched here.

## How it was measured

- **Browser.** One headless Chrome through `media/lib/cdp.mjs` (Metal, muted, `nice -n 20`), killed after every run.
- **Production numbers.** Measured on static exports served by `python3 -m http.server`:
  - **before:** the clean 8ff9be6 build, on :3320.
  - **after:** the working tree built in a scratch copy, on :3322.
  - **for function names:** the working tree built with source maps, on :3321, with allocations resolved through the maps.
- **Where `web/` was not built.** `next build` was never run in `web/`, and a second dev server was never started on :3300.
- **Viewports.**
  - Desktop: 1280×800 at DSF 1. The render-quality screenshots were taken at DSF 2.
  - Mobile: 390×844 at DSF 3, touch, with CPU throttled 4×.
- **Renderer access.** `renderer.info` was read through the `__THREE_DEVTOOLS__` hook.
- **Frame rate.** Measured as the change in `info.render.frame` over a window of time.
- **Allocations.** Measured with the CDP `HeapProfiler` sampler, counting objects that were collected too. GC time comes from `Profiler` samples.
- **Leak check.** `renderer.info.memory` and the JS heap after a forced GC, read after each `__g.load()`.
- **Regression checks.**
  - A copy of daa81b4 (the pre-TypeScript JS) ran on :3311.
  - For the flight bug, a deterministic harness was used: a fake clock with 60 or 30 fps frames and jittered callback times, which is what reproduces it.
  - The harness scripts are in the session scratchpad, not in the repo.

---

## 1. mountain12 "second rise in a flight": root cause and fix

**Symptom.** `media/camera/flighttest.mjs` sometimes flags mountain12 `342,10` as BAD, with "second rises in a flight 1".
- The chain's path, air and cause are correct.
- It is timing-dependent:
  - 1 run in 4 at 4× CPU throttle;
  - 0 in 6 unthrottled.

**Root cause** (`lib/engine/replay.ts`, flight handling). Two things combine at a narrow kicker.
- **The take-off height came from the ball's last frame, not from the lip.**
  - The code set `F.top = prev.y - BALL_R`, the height of the frame before the one that crossed the crest.
  - At a fast ball (about 0.43 board units per 60 fps frame, twice that at 30 fps) that frame can be well down the ramp. On mountain12 it was 1.62 against a lip of 1.90.
  - The parabola started from there, hidden under the lip by the `max(ground, arc)` clamp. The ball followed the ground *down* past the lip, and then the arc rose out of it: a second rise.
- **The crest was sampled 24 times over the whole flight.**
  - On mountain12 that is one sample per 0.5 units, and the kicker is about 2 units wide.
  - The sampled crest could fall past the real lip, where the ground is already falling.

**Why it looked random.** How far the last frame falls short of the lip depends on frame phase and length. The peak of the jump itself moved with the frame rate too: 1.48 to 2.08 on mountain12.

**Not a regression.**
- daa81b4's `replay.js` has the same code (`F.top = prev.y - BALL_R`, `q <= 24`).
- Under the same deterministic sweep it fails the same way, and the numbers below are for that build.

**Fix** (`replay.ts`, two lines of logic).
- The crest is sampled every 0.05 units, with at least 24 samples: `n = max(24, ceil(len / 0.05))`.
- The flight leaves from the lip: `F.top = max(ground(crest), prev.y - BALL_R)`.
  - It is still read at the moment of leaving, so a timed deck or seesaw is still honoured.
  - The ball can only meet the arc going up.

**Numbers.** Deterministic sweep over 10 flight shots, 16 frame timings each (60 and 30 fps, jittered):

| shot | daa81b4 / 8ff9be6: dirty runs, worst dip | fixed | peak (daa81b4 → fixed) |
|---|---|---|---|
| mountain12 342,10 | 2/16, 0.29 | 0/16 | 1.48–2.08 → 2.48 |
| island7 300,10 | 4/16, 0.10 | 0/16 | 0.61–0.74 → 0.78–0.80 |
| island3 210,10 | 3/16, 0.006 | 0/16 | 0.24–0.26 → 0.23–0.24 |
| hole9, hole20, island7 210, mountain5 ×2, mountain14 ×2 | 0/16 | 0/16 | – |
| **total** | **9/160** | **0/160** | |

- The flight shots were found by sweeping every hole's power-10 and power-7 shots on the chain.
- Only hole9, hole20, island3, island7, mountain5, mountain14 and mountain12 fly.
- The jump on those kickers is now the same height at every frame rate. On mountain12 it is a little higher than it used to be, because it now leaves from the lip.

**Tests after the fix.**
- `flighttest.mjs`: PASS. mountain12 has 0 second rises.
- `pulltest.mjs`: 4/4 pass.
- `camsuite.mjs` (14 holes, on the dev server):
  - 12 pass.
  - island7 fails on the clean 8ff9be6 build too, so that failure was there before these fixes.
  - hole3 failed twice with a `distanceToSquared` TypeError, while the dev server was hot-reloading edits. It then passed 4 reruns in a row, and it passes on the clean build.

## 2. Fog: a flat pale plane at the start of a hole (user bug), and the fog popping in

**Cause** (`lib/engine.ts` frame → `weather.view(g.rig.dist)`).
- The fog range is near = 0.75·dist and far = 1.9·dist, where dist is the rig's *goal* distance.
- When the intro glide starts, `g.view` becomes `"ball"` and the goal jumps at once to the close follow framing (dist about 28 on garden/2). The camera is still about 71 away.
- Fog far drops to 52, less than the camera's distance to everything, so the course draws as one flat plane of fog colour. The HTML skyline behind the alpha canvas still shows.
- Measured worst case: camera-to-gnome distance / fog far = **1.36** (anything over 1 is fully fogged).
- The fog also snapped on: `setFog` jumped the range from 1e5 to 20/60, and the fog banks appeared at full opacity.

**Not a regression.** It is the same in daa81b4 (`weather.js:384`, `engine.js:353`): a ratio of 1.35 and the same flat frames.

**Fix.**
- `engine.ts`: in the ball view, the fog gets `max(rig.dist, camera→gnome distance)`. In other views it gets `rig.dist` as before.
- `weather.ts`:
  - The fog fades in and out over 1.5 s (smoothstep), rolling in from beyond the course toward its range. The banks' opacity follows the same fade.
  - The range follows the real distance at once when the camera backs off, and eases in (4/s) when it closes in.
  - Each new hole (`board()`) fades its fog in again.
- At rest the ranges are unchanged:
  - Classic: 20.9/53;
  - Far: 59.7/151;
  - Third: 51.9/131.

**Numbers.**
- Worst ratio in the intro, before: 1.36. After: **0.54**.
- This was measured on garden/2 (Classic, Far, Third, Pro, sage), town/18, mountain/10 and island/7, all with `?weather=fog`.
- Fog arriving between strokes: `fog.near` goes 131 → 21 over about 1.5 s, with no step.

**Frame strips:**
- `media/review/fog-intro-before.jpg`
- `media/review/fog-intro-after.jpg`
- `media/review/fog-change-after.jpg`

## 3. Frame pacing

The design:
- idle at 10 fps (nothing moves);
- idle at 30 fps (weather or timed pieces);
- busy at 60 fps at most.

| hole (weather at the time) | idle before | idle after | busy (replay) |
|---|---|---|---|
| garden/1, desktop (none) | **16.2** | **10.0** | 60.3 |
| mountain/12, mobile 4× (none) | **16.2** | **10.0** | 60.1 |
| town/18 (timed pieces) | 29.9–30.0 | 30.0–30.2 | 59.8–60.2 |
| mountain/12, desktop (snow) | 30.2 | – | 60.3 |

**Bug found and fixed** (`lib/engine/camera.ts` `updateCamera`): a still scene drew 1.6× as often as it should.
- The camera springs (critically damped, ω = 9) were stepped once per drawn frame.
- At the 10 fps idle rate (dt = 0.1 s), that semi-implicit Euler step is unstable: one eigenvalue is −1.25.
- Each 100 ms frame grew the springs' last residue past the `settled` threshold. That made the next frame busy (16 ms), which damped it back.
- The result is a permanent 100 ms / 16 ms rhythm (frame gaps "100 17 100 17 …") with the camera visibly still.
- **The fix:** the springs step in slices of 1/60 s at most. At 60 fps there is one slice, so busy frames behave exactly as before, and the camera feel does not change. After the fix the gaps are "100 100 100 …".

**Busy cap.** `BUSY_MS − 2` holds 60 fps on a 60 Hz display. Headless Chrome runs at 60 Hz, so a 120 Hz display was not measured. The code caps it (a frame is skipped when < 14.7 ms).

## 4. Garbage collection and per-frame allocations

This is the production build. GC time is small everywhere: 0.6–3 ms/s on desktop and 1.6–6.5 ms/s on the throttled phone.

| state | allocation | GC | JS |
|---|---|---|---|
| idle town/18, desktop | 630–810 KB/s | 1.4–2.9 ms/s | 13–31 ms/s |
| replay town/18, desktop | 1.6–2.0 MB/s | 2–3.6 ms/s | 24–41 ms/s |
| idle mountain/12, desktop | 290–870 KB/s (weather dependent) | 0.6–2.6 ms/s | 6–16 ms/s |
| replay mountain/12, mobile 4× | 1.8 MB/s | 4.9–5.9 ms/s | 59–130 ms/s |

**Where it goes**, resolved through source maps.
- **About 40%: three.js internals.**
  - `setValueV3f` and `setValueM4` box doubles into their plain uniform caches.
  - Also `copyArray`, `WebGLRenderer` `setup` and `renderBufferDirect`.
  - These are not ours to change.
- **Ours:**
  - `fadeLoop` (the canopy fade, `materials.ts`): 127 KB/s idle and 287 KB/s in a replay on town/18. **Fixed for the idle case:** it now returns early when the eye and the ball have not moved and no watched item moves by itself. Before and after is the same function of the same inputs, so nothing looks different.
  - `Curve.getTangent` in the mountain skiers, the bobsleigh and the garden stream foam: three's default makes two `Vector3` a call, even when given a target. It is replaced by `tangentInto()` (`scene/common.ts`), the same finite difference with scratch vectors.
    - Allocation under `getPoint`: 30 → 11–15 KB/s idle, and 97 → 75–82 KB/s in a replay.
    - What is left is CatmullRom's own boxing inside three.
  - `camera.ts` `updateCamera`, `occluded` and `wallHug`, and `terrain.ts` `there()`: 20–80 KB/s each, all boxed doubles, with no objects made. Not worth restructuring.
- **Reading it.** No per-frame path makes JS objects any more on the paths profiled. The rest is number boxing, which costs about 1–3 ms of GC a second.

## 5. Memory across hole changes

This is the production build, with a forced GC before each read.
- **Desktop.** 21 loads (two laps of 10 holes plus the return).
- **Mobile.** One lap.

| | garden/1 first | after lap 1 (garden/1) | after lap 2 (garden/1) |
|---|---|---|---|
| geometries | 28 | 35 | 35 |
| textures | 6 | 8 | 8 |
| programs | 30 | 31 | 31 |
| JS heap | 11.9 MB | 13.2 MB | 13.8 MB |

- **No leak.**
  - Geometries follow the hole (21–77) and come back to the same count.
  - Textures settle at +2. These are world textures that stay cached once a world has been visited.
  - Programs stay flat at 26–43 per hole.
  - The heap is flat within about 0.6 MB per lap, with nothing piling up.
- **Mobile.** The same pattern: 30/7/30/11.8 MB → 34/9/31/13.2 MB after the lap.

## 6. The first load

This is the production build. The before and after runs were paired and run back to back, because the machine's load moved the absolute numbers between sessions.

| | desktop | mobile, CPU 4× |
|---|---|---|
| first contentful paint (the title) | 296–376 ms on a quiet machine; 1.55–1.63 s in the paired runs (same before and after) | 1.60–1.76 s |
| first playable hole (`?cup=town&hole=18`, built, shaders ready, HUD up) | 880 ms quiet; 2.11–2.14 s paired (same before and after) | 3.32–3.44 s |
| town/18 build + compile | 136 + 19 ms | 534–549 + 49–56 ms (one long task) |
| JS transferred | 1.26–1.29 MB (three's chunk 537 KB) | same |

**The chain waterfall**, local node, about 20 ms a query:

1. `golf.Holes()`
2. `golf.HoleState("town/18/v1")`. This depends on 1, because the version id comes from the list.
3. The world chunk loads (37 KB), the hole is built, and the shaders compile.
4. `golf.Extras("town/18/v1", 0)`. This is for timed holes only, and is asked in `newRound()` *after* the build: +150 ms on desktop, +620 ms on mobile.
5. `status` (the chain clock).

There are no redundant queries. What could still be won, not done here:
- **Extras.** `Extras(id, 0)` could be asked alongside `HoleState`. It does not block play: the timed pieces grow in once it lands.
- **Mobile.** About 700 ms goes between the title's paint and the first query, parsing and running 1.26 MB of JS. Three.js is the bulk of it, and it is needed before any hole can draw.

## 7. Render quality

- **Shadows.** There are no shadow maps. The gnome's shadow is a blob disc 0.02 above the ground, so there is no shadow acne.
  - On a steep slope, the flat disc cuts into the ground on the uphill side and floats on the downhill side. This was seen in Third on mountain10.
  - It is cosmetic. It could be tilted to the ground normal if it bothers.
- **Z-fighting.**
  - The depth range is near 3 / far 260 (Third: 0.5 / 80).
  - At the Far view's 80–150 units, 24-bit depth resolves about 4.5e-4. Every decal offset is ≥ 0.012, and 30 materials use `polygonOffset`.
  - No flicker was seen in Far or Third on town18, mountain10, island7 or garden9 at DPR 2.
- **Aliasing.**
  - MSAA is on (the ink outlines need it).
  - DPR cap: 1.25 on desktop, 1 on phones. Low tier: 1 on desktop, 0.8 on phones.
  - Thin lines (the lantern wires on town18) shimmer a little in Far. That is expected for 1 px lines.
- **Overdraw.**
  - There are 76 transparent materials, 59 without depth write.
  - The worst case was the fog. The bank that used to cover the lens fades out within 3–7 units of the camera, and the scene fog can no longer cover the view (§2).
- **Materials and programs.**
  - Materials in the code: MeshBasic 100, Toon 16, Lambert 15, Phong 6, no Standard/PBR. `onBeforeCompile` is used 11 times, each with its own cache key.
  - 26–43 programs per hole.
  - Draw calls: 16–50 idle and 44–72 busy. Triangles: 89k–210k (town/18 is the heaviest).
- **Graphics tier.**
  - Auto is High unless the GPU name matches the weak list, or the first 2 s of busy frames have a median over 20 ms. That result is remembered in `localStorage`.
  - At CPU 4× on Metal, the probe did not trip: busy frames stayed at 60, so Auto stays High. That is the right call there.
  - What Low changes:
    - Phone: DPR 1 → 0.8. Desktop at DSF 1: DPR unchanged.
    - Less ink on distant decor: town/18 190k triangles against 206k.
    - Thinner weather.
  - Switching tiers resizes the canvas and briefly wakes the loop (about 55 fps for a second), then it goes idle again.

## Files changed

- `web/lib/engine/replay.ts`: flights leave from the lip, and the crest is found at 0.05 resolution (§1).
- `web/lib/scene/weather.ts`: the fog fades in and out, and its range follows the camera's real distance (§2).
- `web/lib/engine.ts`: the fog distance comes from the real camera in the ball view (§2). The clock uses `TICKS_PER_S`.
- `web/lib/engine/camera.ts`: the camera springs are sub-stepped at 60 Hz (§3).
- `web/lib/scene/materials.ts`: `fadeLoop` skips unchanged frames (§4).
- `web/lib/scene/common.ts`, `web/lib/scene/mountain.ts`, `web/lib/scene/garden.ts`: `tangentInto()` for per-frame curve tangents (§4).
- `media/review/fog-*.jpg`: the frame strips.

`npm run typecheck` and `npm run lint` are clean.
