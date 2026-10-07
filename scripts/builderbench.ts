#!/usr/bin/env -S node --experimental-strip-types
// The 3D board's budget (the GUI spec's B3), measured in a headless Chrome
// against a dev server with the Builder on, and enforced: it exits non-zero
// past any of it.
// - 60 fps at 1440×900 while the pointer sweeps the board (the scene drawing
//   each frame), and 30 fps at least with the CPU four times slower
//   (Emulation.setCPUThrottlingRate);
// - the hole built once a checked hole: never while a piece is dragged, once
//   after the drop (Scene.tsx, ?camlog's window.__builds), and no shader
//   program linked for it (the old hole let go once the new one is drawn);
//   never for an edit that changes nothing drawn (the slug); the player's
//   view painted once a build, from the same scene and context, never as
//   the pointer moves or the board zooms;
// - zoomed with the wheel (motion on), the board drawn once a frame at most;
// - idle, the loop stopped: no frame asked for, little CPU;
// - one WebGL context for the page, a quick test and Prove it visited and
//   left (stage.ts);
// - five quick tests in a row leave no GL program, texture or buffer behind
//   (the game draws with the board's own renderer, lent to it);
// - the context lost: the 2D board until it is back, then the 3D drawn again;
// - the player's view shown large: drawn at its own size, never a smaller
//   picture stretched;
// - a quick test over a timed piece kept moving (Moving air, selected and
//   playing): the board's loop draws nothing on the lent canvas, so the game
//   alone draws, at the window's own shape; its context lost meanwhile, the
//   test says so, and says no more once it is back;
// - round the worlds (Island, Town, Mountain, back to the Garden): each hole
//   built with its own world's scenery, the player's view painted with it;
// - a world's module that would not load (offline): the hole left where it
//   is, said, nothing thrown; picked again once it loads, built there;
// - no WebGL: the 2D board, and no test (T and Prove it say why; the
//   Builder never falls over).
// It prints the numbers as JSON. Every step waits on what it is about (the
// scene's build count and world, the select's value, the line said), each
// with a timeout that names it, never on a guessed delay; a warm-up visit
// first (every world, a quick test) so a dev server's first compiles count
// in no measure.
//
//   APP=http://127.0.0.1:3451 node --experimental-strip-types scripts/builderbench.ts

import assert from "node:assert/strict";

interface Browser {
  send: (method: string, params?: object) => Promise<unknown>;
  ev: <T = unknown>(expr: string) => Promise<T>;
  js: <T = unknown>(expr: string) => Promise<T>;
  errors: unknown[];
  kill: () => void;
}
const cdp = (await import("../media/lib/cdp.mjs")) as { launch: (o: { width: number; height: number }) => Promise<Browser>; sleep: (ms: number) => Promise<void>; APP: string; offline: (b: Browser, now?: boolean) => Promise<{ back: () => Promise<unknown> }> };
const { launch, sleep, APP } = cdp;
// (fps: the frames shown a second, with room for the harness's pacing; the frame's work is held to 60 and 30 exactly)
const W = 1440, H = 900, BUDGET = { fps: 50, slowFps: 30, idleCpu: 0.05, idleFrames: 2 };

// counted from the first script: the canvases given a WebGL context, the GL objects alive on them, and the frames asked for
const COUNT = `window.__gl = new Set(); window.__raf = 0; window.__live = { Program: 0, Texture: 0, Buffer: 0 }; window.__linked = 0; window.__renders = 0;
const gc = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (t, ...a) { const r = gc.call(this, t, ...a); if (r && /webgl/.test(t)) window.__gl.add(this); return r; };
const clear = WebGL2RenderingContext.prototype.clear;
WebGL2RenderingContext.prototype.clear = function (m) { window.__renders++; return clear.call(this, m); };
for (const k of Object.keys(window.__live)) {
  const p = WebGL2RenderingContext.prototype, make = p["create" + k], drop = p["delete" + k];
  p["create" + k] = function (...a) { const o = make.apply(this, a); if (o) (window.__live[k]++, k === "Program" && window.__linked++); return o; };
  p["delete" + k] = function (o) { if (o) window.__live[k]--; return drop.call(this, o); };
}
const raf = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = (f) => (window.__raf++, raf(f));`;

