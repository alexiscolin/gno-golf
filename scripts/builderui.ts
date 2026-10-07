#!/usr/bin/env -S node --experimental-strip-types
// The Builder's layout in a headless Chrome, against a dev server with the
// Builder on (NEXT_PUBLIC_BUILDER=1): at the widths a computer opens it at
// (900 px, its floor, to a wide screen, and a short laptop window), the
// window never scrolls sideways, the checks' dock holds its verdict and
// gauges, the three steps sit in the middle of the header, the header's
// action and the dock keep their places as their words change, what a step
// says when it is off is readable, and the note of a browser that keeps
// nothing covers no control; undo and redo stand whole in the header; the
// start screen (a player back) never scrolls sideways, keeps clear of the
// corner's Back and shows its starters above the fold. Exits non-zero on the first failure.
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
  // a fresh browser is a new player: the first run opens the starter with its hints (Got it); else the drafts screen's first starter
  for (let k = 0; k < 60 && !(await c.ev<boolean>(`!!document.querySelector(".bholes__starts button, .bhint__ok")`)); k++) await sleep(500);
  await c.js(`(document.querySelector(".bhint__ok") || document.querySelector(".bholes__starts button")).click()`);
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

const SIZES: [number, number][] = [[900, 800], [1024, 768], [1280, 800], [1440, 900], [1366, 650], [1512, 982]];
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
  // undo and redo: whole, inside the header, clear of the steps (nothing clipped, nothing under the steps)
  const head = (await box(c, ".bhead"))!, hist = await c.js<Box[]>(`[...document.querySelectorAll(".bhead__hist")].map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })`);
  assert.equal(hist.length, 2, `${at}: undo and redo in the header`);
  for (const b of hist) assert.ok(b.l >= head.l && b.r <= head.r && b.t >= head.t - 0.5 && b.b <= head.b + 0.5 && !overlap(b, steps) && b.r - b.l >= 39.5, `${at}: undo or redo cut or under the steps (${JSON.stringify(b)})`);
  assert.equal(await c.js(`[...document.querySelectorAll(".bhead__hist")].map((e) => e.getAttribute("aria-label")).join()`), "Undo,Redo", `${at}: undo and redo named`);
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

