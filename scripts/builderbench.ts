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
//   never for an edit that changes nothing drawn (the slug);
// - zoomed with the wheel (motion on), the board drawn once a frame at most;
// - idle, the loop stopped: no frame asked for, little CPU;
// - one WebGL context for the page, a quick test and Prove it visited and
//   left (stage.ts);
// - five quick tests in a row leave no GL program, texture or buffer behind
//   (the game draws with the board's own renderer, lent to it);
// - no WebGL: the 2D board.
// It prints the numbers as JSON.
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
const cdp = (await import("../media/lib/cdp.mjs")) as { launch: (o: { width: number; height: number }) => Promise<Browser>; sleep: (ms: number) => Promise<void>; APP: string };
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

const c = await launch({ width: W, height: H });
await c.send("Emulation.setFocusEmulationEnabled", { enabled: true });
await c.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
await c.send("Page.addScriptToEvaluateOnNewDocument", { source: COUNT });
await c.send("Performance.enable");
await c.send("Page.navigate", { url: `${APP}/build/?camlog` });
const until = async (expr: string, what: string, ms = 60_000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) if (await c.ev<boolean>(expr)) return;
  throw new Error(`waited for ${what}`);
};
await until(`!!document.querySelector(".bhint__ok")`, "the first run");
await c.js(`document.querySelector(".bhint__ok").click()`);
await until(`!!document.querySelector(".board--3d canvas") && (window.__builds ?? 0) > 0`, "the board in 3D");
await sleep(1500);
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
const before = await builds(), linked = () => c.js<number>(`window.__linked`);
await mouse("mousePressed", ...piece, 1);
for (let k = 1; k <= 120; k++) {
  await mouse("mouseMoved", piece[0] - 40 * Math.sin(k / 12), piece[1] + 30 * Math.sin(k / 9), 1);
  await sleep(16);
}
const during = (await builds()) - before;
const linked0 = await linked();
await mouse("mouseReleased", piece[0] - 30, piece[1] + 24);
await sleep(1500);
const after = (await builds()) - before, relinked = (await linked()) - linked0;

// the slug edited: checked again, the same hole drawn, not built again
const builds0 = await builds();
await c.js(`(() => { const el = document.querySelector(".bhead__slug"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "bench-slug"); el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
await sleep(1500);
const slugBuilt = (await builds()) - builds0;

// zoomed with the wheel, in and out: the renders (a render clears once) over the frames shown
await c.js(`(() => { window.__frames = 0; const f = () => { window.__frames++; if (!window.__stop) requestAnimationFrame(f); }; window.__stop = false; requestAnimationFrame(f); })()`);
const renders0 = await c.js<number>(`window.__renders`);
for (let k = 0; k < 40; k++) {
  await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: board.l + board.w / 2, y: board.t + board.h / 2, deltaX: 0, deltaY: k % 20 < 10 ? -40 : 40 });
  await sleep(16);
}
const zoomFrames = await c.js<number>(`(window.__stop = true, window.__frames)`), zoom = { renders: (await c.js<number>(`window.__renders`)) - renders0, frames: zoomFrames };

// idle: past the scene's IDLE_MS, nothing asked of the screen, little of the CPU
await mouse("mouseMoved", 5, 5);
await sleep(2600);
const raf0 = await c.js<number>(`window.__raf`), t0 = await task(), w0 = Date.now();
await sleep(3000);
const idle = { frames: (await c.js<number>(`window.__raf`)) - raf0, cpu: Math.round(((await task()) - t0) / ((Date.now() - w0) / 1000) * 1000) / 1000 };

// five quick tests, and back from each: the GL objects alive after each (the first one's left are the board's renderer's cache)
const live: Record<string, number>[] = [];
for (let k = 0; k < 5; k++) {
  await c.js(`document.querySelector(".board").focus()`);
  await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "t", code: "KeyT", text: "t" });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "t", code: "KeyT" });
  await until(`!!document.querySelector(".tbench--quick .tmode__chip")`, "the quick test");
  await sleep(2500);
  await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await until(`!document.querySelector(".tbench--quick")`, "back from the quick test");
  await sleep(800);
  live.push(await c.js<Record<string, number>>(`({ ...window.__live })`));
}
// and Prove it, and back: still the one context
await c.js(`[...document.querySelectorAll("button")].find((b) => /^Prove it$/.test(b.textContent)).click()`);
await until(`!!document.querySelector(".tmode")`, "Prove");
await c.js(`[...document.querySelectorAll("button")].find((b) => /^Back to edit$/.test(b.textContent)).click()`);
await until(`!!document.querySelector(".board--3d canvas")`, "the board again");
await sleep(800);
const contexts = await c.js<number>(`window.__gl.size`);
c.kill();

// no WebGL: the 2D board
const flat = await launch({ width: W, height: H });
await flat.send("Page.addScriptToEvaluateOnNewDocument", { source: `HTMLCanvasElement.prototype.getContext = function () { return null; };` });
await flat.send("Page.navigate", { url: `${APP}/build/` });
for (let k = 0; k < 120 && !(await flat.ev<boolean>(`!!document.querySelector(".board__ground")`)); k++) await sleep(250);
const fallback = await flat.ev<boolean>(`!!document.querySelector(".board__ground") && !document.querySelector(".board--3d")`);
flat.kill();

const out = { at: `${W}×${H}`, normal, cpu4x: slow, drag: { builtDuring: during, builtAfter: after, relinked }, slugBuilt, zoom, idle, contexts, live, fallback2D: fallback };
console.log(JSON.stringify(out, null, 1));
assert.ok(normal.msPerFrame <= 1000 / 60 && normal.fps >= BUDGET.fps, `under 60 fps: ${JSON.stringify(normal)}`);
assert.ok(slow.msPerFrame <= 1000 / BUDGET.slowFps, `CPU 4x: under 30 fps: ${JSON.stringify(slow)}`);
assert.equal(during, 0, "the hole built again while a piece was dragged");
assert.equal(after, 1, `the drop built the hole ${after} times`);
assert.equal(slugBuilt, 0, `a slug edit built the hole ${slugBuilt} times`);
assert.equal(relinked, 0, `the drop's rebuild linked ${relinked} shader programs`);
assert.ok(zoom.renders <= zoom.frames + 1, `zoomed: ${zoom.renders} renders in ${zoom.frames} frames`);
assert.ok(idle.frames <= BUDGET.idleFrames, `idle: ${idle.frames} frames asked for`);
assert.ok(idle.cpu <= BUDGET.idleCpu, `idle: ${idle.cpu * 100}% CPU`);
assert.equal(contexts, 1, `${contexts} WebGL contexts`);
for (const k of Object.keys(live[0])) assert.ok(live.every((l) => l[k] <= live[0][k]), `GL ${k.toLowerCase()}s left by each quick test: ${live.map((l) => l[k]).join(" -> ")}`);
assert.ok(fallback, "no WebGL: no 2D board");
console.log("builderbench: ok");
process.exit(0);
