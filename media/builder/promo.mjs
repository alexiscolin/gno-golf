// @ts-check
// The Builder's video, for social media: node media/builder/promo.mjs [--record] [--edit]
//
// The trailer's tone (media/promo/render.mjs, v11): its music ("Dizzy Racing", CC0, 175 BPM, its
// last 30 s), its titles (big rounded words in ink, a word in gold or red, bouncing in on a beat),
// its cover and end cards (the logo on its sunburst), cut on the beat. In between, the Builder
// itself, played by a script in a headless Chrome against a site with the Builder on (APP, the
// playground's by default; nothing is sent to a chain): the Garden's dogleg opened, a shortcut
// painted onto it (the walls following), pieces dropped, Play and its test rounds in 3D (each
// weather holed, by the page's own test chain, builder.wasm, as scripts/builderwalk.ts finds a
// round), then the Publish step's 3D view turning. A drawn pointer stands for the mouse.
//
// --record: the take only (its frames and marks in WORK); --edit: the cut only, from the last
// take; neither: both. -> media/builder/gnogolf-builder.mp4 (1920x1080, H.264 and AAC) and its
// first frame as gnogolf-builder-cover.jpg. CTA sets the end card's button.
//   APP=http://100.104.210.102:5181 node media/builder/promo.mjs
// Needs: Node 22+, Google Chrome, /opt/homebrew/bin/ffmpeg.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launch, sleep, APP } from "../lib/cdp.mjs";
import { title } from "../promo/titles.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const WORK = path.join(os.tmpdir(), "gnogolf-builder-promo"), TAKE = path.join(WORK, "take"), OVER = path.join(WORK, "over");
const OUT = path.join(HERE, "gnogolf-builder.mp4");
const FPS = 30, BEAT = 60 / 175;
const MUSIC = path.join(HERE, "..", "promo", "music", "dizzy_racing.flac"), MUSIC_END = 134.53;
// the take's window: the Builder at its laptop size, filmed at 1.5x (1920x1080)
const W = 1280, H = 720, DPR = 1.5;
// the author the test rounds are proved under: gnodev's test1 (a well-known dev key; nothing is published)
const AUTHOR = process.env.AUTHOR || "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const CTA = process.env.CTA || "BUILD YOURS ON GNO.LAND";
const RECORD = process.argv.includes("--record") || !process.argv.includes("--edit");
const EDIT = process.argv.includes("--edit") || !process.argv.includes("--record");

// ------------------------------------------------------------------ the take

// the drawn pointer: an arrow following the page's own pointer events, pressed smaller
const POINTER = `addEventListener("DOMContentLoaded", () => {
  const d = document.createElement("div");
  d.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M3 2l17 9.5-7.4 1.6L9 20z" fill="#fffaf0" stroke="#144134" stroke-width="2" stroke-linejoin="round"/></svg>';
  Object.assign(d.style, { position: "fixed", left: "-3px", top: "-2px", zIndex: 2147483647, pointerEvents: "none", transform: "translate(-99px,-99px)", transition: "scale .08s", filter: "drop-shadow(0 3px 3px rgba(20,65,52,.4))" });
  document.body.appendChild(d);
  const at = (e) => (d.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)");
  addEventListener("pointermove", at, true);
  addEventListener("pointerdown", (e) => (at(e), (d.style.scale = ".82")), true);
  addEventListener("pointerup", () => (d.style.scale = "1"), true);
  window.__pointer = (on) => (d.style.display = on ? "" : "none");
  // the first run's hints left out of the film
  const s = document.createElement("style");
  s.textContent = ".bhint { display: none !important; }";
  document.head.appendChild(s);
});`;