/** expr's value in b once it is truthy, looked at every 100 ms; past ms, an error naming what was awaited and the last value seen. */
async function waitFor<T = unknown>(b: Browser, expr: string, what: string, ms = 30_000): Promise<T> {
  let v: T | undefined;
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) if ((v = await b.ev<T>(expr))) return v;
  throw new Error(`builderbench: waited ${ms / 1000} s for ${what} (last: ${JSON.stringify(v)})`);
}
/** expr's value in b once it has stayed the same for quiet ms (the page done with it), at most ms. */
async function settled<T = unknown>(b: Browser, expr: string, what: string, quiet = 600, ms = 30_000): Promise<T> {
  let v = JSON.stringify(await b.ev<T>(expr)), since = Date.now();
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) {
    const now = JSON.stringify(await b.ev<T>(expr));
    if (now !== v) {
      v = now;
      since = Date.now();
    } else if (Date.now() - since >= quiet) return JSON.parse(v ?? "null") as T;
  }
  throw new Error(`builderbench: ${what} never settled in ${ms / 1000} s (last: ${v})`);
}
const WORLD = `document.querySelector('select[aria-label="The hole\\'s world"]')`;
/** The hole moved to world w, through its select, as a pick would. */
const pickWorld = (b: Browser, w: string) => b.js(`(() => { const el = ${WORLD}; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, "${w}"); el.dispatchEvent(new Event("change", { bubbles: true })); })()`);
/** The Builder opened in b on its first run (the Garden's dogleg), Got it pressed, the board built in 3D and its player's view painted. */
async function open(b: Browser) {
  await b.send("Page.navigate", { url: `${APP}/build/?camlog` });
  await waitFor(b, `!!document.querySelector(".bhint__ok")`, "the first run's hints", 60_000);
  await b.js(`document.querySelector(".bhint__ok").click()`);
  await waitFor(b, `!!document.querySelector(".board--3d canvas") && (window.__builds ?? 0) > 0 && (window.__eyes ?? 0) > 0`, "the board in 3D and the player's view", 60_000);
}
/** w's hole built and drawn with its own scenery, after a pick: the select on w, a build past b0, the scene's world w. */
const builtIn = (b: Browser, w: string, b0: number, ms = 60_000) =>
  waitFor(b, `${WORLD}.value === "${w}" && (window.__builds ?? 0) > ${b0} && window.__scenery === "${w}"`, `the hole built in the ${w}`, ms);

// the warm-up, counted in nothing: every world's module and a quick test asked for once (a dev server compiles each on
// its first request, seconds on a cold one), in a browser of its own
{
  const w = await launch({ width: W, height: H });
  await w.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await open(w);
  for (const world of ["island", "town", "mountain", "garden"]) {
    const b0 = await w.js<number>(`window.__builds`);
    await pickWorld(w, world);
    await builtIn(w, world, b0, 120_000);
  }
  await w.js(`document.querySelector(".board").focus()`);
  await w.send("Input.dispatchKeyEvent", { type: "keyDown", key: "t", code: "KeyT", text: "t" });
  await w.send("Input.dispatchKeyEvent", { type: "keyUp", key: "t", code: "KeyT" });
  await waitFor(w, `!!document.querySelector(".tbench--quick .tmode__score") && !!window.__g?.current()`, "the warm-up's quick test on its hole", 120_000);
  await settled(w, `window.__g.info().programs?.length`, "the warm-up's quick test compiled", 1000, 120_000);
  w.kill();
}

