#!/usr/bin/env -S node --experimental-strip-types
// The Builder's layout in a headless Chrome, against a dev server with the
// Builder on (NEXT_PUBLIC_BUILDER=1): at the widths a computer opens it at
// (900 px, its floor, to a wide screen, and a short laptop window), the
// window never scrolls sideways, the checks' dock takes no room when all is
// well (no gauge far from its limit; a problem opens it, its piece a click
// away, and fixed it folds back), the three steps sit in the middle of the
// header, Undo keeps its place as Play's reason comes and goes, what Play
// says when it is off is readable, and the note of a browser that keeps
// nothing covers no control; undo and redo stand whole in the header; the
// palette shows its first five unscrolled (More pieces folded), folds as
// left for the visit; the start screen (a player back) never scrolls
// sideways, keeps clear of the corner's Back and shows its starters above
// the fold. Exits non-zero on the first failure.
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
  offline: (b: Browser, now?: boolean) => Promise<{ back: () => Promise<unknown> }>;
};
const { launch, sleep, APP } = cdp;
const { misaligned, footprint, gold, underChip } = (await import("../media/lib/rows.mjs")) as {
  underChip: () => string;
  misaligned: (rows: { name: string; box: string; words?: string; by?: string }[]) => string;
  footprint: (sel: string) => string;
  gold: (sel: string) => string;
};
type Box = { l: number; t: number; r: number; b: number };

/** The page at /build/, a new hole opened (a starter), in a window w × h; before: a script run ahead of the page's own. */
async function editor(w: number, h: number, before = "") {
  const c = await launch({ width: w, height: h });
  await c.send("Emulation.setFocusEmulationEnabled", { enabled: true }); // (a headless page has no focus of its own: focus events need it)
  if (before) await c.send("Page.addScriptToEvaluateOnNewDocument", { source: before });
  await c.send("Page.enable");
  await c.send("Page.navigate", { url: `${APP}/build/` });
  // a fresh browser is a new player: the first run opens the starter with its hints (the pointer through them); else the drafts screen's first starter
  for (let k = 0; k < 60 && !(await c.ev<boolean>(`!!document.querySelector(".bholes__starts button, .bhint")`)); k++) await sleep(500);
  await c.js(`void (document.querySelector(".bhint") || document.querySelector(".bholes__starts button").click())`);
  for (let k = 0; k < 60 && !(await c.ev<boolean>(`!!document.querySelector(".palette .piece") && !!document.querySelector(".bhead__act")`)); k++) await sleep(500);
  await sleep(800);
  return c;
}
const box = (c: Browser, sel: string) => c.js<Box | null>(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })()`);
/** The middle of a box, as a pointer presses it. */
const midpoint = (b: Box): [number, number] => [(b.l + b.r) / 2, (b.t + b.b) / 2];
/** The middle of the first element sel finds, on the screen. */
const centre = async (c: Browser, sel: string) => midpoint((await box(c, sel))!);
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

const SIZES: [number, number][] = [[900, 800], [1024, 768], [1280, 800], [1440, 900], [1366, 650], [1512, 982], [1920, 1080]];
for (const [w, h] of SIZES) {
  const c = await editor(w, h);
  const at = `${w}×${h}`;
  assert.equal(await c.js(`document.documentElement.scrollWidth > innerWidth`), false, `${at}: the window scrolls sideways`);
  // the keys line: each key with its words on one line, and a line starts with a key, never a separator
  const legend = await c.js<{ broken: string[]; led: string[] }>(`(() => {
    const spans = [...document.querySelectorAll(".board__keys > span")], rects = spans.map((s) => s.getClientRects());
    const lineStart = (i) => i === 0 || rects[i][0].top > rects[i - 1][rects[i - 1].length - 1].top + 2;
    return { broken: spans.filter((_, i) => rects[i].length > 1).map((s) => s.textContent), led: spans.filter((s, i) => lineStart(i) && !s.textContent.trim().startsWith(s.querySelector("kbd").textContent)).map((s) => s.textContent) };
  })()`);
  assert.deepEqual(legend, { broken: [], led: [] }, `${at}: the keys line breaks inside an entry, or a line starts with a separator`);
  // one line, inside the board (the few keys most used; ? shows them all)
  const line = await c.js<{ h: number; lh: number; over: number }>(`(() => { const e = document.querySelector(".board__keys"), r = e.getBoundingClientRect(), b = document.querySelector(".board").getBoundingClientRect(); return { h: r.height, lh: e.querySelector("span").getBoundingClientRect().height, over: r.right - b.right }; })()`);
  assert.ok(line.h < 2 * line.lh && line.over <= 0, `${at}: the keys line wraps or spills (${JSON.stringify(line)})`);
  // the dock, all well: no room taken, no gauge (a gauge only near its limit), nothing of the chain's counts
  const dock = (await box(c, ".checks"))!;
  assert.ok(dock.b - dock.t < 1, `${at}: the dock takes ${dock.b - dock.t} px with nothing to say`);
  assert.equal(await c.js(`document.querySelectorAll(".checks .gauge, .checks__chain").length`), 0, `${at}: a gauge far from its limit, or the chain's limits`);
  // the three steps in the middle of the header
  const steps = (await box(c, ".stepper"))!;
  assert.ok(Math.abs((steps.l + steps.r) / 2 - w / 2) <= 2, `${at}: the steps sit at ${(steps.l + steps.r) / 2}, not ${w / 2}`);
  // undo and redo: whole, inside the header, clear of the steps (nothing clipped, nothing under the steps)
  const head = (await box(c, ".bhead"))!, hist = await c.js<Box[]>(`[...document.querySelectorAll(".bhead__hist")].map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })`);
  assert.equal(hist.length, 2, `${at}: undo and redo in the header`);
  for (const b of hist) assert.ok(b.l >= head.l && b.r <= head.r && b.t >= head.t - 0.5 && b.b <= head.b + 0.5 && !overlap(b, steps) && b.r - b.l >= 39.5, `${at}: undo or redo cut or under the steps (${JSON.stringify(b)})`);
  assert.equal(await c.js(`[...document.querySelectorAll(".bhead__hist")].map((e) => e.getAttribute("aria-label")).join()`), "Undo,Redo", `${at}: undo and redo named`);
  // the palette: "More pieces" and "From other worlds" folded at first (each group open within); it scrolls in itself, never the window
  assert.deepEqual(await c.js(`[...document.querySelectorAll(".palette .palette__more")].map((d) => d.dataset.fold + " " + d.open)`), ["more false", "others false"], `${at}: the palette's folds at first`);
  assert.ok(await c.js<boolean>(`[...document.querySelectorAll(".palette .palette__group")].every((d) => d.open && d.dataset.fold.startsWith("group/"))`), `${at}: a group of the palette folded at first`);
  const pal = await c.js<{ over: string; sh: number; ch: number }>(`(() => { const p = document.querySelector(".palette"); return { over: getComputedStyle(p).overflowY, sh: p.scrollHeight, ch: p.clientHeight }; })()`);
  assert.ok(pal.over === "auto" && (pal.sh <= pal.ch || (await c.js(`document.documentElement.scrollHeight <= innerHeight`))), `${at}: the palette spills onto the page (${JSON.stringify(pal)})`);
  console.log(`${at}: ok`);
  c.kill();
}

