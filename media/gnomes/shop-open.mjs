// @ts-check
// The gnome shop opened from the menu's Shop panel as a player on a slow
// link and a phone's CPU would (Fast 3G, the CPU 4x slower), at 1440, 1024
// and 390: the layout shifts the page reports over 6 s, failing over 0.01
// (the shop draws its final frame first: ShopFrame.tsx); then every card's
// picture in sight loaded (no broken image), and the shop never wider than
// the window (no sideways scroll); a gnome's sheet opened from a card over
// everything, the network banner too (never a chip over its Buy); the
// head's and the cards' small words at WCAG AA (4.5:1) on their ground, and
// every card's #number in sight however long its name. Before, the title screen alone: none of
// the sale read (the catalogue) nor the collection's wardrobe fetched, which
// only a screen showing the sale needs. With OUT, a frame every 100 ms and a
// strip of them.
//   APP=https://… node media/gnomes/shop-open.mjs   (OUT=<dir> for the frames)
import fs from "node:fs";
import path from "node:path";
import { launch, sleep } from "../lib/cdp.mjs";
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
  const early = await b.ev(`performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.includes("/gnomes/catalogue.json") || n.includes("gnome-dress"))`);
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
  const ok = cls.cls < 0.01 && pics.n > 0 && !pics.broken.length && wide <= 0 && !early.length && over === 0 && !low.length && cut === 0;
  results.push({ w, ok });
  console.log(`${ok ? "PASS" : "FAIL"} opening the shop at ${w}: ${early.length} sale reads on the title screen, layout shift ${cls.cls}, ${pics.n} pictures in sight, ${pics.broken.length} broken, ${wide} px sideways, ${over} of the banner over a sheet, ${low.length} small words under 4.5:1, ${cut} #numbers cut`, low.length ? JSON.stringify(low) : "", early.length ? JSON.stringify(early) : "", pics.broken.length ? JSON.stringify(pics.broken.slice(0, 6)) : "", cls.shifts.length ? JSON.stringify(cls.shifts).slice(0, 400) : "");
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
process.exit(results.every((r) => r.ok) ? 0 : 1);