const c = await launch({ width: W, height: H });
await c.send("Emulation.setFocusEmulationEnabled", { enabled: true });
await c.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
await c.send("Page.addScriptToEvaluateOnNewDocument", { source: COUNT });
await c.send("Performance.enable");
const until = (expr: string, what: string, ms?: number) => waitFor(c, expr, what, ms);
await open(c);
await settled(c, `[window.__builds, window.__eyes, window.__renders]`, "the board's first frames", 800);
const board = await c.js<{ l: number; t: number; w: number; h: number }>(`(() => { const r = document.querySelector(".board").getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
const mouse = (type: string, x: number, y: number, buttons = 0) => c.send("Input.dispatchMouseEvent", { type, x, y, button: buttons || type === "mouseReleased" ? "left" : "none", buttons, clickCount: buttons || type === "mouseReleased" ? 1 : 0 });

const task = async () => ((await c.send("Performance.getMetrics")) as { metrics: { name: string; value: number }[] }).metrics.find((m) => m.name === "TaskDuration")!.value;
/**
 * The page while the pointer sweeps the board for ms (the scene drawn each
 * frame): the frames it showed a second (counted in the page, over the wall
 * clock here), and the main thread's work a frame (its tasks' time over the
 * frames, ms): what bounds the frame rate whatever the harness's pacing (a
 * frame's work at most 16.7 ms is 60 frames a second, 33.3 ms is 30).
 */
async function sweep(ms: number) {
  await c.js(`(() => { window.__frames = 0; const f = () => { window.__frames++; if (!window.__stop) requestAnimationFrame(f); }; window.__stop = false; requestAnimationFrame(f); })()`);
  const t0 = Date.now(), w0 = await task();
  for (let k = 0; Date.now() - t0 < ms; k++) {
    const a = (k / 60) * Math.PI;
    await mouse("mouseMoved", board.l + board.w * (0.5 + 0.35 * Math.cos(a)), board.t + board.h * (0.5 + 0.35 * Math.sin(a * 0.7)));
    await sleep(8);
  }
  const wall = Date.now() - t0, work = (await task()) - w0, frames = await c.js<number>(`(window.__stop = true, window.__frames)`);
  return { fps: Math.round((frames * 1000) / wall), msPerFrame: Math.round(((work * 1000) / frames) * 10) / 10, fpsCapacity: Math.round(frames / work) };
}

const normal = await sweep(3000);
await c.send("Emulation.setCPUThrottlingRate", { rate: 4 });
const slow = await sweep(3000);
await c.send("Emulation.setCPUThrottlingRate", { rate: 1 });

// a piece dragged about for two seconds: the hole not built again; let go, built once
const builds = () => c.js<number>(`window.__builds ?? 0`);
const piece = await c.js<[number, number]>(`(() => { const r = document.querySelector("[data-piece='p1']").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
const eyes = () => c.js<number>(`window.__eyes ?? 0`), eyes0 = await eyes();
const before = await builds(), linked = () => c.js<number>(`window.__linked`);
await mouse("mousePressed", ...piece, 1);
for (let k = 1; k <= 120; k++) {
  await mouse("mouseMoved", piece[0] - 40 * Math.sin(k / 12), piece[1] + 30 * Math.sin(k / 9), 1);
  await sleep(16);
}
const during = (await builds()) - before, eyesDuring = (await eyes()) - eyes0;
const linked0 = await linked();
await mouse("mouseReleased", piece[0] - 30, piece[1] + 24);
await until(`(window.__builds ?? 0) > ${before} && (window.__eyes ?? 0) > ${eyes0}`, "the drop's build and its player's view");
await settled(c, `[window.__builds, window.__eyes, window.__linked]`, "the drop's build", 1000);
const after = (await builds()) - before, relinked = (await linked()) - linked0, eyesAfter = (await eyes()) - eyes0;

// the slug edited: checked again, the same hole drawn, not built again
const builds0 = await builds();
await c.js(`(() => { const el = document.querySelector(".bhead__slug"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "bench-slug"); el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
await until(`document.querySelector(".bhead__slug")?.value === "bench-slug"`, "the slug edited");
// (checked 150 ms after the edit: a build, if one came, would be seen within the quiet second)
await settled(c, `window.__builds`, "the builds after the slug edit", 1000);
const slugBuilt = (await builds()) - builds0;

// zoomed with the wheel, in and out: the renders (a render clears once) over the frames shown
await c.js(`(() => { window.__frames = 0; const f = () => { window.__frames++; if (!window.__stop) requestAnimationFrame(f); }; window.__stop = false; requestAnimationFrame(f); })()`);
const renders0 = await c.js<number>(`window.__renders`), eyesZoom0 = await eyes();
for (let k = 0; k < 40; k++) {
  await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: board.l + board.w / 2, y: board.t + board.h / 2, deltaX: 0, deltaY: k % 20 < 10 ? -40 : 40 });
  await sleep(16);
}
const zoomFrames = await c.js<number>(`(window.__stop = true, window.__frames)`), zoom = { renders: (await c.js<number>(`window.__renders`)) - renders0, frames: zoomFrames, eyes: (await eyes()) - eyesZoom0 };

// idle: past the scene's IDLE_MS, nothing asked of the screen, little of the CPU
await mouse("mouseMoved", 5, 5);
// (the loop stops IDLE_MS after the pointer's last move: no more frames asked for)
await settled(c, `window.__raf`, "the loop stopping", 500, 10_000).catch(() => null);
const raf0 = await c.js<number>(`window.__raf`), t0 = await task(), w0 = Date.now();
await sleep(3000);
const idle = { frames: (await c.js<number>(`window.__raf`)) - raf0, cpu: Math.round(((await task()) - t0) / ((Date.now() - w0) / 1000) * 1000) / 1000 };

// five quick tests, and back from each: the GL objects alive after each (the first one's left are the board's renderer's cache)
const live: Record<string, number>[] = [];
for (let k = 0; k < 5; k++) {
  await c.js(`document.querySelector(".board").focus()`);
  await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "t", code: "KeyT", text: "t" });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "t", code: "KeyT" });
  await until(`!!document.querySelector(".tbench--quick .tmode__score") && !!window.__g?.current()`, "the quick test's game on its hole");
  await settled(c, `window.__live`, "the quick test's GL objects", 800);
  await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await until(`!document.querySelector(".tbench--quick") && !!document.querySelector(".board--3d canvas")`, "back from the quick test");
  live.push(await settled<Record<string, number>>(c, `window.__live`, "the GL objects after the quick test", 800));
}
// and Prove it, and back: still the one context
await c.js(`[...document.querySelectorAll("button")].find((b) => /^Prove it$/.test(b.textContent)).click()`);
await until(`!!document.querySelector(".tmode")`, "Prove");
await c.js(`[...document.querySelectorAll("button")].find((b) => /^Back to edit$/.test(b.textContent)).click()`);
await until(`!!document.querySelector(".board--3d canvas")`, "the board again");
await settled(c, `window.__renders`, "the board drawn again", 500);
const contexts = await c.js<number>(`window.__gl.size`);

// the context lost (a GPU reset): the board in 2D meanwhile; back, in 3D and drawn again
await c.js(`window.__lose = document.querySelector(".board__scene canvas").getContext("webgl2").getExtension("WEBGL_lose_context"), window.__lose.loseContext()`);
const whileLost = await waitFor<boolean>(c, `!!document.querySelector(".board__ground") && !document.querySelector(".board--3d")`, "the 2D board while the context is lost", 10_000).catch(() => false);
const renders1 = await c.js<number>(`window.__renders`);
await c.js(`window.__lose.restoreContext()`);
const back = await waitFor<boolean>(c, `!!document.querySelector(".board--3d") && !document.querySelector(".board__ground") && window.__renders > ${renders1}`, "the 3D board drawn again once the context is back", 10_000).catch(() => false);
const lost = { whileLost, backIn3d: await c.js<boolean>(`!!document.querySelector(".board--3d") && !document.querySelector(".board__ground")`), drawn: back || (await c.js<number>(`window.__renders`)) > renders1 };

// the island's module blocked, the hole moved there: left where it is, said, nothing thrown; unblocked, moved and built
// (in the page: any script not loaded yet fails, as offline would; the island's own chunk is one of them, whatever a
// production build names it)
const net = await cdp.offline(c);
const islandBuilds = await builds(), errors0 = c.errors.length;
await pickWorld(c, "island");
const said = await waitFor<string>(c, `document.querySelector(".board__said")?.textContent ?? ""`, "the line said of a world that would not load", 30_000).catch(() => "");
// (refused: the hole stays in the garden, nothing to build; a build, if one came, would be seen within the quiet second)
await settled(c, `window.__builds`, "the builds after the refused pick", 1000);
const offline = { built: (await builds()) - islandBuilds, said, thrown: c.errors.slice(errors0).filter((e) => !/Failed to load resource|__offline__/.test(String(e))) };
await net.back();
await pickWorld(c, "island");
await builtIn(c, "island", islandBuilds + offline.built).catch(() => null);
await settled(c, `window.__builds`, "the island's build", 800);
const world = { ...offline, builtAgain: (await builds()) - islandBuilds - offline.built };

// the player's view large (its dialog): its picture of the dialog canvas's own size, not the board's, stretched
await c.js(`document.querySelector(".pview__pic").click()`);
const e1 = await eyes();
await waitFor(c, `document.querySelector(".pview__big")?.open && (window.__eyes ?? 0) > ${e1 - 1}`, "the player's view large");
await settled(c, `window.__eyes`, "the large view painted", 600);
const large = await c.js<{ css: number; px: number; dpr: number }>(`(() => { const e = document.querySelector(".pview__big canvas"); return { css: e.clientWidth, px: e.width, dpr: devicePixelRatio }; })()`);
await c.js(`document.querySelector(".pview__big form button").click()`);
await until(`!document.querySelector(".pview__big")?.open`, "the large view closed");
let lent = { renders: 0, frames: 0, shape: 0, window: 0 }, testLost = { said: false, unsaid: false };
// round the worlds and back: each built with its own scenery (Scene's ?camlog __scenery: the module that drew it), the player's view painted with it
const scenery: { world: string; drawn: string; eyes: number }[] = [{ world: "island", drawn: await c.js<string>(`window.__scenery`), eyes: 0 }];
for (const w of ["town", "mountain", "garden"]) {
  const b0 = await builds(), e0 = await eyes();
  await pickWorld(c, w);
  await builtIn(c, w, b0).catch(() => null); // (a world that never came: said by the assertion, with what was drawn)
  await settled(c, `[window.__builds, window.__eyes]`, `the ${w}'s build`, 600);
  scenery.push({ world: w, drawn: await c.js<string>(`window.__scenery`), eyes: (await eyes()) - e0 });
}

// in the mountain, Moving air dropped on the lane (selected, playing: the board's loop kept going), then a quick test:
// the renders a frame (one: the game's) and the game's drawing buffer of the window's shape, not the board's
{
  const b0 = await builds();
  await pickWorld(c, "mountain");
  await builtIn(c, "mountain", b0);
  await c.js(`document.querySelector(".palette__more")?.setAttribute("open", "")`);
  await c.js(`[...document.querySelectorAll(".palette .ptile > .piece:not([disabled])")].find((e) => /Moving air/.test(e.textContent)).click()`);
  const lane = await c.js<{ l: number; r: number; t: number }>(`(() => { const r = document.querySelector("[data-piece=p1]").getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top }; })()`);
  const spot: [number, number] = [lane.l + (lane.r - lane.l) * 0.45, lane.t + 140], n = await c.js<number>(`document.querySelectorAll("[data-piece]").length`);
  await mouse("mouseMoved", spot[0] - 8, spot[1]);
  await mouse("mouseMoved", ...spot);
  await mouse("mousePressed", ...spot, 1);
  await mouse("mouseReleased", ...spot);
  await until(`document.querySelectorAll("[data-piece]").length > ${n} && !!document.querySelector(".board__piece--on")`, "Moving air dropped and selected");
  await until(`!document.querySelector(".board__toggle[aria-disabled]")`, "the quick test on (the hole checked, no error)");
  await c.js(`document.querySelector(".board").focus()`);
  await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "t", code: "KeyT", text: "t" });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "t", code: "KeyT" });
  await until(`!!document.querySelector(".tbench--quick .tmode__score") && !!window.__g?.current()`, "the quick test over the moving air");
  await settled(c, `window.__live`, "the quick test's GL objects", 800);
  await c.js(`(() => { window.__frames = 0; const f = () => { window.__frames++; if (!window.__stop) requestAnimationFrame(f); }; window.__stop = false; requestAnimationFrame(f); })()`);
  const r0 = await c.js<number>(`window.__renders`);
  await sleep(1500); // (a window to count in)
  lent = { renders: (await c.js<number>(`window.__renders`)) - r0, frames: await c.js<number>(`(window.__stop = true, window.__frames)`), ...(await c.js<{ shape: number; window: number }>(`(() => { const e = document.querySelector(".tbench--quick canvas"); return { shape: Math.round((e.width / e.height) * 100) / 100, window: Math.round((innerWidth / innerHeight) * 100) / 100 }; })()`)) };
  // the context lost during the test, then back
  const LOST = `[...document.querySelectorAll(".tbench--quick [role=alert]")].some((e) => /3D view/.test(e.textContent))`;
  await c.js(`window.__lose = document.querySelector(".tbench--quick canvas").getContext("webgl2").getExtension("WEBGL_lose_context"), window.__lose.loseContext()`);
  const said = await waitFor<boolean>(c, LOST, "the quick test saying its 3D view was lost", 10_000).catch(() => false);
  await c.js(`window.__lose.restoreContext()`);
  const unsaid = await waitFor<boolean>(c, `!(${LOST})`, "the quick test's note gone once the 3D view is back", 10_000).catch(() => false);
  testLost = { said, unsaid };
  await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
}
c.kill();