// the buttons in a row as tall as one another, on one top and their words on one baseline (Button's sizes): the
// header's (Back, the steps, the meter, ?, undo, redo, the action), the Inspector's; off, a button keeps the box it has
// on (undo, before and after an edit), and so does one on (the difficulty chip showing its line: gold, as every on
// control); the palette's pieces are rows on one grid, no look under them, its first five whole with no scroll
for (const [w, h] of [[1440, 900], [1280, 800], [1024, 700]] as const) {
  const c = await editor(w, h);
  const at = `buttons ${w}×${h}`;
  await c.js(`document.querySelector("[data-piece]").focus()`);
  await sleep(600);
  const rows = [
    { name: "the header", box: ".bhead__start > .btn, .bhead .stepper, .bhead__end .btn, .bhead__end .chip", words: ".bhead .step span, .bhead__end .chip > span, .bhead__act" },
    { name: "the Inspector's", box: ".insp__acts .btn" },
  ];
  assert.deepEqual(await c.js<string[]>(misaligned(rows)), [], `${at}: out of line`);
  const head = await c.js<{ l: number; r: number }[]>(`[...document.querySelectorAll(".bhead__start > *, .bhead .stepper, .bhead__end > *")].filter((e) => e.getBoundingClientRect().width).map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right }; })`);
  for (const [i, b] of head.slice(1).entries()) assert.ok(b.l >= head[i].r - 0.5, `${at}: the header's parts overlap (${JSON.stringify(head)})`);
  const off = await c.js<object>(footprint(".bhead__hist"));
  assert.equal(await c.js(`document.querySelector(".bhead__hist").disabled`), true, `${at}: undo off before any edit`);
  await typeInto(c, ".bhead__name input", "Moved nothing");
  await sleep(600);
  assert.equal(await c.js(`document.querySelector(".bhead__hist").disabled`), false, `${at}: undo on after an edit`);
  assert.deepEqual(await c.js<object>(footprint(".bhead__hist")), off, `${at}: undo's box changes as it comes on`);
  // on (the difficulty chip pressed: its line on the board): gold, its box kept, the header still in line
  const METER = ".bhead__meter .meter";
  for (let k = 0; k < 40 && (await c.ev<boolean>(`!document.querySelector(${JSON.stringify(METER)}) || document.querySelector(${JSON.stringify(METER)}).disabled`)); k++) await sleep(300);
  const unpressed = await c.js<object>(footprint(METER));
  await c.js(`document.querySelector(${JSON.stringify(METER)}).click()`);
  await sleep(300);
  assert.equal(await c.js(`document.querySelector(${JSON.stringify(METER)}).getAttribute("aria-pressed")`), "true", `${at}: the meter's line not on`);
  assert.ok(await c.js<boolean>(`!!document.querySelector(".board__line polyline")`), `${at}: the meter's line not drawn on the board`);
  assert.deepEqual(await c.js<object>(footprint(METER)), unpressed, `${at}: the difficulty chip's box changes as it comes on`);
  assert.equal(await c.js(gold(METER)), true, `${at}: the difficulty chip on, not gold`);
  assert.deepEqual(await c.js<string[]>(misaligned([rows[0]])), [], `${at}: the header out of line with the chip on`);
  // the palette: every piece one row on one grid (as tall, as wide, one left edge), a piece's looks under it, no badge, no popover
  const rowsOf = await c.js<{ l: number; w: number; h: number }[]>(`[...document.querySelectorAll(".palette .ptile > .piece")].filter((e) => e.checkVisibility()).map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, w: r.width, h: r.height }; })`);
  for (const r of rowsOf) assert.ok(Math.abs(r.l - rowsOf[0].l) < 0.5 && Math.abs(r.w - rowsOf[0].w) < 0.5 && Math.abs(r.h - rowsOf[0].h) < 0.5, `${at}: a palette row off the others' grid (${JSON.stringify(r)} against ${JSON.stringify(rowsOf[0])})`);
  assert.equal(await c.js(`document.querySelectorAll(".palette .look, .palette .ptile__looks, .palette [aria-haspopup]").length`), 0, `${at}: a look left in the palette (the Inspector's now)`);
  const pal = await c.js<{ sh: number; ch: number }>(`(() => { const p = document.querySelector(".palette"); return { sh: p.scrollHeight, ch: p.clientHeight }; })()`);
  assert.ok(pal.sh <= pal.ch + 1, `${at}: the palette scrolls at first (${JSON.stringify(pal)})`);
  console.log(`${at}: ok`);
  c.kill();
}

// the palette's folds kept as left for the visit: "More pieces" opened and its Traps folded, the page loaded again, still so
{
  const c = await editor(1440, 900);
  await c.js(`document.querySelector('.palette [data-fold="more"] > summary').click()`);
  await sleep(200);
  await c.js(`document.querySelector('.palette [data-fold="group/Traps"] > summary').click()`);
  await sleep(300);
  await c.send("Page.reload");
  for (let k = 0; k < 60 && !(await c.ev<boolean>(`!!document.querySelector(".palette [data-fold], .bholes__starts button")`)); k++) await sleep(500);
  await c.js(`void (document.querySelector(".palette") || document.querySelector(".bholes__starts button").click())`);
  for (let k = 0; k < 60 && !(await c.ev<boolean>(`!!document.querySelector(".palette [data-fold]")`)); k++) await sleep(500);
  assert.deepEqual(await c.js(`[...document.querySelectorAll(".palette [data-fold]")].map((d) => d.dataset.fold + " " + d.open)`), ["more true", "group/Walls true", "group/Obstacles true", "group/Ground true", "group/Traps false", "others false"], "the palette's folds not kept for the visit");
  console.log("the palette's folds kept: ok");
  c.kill();
}

// the start screen (a player back, hinted): it never scrolls sideways, sits clear of the corner's Back, and its starters stand above the fold;
// its world tabs show the one chosen gold
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
  // room: no diagram of the steps (the editor's stepper says them), the world tabs a section's gap under the sign
  const bar = (await box(c, ".bholes__bar"))!;
  assert.equal(await c.js(`!!document.querySelector(".bholes__steps")`), false, `${at}: the steps drawn again on the start`);
  assert.ok(bar.t - sign.b >= 32, `${at}: the world tabs sit right under the sign (${bar.t - sign.b}px)`);
  // at 1440 × 900, all of it in the window's frame: the last line ("Open a file, or a published hole") too
  if (w === 1440) {
    const more = (await box(c, ".bholes__more summary"))!;
    assert.ok(more.b <= h - 16, `${at}: "Open a file" cut by the window's frame (${more.b} > ${h - 16})`);
  }
  // its world tabs: the one chosen gold (the one selected look), and so the next one chosen, its box kept
  assert.equal(await c.js(gold(".bholes__worlds .on")), true, `${at}: the world chosen is not gold`);
  const tab = await c.js<object>(footprint(".bholes__worlds button:not(.on)"));
  await c.js(`document.querySelector(".bholes__worlds button:not(.on)").click()`);
  await sleep(300);
  assert.equal(await c.js(gold(".bholes__worlds .on")), true, `${at}: the world chosen next is not gold`);
  assert.deepEqual(await c.js<object>(footprint(".bholes__worlds .on")), tab, `${at}: a world tab's box changes as it is chosen`);
  await c.js(`document.querySelector(".bholes__worlds button").click()`);
  await sleep(300);
  // scrolled to its foot, nothing under the network chip (the game's, bottom left: none on this page today)
  assert.deepEqual(await c.js<string[]>(underChip()), [], `${at}: a control under the network chip`);
  // its head the game's (a front screen's pill and outlined title)
  assert.deepEqual(await c.js(`[...document.querySelectorAll(".bholes__sign .front__head > *")].map((e) => e.tagName + " " + e.className + " " + e.textContent)`), ["SPAN eyebrow The Builder", "H1 worlds__title Hard hats on!"], `${at}: the head is not a front screen's`);
  // the starters as templates, the blank lane as one of the cards, as big, under its own label, its own picture
  assert.deepEqual(await c.js<string[]>(`[...document.querySelectorAll(".bholes__group")].map((e) => e.textContent)`), ["Start from a template", "Or start blank"], `${at}: the start's groups`);
  const blank = cards[3], first = cards[0];
  assert.ok(Math.abs(blank.r - blank.l - (first.r - first.l)) <= 1 && Math.abs(blank.b - blank.t - (first.b - first.t)) <= 1, `${at}: the blank lane's card is not a starter's size`);
  assert.equal(await c.js<string>(`document.querySelector(".bholes__start--blank b").textContent`), "Blank lane");
  assert.ok(await c.js<boolean>(`!!document.querySelector(".bholes__start--blank .bholes__blank")`), `${at}: the blank lane has no picture of its own`);
  console.log(`${at}: ok`);
  c.kill();
}

