// @ts-check
// The Builder's video, for social media: node media/builder/promo.mjs [--record] [--shoot [--only=a,b]] [--edit]
//
// The trailer's tone (media/promo/render.mjs, v11): its music ("Dizzy Racing", CC0, 175 BPM, its last 30 s), its
// titles (big rounded words in ink, a word in gold or red, landing on a beat), cut on the beat. Play first: three fun
// holes built of the Builder's own pieces (holes.ts: checked, proved, published on the local chain under AUTHOR), filmed
// in 3D by the trailer's own rig, each a one-stroker in its world and weather; the Builder in one-word flashes, close
// up (paint, drop, tweak, any world, play); the test's weathers turning green; the Publish step's 3D view; the dare
// between friends; the logo, the slogan and the button on the music's last hit.
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
// the author the test rounds are proved under: gnodev's test1 (a well-known dev key; nothing is published)
const AUTHOR = process.env.AUTHOR || "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
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
  const drag = async (/** @type {number[]} */ from, /** @type {number[]} */ to, ms = 700) => {
    await glide(from, 380);
    await mouse("mousePressed", at, true);
    await glide(to, ms, true);
    await mouse("mouseReleased", at);
  };
  const editor = `!!document.querySelector(".palette [data-tool=grow]") && document.querySelectorAll("[data-end]").length === 2`;

  try {
    // ------------------------------------------- take 1: the flashes, on the Garden's dogleg (the first run)
    await c.send("Page.navigate", { url: `${APP}/build/?camlog` });
    await until(editor, "editor");
    await sleep(1500);
    await c.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: W * DPR, maxHeight: H * DPR });
    await sleep(600);
    await mouse("mouseMoved");

    // paint: a bay off the dogleg's foot, one long straight stroke from inside the green (a press on a side would move it)
    await glide(await centre(`document.querySelector(".palette [data-tool=grow]")`), 500);
    await press();
    await sleep(300);
    await glide(await cell(29.5, 25.5), 400); // (clear of the cup: a press on it carries the cup)
    mark("paint");
    await mouse("mousePressed", at, true);
    await glide(await cell(6, 25.5), 1300, true);
    await mouse("mouseReleased", at);
    await sleep(700);
    mark("painted");
    await glide(await centre(`document.querySelector(".palette [data-tool=grow]")`), 400);
    await press();
    await sleep(300);

    // drop: a tunnel from More pieces (its fold opened), onto the top lane (its way out 8 along it)
    await c.js(`document.querySelectorAll(".palette details").forEach((d) => (d.open = true))`);
    await sleep(400);
    const n = await pieces(), tunnel = `document.querySelector(".palette [data-tile=tunnel]")`;
    await c.js(`${tunnel}.scrollIntoView({ block: "center" })`);
    await sleep(300);
    const tile = await centre(tunnel);
    await glide(tile, 450);
    mark("drop");
    await mouse("mousePressed", at, true);
    await glide(await cell(8, 9), 650, true);
    await mouse("mouseReleased", at);
    await sleep(700);
    mark("dropped");
    if ((await pieces()) <= n) console.log(`  (the tunnel not placed: ${await c.ev(`document.querySelector(".board__said")?.textContent || ""`)})`);

    // tweak: the piece's size slider dragged up, the tunnel growing on the board
    await c.js(`document.querySelector(".insp__details") && (document.querySelector(".insp__details").open = true)`);
    const slider = `document.querySelector(".insp__details .range input[type=range]")`; // (its first size: a tunnel's width)
    await until(`!!${slider}`, "the size slider", 5000);
    const [lo, hi, v0] = await c.js(`[+${slider}.min, +${slider}.max, +${slider}.value]`);
    const sr = await c.js(`(() => { const r = ${slider}.getBoundingClientRect(); return [r.left, r.top + r.height / 2, r.width]; })()`);
    const xOf = (/** @type {number} */ v) => sr[0] + ((v - lo) / (hi - lo)) * sr[2];
    const v1 = Math.min(hi, v0 + (hi - lo) * 0.35);
    await glide([xOf(v0), sr[1]], 450);
    mark("tweak");
    await mouse("mousePressed", at, true);
    await glide([xOf(v1), sr[1]], 900, true, (e) => c.js(`(() => { const el = ${slider}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${v0} + (${v1} - ${v0}) * ${e}); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); })()`));
    await mouse("mouseReleased", at);
    await c.js(`${slider}.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }))`);
    await sleep(500);
    mark("tweaked");

    // play: the button pressed (the cut leaves on the press)
    await until(`!document.querySelector(".bhead__act[aria-disabled]")`, "Play on", 10_000);
    await glide(await centre(`document.querySelector(".bhead__act")`), 600);
    mark("play");
    await press();
    await sleep(800);
    mark("played");

    // ------------------------------------------- take 2: each video hole opened from its file (any world: the board in
    // each one's look), the Blowhole last, then holed in each weather and published
    const holes = JSON.parse(fs.readFileSync(path.join(HERE, "holes.json"), "utf8"));
    const open = button(/^Open a file/);
    for (const slug of ["avalanche", "skate-plaza", "blowhole"]) {
      const file = path.join(WORK, `${slug}.gnogolf.json`);
      // (its rounds played on camera: no proofs; an address, or Play asks for a name first)
      fs.writeFileSync(file, JSON.stringify({ ...holes[slug].draft, slug, proofs: [] }));
      if (slug === "avalanche") await c.send("Page.navigate", { url: `${APP}/build/?camlog` });
      // (the editor, or the holes' list): to the list, where a file is opened
      await until(`!!${open} || !!document.querySelector(".bhead button")`, "the Builder again", 30_000);
      await sleep(600);
      if (!(await c.ev(`!!${open}`))) await c.js(`document.querySelector(".bhead button").click()`);
      await until(`!!${open}`, "Open a file…");
      const { root } = await c.send("DOM.getDocument", { depth: -1, pierce: true });
      const { nodeId } = await c.send("DOM.querySelector", { nodeId: root.nodeId, selector: "input[type=file]" });
      await c.send("DOM.setFileInputFiles", { nodeId, files: [file] });
      await until(`${editor} && document.querySelector(".bhead__name input")?.value === ${JSON.stringify(holes[slug].draft.title)}`, `${slug} in the editor`, 20_000);
      await sleep(900);
      mark(`board-${slug}`);
      await sleep(500);
    }
    await until(`!document.querySelector(".bhead__act[aria-disabled]")`, "Play on", 20_000);
    await c.js(`document.querySelector(".bhead__act").click()`);
    await until(`!!document.querySelector(".tmode__sign--start")`, "the start card");
    // the start cards until round 1: the address pasted (the author's), then the next free one if the slug is taken
    const next = button(/^Use [a-z0-9-]+-\d+$/), paste = button(/^Paste an address/i), field = `document.querySelector(".tmode__addr input")`;
    for (let k = 0; k < 60 && (await c.ev(`!!document.querySelector(".tmode__sign")`)); k++, await sleep(500)) {
      if (await c.ev(`!!${next} && !${next}.disabled`)) await c.js(`${next}.click()`);
      else if (await c.ev(`!!${field}`)) {
        await c.js(`(() => { const el = ${field}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(AUTHOR)}); el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
        await sleep(300);
        await c.js(`${button(/^Use this address$/)}?.click()`);
      } else if (await c.ev(`!!${paste}`)) await c.js(`${paste}.click()`);
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
      await until(`!!document.querySelector(".tmode__sum") || !!document.querySelector(".tmode__chip--now:not(.tmode__chip--done)")`, "the next round or the summary", 60_000);
    }
    await until(`[...document.querySelectorAll(".tmode__won button")].some((b) => /^Publish →$/.test(b.textContent))`, "Publish on the summary", 60_000);
    mark("summary");
    await c.js(`[...document.querySelectorAll(".tmode__won button")].find((b) => /^Publish →$/.test(b.textContent)).click()`);
    await until(`!!document.querySelector(".pub .preview canvas")`, "the Publish step's 3D view", 30_000);
    await sleep(1500);
    // the 3D view swung round fast by a drag, then let go turning on its own
    await c.js(`window.__pointer(true)`);
    const pv = await centre(`document.querySelector(".pub .preview")`);
    await glide([pv[0] - 260, pv[1]], 300);
    mark("publish");
    await mouse("mousePressed", at, true);
    await glide([pv[0] + 300, pv[1] + 20], 1100, true);
    await mouse("mouseReleased", at);
    await glide([pv[0] + 420, pv[1] + 240], 500);
    await sleep(3000);
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

// the cut on the music's beat grid (175 BPM; the last hit, beat 87.5, on the end card's button). Each stretch is one of:
// - shot: the game's own 3D, filmed by the trailer's rig (media/promo/render.mjs, its frames at these beats): a hole
//   published (holes.ts), its camera, the weather drawn, a one-stroker found in the chain's weather now (ace), timed to
//   drop in the cup at dropAt seconds into the stretch (render.mjs logs when it sinks: sink, that time, is what the
//   titles land on; dropAt is moved by what they differ);
// - from/to: the Builder's take between two marks (seconds after them) played to fill its beats, cropped to [x, y, w]
//   of its window (16:9);
// - stills: the take's frames at those marks, an equal share of the beats each (hard cuts), cropped alike.
// Titles at seconds into a stretch; "drop": as its ball drops (sink).
const UP = { day: true, cup: "" };
const CUT = [
  // the hook: the ball fed to the blowhole, spat over the lagoon, holed
  { shot: { ...UP, name: "opener", hole: "blowhole", weather: "clear", ace: true, dropAt: 1.8, sink: 2.1, ramp: [1.6, 2.6, 0.45, 0.2],
    cam: { mode: "follow", deg: 0, back: 5.5, up: 2.4, ahead: 4, fov: 52, lag: 4 }, flash: 0.6 }, beats: [0, 8], titles: [
    { big: "BUILD YOUR <b>OWN HOLE.</b>", size: 132, drop: true, kind: "slam", y: 300, sparkle: 4 },
  ] },
  // the Builder in flashes, close up, a word each
  { from: ["paint", 0], to: ["painted", -0.2], beats: [8, 10], crop: [330, 300, 640], titles: [{ big: "PAINT.", size: 150, at: 0.02, y: 300 }] },
  { from: ["drop", 0], to: ["dropped", -0.2], beats: [10, 12], crop: [0, 120, 700], titles: [{ big: "<b>DROP.</b>", size: 150, at: 0.02, y: 300 }] },
  { from: ["tweak", 0], to: ["tweaked", -0.3], beats: [12, 14], crop: [380, 150, 900], titles: [{ big: "<i>TWEAK.</i>", size: 150, at: 0.02, y: 300 }] },
  { stills: [["board-avalanche", 0], ["board-skate-plaza", 0], ["board-blowhole", 0]], beats: [14, 17], crop: [272, 120, 700], titles: [{ big: "ANY <b>WORLD.</b>", size: 150, at: 0.02, y: 300 }] },
  { from: ["play", -0.9], to: ["play", -0.05], beats: [17, 19], crop: [880, 0, 400], titles: [{ big: "PLAY IT.", size: 150, at: 0.02, y: 300 }] },
  // then play: three holes, three worlds, three weathers
  { shot: { ...UP, name: "avalanche", hole: "avalanche", weather: "snow", ace: true, dropAt: 4.5, sink: 4.03, ramp: [3.9, 4.9, 0.5, 0.2],
    cam: { mode: "track", off: [-2, 5.5, 9], lag: 5, lookUp: 0.3, fov: 50 }, flash: 0.5 }, beats: [19, 34], titles: [
    { big: "SNOW.", size: 170, at: 0.02, to: 1.5, y: 280 },
    { big: "<b>SUNK!</b>", size: 170, drop: true, kind: "slam", y: 260, sparkle: 4 },
  ] },
  { shot: { ...UP, name: "skate", hole: "skate-plaza", weather: "rain", ace: true, dropAt: 4.2, sink: 3.9, ramp: [3.3, 4.3, 0.5, 0.2],
    cam: { mode: "follow", deg: 0, back: 9, up: 4.5, ahead: 3, fov: 54 }, punch: 0.1 }, beats: [34, 48], titles: [
    { big: "<b>RAIN.</b>", size: 170, at: 0.02, to: 1.5, y: 280 },
    { big: "NAILED <i>IT!</i>", size: 160, drop: true, kind: "slam", y: 260, sparkle: 4 },
  ] },
  { shot: { ...UP, name: "storm", hole: "blowhole", weather: "storm", ace: true, dropAt: 2.3, sink: 2.6, ramp: [2.1, 3.1, 0.5, 0.2],
    cam: { mode: "orbit", center: "cup", r: 11, h: 5, a0: 200, speed: 24, fov: 46 }, punch: 0.1 }, beats: [48, 58], titles: [
    { big: "<i>STORMS.</i>", size: 170, at: 0.02, to: 1.4, y: 280 },
    { big: "HOLE <b>IN ONE!</b>", size: 160, drop: true, kind: "slam", y: 260, sparkle: 4 },
  ] },
  // proved in each weather: the test's weathers turning green, one cut each
  { stills: [["holed1", 0.05], ["holed2", 0.05], ["holed3", 0.05], ["holed4", 0.05]], beats: [58, 62], crop: [0, 0, 640], titles: [
    { big: "HOLE IT IN <b>EVERY WEATHER.</b>", size: 110, at: 0.02, y: 330 },
  ] },
  // published: the step's 3D view swung round
  { from: ["publish", -0.2], to: ["end", 0], beats: [62, 70], crop: [16, 120, 940], titles: [{ big: "PUBLISH IT <b>ON-CHAIN.</b>", size: 132, at: 0.02, y: 320 }] },
  // the dare: a friend's message over the plaza, then why
  { shot: { ...UP, name: "dare", hole: "skate-plaza", weather: "clear", cam: { mode: "orbit", center: [0.5, 0, 0.5], r: 30, h: 18, a0: 120, speed: 14, fov: 42 } }, beats: [70, 80], titles: [
    { raw: "<div class='bubble'><b>alex.gno</b> sank it in 3.<br>Your turn. <i>Good luck.</i></div>", at: 0.05, to: 1.0, tilt: -2, y: -60 },
    { big: "BUILD IT.", size: 150, at: 1.03, to: 1.6, y: 0 },
    { big: "SHARE IT.", size: 150, at: 1.72, to: 2.3, y: 0 },
    { big: "BEAT YOUR <b>FRIENDS.</b>", size: 140, at: 2.4, y: 0, sparkle: 4 },
  ] },
  // the end card over the avalanche, blurred: the logo, the slogan, the button on the last hit
  { shot: { ...UP, name: "end", hole: "avalanche", weather: "clear", blur: 14, dim: 0.3, rays: true, cam: { mode: "orbit", center: [0.5, 0, 0.5], r: 34, h: 20, a0: 60, speed: 8, fov: 42 } }, beats: [80, 91.5], titles: [
    { logo: 520, at: 0, bounce: 3.2, tilt: -3, y: -210, sparkle: 4, tilt3d: true },
    { big: "YOUR HOLE. <i>THEIR NIGHTMARE.</i>", size: 96, at: 1.03, tilt: -2, y: 140 },
    { cta: CTA, size: 76, at: 2.57, kind: "slam", tilt: 0, y: 300 },
  ] },
];
const HIT = 87.5, LEN = 91.5, MUSIC_AT = +(MUSIC_END - HIT * BEAT).toFixed(3);
const F = (/** @type {number} */ beat) => Math.round(beat * BEAT * FPS);
const RENDER = path.join(HERE, "..", "promo", "render.mjs"), SHOTS = path.join(HERE, "..", "promo", "shots-builder.json");
const FILMED = path.join(os.tmpdir(), "gnogolf-promo"); // (render.mjs's WORK: its frames and the shots' sounds)

/** The 3D shots for render.mjs (shots-builder.json): each at its stretch's beats, its hole's id, its first stroke a one-stroker found then. */
const shotsOf = () => CUT.filter((s) => s.shot).map((s) => ({ ...s.shot, hole: `${AUTHOR}/${s.shot.hole}/v1`, beats: s.beats, fire: s.shot.ace ? [{ deg: 0, power: 5, at: 0 }] : undefined }));

/** The cut as this take allows, each title's time set (a drop's: as its shot's ball sank when filmed, else its sink). */
function cutOf(/** @type {Record<string, number>} */ marks, /** @type {Record<string, number>} */ sinks = {}) {
  return CUT.map((s) => {
    const a = s.from && marks[s.from[0]] + s.from[1], b = s.to && marks[s.to[0]] + s.to[1];
    return { ...s, a, b, titles: (s.titles || []).map((/** @type {any} */ t) => (t.drop ? { ...t, at: (sinks[s.shot.name] ?? s.shot.sink) - 0.04 } : t)) };
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
    titles: cut_.flatMap((s, i) => s.titles.map((/** @type {any} */ t) => ({ ...t, html: title(t).replace(/(id="|url\(#|href="#)([\w-]+)/g, `$1$2-t${i}`), at: t.at < 0 ? -1 : t.at, base: s.beats[0] * BEAT, end: s.beats[1] * BEAT }))),
  };
  await c.js(`document.querySelectorAll("body [id]").forEach((e) => e.removeAttribute("id"))`); // (the page's own logo's ids, hidden, not ours)
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

// the cut's frames, a stretch at a time, cropped and scaled to 1920x1080: a shot's from render.mjs at its beats, the
// take's (each output frame the take's latest by then) or its stills (an equal share each)
function base(/** @type {any[]} */ cut, /** @type {[number, string][]} */ frames, /** @type {Record<string, number>} */ marks) {
  const ts = frames.map((f) => f[0]);
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
    const vf = s.shot ? "scale=1920:1080:flags=lanczos" : `crop=${w}:${h}:${x}:${y},scale=1920:1080:flags=lanczos`;
    execFileSync(FFMPEG, ["-y", "-v", "error", "-framerate", String(FPS), "-i", path.join(dir, "%05d.jpg"), "-vf", vf, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "16", out]);
  }
  const list = path.join(WORK, "parts.txt");
  fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
  execFileSync(FFMPEG, ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", path.join(WORK, "base.mp4")]);
}

/** The 3D shots filmed by the trailer's rig: shots-builder.json written, render.mjs run for its frames and sounds only (--only=a,b:
 *  those shots again, the others' kept), each shot's one-stroker found anew in the chain's weather now (a community hole's
 *  path is played live: one cached under another weather may miss), when its ball sank kept for the titles (sinks.json). */
function shoot() {
  fs.writeFileSync(SHOTS, JSON.stringify(shotsOf(), null, 1) + "\n");
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
  const named = (/** @type {string} */ n) => !only || only.includes(n);
  const pathsFile = path.join(HERE, "..", "promo", "paths.json"), paths = JSON.parse(fs.readFileSync(pathsFile, "utf8"));
  for (const s of shotsOf()) if (named(s.name)) for (const k of Object.keys(paths)) if (k.includes(s.hole)) delete paths[k];
  fs.writeFileSync(pathsFile, JSON.stringify(paths));
  const log = execFileSync(process.execPath, [RENDER, "--cut=builder", "--frames", ...(only ? [`--only=${only.join(",")}`] : [])], { env: { ...process.env, APP }, encoding: "utf8" });
  process.stdout.write(log);
  const file = path.join(WORK, "sinks.json"), sinks = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
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
    "-filter_complex", `[0:v][1:v]overlay=format=auto,format=yuv420p[v];${mix}`,
    "-map", "[v]", "-map", "[a]", "-t", len, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", OUT]);
  execFileSync(FFMPEG, ["-y", "-v", "error", "-i", OUT, "-frames:v", "1", "-q:v", "2", OUT.replace(/\.mp4$/, "-cover.jpg")]);
  console.log(`-> ${OUT} (${len} s)`);
}

const STAGES = ["--record", "--shoot", "--edit"].filter((a) => process.argv.includes(a));
const stage = (/** @type {string} */ a) => !STAGES.length || STAGES.includes(a);
if (stage("--record")) await record();
if (stage("--shoot")) shoot();
if (stage("--edit")) await edit();