// no WebGL: the 2D board
const flat = await launch({ width: W, height: H });
await flat.send("Page.addScriptToEvaluateOnNewDocument", { source: `{ const gc = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : gc.call(this, t, ...a); }; }` });
await flat.send("Page.navigate", { url: `${APP}/build/` });
await waitFor(flat, `!!document.querySelector(".board__ground")`, "the 2D board without WebGL", 60_000).catch(() => false);
const fallback = await flat.ev<boolean>(`!!document.querySelector(".board__ground") && !document.querySelector(".board--3d")`);
await flat.js(`document.querySelector(".bhint__ok")?.click()`);
await waitFor(flat, `!!document.querySelector(".board__toggle[aria-disabled]")`, "Quick test off without WebGL", 30_000).catch(() => false);
await flat.js(`document.querySelector(".board").focus()`);
await flat.send("Input.dispatchKeyEvent", { type: "keyDown", key: "t", code: "KeyT", text: "t" });
await flat.send("Input.dispatchKeyEvent", { type: "keyUp", key: "t", code: "KeyT" });
await flat.js(`[...document.querySelectorAll("button")].find((b) => /^Prove it$/.test(b.textContent))?.click()`);
// (what must not happen: a test opening or the page falling over, watched until nothing more changes)
await settled(flat, `[!!document.querySelector(".tbench--quick, .tmode"), !!document.querySelector(".board")]`, "the page after T and Prove it", 1500);
const noTest = await flat.js<{ quick: string; game: boolean; fell: boolean }>(`({ quick: [...document.querySelectorAll(".board__toggle")].find((b) => /Quick test/.test(b.textContent))?.title ?? "", game: !!document.querySelector(".tbench--quick, .tmode"), fell: !document.querySelector(".board") })`);
flat.kill();

