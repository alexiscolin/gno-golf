// @ts-check
// The Builder's video, for social media: node media/builder/promo.mjs [--record] [--shoot [--only=a,b]] [--edit]
//
// The trailer's tone (media/promo/render.mjs, v11): its music ("Dizzy Racing", CC0, 175 BPM, its last 30 s), its
// titles (big rounded words in ink, a word in gold or red, landing on a beat), cut on the beat. Play first: three fun
// holes built of the Builder's own pieces (holes.ts: checked, proved, published on the local chain under AUTHOR), filmed
// in 3D by the trailer's own rig, each a one-stroker in its world and weather; the Avalanche's making in the Builder,
// close up, a word each (its trap dropped and grown, snowmen by the cup, played), then the same hole in 3D; a friend
// dared to beat it, their ball into the crevasse; the logo, the slogan and the button on the music's last hit.
//
// --record: the Builder's take (a headless Chrome against a site with the Builder on, APP: the playground's by
// default; its frames and marks in WORK); --shoot: the 3D shots (render.mjs --cut=builder --frames; --only=name,…
// some again); --edit: the cut, from the last take and shots; none: all three. -> media/builder/gnogolf-builder.mp4
// (1920x1080, H.264 and AAC) and its first frame as gnogolf-builder-cover.jpg. CTA sets the end card's button.
//   (from web/) node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./test/setup.mjs ../media/builder/holes.ts
//   then publish holes.json's holes (PublishMine, as AUTHOR), then
//   APP=http://100.104.210.102:5181 node media/builder/promo.mjs
// Needs: Node 22+, Google Chrome, /opt/homebrew/bin/ffmpeg, the music (media/promo/CREDITS.txt).

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
// the author the holes are published under: gnodev's test1 (a well-known dev key, on the local chain)
const AUTHOR = process.env.AUTHOR || "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
// the pieces the Avalanche is built with on camera (holes.ts ids): its crevasse and snowmen
const LATER = ["p3", "p4", "p5"];
const CTA = process.env.CTA || "BUILD YOURS ON GNO.LAND";

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
  const glide = async (/** @type {number[]} */ to, ms = 450, down = false, each = (/** @type {number} */ _u) => Promise.resolve()) => {
    const from = at, n = Math.max(2, Math.round(ms / 16));
    for (let k = 1; k <= n; k++) {
      const u = k / n, e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      at = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e];
      await mouse("mouseMoved", at, down);
      await each(e);
      await sleep(16);
    }
  };
  const press = async () => (await mouse("mousePressed", at, true), await sleep(90), await mouse("mouseReleased", at));
  const centre = (/** @type {string} */ sel) => c.js(`(() => { const r = (${sel}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  const cell = (/** @type {number} */ x, /** @type {number} */ y) => c.js(`(() => { const m = document.querySelector(".board__plane").getScreenCTM(); return [m.a * ${x} + m.c * ${y} + m.e, m.b * ${x} + m.d * ${y} + m.f]; })()`);
  const button = (/** @type {RegExp} */ re, within = "document") => `[...${within}.querySelectorAll("button")].find((b) => ${re}.test(b.textContent.trim()))`;
  const pieces = () => c.js(`document.querySelectorAll("[data-piece]").length`);
  const editor = `!!document.querySelector(".palette [data-tool=grow]") && document.querySelectorAll("[data-end]").length === 2`;

  try {
    // the Avalanche, built on camera from its file without its trap and its snowmen (the 3D shot's hole, as published)
    const holes = JSON.parse(fs.readFileSync(path.join(HERE, "holes.json"), "utf8")), draft = holes.avalanche.draft;
    const file = path.join(WORK, "avalanche.gnogolf.json");
    // (its rounds played on camera: no proofs)
    fs.writeFileSync(file, JSON.stringify({ ...draft, slug: "avalanche", proofs: [], pieces: draft.pieces.filter((/** @type {any} */ p) => !LATER.includes(p.id)) }));
    await c.send("Page.navigate", { url: `${APP}/build/?camlog` });
    // (the editor, or the holes' list): to the list, where a file is opened
    const open = button(/^Open a file/);
    await until(`!!${open} || !!document.querySelector(".bhead button")`, "the Builder", 30_000);
    await sleep(600);
    if (!(await c.ev(`!!${open}`))) await c.js(`document.querySelector(".bhead button").click()`);
    await until(`!!${open}`, "Open a file…");
    const { root } = await c.send("DOM.getDocument", { depth: -1, pierce: true });
    const { nodeId } = await c.send("DOM.querySelector", { nodeId: root.nodeId, selector: "input[type=file]" });
    await c.send("DOM.setFileInputFiles", { nodeId, files: [file] });
    await until(`${editor} && document.querySelector(".bhead__name input")?.value === ${JSON.stringify(draft.title)}`, "the Avalanche in the editor", 20_000);
    await c.js(`document.querySelectorAll(".palette details").forEach((d) => (d.open = true))`);
    await sleep(1500);
    await c.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: W * DPR, maxHeight: H * DPR });
    await sleep(600);
    await mouse("mouseMoved");
    /** a piece carried from its tile's row (scrolled into sight) onto a cell of the board, then given its look (the next of its tile takes it) */
    const place = async (/** @type {string} */ tile, /** @type {string} */ look, /** @type {number[]} */ to, /** @type {string} */ m) => {
      const n = await pieces(), row = `document.querySelector('.palette [data-tile="${tile}"]')`;
      await c.js(`${row}.scrollIntoView({ block: "center" })`);
      await sleep(250);
      await glide(await centre(row), 420);
      if (m) mark(m);
      await mouse("mousePressed", at, true);
      await glide(await cell(to[0], to[1]), 600, true);
      await mouse("mouseReleased", at);
      await sleep(450);
      if ((await pieces()) <= n) console.log(`  (${look} not placed: ${await c.ev(`document.querySelector(".board__said")?.textContent || ""`)})`);
      const pick = `document.querySelector('.insp__looks [data-look="${look}"]')`;
      if (!(await c.ev(`!!${pick} && ${pick}.getAttribute("aria-pressed") !== "true"`))) return;
      await glide(await centre(pick), 380);
      await press();
      await sleep(350);
    };

    // drop: the crevasse in the middle of the ice
    await place("drop", "mountain/hazard/crevasse", [25, 7], "drop");
    mark("dropped");

    // tweak: the piece's width slider dragged up, the crevasse growing on the board
    await c.js(`document.querySelector(".insp__details") && (document.querySelector(".insp__details").open = true)`);
    const slider = `document.querySelector(".insp__details .range input[type=range]")`;
    await until(`!!${slider}`, "the size slider", 5000);
    const [lo, hi, v0] = await c.js(`[+${slider}.min, +${slider}.max, +${slider}.value]`);
    const sr = await c.js(`(() => { const r = ${slider}.getBoundingClientRect(); return [r.left, r.top + r.height / 2, r.width]; })()`);
    const xOf = (/** @type {number} */ v) => sr[0] + ((v - lo) / (hi - lo)) * sr[2];
    const v1 = Math.min(hi, v0 + 2.5); // (its width: 2.5 more, clear of the cup)
    await glide([xOf(v0), sr[1]], 450);
    mark("tweak");
    await mouse("mousePressed", at, true);
    await glide([xOf(v1), sr[1]], 800, true, (e) => c.js(`(() => { const el = ${slider}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${v0} + (${v1} - ${v0}) * ${e}); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); })()`));
    await mouse("mouseReleased", at);
    await c.js(`${slider}.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }))`);
    await sleep(400);
    mark("tweaked");

    // block: two snowmen by the cup
    await place("obstacle", "mountain/post/snowman", [37, 3.5], "block");
    await place("obstacle", "mountain/post/snowman", [37, 10.5], "");
    mark("blocked");

    // play: the button pressed (the cut leaves on the press), the test's start cards then
    await until(`!document.querySelector(".bhead__act[aria-disabled]")`, "Play on", 10_000);
    await glide(await centre(`document.querySelector(".bhead__act")`), 600);
    mark("play");
    await press();
    await sleep(800);
    await c.send("Page.stopScreencast");
    await sleep(300);
  } finally {
    fs.writeFileSync(path.join(WORK, "take.json"), JSON.stringify({ frames, marks }));
    if (c.errors.length) console.log("page errors:", c.errors.slice(0, 5));
    c.kill();
  }
  console.log(`take: ${frames.length} frames over ${(frames.at(-1)[0] - frames[0][0]).toFixed(1)} s`);
}

// ------------------------------------------------------------------ the cut

// the cut on the music's beat grid (175 BPM; the last hit, beat 57.5, on the end card's button). Each stretch is one of:
// - shot: the game's own 3D, filmed by the trailer's rig (media/promo/render.mjs, its frames at these beats): a hole
//   published (holes.ts), its camera, the weather drawn, a one-stroker found in the chain's weather now (ace), timed to
//   drop in the cup at dropAt seconds into the stretch (render.mjs logs when it sinks: sink, that time, is what the
//   titles land on; dropAt is moved by what they differ);
// - from/to: the Builder's take between two marks (seconds after them) played to fill its beats, cropped to [x, y, w]
//   of its window (16:9);
// - stills: the take's frames at those marks, an equal share of the beats each (hard cuts), cropped alike.
// Titles at seconds into a stretch; "drop": as its ball drops (sink).
const UP = { day: true, cup: "" };
// when the friend's ball lips out, in seconds into its shot (seen in its frames)
const NOPE = 2.4;
// the chase: low behind the ball (the holes run along +x), wide, close on its heels (a stiff spring): speed
const CHASE = { mode: "track", off: [-3.6, 2.4, 1.4], lag: 22, lookUp: 0.5, fov: 56 };
// the key words: huge, centred, slammed in (a line each when two)
const WORD = { y: 0, kind: "slam", sparkle: 4 };
const CUT = [
  // the hook: the ball shot out of the blowhole (its putt and its ride under the lagoon before the shot), spat over the lagoon, holed
  { shot: { ...UP, name: "opener", hole: "blowhole", weather: "clear", ace: "short", dropAt: 1, putt: -0.75, pre: 1, sink: 2.05,
    cam: { ...CHASE, stay: true }, flash: 0.6 }, beats: [0, 10], titles: [
    { ...WORD, big: "BUILD YOUR<br><b>OWN HOLE.</b>", size: 210, drop: true },
  ] },
  // that hole's making, close up, a word each: the Avalanche built (its trap dropped, grown, snowmen by the cup), played
  { from: ["drop", 0], to: ["dropped", -0.1], beats: [10, 13], crop: [0, 120, 760], titles: [{ ...WORD, big: "DROP A<br><i>TRAP.</i>", size: 250, at: 0.02 }] },
  { from: ["tweak", 0], to: ["tweaked", -0.2], beats: [13, 16], crop: [380, 150, 900], titles: [{ ...WORD, big: "<b>TWEAK.</b>", size: 300, at: 0.02 }] },
  { from: ["block", 0], to: ["blocked", -0.1], beats: [16, 19], crop: [0, 120, 760], titles: [{ ...WORD, big: "BLOCK<br><b>THE CUP.</b>", size: 250, at: 0.02 }] },
  { from: ["play", -0.7], to: ["play", 0.1], beats: [19, 21], crop: [880, 0, 400], titles: [{ ...WORD, big: "PLAY IT.", size: 300, at: 0.02 }] },
  // the same hole in 3D, then another world
  { shot: { ...UP, name: "avalanche", hole: "avalanche", weather: "snow", ace: "short", dropAt: 2.62, putt: 0, sink: 2.2,
    cam: { ...CHASE, stay: true } }, beats: [21, 30], titles: [
    { ...WORD, big: "SNOW.", size: 300, at: 0.02, to: 0.9 },
    { ...WORD, big: "<b>SUNK!</b>", size: 340, drop: true },
  ] },
  { shot: { ...UP, name: "skate", hole: "skate-plaza", weather: "rain", ace: true, dropAt: 3.25, putt: 0, sink: 2.3,
    cam: { ...CHASE, stay: true }, flash: 0.5 }, beats: [30, 40], titles: [
    { ...WORD, big: "<b>RAIN.</b>", size: 300, at: 0.02, to: 0.9 },
    { ...WORD, big: "NAILED<br><i>IT!</i>", size: 260, drop: true },
  ] },
  // shared: a friend's go at it (round the crevasse, over the cup's lip, off a snowman and away), the dare first, then their fate
  { shot: { ...UP, name: "nope", hole: "avalanche", weather: "clear", fire: [{ deg: 23.5, power: 9.75, at: 0.9 }],
    cam: CHASE }, beats: [40, 50], titles: [
    { raw: "<div class='bubble'><b>alex.gno</b> sank it in 1.<br>Your turn. <i>Good luck.</i></div>", at: 0.05, to: 1.5, tilt: -2, y: -60 },
    { ...WORD, big: "<i>NOPE.</i>", size: 360, at: NOPE },
  ] },
  // the end card over the avalanche, blurred: the logo, the slogan, the button on the last hit
  { shot: { ...UP, name: "end", hole: "avalanche", weather: "clear", blur: 14, dim: 0.3, rays: true, cam: { mode: "orbit", center: [0.5, 0, 0.5], r: 34, h: 20, a0: 60, speed: 8, fov: 42 } }, beats: [50, 61.5], titles: [
    { logo: 520, at: 0, bounce: 3.2, tilt: -3, y: -210, sparkle: 4, tilt3d: true },
    { big: "YOUR HOLE. <i>THEIR NIGHTMARE.</i>", size: 112, at: 1.03, tilt: -2, y: 140 },
    { cta: CTA, size: 76, at: 2.57, kind: "slam", tilt: 0, y: 300 },
  ] },
];
const HIT = 57.5, LEN = 61.5, MUSIC_AT = +(MUSIC_END - HIT * BEAT).toFixed(3);
const F = (/** @type {number} */ beat) => Math.round(beat * BEAT * FPS);
const RENDER = path.join(HERE, "..", "promo", "render.mjs"), SHOTS = path.join(HERE, "..", "promo", "shots-builder.json");
const FILMED = path.join(os.tmpdir(), "gnogolf-promo"); // (render.mjs's WORK: its frames and the shots' sounds)

/** The 3D shots for render.mjs (shots-builder.json): each at its stretch's beats, its hole's id, its first stroke a one-stroker found then. */
const shotsOf = () => CUT.filter((s) => s.shot).map((s) => ({ ...s.shot, hole: `${AUTHOR}/${s.shot.hole}/v1`, beats: s.beats, fire: s.shot.fire ?? (s.shot.ace ? [{ deg: 0, power: 5, at: 0 }] : undefined) }));

/** The cut as this take allows, each title's time set (a drop's: as its shot's ball sank when filmed, else its sink). */
function cutOf(/** @type {Record<string, number>} */ marks, /** @type {Record<string, number>} */ sinks = {}) {
  return CUT.map((s) => {
    const a = s.from && marks[s.from[0]] + s.from[1], b = s.to && marks[s.to[0]] + s.to[1];
    return { ...s, a, b, stills: s.stills?.filter(([m]) => marks[m] != null), titles: (s.titles || []).map((/** @type {any} */ t) => (t.drop ? { ...t, at: (sinks[s.shot.name] ?? s.shot.sink) - 0.04 } : t)) };
  });
}

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
  #promo .bubble { font-weight: 600; font-size: 54px; line-height: 1.2; color: #144134; background: #fdf6e9; border: 7px solid #144134; border-radius: 40px 40px 40px 8px;
    padding: 26px 46px 30px; box-shadow: 0 12px 0 #144134; white-space: nowrap; text-align: left; }
  #promo .bubble b { color: #226c57; } #promo .bubble i { color: #e0524b; font-style: normal; }
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
    cards: [],
    cuts: cut_.filter((s) => s.shot && s.shot.flash).map((s) => s.beats[0] * BEAT), // (a white flash into a shot that asks for one)
    // (each logo its own ids: two logos, or the page's own, would share their clip paths and gradient)
    titles: cut_.flatMap((s, i) => s.titles.map((/** @type {any} */ t) => ({ ...t, html: title(t).replace(/(id="|url\(#|href="#)([\w-]+)/g, `$1$2-t${i}`), at: t.at < 0 ? -1 : t.at, base: s.beats[0] * BEAT, end: F(s.beats[1]) / FPS }))),
  };
  await c.js(`document.querySelectorAll("body [id]").forEach((e) => e.removeAttribute("id"))`); // (the page's own logo's ids, hidden, not ours)
  await c.js(`(() => { const s = document.createElement("style"); s.textContent = ${JSON.stringify(CSS)}; document.head.appendChild(s); window.__cut = ${JSON.stringify(cut)}; })()`);
  await c.js(LAYER);
  await c.js(`document.fonts.ready.then(() => true)`);
  for (let f = 0; f < F(LEN); f++) {
    await c.js(`window.__at(${f / FPS}); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`); // (painted before it is captured)
    const s = await c.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OVER, `${String(f).padStart(5, "0")}.png`), Buffer.from(s.data, "base64"));
  }
  c.kill();
}

/** The punch: the picture scaled up a little on every other beat and more on each hit (a cut, a slam), easing back
 *  at once (ffmpeg's scale per frame, its centre kept by the crop after it), t the stretch's own from start0. */
function punch(/** @type {number} */ start0, /** @type {number[]} */ hits) {
  const T = `(t+${start0.toFixed(3)})`;
  const z = `(1+0.03*exp(-9*mod(${T},${(2 * BEAT).toFixed(4)}))${hits.map((h) => `+0.08*exp(-8*max(0,${T}-${h.toFixed(3)}))*gte(${T},${h.toFixed(3)})`).join("")})`;
  return `scale=w='2*trunc(960*${z})':h='2*trunc(540*${z})':eval=frame:flags=lanczos`;
}

// the cut's frames, a stretch at a time, cropped and scaled to 1920x1080: a shot's from render.mjs at its beats, the
// take's (each output frame the take's latest by then) or its stills (an equal share each)
function base(/** @type {any[]} */ cut, /** @type {[number, string][]} */ frames, /** @type {Record<string, number>} */ marks) {
  const ts = frames.map((f) => f[0]);
  const hits = cut.flatMap((s) => [s.beats[0] * BEAT, ...s.titles.filter((/** @type {any} */ t) => t.kind === "slam").map((/** @type {any} */ t) => s.beats[0] * BEAT + t.at)]);
  const latest = (/** @type {number} */ at) => frames[Math.max(0, ts.findLastIndex((t) => t <= at))][1];
  const parts = [];
  for (const [i, s] of cut.entries()) {
    const f0 = F(s.beats[0]), n = F(s.beats[1]) - f0, out = path.join(WORK, `part${i}.mp4`), dir = path.join(WORK, `part${i}`);
    parts.push(out);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir);
    for (let f = 0; f < n; f++) {
      const src = s.shot ? path.join(FILMED, "frames", `${String(f0 + f).padStart(5, "0")}.jpg`)
        : s.stills ? latest(marks[s.stills[Math.floor((f * s.stills.length) / n)][0]] + s.stills[Math.floor((f * s.stills.length) / n)][1])
        : latest(s.a + ((s.b - s.a) * f) / n);
      if (!fs.existsSync(src)) throw new Error(`no frame ${src} (${s.shot ? "render.mjs --cut=builder --frames first" : "the take"})`);
      fs.symlinkSync(src, path.join(dir, `${String(f).padStart(5, "0")}.jpg`));
    }
    const [x, y, w] = (s.crop || [0, 0, W]).map((/** @type {number} */ v) => v * DPR), h = (w * 9) / 16;
    const vf = `${s.shot ? "" : `crop=${w}:${h}:${x}:${y},`}${punch(s.beats[0] * BEAT, hits.filter((t) => t < s.beats[1] * BEAT))},crop=1920:1080`;
    execFileSync(FFMPEG, ["-y", "-v", "error", "-framerate", String(FPS), "-i", path.join(dir, "%05d.jpg"), "-vf", vf, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "16", out]);
  }
  const list = path.join(WORK, "parts.txt");
  fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
  execFileSync(FFMPEG, ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", path.join(WORK, "base.mp4")]);
}

/** The 3D shots filmed by the trailer's rig: shots-builder.json written, render.mjs run for its frames and sounds only (--only=a,b:
 *  those shots again, the others' kept), each shot's one-stroker the one render.mjs found and kept with its path (played as
 *  kept, whatever the chain's weather now), when its ball sank kept for the titles (sinks.json). */
function shoot() {
  fs.writeFileSync(SHOTS, JSON.stringify(shotsOf(), null, 1) + "\n");
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
  const log = execFileSync(process.execPath, [RENDER, "--cut=builder", "--frames", ...(only ? [`--only=${only.join(",")}`] : [])], { env: { ...process.env, APP }, encoding: "utf8" });
  process.stdout.write(log);
  const file = path.join(WORK, "sinks.json"), sinks = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  for (const s of shotsOf()) if (!only || only.includes(s.name)) delete sinks[s.name]; // (a shot not seen to sink: its sink in the cut)
  for (const [, name, t] of log.matchAll(/^ {2}([\w-]+): the ball sinks at ([\d.]+) s/gm)) sinks[name] = Number(t);
  fs.writeFileSync(file, JSON.stringify(sinks));
}

async function edit() {
  const sinks = fs.existsSync(path.join(WORK, "sinks.json")) ? JSON.parse(fs.readFileSync(path.join(WORK, "sinks.json"), "utf8")) : {};
  const { frames, marks } = JSON.parse(fs.readFileSync(path.join(WORK, "take.json"), "utf8")), cut = cutOf(marks, sinks);
  await overlay(cut);
  base(cut, frames, marks);
  const len = (F(LEN) / FPS).toFixed(3);
  // the shots' own sounds (the putt, the cup, the confetti: render.mjs's sfx-<i>.wav, from its shot's start) under the music
  const sfx = shotsOf().map((s, i) => [path.join(FILMED, `sfx-${i}.wav`), F(s.beats[0]) / FPS]).filter(([f]) => fs.existsSync(String(f)));
  const ins = sfx.flatMap(([f]) => ["-i", String(f)]);
  const mix = sfx.length
    ? `${sfx.map(([, at], k) => `[${k + 3}:a]adelay=${Math.round(Number(at) * 1000)}:all=1[s${k}]`).join(";")};${sfx.map((_, k) => `[s${k}]`).join("")}amix=inputs=${sfx.length}:normalize=0,volume=2.2[fx];[2:a]afade=t=in:d=0.25,volume=0.75[mus];[mus][fx]amix=inputs=2:normalize=0:duration=first,apad[a]`
    : `[2:a]afade=t=in:d=0.25,apad[a]`;
  execFileSync(FFMPEG, ["-y", "-v", "error", "-i", path.join(WORK, "base.mp4"), "-framerate", String(FPS), "-i", path.join(OVER, "%05d.png"),
    "-ss", String(MUSIC_AT), "-i", MUSIC, ...ins,
    // (both on one clock, a frame its index: the mp4's rounded times paired a frame with the titles' one before)
    "-filter_complex", `[0:v]settb=1/${FPS},setpts=N[b];[1:v]settb=1/${FPS},setpts=N[o];[b][o]overlay=format=auto,format=yuv420p[v];${mix}`,
    "-map", "[v]", "-map", "[a]", "-t", len, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", OUT]);
  execFileSync(FFMPEG, ["-y", "-v", "error", "-i", OUT, "-frames:v", "1", "-q:v", "2", OUT.replace(/\.mp4$/, "-cover.jpg")]);
  console.log(`-> ${OUT} (${len} s)`);
}

const STAGES = ["--record", "--shoot", "--edit"].filter((a) => process.argv.includes(a));
const stage = (/** @type {string} */ a) => !STAGES.length || STAGES.includes(a);
if (stage("--record")) await record();
if (stage("--shoot")) shoot();
if (stage("--edit")) await edit();
