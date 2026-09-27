# Web client code review (2026-09-24)

Numbers are the review's items. Owner in brackets. Line numbers are approximate:
the files keep moving.

## Security [ui]
1. `components/Golf.jsx:21-22`: `?rpc=` and `?web=` come straight from the URL and are passed to Adena's AddNetwork/networkInfo and to every code link. Allow only the defaults, `NEXT_PUBLIC_*`, and localhost (https: required otherwise).
2. `lib/chain.js:74-76` `sourceURL`/`roundURL`: `by` from the chain is joined onto `web` unchecked (`@evil.com/x`). Validate with `/^gno\.land\/[rp]\/[\w/.-]+$/`, else `"#"`, and build with `new URL(path, web)`.
3. `Golf.jsx:1053`: `r.player.slice` needs `String(r.player)`.

## Disposal and materials [garden: materials.js, props.js, course.js, fx.js]
4. `materials.js` `disposeCourse` frees module-level shared resources on every hole switch: inkSway, ringLine, stripeTex, softEdges, flower head and stem, island leafInk/ballInk, mountain SNOW/DRIFT/ICE/FROST/ICE_SOLID, glowCache as a map, ringsTex, and the Sprite shared geometry. Add a `share(x)` registry Set (or `userData.shared`) and skip sprites.
5. `InstancedMesh.dispose()` is never called: gulls and mountain instances leak.
6. `clipTo` stores the course water mask in `userData.mask`, so disposing a splash frees the live mask. The course should own `t.water`/`t.mask`.
7. The hull shader hook is written out 6 times (materials, island:824, mountain:890, town:~508). Export `pushHull(mat, w)` and `hull`.
8. `inkSway` is unused.
9. `props.js:357` sets `side = DoubleSide` on the SHARED `sway(color)` material. Use a separate cached double-sided variant. HIGH.
10. The fireflies are 18 SpriteMaterials: use one Points or instanced batch.
11. Chimney smoke has 4 geometries and 4 materials per chimney (props:368, pieces:467): share them.
12. Warp sparks and lantern glass: share their geometry and material.

## Weather [ui: weather.js]
13. `:371` `rainPos.set([...6])` allocates about 1,500 arrays per frame: write by index. HIGH.
14. `:355`/`:417`: the same for the gust streaks.
15. `flush()` rebuilds closures, calls camera() per item and rewrites hidden batches.
16. The weather-skin list is duplicated in course.js:1215, which lacks "snow". Export `WEATHER_SKINS`.
17. `rain.material` is never disposed.
18. The `blob` texture duplicates glowTex.

## course.js [garden]
19. The wear overlay is baked; paint() toggles a detached mesh; a full-board transparent quad draws every frame.
20. Logs and stumps use multi-material arrays (not baked), and `sawn()` creates materials each time.
21. There are four merge implementations (bake, mountain compact, island mergedMover, town mergeLive): one helper.
22. The bake signature uses `String(onBeforeCompile).length` and ignores the mask uuid.
23. `ZONE_COLOR` is dead.
24. `wallPieces`, `ground` and `roughScenery` are too long: split them, and rename `ground` to `groundMesh`.
25. Hoist `cutAny` and the `WEATHER` Set.
26. Loop leftovers: `lawnCells`, `plinthsOf`, 751-786, zones:271, island:1585.

## Worlds [island, town, mountain; garden for garden.js]
27. `town.js:682, :1103`: `.visible = false` parts get baked back and z-fight. Remove them from the scene instead.
28. The fade logic exists in 3 copies (town, mountain, island), and materials stay transparent at opacity 1. Use one `fadeable()`/`fadeLoop()` in materials.js [garden adds it; the worlds adopt it], and set transparent only when opacity < 0.99.
29. `island.js:127` `seaMat` bakes the hole centre and radius into GLSL under a constant cache key: use uniforms.
30. `island.js:701` gets the hull material through a throwaway `drawn()` and shadows `ink`.
31. Point-in-polygon exists in 3 copies: use `inZone`/`inPoly` exported from terrain.js.
32. The green-cell lookup exists in 7 copies: use a `t.onGreen(x, z)` method on the terrain [garden adds it].
33. `seeded`, `ISLAND` and `GRASS` live in garden.js and every module imports them (import cycles): move them to a common module [garden].
34. Per-frame allocations: mountain 521-588, 675, 728, 1757; garden 207; island 838.
35. Long functions: the decor() of each world, town piece(), which should reuse its own builders.
36. `mountain.js:722, 1698, 1736` use Math.random: seed them.
37. `town.js:1070` seeds with the JSON length: seed with the coordinates.
38. `garden.js:95`, `gnome.js:48` use raw CanvasTextures: use texOf (sRGB).

## Shared scene [garden]
39. `zones.js` `zoneDetail` is about 460 lines: use a dispatch table by skin.
40. `fx.js` `aimAlong` allocates per pointer move: module scratch objects.
41. Splash spheres and confetti geometry: share them.
42. `camera.js` `applyRig`/`focusRig` allocate per frame.
43. `camera.js:105`: the overview searches distances up to 600 while far is 260. Set far from the rig distance.
44. Consider `powerPreference: "default"`.
45. `worlds.js:37`: a failed import() stays cached. Delete it in .catch.
46. `gnome.js:35`: "grand chelem" should be "grand slam" (card.js too [ui]).
47. `state.js` fields, the worlds.js doc and the scene.js re-exports are out of date.

## Engine [ui]
48. `load()` calls newRound() twice; the first runs on the old hole and fires RPCs.
49. The aim-reset line is pasted 6 times: one `dropAim()`.
50. `destroy()` doesn't dispose the ball, aim, band, confetti or weather, and the replay loops check `round`, not `alive`.
51. Re-implements inZone, inPoly and onGreen.
52. No timeout on load()/start(); the preview's race timer is never cleared. Use AbortSignal.timeout in chain.js.
53. `publish()` rebuilds everything, called per aim step and per frame in demo().
54. Remove the "HUD aim stale" watchdog once publish is reliable.
55. `tube.getPoint`, `rightUp` and `at()` allocate per frame.
56. The `?probe` window.__cam debug global, stacked comments, a `fail()` helper, and the `mood` name clash.
57. `chain.js` abci(): no res.ok or body.error check, addr unencoded, the decode duplicated, no timeout.
58. `chain.js` `simulate`/`demoPull` are unused; the doc comments are detached; the demo self-checks never run.
59. `adena.js` onWalletChange: no-op unsubscribe (listeners pile up); DoContract without an Adena guard; unused `balance`; the fee formula ×3.
60. `feel.js`: the rain loop never stops; resume() promise is unhandled.
61. `card.js` worldOf ×5 and the localStorage save duplicated; terrain.js doc comment misplaced, and the W2/H2 aliases.

## Golf.jsx [ui]
62. `onChange: setS` re-renders the whole tree on every publish: split and memoise.
63. `unlocked()` writes localStorage during render.
64. Standings and Leaderboard set state after unmount; the leaderboard is fetched twice.
65. Timers are not cleared on unmount.
66. Effect deps not documented.
67. Duplicated logic: wx vs faked(), guessWorld, choresOf ×2, the saved check ×3, the close-X SVG ×3, `short` shadowed, conflicting doc comments, i0.
68. Add a lint script and ESLint react-hooks.

Suggested order: 1, 2, 4, 9, 13, 27, 62, 48, then the shared helpers (28, 31, 32, 33, 21).