// the first run: a new player lands on the Garden's dogleg with three hints, the pointer through them, gone at the first drag,
// never shown again
{
  const c = await launch({ width: 1280, height: 800 });
  await c.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await c.send("Page.navigate", { url: `${APP}/build/` });
  for (let k = 0; k < 60 && !(await c.ev<boolean>(`!!document.querySelector(".bhint, .bholes__starts button")`)); k++) await sleep(500);
  assert.equal(await c.js(`document.querySelectorAll(".bhint").length`), 3, "three hints");
  assert.equal(await c.js(`document.querySelector(".bhead__name input").value`), "Garden Dogleg", "on the Garden's dogleg");
  assert.equal(await c.js(`!!document.querySelector(".bhint__ok, .bhints button")`), false, "no Got it: nothing to press");
  assert.equal(await c.js(`getComputedStyle(document.querySelector(".bhints")).pointerEvents`), "none", "the pointer through them");
  // the hints leave the hole in sight: none of them over the tee or the cup
  for (let k = 0; k < 20 && !(await c.ev<boolean>(`!!document.querySelector("[data-end='pin']")`)); k++) await sleep(300);
  for (const end of ["tee", "pin"]) {
    const at = (await box(c, `[data-end='${end}'] circle`))!;
    for (const [i, part] of (await c.js<Box[]>(`[...document.querySelectorAll(".bhint")].map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })`)).entries()) {
      assert.ok(!overlap(part, at), `hint ${i + 1} covers the ${end === "pin" ? "cup" : "tee"}`);
    }
  }
  assert.equal(await c.js(`document.querySelectorAll(".bgloss").length`), 0, "the first run: three hints, no glossary");
  // a piece taken from the palette (the first drag's press): the hints gone
  const tile = await centre(c, ".palette [data-tile]");
  await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: tile[0], y: tile[1], button: "left", buttons: 1, clickCount: 1 });
  await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: tile[0], y: tile[1], button: "left", buttons: 0, clickCount: 1 });
  await sleep(300);
  assert.equal(await c.js(`document.querySelectorAll(".bhint").length`), 0, "gone at the first drag");
  await c.send("Page.reload");
  for (let k = 0; k < 60 && !(await c.ev<boolean>(`!!document.querySelector(".bholes__list")`)); k++) await sleep(500);
  assert.equal(await c.js(`document.querySelectorAll(".bhint").length`), 0, "never again: the drafts screen, the dogleg kept");
  // "?": the three hints again and, under them, one screen of the world's pieces (each tile's picture, name, what it does), the keys
  await c.js(`document.querySelector(".bholes__starts button").click()`);
  for (let k = 0; k < 40 && !(await c.ev<boolean>(`!!document.querySelector(".palette .piece")`)); k++) await sleep(300);
  await c.js(`document.querySelector(".bhead [aria-label^='How it works']").click()`);
  await sleep(500);
  assert.equal(await c.js(`document.querySelectorAll(".bhint").length`), 3, "?: the three hints");
  // (the world's own: another world's, under From other worlds, are theirs)
  const tiles = await c.js<number>(`document.querySelectorAll(".palette [data-tile]").length - document.querySelectorAll('.palette [data-fold="others"] [data-tile]').length`);
  assert.equal(await c.js(`document.querySelectorAll(".bgloss__piece").length`), tiles, "?: a line for each tile of the world's own");
  assert.ok(await c.js<boolean>(`[...document.querySelectorAll(".bgloss__piece")].every((e) => e.querySelector("img") && e.querySelector("b").textContent && e.querySelector("small").textContent)`), "each: its picture, its name, what it does");
  const g = (await box(c, ".bgloss"))!;
  assert.ok(g.t >= 0 && g.b <= 800 && g.l >= 0 && g.r <= 1280, `the glossary on one screen: ${JSON.stringify(g)}`);
  assert.ok(await c.js<boolean>(`(() => { const e = document.querySelector(".bgloss"); return e.scrollHeight <= e.clientHeight + 1; })()`), "the glossary on one screen, not scrolled");
  const v = (await box(c, ".sheet"))!;
  assert.ok(Math.abs((g.l + g.r) / 2 - (v.l + v.r) / 2) < 2 && Math.abs((g.t + g.b) / 2 - (v.t + v.b) / 2) < 2, `the glossary in the window's middle: ${JSON.stringify(g)}`);
  assert.ok(v.l === 0 && v.t === 0 && v.r === 1280 && v.b === 800, `the dim over the whole window: ${JSON.stringify(v)}`);
  await c.js(`document.querySelector(".sheet__close").click()`);
  await sleep(300);
  assert.equal(await c.js(`document.querySelectorAll(".bgloss, .bhint").length`), 0, "gone with its X");
  console.log("first run: ok");
  c.kill();
}

