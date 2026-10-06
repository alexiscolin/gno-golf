#!/usr/bin/env -S node --experimental-strip-types
// The Builder's layout in a headless Chrome, against a dev server with the
// Builder on (NEXT_PUBLIC_BUILDER=1): at the widths a computer opens it at
// (900 px, its floor, to a wide screen, and a short laptop window), the
// window never scrolls sideways, the checks' dock holds its verdict and
// gauges, the three steps sit in the middle of the header, the header's
// action and the dock keep their places as their words change, what a step
// says when it is off is readable, and the note of a browser that keeps
// nothing covers no control. Exits non-zero on the first failure.
//
//   APP=http://localhost:3471 node --experimental-strip-types scripts/builderui.ts

import assert from "node:assert/strict";

interface Browser {
  send: (method: string, params?: object) => Promise<unknown>;
  ev: <T = unknown>(expr: string) => Promise<T>;
  js: <T = unknown>(expr: string) => Promise<T>;
  errors: unknown[];
  kill: () => void;
}
const cdp = (await import("../media/lib/cdp.mjs")) as {
  launch: (o: { width: number; height: number }) => Promise<Browser>;
  sleep: (ms: number) => Promise<void>;
  APP: string;
};
const { launch, sleep, APP } = cdp;
type Box = { l: number; t: number; r: number; b: number };

