// @ts-check
// The gnome shop opened from the menu's Shop panel as a player on a slow
// link and a phone's CPU would (Fast 3G, the CPU 4x slower), at 1440, 1024
// and 390: the layout shifts the page reports over 6 s, failing over 0.01
// (the shop draws its final frame first: ShopFrame.tsx); then every card's
// picture in sight loaded (no broken image), and the shop never wider than
// the window (no sideways scroll); a gnome's sheet opened from a card over
// everything, the network banner too (never a chip over its Buy), its Buy
// footer over nothing that follows it (its Traits there to click); the
// head's and the cards' small words at WCAG AA (4.5:1) on their ground, and
// every card's #number in sight however long its name; the toolbar's controls, on each of its
// lines, as tall as one another, on one top, their words on one baseline, and More filters open
// gold (on) in the box it has shut, a tier filter and the view selected gold as well; the picker's collection between its tile and its aim card,
// one slim row (its thumbnails of one frame, its line on one line, two on a phone, on its button's baseline), its head whole (at 1440, 1280, 1024 and 390, unthrottled: media/lib/rows.mjs); the menu
// and the shop never sideways from 360 to 1440 px wide; the shop, the cups and the menu scrolled to their foot clear
// of the network chip (at 1440, 1024, 390); About's link cards' words on one left edge. Before, the title screen alone: none of
// the sale read (the catalogue), the collection's wardrobe nor the shop's
// part of the game (components/gnomes/Game.tsx: a dev build's chunk names
// it) fetched, which only a screen showing the sale needs. With OUT, a frame every 100 ms and a
// strip of them.
//   APP=https://… node media/gnomes/shop-open.mjs   (OUT=<dir> for the frames)
import fs from "node:fs";
import path from "node:path";
import { launch, offline, sleep } from "../lib/cdp.mjs";
import { footprint, gold, misaligned, underChip } from "../lib/rows.mjs";
const APP = process.env.APP || "http://127.0.0.1:5175", OUT = process.env.OUT || "", TAG = process.env.TAG || "open";
const results = [];
for (const [w, h, mobile] of /** @type {[number, number, boolean][]} */ ([[1440, 900, false], [1024, 768, false], [390, 844, true]])) {
  const b = await launch({ width: w, height: h, mobile, touch: mobile });
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await b.send("Network.enable");
  await b.send("Network.setCacheDisabled", { cacheDisabled: false });
  await b.send("Page.navigate", { url: APP + "/" });
  for (let i = 0; i < 90 && !(await b.ev(`!![...document.querySelectorAll("button")].find((x) => /Click to start/.test(x.textContent))`)); i++) await sleep(500);
  await sleep(3000);
  const early = await b.ev(`performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.includes("/gnomes/catalogue.json") || n.includes("gnome-dress") || n.includes("components_gnomes_"))`);
  await b.js(`[...document.querySelectorAll("button")].find((x) => /Click to start/.test(x.textContent)).click()`);
  for (let i = 0; i < 60 && !(await b.ev(`!!document.querySelector(".mode--shop")`)); i++) await sleep(500);
  await sleep(1500);
  // throttled from here: what a player on a slow link and a phone's CPU sees
  await b.send("Network.emulateNetworkConditions", { offline: false, latency: 563, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await b.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await b.js(`window.__cls = 0; window.__shifts = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push([Math.round(performance.now()), +e.value.toFixed(4), (e.sources || []).map((s) => s.node ? (s.node.className || s.node.nodeName) : "").join(" ").slice(0, 120)]); } }).observe({ type: "layout-shift", buffered: false }); true`);
  const r = await b.ev(`(() => { const r = document.querySelector(".mode--shop").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  const dir = OUT && path.join(OUT, `${TAG}-${w}`);
  if (dir) fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now(), files = [];
  await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r[0], y: r[1] });
  for (const type of ["mousePressed", "mouseReleased"]) await b.send("Input.dispatchMouseEvent", { type, x: r[0], y: r[1], button: "left", clickCount: 1 });
  for (let k = 0; k < 60; k++) {
    while (Date.now() - t0 < k * 100) await sleep(5);
    if (!dir) continue;
    const { data } = await b.send("Page.captureScreenshot", { format: "jpeg", quality: 60 });
    const f = path.join(dir, `${String(k).padStart(2, "0")}.jpg`); fs.writeFileSync(f, Buffer.from(data, "base64")); files.push(f);
  }
  const cls = await b.ev(`({ cls: +window.__cls.toFixed(4), shifts: window.__shifts })`);
  // every card's picture in sight: loaded, none a broken image (a 404, a wrong path, a server gone)
  const seen = `[...document.querySelectorAll(".gshelf li img")].filter((i) => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; })`;
  for (let i = 0; i < 60 && !(await b.ev(`${seen}.every((i) => i.complete)`)); i++) await sleep(500);
  const pics = await b.ev(`(() => { const s = ${seen}; return { n: s.length, broken: s.filter((i) => !i.complete || !i.naturalWidth).map((i) => i.getAttribute("src")) }; })()`);
  // the shop's room the window's: nothing past its side (a trackpad's swipe shifts nothing)
  const wide = await b.ev(`(() => { const s = document.querySelector(".screen.shop"); return s.scrollWidth - s.clientWidth; })()`);
  // small words readable (WCAG AA, 4.5:1, on the first opaque ground behind them), a card's #number never cut
  const low = await b.ev(`(() => {
    const rgb = (s) => (s.match(/[0-9.]+/g) || []).map(Number);
    const lum = ([r, g, b]) => { const f = (v) => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const ratio = (e) => { let bg = [255, 255, 255]; for (let x = e; x; x = x.parentElement) { const c = rgb(getComputedStyle(x).backgroundColor); if ((c[3] ?? 1) > 0.9) { bg = c; break; } } const [a, b] = [lum(rgb(getComputedStyle(e).color)), lum(bg)].sort((x, y) => y - x); return (a + 0.05) / (b + 0.05); };
    return [".shop__pitch", ".wline__who", ".gshelf .gcard__name small", ".gshelf .gcard__fact"].map((s) => [s, document.querySelector(s)]).filter(([, e]) => e && ratio(e) < 4.5).map(([s, e]) => s + " " + ratio(e).toFixed(2));
  })()`);
  // (the line laid out past its box by a hair is ellipsised from its end: the number first)
  const cut = await b.ev(`[...document.querySelectorAll(".gshelf li .gcard__name small")].filter((id) => { const r = id.getBoundingClientRect(), box = id.parentElement.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > box.right + 0.01; }).length`);
  // a card's sheet: nothing of the banner (Local chain, Feedback, Support) over it, nor clickable through it
  await b.js(`document.querySelector(".gshelf li .gcard").click(); true`);
  for (let i = 0; i < 20 && !(await b.ev(`!!document.querySelector(".gsheet")`)); i++) await sleep(250);
  const over = await b.ev(`(() => { const n = document.querySelector(".netbanner"); if (!n) return 0; return [...n.querySelectorAll("*")].filter((e) => { const r = e.getBoundingClientRect(); if (!r.width) return false; const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return at && at.closest(".netbanner"); }).length; })()`);
  // and its sticky Buy footer over nothing that follows it: the Traits summary's top is the summary's, there to click
  for (let i = 0; i < 20 && !(await b.ev(`!!document.querySelector(".gsheet .gsheet__foot .btn")`)); i++) await sleep(250);
  const covered = await b.ev(`(() => { const s = document.querySelector(".gsheet details.more > summary"); if (!s) return "no Traits"; const r = s.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return ""; const at = document.elementFromPoint(r.left + r.width / 2, r.top + 3); return at && s.contains(at) ? "" : "Traits under " + (at ? at.className || at.nodeName : "nothing"); })()`);
  const ok = cls.cls < 0.01 && pics.n > 0 && !pics.broken.length && wide <= 0 && !early.length && over === 0 && !low.length && cut === 0 && !covered;
  results.push({ w, ok });
  console.log(`${ok ? "PASS" : "FAIL"} opening the shop at ${w}: ${early.length} sale reads on the title screen, layout shift ${cls.cls}, ${pics.n} pictures in sight, ${pics.broken.length} broken, ${wide} px sideways, ${over} of the banner over a sheet, ${low.length} small words under 4.5:1, ${cut} #numbers cut${covered ? `, ${covered}` : ""}`, low.length ? JSON.stringify(low) : "", early.length ? JSON.stringify(early) : "", pics.broken.length ? JSON.stringify(pics.broken.slice(0, 6)) : "", cls.shifts.length ? JSON.stringify(cls.shifts).slice(0, 400) : "");
  b.kill();
  if (!dir) continue;
  // a strip: every other frame (0-5.8 s), 6 a row
  const b2 = await launch({ width: 1600, height: 1000 });
  const sel = files.filter((_, i) => i % 2 === 0), cw = w > 600 ? 240 : 120;
  const html = `<html><body style="margin:0;font:12px sans-serif;background:#fff"><div style="display:grid;grid-template-columns:repeat(${w > 600 ? 6 : 10},${cw}px);gap:3px">${sel.map((f, i) => `<figure style="margin:0"><img src="file://${f}" width="${cw}"><figcaption>${i * 200} ms</figcaption></figure>`).join("")}</div></body></html>`;
  const page = path.join(OUT, `${TAG}-${w}.html`); fs.writeFileSync(page, html);
  await b2.send("Page.navigate", { url: "file://" + page }); await sleep(1500);
  const { width, height } = await b2.ev(`({ width: document.body.scrollWidth, height: document.body.scrollHeight })`);
  const { data } = await b2.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width, height, scale: 1 } });
  fs.writeFileSync(path.join(OUT, `strip-${TAG}-${w}.png`), Buffer.from(data, "base64"));
  b2.kill();
}
// the toolbar: one height, one top and one baseline a line (the views, the tiers, the search, the look, more filters)
for (const [w, h, mobile] of /** @type {[number, number, boolean][]} */ ([[1440, 900, false], [1280, 800, false], [1024, 700, false], [390, 844, true]])) {
  const b = await launch({ width: w, height: h, mobile, touch: mobile });
  await b.send("Page.navigate", { url: APP + "/g/" });
  for (let i = 0; i < 90 && !(await b.ev(`!!document.querySelector(".gbar .tierbtn")`)); i++) await sleep(500);
  await sleep(1000);
  const bar = [{ name: "the shop's bar", box: ".gbar .seg, .gbar .btn, .gbar .gsearch", by: ".gbar" }];
  const off = await b.ev(misaligned(bar));
  // more filters open: on (gold, as every on control), its box kept, the bar still in line
  const shut = await b.ev(footprint(".gbar__more"));
  await b.js(`document.querySelector(".gbar__more").click(); true`);
  await sleep(300);
  const on = { box: JSON.stringify(await b.ev(footprint(".gbar__more"))) === JSON.stringify(shut), gold: await b.ev(gold(".gbar__more")), line: await b.ev(misaligned(bar)) };
  // a tier selected and the view chosen: the one selected look (gold), the tier's box kept, the bar in line
  const tier = await b.ev(footprint(".gbar .tierbtn"));
  await b.js(`document.querySelector(".gbar .tierbtn").click(); true`);
  await sleep(300);
  const sel = { box: JSON.stringify(await b.ev(footprint(".gbar .tierbtn"))) === JSON.stringify(tier), gold: await b.ev(gold(".gbar .tierbtn")), view: await b.ev(gold(".gbar__views button.on")), line: await b.ev(misaligned(bar)) };
  const ok = Array.isArray(off) && off.length === 0 && on.box && on.gold && on.line.length === 0 && sel.box && sel.gold && sel.view && sel.line.length === 0;
  results.push({ w, ok });
  console.log(`${ok ? "PASS" : "FAIL"} the shop's bar in line at ${w}×${h}, more filters on: gold ${on.gold}, its box kept ${on.box}; a tier and the view selected: gold ${sel.gold && sel.view}, the tier's box kept ${sel.box}`, ok ? "" : JSON.stringify({ off, on, sel }));
  // the picker: the collection between the tile and the aim card, at least as wide, one slim row (about a button
  // high): its thumbnails of one size and one frame, its line on one line on a computer (two at most on a phone),
  // the line and its button on one baseline (one middle on a phone); the head whole
  await b.send("Page.navigate", { url: APP + "/?cup=garden&screen=pick" });
  for (let i = 0; i < 90 && !(await b.ev(`!!document.querySelector(".screen--pick .gcollect")`)); i++) await sleep(500);
  await sleep(500);
  const pick = await b.ev(`(() => { const r = (s) => document.querySelector(".screen--pick " + s)?.getBoundingClientRect(); const band = r(".gcollect"), stage = r(".pick__tile"), aim = r(".aimset"), go = r(".gcollect__go"), eyebrow = document.querySelector(".pick > .eyebrow");
    const text = document.querySelector(".gcollect__text"), said = text.getBoundingClientRect();
    const faces = [...document.querySelectorAll(".gcollect__faces .gtile")].filter((t) => t.checkVisibility()).map((t) => { const s = getComputedStyle(t), q = t.getBoundingClientRect(); return [q.width, q.height, s.borderTopWidth, s.borderTopColor, s.borderRadius, getComputedStyle(t, "::before").boxShadow.replace(/rgba?\\([^)]*\\)/g, "")].join(" "); });
    return { below: band.top >= stage.bottom, above: band.bottom <= aim.top, narrow: band.width < aim.width - 0.5, tall: band.height, lines: Math.round(said.height / parseFloat(getComputedStyle(text).lineHeight)),
      middle: Math.abs(said.top + said.height / 2 - (go.top + go.height / 2)), faces: faces.length, frames: new Set(faces).size, head: eyebrow?.nextElementSibling?.matches(".pick__name, .dare") ?? false }; })()`);
  const line = mobile ? [] : await b.ev(misaligned([{ name: "the picker's band", box: ".gcollect__go", words: ".gcollect__text, .gcollect__go" }]));
  const fits = pick.below && pick.above && !pick.narrow && pick.tall <= 56 && pick.lines <= (mobile ? 2 : 1) && pick.middle <= 1 && pick.faces >= 3 && pick.frames === 1 && line.length === 0 && pick.head;
  results.push({ w, ok: fits });
  console.log(`${fits ? "PASS" : "FAIL"} the picker's collection under its tile, ${Math.round(pick.tall)} px tall, its line on ${pick.lines}, ${pick.faces} thumbnails of one frame, the head whole at ${w}×${h}`, fits ? "" : JSON.stringify({ pick, line }));
  b.kill();
}
// never sideways: the menu (its shop panel the way in) and the shop, from 360 to 1440 px wide in steps of 40, the
// page and its screen no wider than the window (a trackpad's swipe shifts nothing)
{
  const b = await launch({ width: 1440, height: 900 });
  for (const at of ["/?screen=modes", "/g/"]) {
    await b.send("Page.navigate", { url: APP + at });
    for (let i = 0; i < 90 && !(await b.ev(`!!document.querySelector(".screen.modes .mode, .screen.shop .gbar")`)); i++) await sleep(500);
    const wide = [];
    for (let w = 360; w <= 1440; w += 40) {
      await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
      await sleep(250);
      const over = await b.ev(`Math.max(document.documentElement.scrollWidth - innerWidth, ...[...document.querySelectorAll(".screen")].map((s) => s.scrollWidth - s.clientWidth))`);
      if (over > 0) wide.push(`${w}: ${over} px`);
    }
    results.push({ w: at, ok: !wide.length });
    console.log(`${wide.length ? "FAIL" : "PASS"} ${at} never sideways from 360 to 1440 px`, wide.length ? JSON.stringify(wide) : "");
  }
  // About's link cards (Button's look, a card's shape): each card's words from its padding, the four on one left edge
  for (const w of [1280, 390]) {
    await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: 844, deviceScaleFactor: 1, mobile: w < 600 });
    await b.send("Page.navigate", { url: APP + "/?screen=modes" });
    for (let i = 0; i < 90 && !(await b.ev(`!!document.querySelector(".screen__about")`)); i++) await sleep(500);
    await b.js(`document.querySelector(".screen__about").click(); true`);
    for (let i = 0; i < 20 && !(await b.ev(`!!document.querySelector(".about__links .btn")`)); i++) await sleep(250);
    await sleep(800); // (the sheet's pop settled)
    const edges = await b.ev(`[...document.querySelectorAll(".about__links .btn")].map((a) => { const s = getComputedStyle(a); return Math.round(a.querySelector("b").getBoundingClientRect().left - a.getBoundingClientRect().left - parseFloat(s.borderLeftWidth) - parseFloat(s.paddingLeft)); })`);
    const ok = edges.length > 0 && edges.every((x) => x === 0);
    results.push({ w: `about ${w}`, ok });
    console.log(`${ok ? "PASS" : "FAIL"} About's link cards, their words from their padding, at ${w}`, ok ? "" : JSON.stringify(edges));
  }
  b.kill();
}
// the shop's part of the game (components/gnomes/Game.tsx) not fetched (offline, a deploy that took the old files):
// the shop's screen still has its Back, About and Try again, and Escape leaves it; Try again with the network back
// opens the shop (offline in the page: lib/cdp.mjs offline, the chunk whatever a build names it)
{
  const b = await launch({ width: 1280, height: 800 });
  // offline from the title screen on (the game itself loaded), the shop then opened from the menu
  await b.send("Page.navigate", { url: APP + "/" });
  for (let i = 0; i < 90 && !(await b.ev(`!![...document.querySelectorAll("button")].find((x) => /Click to start/.test(x.textContent))`)); i++) await sleep(500);
  const net = await offline(b);
  await b.js(`[...document.querySelectorAll("button")].find((x) => /Click to start/.test(x.textContent)).click()`);
  for (let i = 0; i < 60 && !(await b.ev(`!!document.querySelector(".mode--shop")`)); i++) await sleep(500);
  await b.js(`document.querySelector(".mode--shop").click()`);
  for (let i = 0; i < 90 && !(await b.ev(`!!document.querySelector(".shop [role=alert] button")`)); i++) await sleep(500);
  const off = await b.ev(`(() => ({ back: !!document.querySelector(".shop .screen__back"), about: !!document.querySelector(".shop .screen__about"), retry: !!document.querySelector(".shop [role=alert] button") }))()`);
  await net.back();
  await b.js(`document.querySelector(".shop [role=alert] button")?.click(); true`);
  for (let i = 0; i < 60 && !(await b.ev(`!!document.querySelector(".gshelf li .gcard")`)); i++) await sleep(500);
  const back = !!(await b.ev(`!!document.querySelector(".gshelf li .gcard")`));
  await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(800);
  const left = await b.ev(`!document.querySelector(".screen.shop")`);
  const ok = !!off && off.back && off.about && off.retry && back && left;
  results.push({ w: 1280, ok });
  console.log(`${ok ? "PASS" : "FAIL"} the shop's part not fetched: Back ${off && off.back}, About ${off && off.about}, Try again ${off && off.retry}; then the shelf ${back}; Escape leaves the shop ${left}`);
  b.kill();
}
// the network chip (bottom left, fixed) never over the last row: the shop's gallery (every gnome shown), the cups
// (the community's list at their foot) and the menu, each scrolled to its foot, no control under the chip
for (const [w, h, mobile] of /** @type {[number, number, boolean][]} */ ([[1440, 900, false], [1024, 768, false], [390, 844, true]]))
  for (const [at, ready] of [["/g/", ".gshelf li"], ["/?screen=cups", ".world"], ["/?screen=modes", ".mode"]]) {
    const b = await launch({ width: w, height: h, mobile, touch: mobile });
    await b.send("Page.navigate", { url: APP + at });
    for (let i = 0; i < 90 && !(await b.ev(`!!document.querySelector(${JSON.stringify(ready)})`)); i++) await sleep(500);
    await sleep(1500);
    for (let k = 0; k < 40 && (await b.ev(`!!document.querySelector(".gshelf__more")`)); k++) await b.js(`document.querySelector(".gshelf__more").click(); true`), await sleep(300);
    const under = await b.ev(underChip());
    const ok = (await b.ev(`!!document.querySelector(".netbanner")`)) && Array.isArray(under) && under.length === 0;
    results.push({ w: `${at} ${w}`, ok });
    console.log(`${ok ? "PASS" : "FAIL"} ${at} at ${w}×${h}: scrolled to its foot, nothing under the network chip`, ok ? "" : JSON.stringify(under));
    b.kill();
  }
process.exit(results.every((r) => r.ok) ? 0 : 1);