// the start screen (a player back, hinted): it never scrolls sideways, sits clear of the corner's Back, and its starters stand above the fold
for (const [w, h] of [[1440, 900], [1280, 720], [1024, 700]] as const) {
  const c = await launch({ width: w, height: h });
  await c.send("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem("gnogolf.builder.hinted", "1"); } catch {}` });
  await c.send("Page.navigate", { url: `${APP}/build/` });
  for (let k = 0; k < 60 && !(await c.ev<boolean>(`!!document.querySelector(".bholes__start")`)); k++) await sleep(500);
  await sleep(600);
  const at = `start ${w}×${h}`;
  assert.equal(await c.js(`document.documentElement.scrollWidth > innerWidth || document.querySelector(".bholes").scrollWidth > innerWidth`), false, `${at}: the window scrolls sideways`);
  const cards = await c.js<Box[]>(`[...document.querySelectorAll(".bholes__start")].map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })`);
  assert.equal(cards.length, 4, `${at}: three starters and a blank lane`);
  for (const b of cards) assert.ok(b.b <= h - 16 && b.l >= 0 && b.r <= w, `${at}: a starter's card below the fold or out of the window (${JSON.stringify(b)})`);
  const back = (await box(c, ".screen__back"))!;
  for (const sel of [".bholes__sign", ".bholes__bar", ".bholes__starts"]) assert.ok(!overlap(back, (await box(c, sel))!), `${at}: ${sel} under the corner's Back`);
  const sign = (await box(c, ".bholes__sign"))!, starts = (await box(c, ".bholes__starts"))!;
  assert.ok(Math.abs(sign.l + sign.r - w) <= 2 && Math.abs(starts.l + starts.r - w) <= 2, `${at}: the column is not centred`);
  console.log(`${at}: ok`);
  c.kill();
}

// the first run: a new player lands on the Garden's dogleg with three hints, gone with Got it, never shown again
{
  const c = await launch({ width: 1280, height: 800 });
  await c.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await c.send("Page.navigate", { url: `${APP}/build/` });
  for (let k = 0; k < 60 && !(await c.ev<boolean>(`!!document.querySelector(".bhint__ok, .bholes__starts button")`)); k++) await sleep(500);
  assert.equal(await c.js(`document.querySelectorAll(".bhint").length`), 3, "three hints");
  assert.equal(await c.js(`document.querySelector(".bhead__hole input").value`), "Garden Dogleg", "on the Garden's dogleg");
  assert.equal(await c.js(`document.activeElement?.textContent`), "Got it");
  // the hints leave the 3D in sight: none of them, nor Got it, over the preview
  for (let k = 0; k < 20 && !(await c.ev<boolean>(`!!document.querySelector(".col .preview")`)); k++) await sleep(300);
  const preview = await box(c, ".col .preview");
  assert.ok(preview, "the 3D's place");
  for (const [i, part] of (await c.js<Box[]>(`[...document.querySelectorAll(".bhint, .bhint__ok")].map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })`)).entries()) {
    assert.ok(!overlap(part, preview), `hint ${i + 1} covers the 3D preview`);
  }
  assert.equal(await c.js(`document.querySelectorAll(".bgloss").length`), 0, "the first run: three hints, no glossary");
  await c.js(`document.querySelector(".bhint__ok").click()`);
  await sleep(300);
  assert.equal(await c.js(`document.querySelectorAll(".bhint").length`), 0, "gone with Got it");
  await c.send("Page.reload");
  for (let k = 0; k < 60 && !(await c.ev<boolean>(`!!document.querySelector(".bholes__list")`)); k++) await sleep(500);
  assert.equal(await c.js(`document.querySelectorAll(".bhint").length`), 0, "never again: the drafts screen, the dogleg kept");
  // "?": the three hints again and, under them, one screen of the world's pieces (each tile's picture, name, what it does), the keys
  await c.js(`document.querySelector(".bholes__starts button").click()`);
  for (let k = 0; k < 40 && !(await c.ev<boolean>(`!!document.querySelector(".checks .gauge")`)); k++) await sleep(300);
  await c.js(`document.querySelector(".bhead [aria-label^='How it works']").click()`);
  await sleep(500);
  assert.equal(await c.js(`document.querySelectorAll(".bhint").length`), 3, "?: the three hints");
  const tiles = await c.js<number>(`document.querySelectorAll(".palette [data-tile]").length`);
  assert.equal(await c.js(`document.querySelectorAll(".bgloss__piece").length`), tiles, "?: a line for each tile of the palette");
  assert.ok(await c.js<boolean>(`[...document.querySelectorAll(".bgloss__piece")].every((e) => e.querySelector("img") && e.querySelector("b").textContent && e.querySelector("small").textContent)`), "each: its picture, its name, what it does");
  const g = (await box(c, ".bgloss"))!;
  assert.ok(g.t >= 0 && g.b <= 800 && g.l >= 0 && g.r <= 1280, `the glossary on one screen: ${JSON.stringify(g)}`);
  assert.ok(await c.js<boolean>(`(() => { const e = document.querySelector(".bgloss"); return e.scrollHeight <= e.clientHeight + 1; })()`), "the glossary on one screen, not scrolled");
  for (const [i, part] of (await c.js<Box[]>(`[...document.querySelectorAll(".bhint, .bhint__ok, .bgloss")].map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })`)).entries()) {
    assert.ok(!overlap(part, (await box(c, ".col .preview"))!), `help part ${i + 1} covers the 3D preview`);
  }
  await c.js(`document.querySelector(".bhint__ok").click()`);
  await sleep(300);
  assert.equal(await c.js(`document.querySelectorAll(".bgloss, .bhint").length`), 0, "gone with Got it");
  console.log("first run: ok");
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
  // the straight starter (its obstacles): from the drafts screen
  await c.js(`document.querySelector(".bhead .round--icon").click()`);
  for (let k = 0; k < 20 && !(await c.ev<boolean>(`!!document.querySelector(".bholes__starts button")`)); k++) await sleep(300);
  await c.js(`document.querySelector(".bholes__starts button").click()`);
  for (let k = 0; k < 40 && !(await c.ev<boolean>(`!!document.querySelector("[data-piece][aria-label*=' obstacle at ']")`)); k++) await sleep(300);
  await sleep(800);
  const key = async (key: string, code = key) => {
    await c.send("Input.dispatchKeyEvent", { type: "keyDown", key, code });
    await c.send("Input.dispatchKeyEvent", { type: "keyUp", key, code });
  };
  await c.js(`[...document.querySelectorAll("[data-piece]")].find((g) => / obstacle at /.test(g.getAttribute("aria-label"))).focus()`);
  await sleep(600);
  const n = await c.js<number>(`document.querySelectorAll("[data-piece]").length`);
  assert.equal(await c.js(`[...document.querySelectorAll(".insp input")].filter((x) => x.checkVisibility()).length`), 0, "a piece selected: no number to type until Details is opened");
  await c.js(`document.querySelector(".insp__details").open = true`);
  await sleep(200);
  assert.ok(await c.js<number>(`[...document.querySelectorAll(".insp input")].filter((x) => x.checkVisibility()).length`) > 0, "Details opened: its sliders");
  await c.js(`[...document.querySelectorAll(".insp button")].find((b) => /Delete/.test(b.textContent)).focus()`);
  await c.js(`[...document.querySelectorAll(".insp button")].find((b) => /Delete/.test(b.textContent)).click()`);
  await sleep(800);
  assert.equal(await c.js(`document.querySelectorAll("[data-piece]").length`), n - 1, "the piece deleted");
  assert.equal(await c.js(`document.activeElement?.classList.contains("board")`), true, "the focus on the board after a Delete");
  // a post dragged from the board onto the palette's bin: removed
  const mouse = (type: string, x: number, y: number) => c.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
  const centre = (sel: string) => c.js<[number, number]>(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  const post = await c.js<[number, number]>(`(() => { const g = [...document.querySelectorAll("[data-piece]")].find((g) => / obstacle at /.test(g.getAttribute("aria-label"))); const r = g.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  const bin = await centre("[data-bin]");
  await mouse("mousePressed", ...post);
  for (let k = 1; k <= 6; k++) {
    await mouse("mouseMoved", post[0] + ((bin[0] - post[0]) * k) / 6, post[1] + ((bin[1] - post[1]) * k) / 6);
    await sleep(50);
  }
  await mouse("mouseReleased", ...bin);
  await sleep(1200);
  assert.equal(await c.js(`document.querySelectorAll("[data-piece]").length`), n - 2, "a post dropped on the bin is removed");
  // the cup taken by its flag, the tee by its edge: each moved, the board not panned (a hit area bigger than the drawing)
  const at = (sel: string) => c.js<[number, number]>(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return [+e.getAttribute("cx"), +e.getAttribute("cy")]; })()`);
  const onScreen = (sel: string) => c.js<[number, number]>(`(() => { const svg = document.querySelector(".board__map"), e = document.querySelector(${JSON.stringify(sel)}); const p = svg.createSVGPoint(); p.x = +e.getAttribute("cx"); p.y = +e.getAttribute("cy"); const s = p.matrixTransform(svg.getScreenCTM()); return [s.x, s.y]; })()`);
  const drag = async (from: [number, number], dx: number) => {
    await mouse("mousePressed", ...from);
    for (let k = 1; k <= 6; k++) {
      await mouse("mouseMoved", from[0] + (dx * k) / 6, from[1]);
      await sleep(40);
    }
    await mouse("mouseReleased", from[0] + dx, from[1]);
    await sleep(1000);
  };
  const k = await c.js<number>(`document.querySelector(".board__map").getScreenCTM().a`); // (px a unit)
  for (const [what, sel, grip] of [["the cup, by its flag", "[data-end='pin'] circle", (p: [number, number]): [number, number] => [p[0] + 0.35 * k, p[1] - 0.95 * k]], ["the tee, by its edge", "[data-end='tee'] circle", (p: [number, number]): [number, number] => [p[0] + 0.8 * k, p[1] + 0.3 * k]]] as const) {
    const was = await at(sel), other = await onScreen(sel === "[data-end='tee'] circle" ? "[data-end='pin'] circle" : "[data-end='tee'] circle");
    await drag(grip(await onScreen(sel)), -1.5 * k);
    assert.notDeepEqual(await at(sel), was, `${what}: moved`);
    assert.deepEqual(await onScreen(sel === "[data-end='tee'] circle" ? "[data-end='pin'] circle" : "[data-end='tee'] circle"), other, `${what}: the board not panned`);
  }
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
// the keys: 1 to 5 pick the palette's first five, Space and a drag pan (a piece under it too), F frames the hole,
// T goes to Test, Escape comes back; the board's key line says them
{
  const c = await editor(1280, 800);
  const key = async (key: string, code: string, type: "both" | "down" | "up" = "both") => {
    if (type !== "up") await c.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, ...(key.length === 1 && { text: key }) });
    if (type !== "down") await c.send("Input.dispatchKeyEvent", { type: "keyUp", key, code });
    await sleep(150);
  };
  const mouse = (type: string, x: number, y: number) => c.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
  await c.js(`document.querySelector(".board").focus()`);
  await key("2", "Digit2");
  assert.equal(await c.js(`document.querySelector(".palette .piece--on .piece__name")?.textContent`), "Bumper", "2: the second piece, armed");
  await key("Escape", "Escape");
  const keys = await c.js<string>(`document.querySelector(".board__keys").textContent`);
  for (const k of ["1–5", "Space", "F", "T"]) assert.ok(keys.includes(k), `the key line says ${k}: ${keys}`);
  // Space held, a drag over a piece pans (the piece stays)
  const tee = () => c.js<[number, number]>(`(() => { const r = document.querySelector("[data-end='tee'] circle").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  const piece = await c.js<[number, number]>(`(() => { const r = document.querySelector("[data-piece]").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  const pieceAt = () => c.js<string>(`document.querySelector("[data-piece]").getAttribute("aria-label")`);
  const was = await tee(), label = await pieceAt();
  await key(" ", "Space", "down");
  await mouse("mousePressed", ...piece);
  for (let k = 1; k <= 5; k++) {
    await mouse("mouseMoved", piece[0] + 12 * k, piece[1] + 8 * k);
    await sleep(30);
  }
  await mouse("mouseReleased", piece[0] + 60, piece[1] + 40);
  await key(" ", "Space", "up");
  await sleep(300);
  const now = await tee();
  assert.ok(Math.abs(now[0] - was[0] - 60) < 2 && Math.abs(now[1] - was[1] - 40) < 2, `Space and a drag: the board panned (${was.join()} → ${now.join()})`);
  assert.equal(await pieceAt(), label, "the piece under it not moved");
  // F: framed again (the tee back where the first framing had it)
  await key("f", "KeyF");
  await sleep(300);
  const back = await tee();
  assert.ok(Math.abs(back[0] - was[0]) < 2 && Math.abs(back[1] - was[1]) < 2, `F frames the hole (${was.join()} → ${back.join()})`);
  // T: to Test; Escape: back to the editor
  for (let k = 0; k < 20 && (await c.ev<boolean>(`!!document.querySelector(".bhead__end .btn[aria-disabled]")`)); k++) await sleep(300);
  await key("t", "KeyT");
  for (let k = 0; k < 20 && !(await c.ev<boolean>(`!!document.querySelector(".tmode")`)); k++) await sleep(300);
  assert.ok(await c.ev<boolean>(`!!document.querySelector(".tmode")`), "T: to Test");
  await key("Escape", "Escape");
  for (let k = 0; k < 20 && !(await c.ev<boolean>(`!!document.querySelector(".board__map")`)); k++) await sleep(300);
  assert.ok(await c.ev<boolean>(`!!document.querySelector(".board__map")`), "Escape: back from Test to the editor");
  console.log("keys: ok");
  c.kill();
}
console.log("builderui: all ok");
process.exit(0);