/** The page at /build/, a new hole opened (a starter), in a window w × h; before: a script run ahead of the page's own. */
async function editor(w: number, h: number, before = "") {
  const c = await launch({ width: w, height: h });
  await c.send("Emulation.setFocusEmulationEnabled", { enabled: true }); // (a headless page has no focus of its own: focus events need it)
  if (before) await c.send("Page.addScriptToEvaluateOnNewDocument", { source: before });
  await c.send("Page.enable");
  await c.send("Page.navigate", { url: `${APP}/build/` });
  for (let k = 0; k < 60 && !(await c.ev<boolean>(`!!document.querySelector(".bholes__starts button")`)); k++) await sleep(500);
  await c.js(`document.querySelector(".bholes__starts button").click()`);
  for (let k = 0; k < 60 && !(await c.ev<boolean>(`!!document.querySelector(".checks .gauge")`)); k++) await sleep(500);
  await sleep(800);
  return c;
}
const box = (c: Browser, sel: string) => c.js<Box | null>(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })()`);
const overlap = (a: Box, b: Box) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
const typeInto = (c: Browser, sel: string, v: string) =>
  c.js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
// the WCAG contrast of an element's text on the first opaque background behind it
const CONTRAST = `(sel) => {
  const e = document.querySelector(sel); if (!e) return null;
  const rgb = (s) => (s.match(/[\\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => { const f = (v) => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  let bg = null, op = 1;
  for (let x = e; x; x = x.parentElement) { const s = getComputedStyle(x); op *= +s.opacity; const c = rgb(s.backgroundColor); if (!bg && (c[3] ?? 1) > 0.9 && s.backgroundImage === "none") bg = c; }
  const fg = rgb(getComputedStyle(e).color), [a, b] = [lum(fg), lum(bg || [255, 255, 255])].sort((x, y) => y - x);
  return { ratio: (a + 0.05) / (b + 0.05), opacity: op };
}`;

const SIZES: [number, number][] = [[900, 800], [1024, 768], [1280, 800], [1440, 900], [1366, 650]];
for (const [w, h] of SIZES) {
  const c = await editor(w, h);
  const at = `${w}×${h}`;
  assert.equal(await c.js(`document.documentElement.scrollWidth > innerWidth`), false, `${at}: the window scrolls sideways`);
  // the dock: its line and, its limits opened, every gauge inside it
  await c.js(`document.querySelector(".checks__limits").open = true`);
  await sleep(200);
  const dock = (await box(c, ".checks"))!;
  const inside = await c.js<Box[]>(`[...document.querySelectorAll(".checks__line > *, .checks .gauge")].map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })`);
  for (const b of inside.filter((x) => x.r > x.l)) assert.ok(b.r <= dock.r + 0.5 && b.l >= dock.l - 0.5, `${at}: the dock spills (${JSON.stringify(b)} out of ${JSON.stringify(dock)})`);
  // the three steps in the middle of the header
  const steps = (await box(c, ".stepper"))!;
  assert.ok(Math.abs((steps.l + steps.r) / 2 - w / 2) <= 2, `${at}: the steps sit at ${(steps.l + steps.r) / 2}, not ${w / 2}`);
  // the header's action and the dock keep their places as their words change (a slug, then none)
  await typeInto(c, ".bhead__slug", "a-name");
  await sleep(1500);
  const named = { undo: (await box(c, ".bhead__end .round"))!, gauge: (await box(c, ".checks__limits summary"))! };
  await typeInto(c, ".bhead__slug", "");
  await sleep(1500);
  const unnamed = { undo: (await box(c, ".bhead__end .round"))!, gauge: (await box(c, ".checks__limits summary"))! };
  assert.ok(Math.abs(named.undo.l - unnamed.undo.l) < 1, `${at}: Undo moves as the action's words change (${named.undo.l} → ${unnamed.undo.l})`);
  assert.ok(Math.abs(named.gauge.l - unnamed.gauge.l) < 1, `${at}: the limits move as the verdict changes (${named.gauge.l} → ${unnamed.gauge.l})`);
  // the action off, its reason readable (no faded text)
  const off = await c.js<{ ratio: number; opacity: number } | null>(`(${CONTRAST})(".bhead__end .btn[aria-disabled=true]")`);
  assert.ok(off, `${at}: the action is not off with no name`);
  assert.ok(off.opacity === 1 && off.ratio >= 4.5, `${at}: the action's reason, off, reads at ${off.ratio.toFixed(2)}:1, opacity ${off.opacity}`);
  console.log(`${at}: ok`);
  c.kill();
}

// no 3D (WebGL refused): the preview says so, readably
{
  const c = await editor(1280, 800, `HTMLCanvasElement.prototype.getContext = function () { return null; };`);
  const r = await c.js<{ ratio: number; opacity: number } | null>(`(${CONTRAST})(".col .preview--off, .col .preview.nothing")`);
  assert.ok(r && r.ratio >= 4.5, `no WebGL: the preview's sentence reads at ${r?.ratio.toFixed(2)}:1`);
  console.log("no 3D: ok");
  c.kill();
}

// a browser that keeps nothing (a private window): its note covers no control
{
  const c = await editor(1024, 768, `Storage.prototype.setItem = function () { throw new Error("blocked"); };`);
  const note = await box(c, ".bench__unkept");
  assert.ok(note, "the note is shown");
  for (const sel of [".checks", ".board", ".palette", ".col"]) {
    const b = await box(c, sel);
    if (b) assert.ok(!overlap(note, b), `the note covers ${sel}`);
  }
  console.log("keeps nothing: ok");
  c.kill();
}
// a piece deleted from the Inspector: the focus on the board, not lost; a draft deleted: the game's sheet, Escape keeps it
{
  const c = await editor(1280, 800);
  const key = async (key: string, code = key) => {
    await c.send("Input.dispatchKeyEvent", { type: "keyDown", key, code });
    await c.send("Input.dispatchKeyEvent", { type: "keyUp", key, code });
  };
  await c.js(`[...document.querySelectorAll("[data-piece]")].find((g) => / post at /.test(g.getAttribute("aria-label"))).focus()`);
  await sleep(600);
  const n = await c.js<number>(`document.querySelectorAll("[data-piece]").length`);
  await c.js(`[...document.querySelectorAll(".insp button")].find((b) => /Delete/.test(b.textContent)).focus()`);
  await c.js(`[...document.querySelectorAll(".insp button")].find((b) => /Delete/.test(b.textContent)).click()`);
  await sleep(800);
  assert.equal(await c.js(`document.querySelectorAll("[data-piece]").length`), n - 1, "the piece deleted");
  assert.equal(await c.js(`document.activeElement?.classList.contains("board")`), true, "the focus on the board after a Delete");
  await c.js(`document.querySelector(".bhead .round--icon").click()`); // back to the drafts
  for (let k = 0; k < 20 && !(await c.ev<boolean>(`!!document.querySelector(".bholes__list")`)); k++) await sleep(300);
  const drafts = await c.js<number>(`document.querySelectorAll(".bholes__list li").length`);
  await c.js(`[...document.querySelectorAll(".bholes__list button")].find((b) => /Delete/.test(b.textContent)).click()`);
  await sleep(400);
  assert.equal(await c.js(`document.querySelector('[role="alertdialog"]')?.getAttribute("aria-label")`), "Delete this hole", "the game's sheet, not window.confirm");
  await key("Escape");
  await sleep(400);
  assert.equal(await c.js(`!!document.querySelector('[role="alertdialog"]')`), false, "Escape closes it");
  assert.equal(await c.js(`document.querySelectorAll(".bholes__list li").length`), drafts, "and keeps the draft");
  assert.match(await c.js<string>(`document.activeElement?.textContent || ""`), /Delete/, "the focus back on the row's Delete");
  console.log("delete: ok");
  c.kill();
}
console.log("builderui: all ok");
process.exit(0);