async function record() {
  fs.rmSync(TAKE, { recursive: true, force: true });
  fs.mkdirSync(TAKE, { recursive: true });
  // (the screencast films the window at its device scale only when Chrome is started at it)
  const c = await launch({ width: W, height: H, args: ["--hide-scrollbars", `--force-device-scale-factor=${DPR}`, `--window-size=${W},${H}`] });
  await c.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
  await c.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await c.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await c.send("Page.addScriptToEvaluateOnNewDocument", { source: POINTER });
  /** @type {[number, string][]} */
  const frames = [];
  /** @type {Record<string, number>} */
  const marks = {};
  const now = () => Date.now() / 1000, mark = (/** @type {string} */ n) => ((marks[n] = now()), console.log(`  ${n}`));
  c.on("Page.screencastFrame", (p) => {
    const f = path.join(TAKE, `${String(frames.length).padStart(5, "0")}.jpg`);
    fs.writeFileSync(f, Buffer.from(p.data, "base64"));
    frames.push([p.metadata.timestamp, f]);
    void c.send("Page.screencastFrameAck", { sessionId: p.sessionId });
  });
  const until = async (/** @type {string} */ expr, /** @type {string} */ what, ms = 60_000) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(150)) if (await c.ev(expr)) return;
    throw new Error(`no ${what}`);
  };
  // the pointer: where it is, moved there eased (pressed: a drag), pressed and let go
  let at = [W * 0.62, H * 0.55];
  const mouse = (/** @type {string} */ type, [x, y] = at, down = false) =>
    c.send("Input.dispatchMouseEvent", { type, x, y, button: down || type !== "mouseMoved" ? "left" : "none", buttons: down ? 1 : 0, clickCount: 1 });
  const glide = async (/** @type {number[]} */ to, ms = 450, down = false) => {
    const from = at, n = Math.max(2, Math.round(ms / 16));
    for (let k = 1; k <= n; k++) {
      const u = k / n, e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      at = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e];
      await mouse("mouseMoved", at, down);
      await sleep(16);
    }
  };
  const press = async () => (await mouse("mousePressed", at, true), await sleep(90), await mouse("mouseReleased", at));
  const centre = (/** @type {string} */ sel) => c.js(`(() => { const r = (${sel}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  const cell = (/** @type {number} */ x, /** @type {number} */ y) => c.js(`(() => { const m = document.querySelector(".board__plane").getScreenCTM(); return [m.a * ${x} + m.c * ${y} + m.e, m.b * ${x} + m.d * ${y} + m.f]; })()`);
  const button = (/** @type {RegExp} */ re) => `[...document.querySelectorAll("button")].find((b) => ${re}.test(b.textContent.trim()))`;
  const pieces = () => c.js(`document.querySelectorAll("[data-piece]").length`);

  try {
    await c.send("Page.navigate", { url: `${APP}/build/?camlog` });
    await until(`!!document.querySelector(".palette [data-tool=grow]") && document.querySelectorAll("[data-end]").length === 2`, "editor");
    await sleep(1500);
    await c.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: W * DPR, maxHeight: H * DPR });
    await sleep(600);
    await mouse("mouseMoved");

    // a shortcut painted across the dogleg's corner: three straight strokes from inside the green (a press on its side would move the side), a stair the walls follow
    mark("paint");
    await glide(await centre(`document.querySelector(".palette [data-tool=grow]")`), 600);
    await press();
    await sleep(350);
    for (const [[x0, y0], [x1, y1]] of [[[25.5, 13.5], [9, 13.5]], [[25.5, 16.5], [13, 16.5]], [[25.5, 19.5], [17, 19.5]]]) {
      await glide(await cell(x0, y0), 420);
      await mouse("mousePressed", at, true);
      await glide(await cell(x1, y1), 900, true);
      await mouse("mouseReleased", at);
      await sleep(450);
    }
    await glide(await centre(`document.querySelector(".palette [data-tool=grow]")`), 500);
    await press();
    await sleep(500);
    mark("painted");

    // pieces dropped from the palette, off the shot's straight line (the shortcut left clear)
    mark("pieces");
    for (const [name, x, y] of /** @type {[string, number, number][]} */ ([["Bumper", 12, 3.5], ["Sand", 15.5, 3.5], ["Water", 25.5, 9.5], ["Bumper", 19, 8.5]])) {
      const n = await pieces(), tile = await centre(`[...document.querySelectorAll(".palette [data-tile]")].find((t) => t.querySelector(".piece__name")?.textContent === ${JSON.stringify(name)})`);
      await glide(tile, 450);
      await mouse("mousePressed", at, true);
      await glide(await cell(x, y), 700, true);
      await mouse("mouseReleased", at);
      await sleep(650);
      if ((await pieces()) <= n) console.log(`  (${name} not placed at ${x},${y}: ${await c.ev(`document.querySelector(".board__said")?.textContent || ""`)})`);
    }
    // nothing selected: the inspector's own words back
    await glide(await cell(6, 30), 400);
    await press();
    await sleep(500);
    mark("placed");

    // Play: the address the rounds are proved under, then each weather holed in 3D
    await until(`!document.querySelector(".bhead__act[aria-disabled]")`, "Play on");
    await glide(await centre(`document.querySelector(".bhead__act")`), 600);
    await press();
    await until(`!!document.querySelector(".tmode__sign--start")`, "the start card");
    const next = button(/^Use [a-z0-9-]+-\d+$/), paste = button(/^Paste an address/i);
    await until(`!!${next} || !!${paste}`, "the start card's way on");
    await sleep(800);
    if (await c.ev(`!!${next}`)) await c.js(`${next}.click()`);
    else {
      await c.js(`${paste}.click()`);
      await until(`!!document.querySelector(".tmode__addr input")`, "the address field");
      await c.js(`(() => { const el = document.querySelector(".tmode__addr input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(AUTHOR)}); el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
      await c.js(`${button(/^Use this address$/)}.click()`);
    }
    await c.js(`window.__pointer(false)`);
    for (let w = 1; w <= 6 && !(await c.ev(`!!document.querySelector(".tmode__sum")`)); w++) {
      await until(`!!window.__g && !!document.querySelector(".tmode__chip--now:not(.tmode__chip--done)") && document.querySelector(".tmode__score strong")?.textContent === "0" && !document.querySelector(".tmode__won")`, "a weather to play", 90_000);
      const done = await c.js(`document.querySelectorAll(".tmode__chip--done").length`);
      await sleep(1500); // (the round set up: its weather's period read, as builderwalk waits)
      const round = await c.js(FIND);
      if (!round) throw new Error(`no round found in weather ${w}`);
      mark(`w${w}`);
      for (const [k, [a, pw]] of round.entries()) {
        await until(`document.querySelector(".tmode__score strong")?.textContent === "${k}"`, `stroke ${k} ready`, 30_000);
        if (k) await sleep(500);
        await c.js(`window.__g.shoot(${a}, ${pw})`); // (back once the ball is still: the last one, holed)
      }
      mark(`sunk${w}`);
      await until(`document.querySelectorAll(".tmode__chip--done").length > ${done} || !!document.querySelector(".tmode__won")`, `weather ${w} holed`, 60_000);
      mark(`holed${w}`);
      console.log(`  weather ${w}: ${round.length} shot(s)`);
      await until(`!!document.querySelector(".tmode__sum") || !!document.querySelector(".tmode__chip--now:not(.tmode__chip--done)")`, "the next round or the summary", 60_000);
    }

    // the summary's Publish, then its step's 3D view: grabbed and turned a little, let go turning on its own
    await until(`[...document.querySelectorAll(".tmode__won button")].some((b) => /^Publish →$/.test(b.textContent))`, "Publish on the summary", 60_000);
    mark("summary");
    await c.js(`window.__pointer(true)`);
    const publish = `[...document.querySelectorAll(".tmode__won button")].find((b) => /^Publish →$/.test(b.textContent))`;
    await glide(await centre(publish), 600);
    await press();
    await sleep(400);
    if (await c.ev(`!!${publish}`)) await c.js(`${publish}.click()`); // (a press the card took for its own)
    await until(`!!document.querySelector(".pub .preview canvas")`, "the Publish step's 3D view", 30_000);
    await sleep(1500);
    mark("publish");
    const pv = await centre(`document.querySelector(".pub .preview")`);
    await glide([pv[0] - 120, pv[1]], 500);
    await mouse("mousePressed", at, true);
    await glide([pv[0] + 140, pv[1] + 30], 1300, true);
    await mouse("mouseReleased", at);
    await glide([pv[0] + 260, pv[1] + 220], 700);
    await sleep(6000);
    mark("end");
    await c.send("Page.stopScreencast");
    await sleep(300);
  } finally {
    fs.writeFileSync(path.join(WORK, "take.json"), JSON.stringify({ frames, marks }));
    if (c.errors.length) console.log("page errors:", c.errors.slice(0, 5));
    c.kill();
  }
  console.log(`take: ${frames.length} frames over ${(frames.at(-1)[0] - frames[0][0]).toFixed(1)} s`);
}

// a round of the weather now played holed: each shot the one ending nearest the cup, within 40 degrees of it (scripts/builderwalk.ts holeOne)
const FIND = `(async () => {
  const g = window.__g, id = g.current(), p = await g.chain.period(), s = await g.chain.state(id);
  const pin = s.cup, shots = [];
  let rest = s.start;
  const of = (a, pw) => a.toFixed(4) + "," + pw.toFixed(4);
  for (let k = 0; k < 8; k++) {
    let best = null;
    const toward = Math.atan2(pin[1] - rest[1], pin[0] - rest[0]) * 180 / Math.PI;
    for (let da = -40; da <= 40; da += 2) for (let pw = 0.5; pw <= 10; pw += 0.25) {
      const a = Math.round((toward + da) * 100) / 100;
      let r;
      try { r = k === 0 ? await g.chain.simulateRound(id, [of(a, pw)], p) : await g.chain.simulateFrom(id, rest, of(a, pw), k, p); } catch { continue; }
      if (r.holed) return [...shots, [a, pw]];
      const d = Math.hypot(r.rest[0] - pin[0], r.rest[1] - pin[1]);
      if (!best || d < best.d) best = { a, pw, rest: r.rest, d };
    }
    if (!best) return null;
    shots.push([best.a, best.pw]);
    rest = best.rest;
  }
  return null;
})()`;

// ------------------------------------------------------------------ the cut

// the cut on the music's beat grid: a card, or a stretch of the take between two marks (seconds after
// them) played to fill its beats, cropped to [x, y, w] of the take's window (16:9; none: all of it);
// its titles at seconds into it ("at" -1: landed on its first frame, a cover's; "on": as the take's mark is played). A
// stretch whose marks the take has not (a weather the earlier rounds held in, not played) is left out, the one before
// it played over its beats
const CUT = [
  { card: "cover", beats: [0, 6], titles: [
    { logo: 560, at: -1, to: 1.54, bounce: 3.2, tilt: -3, y: -170, sparkle: 6, tilt3d: 4 },
    { pill: "NEW IN GNOGOLF", size: 54, at: -1, to: 1.54, tilt: -2, y: 165 },
    { big: "BUILD YOUR <b>OWN HOLE.</b>", size: 124, at: -1, to: 1.54, tilt: -3, y: 320 },
  ] },
  { from: ["paint", 0.3], to: ["painted", 0], beats: [6, 22], crop: [8, 84, 1100], titles: [
    { big: "PAINT <b>THE GREEN.</b>", size: 132, at: 0.02, to: 2.4, y: 330 },
    { big: "THE WALLS <i>FOLLOW.</i>", size: 132, at: 2.75, to: 5.2, y: 330 },
  ] },
  { from: ["pieces", 0], to: ["placed", -0.3], beats: [22, 36], crop: [8, 84, 1100], titles: [
    { big: "DROP <b>THE PIECES.</b>", size: 132, at: 0.02, to: 4.5, y: 330 },
  ] },
  { from: ["w1", -0.6], to: ["sunk1", 1.3], beats: [36, 48], titles: [
    { big: "PLAY IT <b>IN 3D.</b>", size: 140, at: 0.02, to: 2.2, y: 300 },
    { big: "<b>SUNK!</b>", size: 170, on: "sunk1", kind: "slam", y: 260, sparkle: 4 },
  ] },
  { from: ["w2", -0.3], to: ["sunk2", 0.9], beats: [48, 54], titles: [{ big: "IN THE <i>WIND.</i>", size: 150, at: 0.02, y: 300 }] },
  { from: ["w3", -0.3], to: ["sunk3", 0.9], beats: [54, 60], titles: [{ big: "IN THE <b>RAIN.</b>", size: 150, at: 0.02, y: 300 }] },
  { from: ["summary", 0.2], to: ["summary", 1.8], beats: [60, 64], crop: [200, 92, 880] },
  { from: ["publish", -0.6], to: ["end", 0], beats: [64, 80], crop: [0, 80, 1110], titles: [
    { big: "PUBLISH IT <b>ON-CHAIN.</b>", size: 132, at: 0.02, to: 2.55, y: 330 },
    { big: "DARE YOUR <i>FRIENDS.</i>", size: 132, at: 2.75, y: 330 },
  ] },
  { card: "end", beats: [80, 91.5], titles: [
    { logo: 600, at: 0, bounce: 3.2, tilt: -3, y: -190, sparkle: 4, tilt3d: true },
    { raw: "<div class='sub' style='text-transform:none;letter-spacing:.01em;font-size:44px'>Paint · Drop · Play · Publish</div>", at: 0.69, tilt: 0, y: 345 },
    { cta: CTA, size: 84, at: 2.57, kind: "slam", tilt: 0, y: 215 },
  ] },
];
// the music's last hit (134.53 s) on the end card's CTA, beat 87.5: the cut starts that many beats before it
/** The cut as this take allows: the stretches it has marks for, each title's time set. */
function cutOf(/** @type {Record<string, number>} */ marks) {
  /** @type {any[]} */
  const out = [];
  for (const s of CUT) {
    if (s.from && !(s.from[0] in marks && s.to[0] in marks)) { out.at(-1).beats = [out.at(-1).beats[0], s.beats[1]]; continue; }
    out.push({ ...s });
  }
  return out.map((s) => {
    const a = s.from && marks[s.from[0]] + s.from[1], b = s.from && marks[s.to[0]] + s.to[1], dur = (s.beats[1] - s.beats[0]) * BEAT;
    return { ...s, a, b, titles: (s.titles || []).map((/** @type {any} */ t) => (t.on ? { ...t, at: ((marks[t.on] - a) / (b - a)) * dur - 0.05 } : t)) };
  });
}
const HIT = 87.5, LEN = 91.5, MUSIC_AT = +(MUSIC_END - HIT * BEAT).toFixed(3);
const F = (/** @type {number} */ beat) => Math.round(beat * BEAT * FPS);

// the titles' look: web/lib/promo.ts's #promo (kept alike), and the cards' sunburst on the end card's paper
const CSS = `
  html, body { background: transparent !important; }
  body > *:not(#promo), body::before, body::after { display: none !important; }
  #promo { position: fixed; inset: 0; overflow: hidden; font-family: Fredoka, ui-rounded, system-ui, sans-serif; }
  #promo .pcard { position: absolute; inset: 0; background: linear-gradient(178deg, #fdebcf 0%, #f3ddc2 38%, #bfd9cc 100%); opacity: 0; overflow: hidden; }
  #promo .pcard::after { content: ""; position: absolute; inset: 0; background-image: radial-gradient(circle, rgba(34,108,87,.45) 2px, transparent 2.6px);
    background-size: 18px 18px; -webkit-mask-image: linear-gradient(to top, #000 10%, transparent 55%); }
  #promo .burst { position: absolute; left: 50%; top: 46%; width: 2800px; height: 2800px; margin: -1400px 0 0 -1400px; opacity: .35;
    background: repeating-conic-gradient(#f5b83d 0deg 7.5deg, #f8c65c 7.5deg 15deg); -webkit-mask-image: radial-gradient(circle, #000 12%, rgba(0,0,0,.7) 26%, transparent 46%); }
  #promo .flash { position: absolute; inset: 0; background: #fffdf6; opacity: 0; }
  #promo .vig { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 55%, transparent 55%, rgba(20,65,52,.35) 100%); }
  #promo .t { position: absolute; left: 50%; top: 50%; display: grid; justify-items: center; gap: 6px; transform-origin: 50% 50%; white-space: nowrap; opacity: 0; }
  #promo .big { font-weight: 700; font-size: 190px; line-height: .9; letter-spacing: .02em; color: #fdf6e9;
    -webkit-text-stroke: 16px #144134; paint-order: stroke fill; text-shadow: 0 14px 0 #144134, 0 26px 40px rgba(20,65,52,.35); }
  #promo .big b { color: #f5b83d; font-weight: 700; }
  #promo .big i { color: #e0524b; font-style: normal; }
  #promo .sub { font-weight: 700; font-size: 46px; letter-spacing: .08em; text-transform: uppercase; color: #fdf6e9; background: #226c57;
    border: 6px solid #144134; border-radius: 999px; padding: 6px 34px 8px; box-shadow: 0 8px 0 #144134; margin-top: 18px; }
  #promo .logo { width: 900px; overflow: visible; filter: drop-shadow(7px 0 0 #fdf6e9) drop-shadow(-7px 0 0 #fdf6e9) drop-shadow(0 7px 0 #fdf6e9)
    drop-shadow(0 -7px 0 #fdf6e9) drop-shadow(0 4px 0 #144134) drop-shadow(0 4px 0 #144134) drop-shadow(0 4px 0 #0e3027) drop-shadow(0 22px 30px rgba(10,30,24,.5)); }
  #promo .cta { font-weight: 700; font-size: 64px; color: #fdf6e9; background: #226c57; border: 7px solid #144134; border-radius: 28px;
    padding: 14px 54px 20px; box-shadow: 0 12px 0 #144134; letter-spacing: .02em; }
  #promo .spk { position: absolute; width: 110px; height: 110px; margin: -55px 0 0 -55px; transform: scale(0); }
`;
const STAR = `<svg viewBox="-11 -11 22 22" width="110" height="110"><path d="M0-10Q1.8-1.8 10 0Q1.8 1.8 0 10Q-1.8 1.8-10 0Q-1.8-1.8 0-10Z" fill="#fffaf0" stroke="#144134" stroke-width="1.8" stroke-linejoin="round"/></svg>`;

// the overlay, one frame a time (its titles moved as web/lib/promo.ts moves them), at t seconds of the video
const LAYER = `(() => {
  const SPARKS = [[8, 30], [90, 20], [18, 82], [84, 74], [50, 2], [64, 92]];
  const ease = (k) => 1 - Math.pow(1 - k, 3), back = (k, c = 1.7) => 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
  const { cards, titles, cuts } = window.__cut;
  const layer = document.createElement("div");
  layer.id = "promo";
  layer.innerHTML = '<div class="pcard"><div class="burst"></div></div><div class="vig"></div>';
  document.body.appendChild(layer);
  const card = layer.querySelector(".pcard"), burst = layer.querySelector(".burst"), vig = layer.querySelector(".vig");
  const ts = titles.map((t) => {
    const el = document.createElement("div");
    el.className = "t";
    el.innerHTML = t.html;
    for (const [x, y] of SPARKS.slice(0, t.sparkle || 0)) {
      const sp = document.createElement("div");
      sp.className = "spk";
      Object.assign(sp.style, { left: x + "%", top: y + "%" });
      sp.innerHTML = ${JSON.stringify(STAR)};
      el.appendChild(sp);
    }
    layer.appendChild(el);
    return { ...t, el };
  });
  const flash = document.createElement("div");
  flash.className = "flash";
  layer.appendChild(flash);
  window.__at = (T) => {
    const c = cards.find(([a, b]) => T >= a && T < b);
    card.style.opacity = c ? "1" : "0";
    vig.style.opacity = c ? "0" : "1";
    if (c) burst.style.transform = "scale(" + (0.6 + 0.4 * back(Math.min(1, (T - c[0]) / 0.5))) + ") rotate(" + T * 8 + "deg)";
    const cut = cuts.filter((x) => x <= T).pop();
    flash.style.opacity = cut == null ? "0" : String(Math.max(0, 1 - (T - cut) / 0.22) * 0.75);
    for (const t of ts) {
      const tt = T - t.base, k = (tt - t.at) / 0.28, out = t.to != null ? (tt - t.to) / 0.18 : 0;
      if (k < 0 || out >= 1 || T >= t.end) { t.el.style.opacity = "0"; continue; }
      const kk = Math.min(k, 1);
      let s = t.kind === "slam" ? 2.6 - 1.6 * ease(kk) : 0.2 + 0.8 * back(kk, t.bounce || 1.7);
      const shake = t.kind === "slam" && k > 1 && k < 1.8 ? Math.sin(tt * 90) * 10 * (1.8 - k) : 0;
      s *= 1 + Math.max(0, tt - t.at - 0.28) * 0.025;
      if (out > 0) s *= 1 + out * 0.4;
      const sq = k > 0.7 && k < 1.6 ? Math.sin((k - 0.7) * 7) * 0.07 * (1.6 - k) : 0;
      const tw = t.tilt3d === true ? 9 : t.tilt3d || 0;
      const tilt3d = tw ? " perspective(1400px) rotateY(" + Math.sin(tt * 1.3) * tw + "deg) rotateX(" + (Math.cos(tt * 1.1) * tw * 5) / 9 + "deg)" : "";
      t.el.style.opacity = String(Math.min(1, kk * 3) * (out > 0 ? 1 - out : 1));
      t.el.style.transform = "translate(calc(-50% + " + shake + "px), calc(-50% + " + (t.y || 0) + "px))" + tilt3d + " rotate(" + (t.tilt ?? -4) + "deg) scale(" + s * (1 + sq) + ", " + s * (1 - sq) + ")";
      t.el.querySelectorAll(".spk").forEach((sp, i) => {
        const u = (tt - Math.max(t.at, 0) - 0.3 - i * 0.13) / 0.5, on = u > 0 && u < 1;
        sp.style.transform = on ? "scale(" + Math.sin(Math.PI * u) * (i % 2 ? 0.8 : 1.2) + ") rotate(" + u * 120 + "deg)" : "scale(0)";
      });
    }
  };
})()`;

async function overlay(/** @type {any[]} */ cut_) {
  fs.rmSync(OVER, { recursive: true, force: true });
  fs.mkdirSync(OVER, { recursive: true });
  const c = await launch({ width: 1920, height: 1080, args: ["--hide-scrollbars"] });
  await c.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  await c.send("Page.navigate", { url: `${APP}/` }); // (the site's own Fredoka and the logo's colours)
  for (let k = 0; k < 60 && !(await c.ev(`document.readyState === "complete" && document.fonts.status === "loaded"`)); k++) await sleep(300);
  const cut = {
    cards: cut_.filter((s) => s.card).map((s) => s.beats.map((/** @type {number} */ b) => b * BEAT)),
    cuts: [cut_[1].beats[0], cut_.at(-1).beats[0]].map((b) => b * BEAT),
    titles: cut_.flatMap((s) => s.titles.map((/** @type {any} */ t) => ({ ...t, html: title(t), at: t.at < 0 ? -1 : t.at, base: s.beats[0] * BEAT, end: s.beats[1] * BEAT }))),
  };
  await c.js(`(() => { const s = document.createElement("style"); s.textContent = ${JSON.stringify(CSS)}; document.head.appendChild(s); window.__cut = ${JSON.stringify(cut)}; })()`);
  await c.js(LAYER);
  await c.js(`document.fonts.ready.then(() => true)`);
  for (let f = 0; f < F(LEN); f++) {
    await c.js(`window.__at(${f / FPS})`);
    const s = await c.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OVER, `${String(f).padStart(5, "0")}.png`), Buffer.from(s.data, "base64"));
  }
  c.kill();
}