const out = { at: `${W}×${H}`, normal, cpu4x: slow, drag: { builtDuring: during, builtAfter: after, relinked, eyesDuring, eyesAfter }, slugBuilt, zoom, idle, contexts, live, lost, world, scenery, large, lent, testLost, fallback2D: fallback, noTest };
console.log(JSON.stringify(out, null, 1));
assert.ok(normal.msPerFrame <= 1000 / 60 && normal.fps >= BUDGET.fps, `under 60 fps: ${JSON.stringify(normal)}`);
assert.ok(slow.msPerFrame <= 1000 / BUDGET.slowFps, `CPU 4x: under 30 fps: ${JSON.stringify(slow)}`);
assert.equal(during, 0, "the hole built again while a piece was dragged");
assert.equal(after, 1, `the drop built the hole ${after} times`);
assert.ok(eyesDuring === 0 && eyesAfter === 1 && zoom.eyes === 0, `the player's view painted ${eyesDuring} times during the drag, ${eyesAfter} after, ${zoom.eyes} while zoomed`);
assert.equal(slugBuilt, 0, `a slug edit built the hole ${slugBuilt} times`);
assert.equal(relinked, 0, `the drop's rebuild linked ${relinked} shader programs`);
assert.ok(zoom.renders <= zoom.frames + 1, `zoomed: ${zoom.renders} renders in ${zoom.frames} frames`);
assert.ok(idle.frames <= BUDGET.idleFrames, `idle: ${idle.frames} frames asked for`);
assert.ok(idle.cpu <= BUDGET.idleCpu, `idle: ${idle.cpu * 100}% CPU`);
assert.equal(contexts, 1, `${contexts} WebGL contexts`);
assert.ok(lent.renders <= lent.frames + 1 && Math.abs(lent.shape - lent.window) <= 0.02, `a quick test over a timed piece kept moving: ${JSON.stringify(lent)} (the board drew on the lent canvas)`);
assert.ok(large.px >= Math.round(large.css * Math.min(large.dpr, 1.25)) - 1, `the player's view large: ${large.px} px drawn for ${large.css} css px (stretched)`);
assert.ok(testLost.said && testLost.unsaid, `a quick test's context lost and back: ${JSON.stringify(testLost)}`);
assert.ok(scenery.every((x, i) => x.drawn === x.world && (i === 0 || x.eyes === 1)), `a world's own scenery: ${JSON.stringify(scenery)}`);
assert.ok(world.built === 0 && /could not load/.test(world.said) && !world.thrown.length && world.builtAgain === 1, `a world that would not load: ${JSON.stringify(world)}`);
assert.ok(lost.whileLost && lost.backIn3d && lost.drawn, `the context lost and back: ${JSON.stringify(lost)}`);
for (const k of Object.keys(live[0])) assert.ok(live.every((l) => l[k] <= live[0][k]), `GL ${k.toLowerCase()}s left by each quick test: ${live.map((l) => l[k]).join(" -> ")}`);
assert.ok(fallback, "no WebGL: no 2D board");
assert.ok(!noTest.fell && !noTest.game && /WebGL/.test(noTest.quick), `no WebGL: a test opened or the Builder fell over: ${JSON.stringify(noTest)}`);
console.log("builderbench: ok");
process.exit(0);