// the board in 3D (WebGL: the game's scene under the overlay); without WebGL, the 2D board as it was, every piece drawn
{
  const c = await editor(1280, 800);
  assert.ok(await c.ev<boolean>(`!!document.querySelector(".board--3d .board__scene canvas")`), "the board in 3D");
  c.kill();
  const flat = await editor(1280, 800, `HTMLCanvasElement.prototype.getContext = function () { return null; };`);
  assert.ok(await flat.ev<boolean>(`!document.querySelector(".board--3d") && !!document.querySelector(".board__ground")`), "no WebGL: the 2D board");
  assert.ok(await flat.ev<boolean>(`[...document.querySelectorAll(".board__piece > :first-child")].every((e) => getComputedStyle(e).fill !== "transparent" || getComputedStyle(e).stroke !== "transparent")`), "no WebGL: every piece drawn");
  console.log("no 3D: ok");
  flat.kill();
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
// a problem (a draft kept with a piece doubled where it stands): the dock opens on it, a click on it selects the piece; Play off,
// its reason readable beside it, Undo kept in its place; fixed, the dock folds back
{
  const c = await editor(1440, 900);
  await c.js(`(() => { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("gnogolf.builder.draft.")) { const d = JSON.parse(localStorage.getItem(k)); const p = d.pieces.find((q) => q.geometry.t === "post") || d.pieces.at(-1); d.pieces.push({ ...p, id: p.id + "x" }); localStorage.setItem(k, JSON.stringify(d)); } } })()`);
  await c.send("Page.reload");
  for (let k = 0; k < 40 && !(await c.ev<boolean>(`!!document.querySelector(".bholes__pick")`)); k++) await sleep(300);
  await c.js(`document.querySelector(".bholes__pick").click()`);
  for (let k = 0; k < 60 && !(await c.ev<boolean>(`!!document.querySelector(".issue button.issue__why")`)); k++) await sleep(300);
  const offPlay = await c.js<{ ratio: number; opacity: number } | null>(`(${CONTRAST})(".bhead__end .btn[aria-disabled=true]")`);
  assert.ok(offPlay && offPlay.opacity === 1 && offPlay.ratio >= 4.5, `Play off, its words read at ${offPlay?.ratio.toFixed(2)}:1`);
  assert.match(await c.js<string>(`document.querySelector("#bench-why")?.textContent ?? ""`), /thing to fix/, "why Play waits, beside it");
  const undoOff = (await box(c, ".bhead__hist"))!;
  const well = (await box(c, ".checks"))!, row = await c.js<string>(`document.querySelector(".issue button.issue__why").textContent`);
  assert.match(row, /^Two \w+s overlap: move one\.$/, "a problem: its plain reason in the dock (two of one piece, counted)");
  assert.ok(well.b - well.t > 24, `a problem: the dock opened on it (${well.b - well.t} px)`);
  await c.js(`document.querySelector(".issue button.issue__why").click()`);
  await sleep(500);
  const picked = await c.js<string>(`document.querySelector(".board__piece--on")?.getAttribute("data-piece") ?? ""`);
  assert.ok(picked, "a click on the problem: its piece selected");
  await c.js(`[...document.querySelectorAll(".insp button")].find((b) => /Delete/.test(b.textContent)).click()`);
  for (let k = 0; k < 30 && (await c.ev<boolean>(`!!document.querySelector(".issue")`)); k++) await sleep(300);
  const fixed = (await box(c, ".checks"))!;
  assert.equal(await c.js(`document.querySelectorAll(".issue").length`), 0, "fixed: nothing left to fix");
  assert.ok(fixed.b - fixed.t < 1, `fixed: the dock folds back (${fixed.b - fixed.t} px)`);
  for (let k = 0; k < 30 && !(await c.ev<boolean>(`!!document.querySelector(".bhead__meter")`)); k++) await sleep(300);
  assert.ok(Math.abs((await box(c, ".bhead__hist"))!.l - undoOff.l) < 1, "Undo moves as Play's reason gives way to the difficulty chip");
  console.log("a problem in the dock: ok");
  c.kill();
}

// a piece deleted from the Inspector: the focus on the board, not lost; a draft deleted: the game's sheet, Escape keeps it
{
  const c = await editor(1280, 800);
  // the straight starter (its two posts, p1 and p2; its rails are r1 to r4): from the drafts screen
  await c.js(`document.querySelector(".bhead [aria-label^='Back to your holes']").click()`);
  for (let k = 0; k < 20 && !(await c.ev<boolean>(`!!document.querySelector(".bholes__starts button")`)); k++) await sleep(300);
  await c.js(`document.querySelector(".bholes__starts button").click()`);
  for (let k = 0; k < 40 && !(await c.ev<boolean>(`!!document.querySelector("[data-piece^='p']")`)); k++) await sleep(300);
  await sleep(800);
  const key = async (key: string, code = key) => {
    await c.send("Input.dispatchKeyEvent", { type: "keyDown", key, code });
    await c.send("Input.dispatchKeyEvent", { type: "keyUp", key, code });
  };
  await c.js(`document.querySelector("[data-piece^='p']").focus()`);
  await sleep(600);
  const n = await c.js<number>(`document.querySelectorAll("[data-piece]").length`);
  // Details open from the first piece (the column never stands empty); folded, kept so for the visit and over another piece
  const sliders = () => c.js<number>(`[...document.querySelectorAll(".insp input")].filter((x) => x.checkVisibility()).length`);
  assert.ok((await sliders()) > 0, "a piece selected: its Details open, its sliders");
  const grid = await c.js<{ l: number[]; v: number[]; s: number[] }>(`(() => { const rows = [...document.querySelectorAll(".insp__details > .range")].filter((r) => r.querySelector("input[type=range]")); const x = (sel) => rows.map((r) => Math.round(r.querySelector(sel).getBoundingClientRect().left)); return { l: x("span"), s: x("input"), v: x("output") }; })()`);
  for (const col of [grid.l, grid.s, grid.v]) assert.ok(col.length > 1 && col.every((x) => x === col[0]), `the Inspector's rows out of line (${JSON.stringify(grid)})`);
  await c.js(`document.querySelector(".insp__details summary").click()`);
  await sleep(200);
  assert.equal(await sliders(), 0, "Details folded");
  await c.js(`document.querySelectorAll("[data-piece^='p']")[1].focus()`);
  await sleep(400);
  assert.equal(await sliders(), 0, "Details folded: still so for another piece");
  assert.equal(await c.js(`sessionStorage.getItem("gnogolf.builder.details")`), "shut", "the fold kept for the visit");
  await c.js(`document.querySelector(".insp__details summary").click()`);
  await sleep(200);
  assert.ok((await sliders()) > 0, "Details opened again");
  await c.js(`document.querySelector("[data-piece^='p']").focus()`);
  await sleep(400);
  await c.js(`[...document.querySelectorAll(".insp button")].find((b) => /Delete/.test(b.textContent)).focus()`);
  await c.js(`[...document.querySelectorAll(".insp button")].find((b) => /Delete/.test(b.textContent)).click()`);
  await sleep(800);
  assert.equal(await c.js(`document.querySelectorAll("[data-piece]").length`), n - 1, "the piece deleted");
  assert.equal(await c.js(`document.activeElement?.classList.contains("board")`), true, "the focus on the board after a Delete");
  // a post dragged from the board onto the palette's bin: removed
  const mouse = (type: string, x: number, y: number) => c.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
  const centre = (sel: string) => c.js<[number, number]>(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  const post = await c.js<[number, number]>(`(() => { const g = document.querySelector("[data-piece^='p']"); const r = g.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  // the bin shows only while a piece is carried
  assert.equal(await c.js(`!!document.querySelector("[data-bin]")`), false, "no bin while nothing is carried");
  await mouse("mousePressed", ...post);
  await mouse("mouseMoved", post[0] + 4, post[1] + 4);
  await sleep(200);
  assert.equal(await c.js(`!!document.querySelector("[data-bin]")`), true, "the bin while a piece is carried");
  const bin = await centre("[data-bin]");
  for (let k = 1; k <= 6; k++) {
    await mouse("mouseMoved", post[0] + ((bin[0] - post[0]) * k) / 6, post[1] + ((bin[1] - post[1]) * k) / 6);
    await sleep(50);
  }
  await mouse("mouseReleased", ...bin);
  await sleep(1200);
  assert.equal(await c.js(`document.querySelectorAll("[data-piece]").length`), n - 2, "a post dropped on the bin is removed");
  assert.equal(await c.js(`!!document.querySelector("[data-bin]")`), false, "the bin gone once let go");
  // the cup taken by its flag, the tee by its edge: each moved, the board not panned (a hit area bigger than the drawing)
  // (an end's place on the board, as its label says it; its badge's middle on the screen)
  const at = (sel: string) => c.js<string>(`/\\(.*\\)/.exec(document.querySelector(${JSON.stringify(sel)}).closest("[data-end]").getAttribute("aria-label"))[0]`);
  const onScreen = (sel: string) => c.js<[number, number]>(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  const drag = async (from: [number, number], dx: number) => {
    await mouse("mousePressed", ...from);
    for (let k = 1; k <= 6; k++) {
      await mouse("mouseMoved", from[0] + (dx * k) / 6, from[1]);
      await sleep(40);
    }
    await mouse("mouseReleased", from[0] + dx, from[1]);
    await sleep(1000);
  };
  const k = await c.js<number>(`document.querySelector(".board__plane").getScreenCTM().a`); // (px a unit)
  for (const [what, sel, grip] of [["the cup, by its flag", "[data-end='pin'] circle", (p: [number, number]): [number, number] => [p[0] + 0.35 * k, p[1] - 0.95 * k]], ["the tee, by its edge", "[data-end='tee'] circle", (p: [number, number]): [number, number] => [p[0] + 0.8 * k, p[1] + 0.3 * k]]] as const) {
    const was = await at(sel), other = await onScreen(sel === "[data-end='tee'] circle" ? "[data-end='pin'] circle" : "[data-end='tee'] circle");
    await drag(grip(await onScreen(sel)), -1.5 * k);
    assert.notDeepEqual(await at(sel), was, `${what}: moved`);
    assert.deepEqual(await onScreen(sel === "[data-end='tee'] circle" ? "[data-end='pin'] circle" : "[data-end='tee'] circle"), other, `${what}: the board not panned`);
  }
  await c.js(`document.querySelector(".bhead [aria-label^='Back to your holes']").click()`); // back to the drafts
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
// two tabs on one browser (the second a frame of the same origin: one storage, its events): a hole one starts and
// an edit the other makes, on a list it read before, are both kept; the drafts screen shows what the other kept
{
  const c = await editor(1280, 800); // tab A, on the dogleg
  const inB = (expr: string) => c.js(`(() => { const document = window.frames[0].document; return ${expr}; })()`);
  await c.js(`(() => { const f = document.createElement("iframe"); f.src = "/build/"; f.style.cssText = "position:fixed;inset:0;width:1100px;height:780px;z-index:99"; document.body.append(f); })()`);
  for (let k = 0; k < 60 && !(await c.ev<boolean>(`!!window.frames[0]?.document.querySelector(".bholes__list button")`)); k++) await sleep(500);
  await inB(`document.querySelector(".bholes__pick").click()`); // tab B, on the dogleg too
  for (let k = 0; k < 40 && !(await c.ev<boolean>(`!!window.frames[0].document.querySelector(".palette .piece")`)); k++) await sleep(300);
  await c.js(`document.querySelector(".bhead [aria-label^='Back to your holes']").click()`);
  for (let k = 0; k < 20 && !(await c.ev<boolean>(`!!document.querySelector(".bholes__starts button")`)); k++) await sleep(300);
  await c.js(`document.querySelector(".bholes__starts button").click()`); // A starts a hole
  for (let k = 0; k < 40 && !(await c.ev<boolean>(`!!document.querySelector(".palette .piece")`)); k++) await sleep(300);
  await inB(`(() => { const el = document.querySelector("[aria-label=\\"The hole's name\\"]"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "Named in B"); el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await sleep(1500);
  await inB(`document.querySelector(".bhead [aria-label^='Back to your holes']").click()`);
  for (let k = 0; k < 20 && !(await c.ev<boolean>(`!!window.frames[0].document.querySelector(".bholes__list")`)); k++) await sleep(300);
  assert.equal(await inB(`document.querySelectorAll(".bholes__list li").length`), 2, "tab B back on its drafts: A's new hole there");
  await c.send("Page.reload");
  for (let k = 0; k < 60 && !(await c.ev<boolean>(`!!document.querySelector(".bholes__list")`)); k++) await sleep(500);
  assert.equal(await c.js(`document.querySelectorAll(".bholes__list li").length`), 2, "the hole A started, kept through B's save");
  assert.match(await c.js<string>(`document.querySelector(".bholes__list").textContent`), /Named in B/, "B's edit kept");
  console.log("two tabs: ok");
  c.kill();
}
// the keys: 1 to 5 pick the palette's first five, Space and a drag pan (a piece under it too), F frames the hole,
// T plays over the editor, Escape comes back to it as it was; the board's key line says them; a look chosen in the
// Inspector is its piece's from then on (the next one armed takes it)
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
  // 4 and Enter: the water dropped between the tee and the cup, selected; its last look chosen in the Inspector, then 4 arms that look
  await key("4", "Digit4");
  await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  for (let k = 0; k < 20 && !(await c.ev<boolean>(`document.querySelectorAll(".insp__looks .look").length > 1`)); k++) await sleep(300);
  const water = await c.js<string>(`(() => { const l = [...document.querySelectorAll(".insp__looks .look")].at(-1); l.click(); return l.dataset.look; })()`);
  await sleep(600);
  assert.equal(await c.js(`document.querySelector('.insp__looks .look[aria-pressed="true"]')?.dataset.look`), water, "the look chosen: the piece's, gold");
  await key("Escape", "Escape");
  await c.js(`document.querySelector(".board").focus()`);
  await key("4", "Digit4");
  assert.equal(await c.js(`document.querySelector(".palette .piece--on")?.dataset.look`), water, "4: the water in the look last chosen");
  await key("Escape", "Escape");
  await c.js(`document.querySelector("[data-piece]").focus()`);
  await sleep(300);
  await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "z", code: "KeyZ", modifiers: 4, windowsVirtualKeyCode: 90 });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", modifiers: 4, windowsVirtualKeyCode: 90 });
  await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "z", code: "KeyZ", modifiers: 4, windowsVirtualKeyCode: 90 });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", modifiers: 4, windowsVirtualKeyCode: 90 });
  await sleep(500);
  const keys = await c.js<string>(`document.querySelector(".board__keys").textContent`);
  for (const k of ["1–5", "R", "T", "?"]) assert.ok(keys.includes(k), `the key line says ${k}: ${keys}`);
  // ?: every key, in the glossary
  await key("?", "Slash");
  assert.ok(await c.js<boolean>(`["Space", "F", "V", "Q", "Esc", "⌫"].every((k) => document.querySelector(".bgloss__keys")?.textContent.includes(k))`), "?: the glossary with every key");
  await c.js(`document.querySelector(".sheet__close").click()`);
  await sleep(300);
  // Space held, a drag over a piece pans (the piece stays)
  const tee = () => centre(c, "[data-end='tee'] circle");
  const piece = await centre(c, "[data-piece]");
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
  // the die by the name: a name suggested, another at each roll, the slug following it (not yet proved)
  const name = () => c.js<string>(`document.querySelector(".bhead__name input").value`);
  const before = await name();
  await c.js(`document.querySelector(".bhead__roll").click()`);
  await sleep(200);
  const first = await name();
  await c.js(`document.querySelector(".bhead__roll").click()`);
  await sleep(200);
  const second = await name();
  assert.ok(first !== before && second !== first && /^[A-Z][a-z]+ [A-Z]/.test(first) && first.length <= 40, `the die: ${before} → ${first} → ${second}`);
  await sleep(1200);
  const slug = await c.js<string>(`(() => { const k = Object.keys(localStorage).find((x) => x.startsWith("gnogolf.builder.draft.")); return JSON.parse(localStorage.getItem(k)).slug; })()`);
  assert.equal(slug, second.toLowerCase().replace(/[^a-z0-9]+/g, "-"), "the address follows the name");
  // T: Play, over the editor, no address asked before a round is holed; Escape: back to the editor at the same zoom
  await c.js(`document.querySelector(".bhead__roll").blur()`);
  for (let k = 0; k < 20 && (await c.ev<boolean>(`!!document.querySelector(".bhead__end .btn[aria-disabled]")`)); k++) await sleep(300);
  const at = await tee();
  await key("t", "KeyT");
  for (let k = 0; k < 20 && !(await c.ev<boolean>(`!!document.querySelector(".tbench--play .tmode__score")`)); k++) await sleep(300);
  assert.ok(await c.ev<boolean>(`!!document.querySelector(".tbench--play .tmode__score") && !document.querySelector(".tmode__sign")`), "T: Play, the address not asked before a round is holed");
  assert.equal(await c.js(`!!document.querySelector(".tmode__strip, .tmode__intro")`), false, "no line repeating what Play is for");
  // the game's HUD: its cards in one row along the top, in the window, none over another; no Try again before a shot
  const cards = await c.js<Box[]>(`[...document.querySelectorAll(".tbench--play .hud--top > *")].map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })`);
  const wide = await c.js<number>("innerWidth");
  assert.ok(cards.length >= 4, `the HUD's cards: ${cards.length}`);
  for (const [i, b] of cards.entries()) {
    assert.ok(b.l >= 0 && b.r <= wide && b.t >= 0 && Math.abs(b.t - cards[0].t) < 1, `a HUD card out of its row or the window (${JSON.stringify(b)})`);
    for (const o of cards.slice(i + 1)) assert.ok(!overlap(b, o), `two HUD cards over each other (${JSON.stringify(b)}, ${JSON.stringify(o)})`);
  }
  assert.equal(await c.js(`[...document.querySelectorAll(".tbench--play button")].some((b) => /Try again/.test(b.textContent))`), false, "no Try again at 0 shots");
  assert.match(await c.js<string>(`document.querySelector(".tbench--play .hud__right").textContent`), /^Back to BuildEsc$/, "Back to Build (Esc) in the HUD");
  await key("Escape", "Escape");
  for (let k = 0; k < 20 && (await c.ev<boolean>(`!!document.querySelector(".tbench--play")`)); k++) await sleep(300);
  const after = await tee();
  assert.ok(!(await c.ev<boolean>(`!!document.querySelector(".tbench--play")`)) && Math.abs(after[0] - at[0]) < 1 && Math.abs(after[1] - at[1]) < 1, `Escape: back to the editor at the same zoom (${at.join()} → ${after.join()})`);
  // a refused drop, then the same piece pressed and carried again: still armed, its ghost's own words (never the refusal before)
  const waterTile = await c.js<[number, number]>(`(() => { const b = [...document.querySelectorAll(".palette [data-tile]")].find((t) => t.querySelector(".piece__name")?.textContent === "Water"); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  const teeAt = await tee(), lane = await centre(c, ".board");
  const carry = async (to: [number, number]) => {
    await mouse("mousePressed", ...waterTile);
    for (let k = 1; k <= 8; k++) {
      await mouse("mouseMoved", waterTile[0] + ((to[0] - waterTile[0]) * k) / 8, waterTile[1] + ((to[1] - waterTile[1]) * k) / 8);
      await sleep(30);
    }
    await sleep(200);
  };
  await carry(teeAt);
  await mouse("mouseReleased", ...teeAt);
  await sleep(300);
  const refused = await c.js<string>(`document.querySelector(".measure")?.textContent ?? ""`);
  assert.match(refused, /tee/, `a drop on the tee refused, said: ${refused}`);
  await carry(lane);
  assert.equal(await c.js(`document.querySelector(".palette .piece--on .piece__name")?.textContent`), "Water", "pressed again: still armed, never put back");
  const second2 = await c.js<string>(`document.querySelector(".measure")?.textContent ?? ""`);
  assert.notEqual(second2, refused, "the second drag says its own place or reason, not the refusal before");
  await mouse("mouseReleased", ...lane);
  await key("Escape", "Escape");
  console.log("keys: ok");
  c.kill();
}
// what the review found, as a player meets it: the "?" panel leaves the focus where Tab put it while the editor draws
// again; the ball by the tee pressed zoomed out is the ball's, never the tee's; the Inspector's "drag it" is marked seen
// when it shows (a piece selected), not as its column mounts, and the keys line stays for the visit (an editor opened
// again); a drop's ghost ball never runs for a change made after it
{
  const c = await editor(1280, 800);
  const press = async (key: string, code: string) => {
    await c.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, ...(key.length === 1 && { text: key }) });
    await c.send("Input.dispatchKeyEvent", { type: "keyUp", key, code });
    await sleep(200);
  };
  const SEEN = "gnogolf.builder.seen.";
  assert.equal(await c.js(`localStorage.getItem("${SEEN}drag")`), null, "no piece selected yet: the Inspector's help not seen");
  await c.js(`document.querySelector("[data-piece]").focus()`);
  await sleep(400);
  assert.ok(await c.js<boolean>(`!!document.querySelector(".insp__hint")`), "a piece selected: how to move it, said");
  assert.equal(await c.js(`localStorage.getItem("${SEEN}drag")`), "1", "seen as it shows");
  await press("Escape", "Escape");
  // "?": the game's sheet over the editor (its dim, its X); a key pressed in it is its own, never the editor's (1 arms no
  // piece behind it); Escape, then the dim pressed, put it away
  const armed = `document.querySelectorAll(".palette [aria-pressed=true]").length`;
  await press("Escape", "Escape");
  assert.equal(await c.js(armed), 0, "nothing in hand");
  await press("?", "Slash");
  assert.ok(await c.js<boolean>(`!!document.activeElement?.closest(".sheet .bgloss")`), "?: the focus in the sheet as it opens");
  await press("1", "Digit1");
  assert.equal(await c.js(armed), 0, "?: 1 pressed in the sheet arms no piece behind it");
  await press("Escape", "Escape");
  assert.equal(await c.js(`document.querySelectorAll(".bgloss").length`), 0, "?: gone with Escape");
  await press("?", "Slash");
  await c.js(`document.querySelector(".sheet").click()`);
  await sleep(300);
  assert.equal(await c.js(`document.querySelectorAll(".bgloss").length`), 0, "?: gone with the dim pressed");
  // zoomed out (the wheel, round the tee) and in: the ball by the tee is the ball's to press, the tee the tee's
  for (const [n, dy] of [[0, 0], [6, 300], [12, -300]] as const) {
    const [ox, oy] = await centre(c, "[data-end='tee'] circle");
    for (let k = 0; k < n; k++) await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: ox, y: oy, deltaX: 0, deltaY: dy });
    await sleep(300);
    const [x, y] = await centre(c, "[data-shot='tee'] .board__ball"), [tx, ty] = await centre(c, "[data-end='tee'] circle");
    const under = await c.js<[string, string]>(`[document.elementFromPoint(${x}, ${y})?.closest("[data-shot],[data-end]"), document.elementFromPoint(${tx}, ${ty})?.closest("[data-shot],[data-end]")].map((e) => e ? e.dataset.shot ?? "end " + e.dataset.end : "")`);
    assert.deepEqual(under, ["tee", "end tee"], `zoom ${n ? (dy > 0 ? "out" : "in") : "as framed"}: the ball by the tee and the tee under the pointer (${under.join()})`);
  }
  await press("f", "KeyF");
  // a drop, then a change before the meter answers: no ghost ball for that later change
  await c.js(`window.__rolled = false; new MutationObserver(() => document.querySelector(".board__roll") && (window.__rolled = true)).observe(document.querySelector(".board"), { subtree: true, childList: true })`);
  const mouse = (type: string, x: number, y: number) => c.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
  const from = await centre(c, ".palette [data-tile]"), board = (await box(c, ".board"))!, to: [number, number] = [board.l + (board.r - board.l) * 0.5, board.t + (board.b - board.t) * 0.3];
  await mouse("mousePressed", ...from);
  for (let k = 1; k <= 8; k++) {
    await mouse("mouseMoved", from[0] + ((to[0] - from[0]) * k) / 8, from[1] + ((to[1] - from[1]) * k) / 8);
    await sleep(30);
  }
  const pieces = await c.js<number>(`document.querySelectorAll("[data-piece]").length`);
  await mouse("mouseReleased", ...to);
  await sleep(50);
  if ((await c.js<number>(`document.querySelectorAll("[data-piece]").length`)) > pieces) {
    await c.js(`document.querySelector(".bhead__name input").focus()`);
    await c.send("Input.insertText", { text: "x" }); // (a rename: a change of the hole as kept, the drop's no longer)
    await sleep(2500);
    assert.equal(await c.js(`window.__rolled`), false, "a change after the drop: its ghost ball not run for it");
  } else console.log("fixes: the drop did not hold here, its ghost-ball case skipped");
  // the keys line: shown on this first visit, and still on the editor opened again in it
  assert.ok(await c.js<boolean>(`!!document.querySelector(".board__keys")`), "the keys line, a first visit");
  await c.js(`document.querySelector(".bhead [aria-label^='Back to your holes']").click()`);
  for (let k = 0; k < 20 && !(await c.ev<boolean>(`!!document.querySelector(".bholes__pick")`)); k++) await sleep(300);
  await c.js(`document.querySelector(".bholes__pick").click()`);
  for (let k = 0; k < 40 && !(await c.ev<boolean>(`!!document.querySelector(".palette .piece")`)); k++) await sleep(300);
  await sleep(500);
  assert.ok(await c.js<boolean>(`!!document.querySelector(".board__keys")`), "the editor opened again on the same visit: the keys line still there");
  console.log("fixes: ok");
  c.kill();
}
// every palette entry dropped on a blank lane, at a laptop's size and a retina one's: the selection's outline and a hover's
// a few css px whatever the zoom (never a stroke in the board's units: a fat capsule over the cup), no overlay drawn empty
// the open hole changed, then deleted, in another tab: this tab's edits not written over it, said, and its choice kept
{
  const c = await editor(1280, 800);
  const stored = () => c.js<string | null>(`(() => { const k = Object.keys(localStorage).find((x) => x.startsWith(${JSON.stringify("gnogolf.builder.draft.")})); return k ? localStorage.getItem(k) : null; })()`);
  const nudge = async () => {
    await c.js(`document.querySelector("[data-piece^='p']").focus()`);
    await sleep(300);
    await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight" });
    await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight" });
    await sleep(800);
  };
  const theirs = await c.js<string>(`(() => { const k = Object.keys(localStorage).find((x) => x.startsWith(${JSON.stringify("gnogolf.builder.draft.")})); const d = JSON.parse(localStorage.getItem(k)); d.title = "Renamed elsewhere"; localStorage.setItem(k, JSON.stringify(d)); return localStorage.getItem(k); })()`);
  await nudge();
  assert.equal(await stored(), theirs, "the other tab's edit not written over");
  assert.match(await c.js<string>(`document.querySelector(".bench__unkept--elsewhere")?.textContent ?? ""`), /changed in another tab/, "said");
  await c.js(`[...document.querySelectorAll(".bench__unkept--elsewhere button")].find((b) => /Keep mine/.test(b.textContent)).click()`);
  await sleep(500);
  assert.notEqual(await stored(), theirs, "Keep mine: this tab's hole kept");
  assert.equal(await c.js(`!!document.querySelector(".bench__unkept--elsewhere")`), false);
  await c.js(`Object.keys(localStorage).filter((x) => x.startsWith(${JSON.stringify("gnogolf.builder.draft.")})).forEach((k) => localStorage.removeItem(k))`);
  await nudge();
  assert.equal(await stored(), null, "deleted in another tab: not brought back");
  await c.js(`[...document.querySelectorAll(".bench__unkept--elsewhere button")].find((b) => /Open it as kept/.test(b.textContent)).click()`);
  await sleep(800);
  assert.equal(await c.js(`!!document.querySelector(".bholes")`), true, "opened as kept: gone, so back to the holes");
  c.kill();
}

// a world's pieces that cannot load (offline, an old deploy's chunk gone): said, with a Try again that loads them
{
  const c = await editor(1280, 800);
  await c.js(`document.querySelector(".bhead [aria-label^='Back to your holes']").click()`);
  for (let k = 0; k < 20 && !(await c.ev<boolean>(`!!document.querySelector(".bholes__worlds button")`)); k++) await sleep(300);
  const net = await cdp.offline(c); // (the island's chunk among the scripts not loaded yet, whatever a build names it)
  await c.js(`[...document.querySelectorAll(".bholes__worlds button")].find((b) => /Island/.test(b.textContent)).click()`);
  await sleep(300);
  await c.js(`document.querySelector(".bholes__starts .bholes__start").click()`);
  for (let k = 0; k < 40 && !(await c.ev<boolean>(`/could not load/.test(document.querySelector(".bench__wait")?.textContent ?? "")`)); k++) await sleep(300);
  assert.match(await c.js<string>(`document.querySelector(".bench__wait")?.textContent ?? ""`), /could not load/, "a world's pieces that fail to load: said where the board would be");
  await net.back();
  await c.js(`[...document.querySelectorAll(".bench__wait button")].find((b) => /Try again/.test(b.textContent)).click()`);
  for (let k = 0; k < 60 && !(await c.ev<boolean>(`!!document.querySelector(".palette")`)); k++) await sleep(500);
  assert.equal(await c.js(`!!document.querySelector(".palette")`), true, "Try again: the pieces loaded");
  c.kill();
}

// the Inspector's choices whole in their rows (a push's eight ways the widest), at the usual width and the floor:
// the garden's signature hole, its moon bridge (p1) selected
for (const [w, h] of [[1280, 800], [900, 800]] as const) {
  const c = await editor(w, h);
  await c.js(`document.querySelector(".bhead [aria-label^='Back to your holes']").click()`);
  for (let k = 0; k < 20 && !(await c.ev<boolean>(`!!document.querySelector(".bholes__starts button")`)); k++) await sleep(300);
  await c.js(`document.querySelectorAll(".bholes__starts .bholes__start")[2].click()`);
  for (let k = 0; k < 40 && !(await c.ev<boolean>(`!!document.querySelector("[data-piece='p1']")`)); k++) await sleep(300);
  await sleep(800);
  await c.js(`document.querySelector("[data-piece='p1']").focus()`);
  await sleep(600);
  if (!(await c.js<boolean>(`!!document.querySelector(".insp__dirs")?.checkVisibility()`))) {
    await c.js(`document.querySelector(".insp__details summary").click()`);
    await sleep(200);
  }
  assert.equal(await c.js(`!!document.querySelector(".insp__dirs")?.checkVisibility()`), true, `${w}×${h}: the moon bridge's way shown`);
  const cut = await c.js<string[]>(`[...document.querySelectorAll(".insp .seg")].filter((s) => s.checkVisibility() && (s.scrollWidth > s.clientWidth + 0.5 || [...s.querySelectorAll("button")].some((b) => b.getBoundingClientRect().right > s.getBoundingClientRect().right + 0.5))).map((s) => s.getAttribute("aria-label") || s.className)`);
  assert.deepEqual(cut, [], `${w}×${h}: the Inspector's choices clipped`);
  c.kill();
}

for (const [w, h, dpr] of [[1440, 900, 1], [1800, 1170, 2]] as const) {
  const c = await launch({ width: w, height: h });
  await c.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
  await c.send("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem("gnogolf.builder.hinted", "1"); } catch {}` });
  await c.send("Page.navigate", { url: `${APP}/build/` });
  for (let k = 0; k < 60 && !(await c.ev<boolean>(`!!document.querySelector(".bholes__start--blank")`)); k++) await sleep(500);
  await c.js(`document.querySelector(".bholes__start--blank").click()`);
  for (let k = 0; k < 40 && !(await c.ev<boolean>(`!!document.querySelector("[data-piece=p1]")`)); k++) await sleep(300);
  await sleep(1500);
  await c.js(`document.querySelectorAll(".palette details").forEach((d) => d.setAttribute("open", ""))`);
  await sleep(300);
  const mouse = (type: string, x: number, y: number) => c.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 });
  // the outline's width on screen: its stroke, in css px if non-scaling, else times the board's scale
  const outline = (sel: string) => c.js<number | null>(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const s = getComputedStyle(e), sw = parseFloat(s.strokeWidth) || 0;
    return s.vectorEffect === "non-scaling-stroke" ? sw : sw * Math.hypot(e.getScreenCTM().a, e.getScreenCTM().b); })()`);
  const empty = () => c.js<string[]>(`[...document.querySelectorAll(".centre .measure, .centre .btoast, .centre .bbroken, .centre [role=status]")].filter((e) => e.offsetParent && !e.textContent.trim()).map((e) => e.className)`);
  const lane = (await box(c, "[data-piece=p1]"))!, spot: [number, number] = [lane.l + (lane.r - lane.l) * 0.45, lane.t + 140];
  // a hover on the lane's top wall
  await mouse("mouseMoved", (lane.l + lane.r) / 2, lane.t + 1);
  await sleep(200);
  const hovered = await outline(".board__piece:hover > :first-child");
  assert.ok(hovered === null || hovered <= 4, `${w}×${h}@${dpr}: a wall hovered drawn ${hovered} px wide`);
  const tiles = await c.js<number>(`document.querySelectorAll(".palette .ptile > .piece:not([disabled])").length`);
  assert.ok(tiles >= 5, `${w}: the palette's tiles (${tiles})`);
  for (let t = 0; t < tiles; t++) {
    const name = await c.js<string>(`document.querySelectorAll(".palette .ptile > .piece:not([disabled])")[${t}].textContent.trim().slice(0, 30)`);
    await c.js(`document.querySelectorAll(".palette .ptile > .piece:not([disabled])")[${t}].click()`);
    await sleep(150);
    const n = await c.js<number>(`document.querySelectorAll("[data-piece]").length`);
    await mouse("mouseMoved", spot[0] - 8, spot[1]); await mouse("mouseMoved", ...spot);
    await sleep(120);
    await mouse("mousePressed", ...spot); await mouse("mouseReleased", ...spot);
    await sleep(500);
    assert.deepEqual(await empty(), [], `${w}: ${name}: an overlay drawn empty`);
    if ((await c.js<number>(`document.querySelectorAll("[data-piece]").length`)) > n) {
      const px = await outline(".board__piece--on > :first-child");
      assert.ok(px !== null && px <= 4, `${w}×${h}@${dpr}: ${name} selected, its outline ${px} px wide`);
      await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "z", code: "KeyZ", modifiers: 4, windowsVirtualKeyCode: 90 });
      await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", modifiers: 4, windowsVirtualKeyCode: 90 });
      await sleep(300);
    }
    await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  }
  // the lane's right wall selected: a thin outline, the cup's badge on top of it
  await c.js(`document.querySelector("[data-piece=p2]").dispatchEvent(new FocusEvent("focus"))`);
  const r2 = (await box(c, "[data-piece=p2]"))!;
  await mouse("mousePressed", (r2.l + r2.r) / 2, (r2.t + r2.b) / 2 + 30); await mouse("mouseReleased", (r2.l + r2.r) / 2, (r2.t + r2.b) / 2 + 30);
  await sleep(300);
  const wallPx = await outline(".board__piece--on > :first-child");
  assert.ok(wallPx !== null && wallPx <= 4, `${w}×${h}@${dpr}: the right wall selected, its outline ${wallPx} px wide`);
  // every row: armed from the keyboard (Enter: gold, pressed again: put back), and carried onto the board by a drag (its ghost there)
  const rowsN = await c.js<number>(`document.querySelectorAll(".palette .ptile > .piece:not([disabled])").length`);
  for (let k = 0; k < rowsN; k++) {
    const sel = `document.querySelectorAll(".palette .ptile > .piece:not([disabled])")[${k}]`, label = await c.js<string>(`${sel}.querySelector(".piece__name").textContent`);
    await c.js(`${sel}.focus()`);
    await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
    await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await sleep(120);
    assert.equal(await c.js(`${sel}.getAttribute("aria-pressed")`), "true", `${w}: ${label}: Enter did not arm it`);
    await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
    await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await sleep(80);
    assert.equal(await c.js(`${sel}.getAttribute("aria-pressed")`), "false", `${w}: ${label}: pressed again, still armed`);
    await c.js(`${sel}.scrollIntoView({ block: "center" })`);
    const at = await c.js<[number, number]>(`(() => { const r = ${sel}.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    await mouse("mouseMoved", ...at); await mouse("mousePressed", ...at);
    for (let i = 1; i <= 4; i++) await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at[0] + ((spot[0] - at[0]) * i) / 4, y: at[1] + ((spot[1] - at[1]) * i) / 4, button: "left", buttons: 1 });
    await sleep(150);
    assert.ok(await c.js<boolean>(`!!document.querySelector(".board__ghost")`), `${w}: ${label}: dragged, no ghost on the board`);
    const n = await c.js<number>(`document.querySelectorAll("[data-piece]").length`);
    await mouse("mouseReleased", ...spot);
    await sleep(400);
    if ((await c.js<number>(`document.querySelectorAll("[data-piece]").length`)) > n) {
      await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "z", code: "KeyZ", modifiers: 4, windowsVirtualKeyCode: 90 });
      await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", modifiers: 4, windowsVirtualKeyCode: 90 });
      await sleep(300);
    }
    await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  }
  console.log(`palette drops ${w}×${h}@${dpr}: ok (${tiles} entries, each armed and carried)`);
  c.kill();
}
console.log("builderui: all ok");
process.exit(0);