// the take's frames laid on the cut (each output frame the take's latest by then), cropped and scaled to 1920x1080 a stretch at a time
function base(/** @type {any[]} */ cut, /** @type {[number, string][]} */ frames) {
  const ts = frames.map((/** @type {[number, string]} */ f) => f[0]);
  const parts = [];
  for (const [i, s] of cut.entries()) {
    const out = path.join(WORK, `part${i}.mp4`), n = F(s.beats[1]) - F(s.beats[0]);
    parts.push(out);
    if (s.card) {
      execFileSync(FFMPEG, ["-y", "-v", "error", "-f", "lavfi", "-i", `color=c=0x3f9a72:s=1920x1080:r=${FPS}`, "-frames:v", String(n), "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "16", out]);
      continue;
    }
    const { a, b } = s;
    const dir = path.join(WORK, `part${i}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir);
    for (let f = 0, j = 0; f < n; f++) {
      const at = a + ((b - a) * f) / n;
      while (j + 1 < ts.length && ts[j + 1] <= at) j++;
      fs.symlinkSync(frames[j][1], path.join(dir, `${String(f).padStart(5, "0")}.jpg`));
    }
    const [x, y, w] = (s.crop || [0, 0, W]).map((v) => v * DPR), h = (w * 9) / 16;
    execFileSync(FFMPEG, ["-y", "-v", "error", "-framerate", String(FPS), "-i", path.join(dir, "%05d.jpg"), "-vf", `crop=${w}:${h}:${x}:${y},scale=1920:1080:flags=lanczos`, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "16", out]);
  }
  const list = path.join(WORK, "parts.txt");
  fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
  execFileSync(FFMPEG, ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", path.join(WORK, "base.mp4")]);
}

async function edit() {
  const { frames, marks } = JSON.parse(fs.readFileSync(path.join(WORK, "take.json"), "utf8")), cut = cutOf(marks);
  await overlay(cut);
  base(cut, frames);
  const len = (F(LEN) / FPS).toFixed(3);
  execFileSync(FFMPEG, ["-y", "-v", "error", "-i", path.join(WORK, "base.mp4"), "-framerate", String(FPS), "-i", path.join(OVER, "%05d.png"),
    "-ss", String(MUSIC_AT), "-i", MUSIC,
    "-filter_complex", `[0:v][1:v]overlay=format=auto,format=yuv420p[v];[2:a]afade=t=in:d=0.25,apad[a]`,
    "-map", "[v]", "-map", "[a]", "-t", len, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", OUT]);
  execFileSync(FFMPEG, ["-y", "-v", "error", "-i", OUT, "-frames:v", "1", "-q:v", "2", OUT.replace(/\.mp4$/, "-cover.jpg")]);
  console.log(`-> ${OUT} (${len} s)`);
}

if (RECORD) await record();
if (EDIT) await edit();
