// @ts-check
// Renders the Gnogolf trailer: node media/promo/render.mjs [--stills] [--only=name] [--clean] [--cups] [--cut=v7]
//
// --cut=v4: another cut of it, shots-v4.json, rendered to gnogolf-promo-v4.mp4 (and -720p).
// --cut=v5: v4 with a ghost duel before an end card without Adena (its rival's screen, the
// turns called, the ghost holing, the win, the game's own pieces shown: a shot's ui).
// --cut=v6: the duel as gameplay only, before the Builder's "coming soon": one race against the
// champion's ghost (another skin, see-through) filmed in slices, the two on the tee, a stroke each
// cut on the beat, both rolling in, the ghost holing then the player, again slowed; no game UI.
// --cut=v7: v6's duel on 20 beats, without the slowed replay, the player holing on the music's
// drop; the Builder's card on 14 beats, each title held 2 s or more.
// --cut=v8, the current one: v7, the hole-in-one's slow motion eased in and held at 0.6 (it
// stood still on the lip at 0.35), and the music's rewind moved off the duel's first cut (mid-bar,
// a bar after it the chords 0.86 alike) to the duel-finish cut, a downbeat: the song's own last
// bar, break and drop then play into the player's holing (the bar after it 0.94 alike, per-beat
// chroma). One command, with the dev client on the local chain (web/.env.local; read only, nothing is sent):
//   (cd web && npx next dev -p 3316) & APP=http://localhost:3316 node media/promo/render.mjs --cut=v8
// -> media/promo/gnogolf-promo-v8.mp4 and -v8-720p.mp4. The duel races the seeded champion's
// ghost (media/check/seed), its reads kept in paths.json ("reads") like the shots' paths.
// --cut=v8-teaser: v8 before the launch, its end card announcing it ("COMING VERY SOON", on
// gno.land) and the Builder's "NEXT:" (its "COMING SOON:" would say it twice in a row).
//
// --clean: the title screen's background instead (web/public/title/bg.*): a
// short cut of the calmer shots, no titles, flashes, shakes or sound, encoded
// small for the web (AV1 and VP9 webm, H.264 mp4; no poster: the page fades the film in over the sky's colour).
//
// One headless Chrome (its own profile, killed by PID at the end) opens the
// running dev client (http://localhost:3300) in promo mode (web/lib/promo.js)
// once per shot, steps it one frame at a time and screenshots each frame; the
// shot's own game sounds come back as a WAV. ffmpeg then lays the frames on
// the music's beat grid and mixes the sounds under it. The chain's paths are
// cached in paths.json, so a re-render replays the same shots.
// Needs: Node 22+ (built-in WebSocket), Google Chrome, /opt/homebrew/bin/ffmpeg.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launch, sleep, APP, RPC, REALM } from "../lib/cdp.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const WORK = path.join(os.tmpdir(), "gnogolf-promo");
const STILLS = process.argv.includes("--stills");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7);
const FPS = 30;
const CLEAN = process.argv.includes("--clean");
const CUPS = process.argv.includes("--cups");
const CUT = (process.argv.find((a) => a.startsWith("--cut=")) || "").slice(6).replace(/[^\w-]/g, "");
const SUFFIX = CUT ? `-${CUT}` : ""; // the cut's shots and its video: shots-v4.json, gnogolf-promo-v4.mp4
// the clean cut's shots, in order: flyovers and rolls, ending on the garden's slow, bright orbit
const CLEAN_SHOTS = ["snow", "sandcastles", "market", "cold", "mill", "frozen", "jump", "plazaP", "marketW", "tube", "logo"];

// The music: "Dizzy Racing" by Zane Little Music (CC0), 175 BPM. The cut
// starts on a phrase at 104.53 s and its last hit lands on the end card.
const BEAT = 60 / 175; // s
// the track's last hit lands at 134.53 s, on its beat grid: the cut starts as many beats before it as the video is long
const MUSIC = path.join(HERE, "music", "dizzy_racing.flac"), MUSIC_END = 134.53;
const F = (beat) => Math.round(beat * BEAT * FPS); // a beat's frame

// ------------------------------------------------------------- the titles

const burst = (n, r0, r1, cx = 100, cy = 100) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? r1 : r0; // a dip at the top: the hat's tip stands clear, no ray behind it
    return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
  }).join(" ");
// the title screen's own logo (components/Title.tsx), with its classes (app/globals.css): keep the two alike
const LOGO = (w = 900) => `<svg class="logo" style="width:${w}px" viewBox="0 0 600 505">
<defs>
<path id="arc" d="M 70 330 A 230 230 0 0 1 530 330" />
<linearGradient id="title-word" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#5fe0a8" />
<stop offset=".55" stop-color="#2a9d74" />
<stop offset="1" stop-color="#1c7a5a" />
</linearGradient>
<polygon id="badge" points="${burst(18, 86, 104)}" />
<g id="gnome">
<rect id="gnome-face" x="40" y="100" width="120" height="44" rx="6" />
<path id="gnome-beard" d="M 40 116 Q 34 190 100 214 Q 166 190 160 116 Q 140 146 100 142 Q 60 146 40 116 Z" />
<path id="gnome-hat" d="M 28 95 Q 40 91 48.7 76 L 96.5 7 Q 100 -1.5 103.5 7 L 151.3 76 Q 160 91 172 95 Z" />
<rect id="gnome-brim" x="26" y="90" width="148" height="20" rx="10" />
</g>
<clipPath id="clip-hat"><use href="#gnome-hat" /></clipPath>
<clipPath id="clip-brim"><use href="#gnome-brim" /></clipPath>
<clipPath id="clip-face"><use href="#gnome-face" /></clipPath>
<clipPath id="clip-ball"><circle cx="300" cy="462" r="17" /></clipPath>
<clipPath id="clip-beard"><use href="#gnome-beard" /></clipPath>
  <g id="iron">
    <rect x="293" y="118" width="14" height="360" rx="7" class="title__shaft" />
    <rect x="289" y="118" width="22" height="62" rx="9" class="title__grip" />
    <path d="M 293 460 L 307 460 L 311 477 L 348 466 Q 362 462 362 474 L 361 489 Q 359 499 348 499 L 299 500 Q 290 500 291 491 Z" class="title__head" />
    <rect x="316" y="480" width="34" height="2.6" rx="1.3" class="title__grip" />
    <rect x="314" y="486" width="38" height="2.6" rx="1.3" class="title__grip" />
    <rect x="312" y="492" width="40" height="2.6" rx="1.3" class="title__grip" />
  </g>
</defs>
<text class="title__word">
<textPath href="#arc" startOffset="50%" text-anchor="middle">GNOGOLF</textPath>
</text>
<g class="title__clubs">
  <use href="#iron" transform="rotate(-44 300 330)" />
  <use href="#iron" transform="rotate(44 300 330) translate(600 0) scale(-1 1)" />
</g>
<g transform="translate(0 5)">
<path d="M 288 476 Q 300 483 312 476 L 305 483 L 302 496 Q 300 500 298 496 L 295 483 Z" class="title__hat title__inked" />
<circle cx="300" cy="462" r="17" class="title__beard title__inked" />
<path d="M 305 441 A 21 21 0 0 1 305 483 A 13 21 0 0 0 305 441 Z" clip-path="url(#clip-ball)" class="title__beardshade" />
<circle cx="292" cy="457" r="2.2" class="title__beardshade" />
<circle cx="301" cy="453" r="2.2" class="title__beardshade" />
<circle cx="296" cy="465" r="2.2" class="title__beardshade" />
</g>
<g transform="translate(300 298) scale(1.25) translate(-100 -110)">
<use href="#badge" y="8" class="title__outline" />
<use href="#badge" class="title__outline" />
<use href="#badge" class="title__burst" />
<circle cx="100" cy="100" r="78" class="title__disc" />
<use href="#gnome" y="8" class="title__outline" />
<use href="#gnome" class="title__outline" />
<use href="#gnome-face" class="title__face" />
<path d="M 20 90 H 180 V 119 C 150 119 120 117 100 116 C 70 115 45 113 20 113 Z" clip-path="url(#clip-face)" class="title__faceshade" />
<use href="#gnome-beard" class="title__beard" />
<path d="M 20 100 H 180 V 230 H 100 Q 136 192 129 162 Q 124 150 106 151 C 82 153 60 150 40 136 L 20 128 Z" clip-path="url(#clip-beard)" class="title__beardshade" />
<use href="#gnome-hat" class="title__hat" />
<path d="M 100 -8 C 118.4 35.5 125.3 68.1 127 100 L 127 120 L 200 120 L 200 -8 Z" clip-path="url(#clip-hat)" class="title__shade" />
<path d="M 101 -5 L 200 -5 L 200 120 L 172 120 L 163 90 Q 149.2 88 146 80 C 135.2 53.3 120.8 28.7 103 6 Z" clip-path="url(#clip-hat)" class="title__hatink" />
<use href="#gnome-brim" class="title__shade" />
<path d="M 126 85 L 126 90 A 16 10 0 0 0 126 110 L 126 115 L 200 115 L 200 85 Z" clip-path="url(#clip-brim)" class="title__hatink" />
<path d="M 86 30 L 64 62" class="title__glint" />
<circle cx="80" cy="120" r="7" class="title__ink" />
<circle cx="120" cy="120" r="7" class="title__ink" />
<circle cx="100" cy="134" r="9" class="title__nose" />
</g>
</svg>`;
const big = (html, size) => `<div class="big"${size ? ` style="font-size:${size}px"` : ""}>${html}</div>`;
const title = (t) => t.raw ? t.raw : t.logo ? LOGO(t.logo) : t.pill ? `<div class="sub"${t.size ? ` style="font-size:${t.size}px"` : ""}>${t.pill}</div>` : t.cta ? `<div class="cta"${t.size ? ` style="font-size:${t.size}px"` : ""}>${t.cta}</div>` : big(t.big, t.size);

// --------------------------------------------------------------- the shots
//
// beats: where the shot sits on the music. cam: see aim() in web/lib/promo.js.
// fire: shots played (deg, power, at s of shot time; negative = before the cut).
// pre: seconds run before the first captured frame.

// swap: a shot cut into slices, one gnome each (a page load per slice), the
// camera and the titles running on through them. url: the end card's address,
// left out while it is empty.
// clean: the picked shots laid end to end, every overlay and camera jolt left out
const cleanOf = (all) => {
  let at = 0;
  return CLEAN_SHOTS.map((n) => all.find((s) => s.name === n)).map((s) => {
    const len = s.beats[1] - s.beats[0];
    const { titles, url, card, burst, rays, blur, dim, drift, flash, punch, whip, hits, dip, ...rest } = s;
    return { ...rest, weather: s.weather || "clear", beats: [at, (at += len)] }; // "clear": no rain from the live forecast
  });
};
const SHOTS = ((a) => (CLEAN ? cleanOf(a) : a))(JSON.parse(fs.readFileSync(path.join(HERE, `shots${SUFFIX}.json`), "utf8"))).flatMap((s) => {
  const titles = [...(s.titles || []), ...(s.url ? [{ pill: s.url, at: s.urlAt ?? 1.37, tilt: 0, y: s.urlY ?? 440 }] : [])]
    .map((t) => ({ ...t, html: title(t) }));
  const f0 = F(s.beats[0]), f1 = F(s.beats[1]), dur = (f1 - f0) / FPS;
  const base = { ...s, titles, f0, f1, cam: { ...s.cam, dur: s.cam.dur || dur } };
  if (!s.swap) return [base];
  const n = s.swap.length;
  return s.swap.map((gnome, k) => {
    const a = f0 + Math.round(((f1 - f0) * k) / n), b = f0 + Math.round(((f1 - f0) * (k + 1)) / n);
    return { ...base, name: `${s.name}-${gnome}`, gnome, f0: a, f1: b, t0: (a - f0) / FPS, flash: k ? 0 : s.flash, punch: k ? 0 : s.punch };
  });
});
// every gnome may be shown, the ones still to unlock too (this is the capture's own browser profile)
const ALL_GNOMES = ["classic", "sage", "ginger", "moustache", "gardener", "wizard", "viking", "golden", "pirate", "diver", "baker", "mayor", "king"];

const LAST = Math.max(...SHOTS.map((s) => s.beats[1]));
// rewind: the music goes back that many beats as the shot starts (a phrase played again), so a
// cut longer than another keeps the other's music under its shots (v7: v4's, its duel on the
// 24 beats before the Builder's again; v8: from the duel's last cut, a downbeat), and still ends
// on the last hit: [music s, length s] each
const REWINDS = SHOTS.filter((s) => s.rewind && !s.t0).map((s) => [s.beats[0], s.rewind]);
const LEN = F(LAST) / FPS, MUSIC_AT = +(MUSIC_END - (LAST - REWINDS.reduce((a, [, r]) => a + r, 0)) * BEAT).toFixed(3);
const PARTS = [];
for (let k = 0, b0 = 0, m = MUSIC_AT; k <= REWINDS.length; k++) {
  const [b, r] = REWINDS[k] || [LAST, 0];
  PARTS.push([+m.toFixed(3), +((b - b0) * BEAT).toFixed(3)]);
  (m += (b - b0 - r) * BEAT), (b0 = b);
}

// ------------------------------------------------------------------ chrome

async function chrome() {
  const [w, h] = CLEAN ? [1280, 720] : [1920, 1080];
  const { send, js, kill } = await launch({ width: w, height: h, dir: path.join(WORK, "profile"), args: [`--window-size=${w},${h}`, "--hide-scrollbars", "--mute-audio"] });
  // a headless page never has the focus, and the game plays no sound without it (feel.ts present())
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  // the HMR socket never opens: another edit to the app cannot remount the game mid-shot
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `try{localStorage.setItem("gnogolf.earned",${JSON.stringify(JSON.stringify(ALL_GNOMES))})}catch(e){}` });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `{const W=window.WebSocket;window.WebSocket=function(u,p){return /hmr/.test(String(u))?{readyState:0,send(){},close(){},addEventListener(){},removeEventListener(){}}:new W(u,p)};Object.assign(window.WebSocket,{CONNECTING:0,OPEN:1,CLOSING:2,CLOSED:3});}` });
  return { send, js, kill };
}

// ------------------------------------------------------------------ render

const pathsFile = path.join(HERE, "paths.json");
const paths = fs.existsSync(pathsFile) ? JSON.parse(fs.readFileSync(pathsFile, "utf8")) : {};

async function shoot(c, s, i, out) {
  const q = new URLSearchParams({ cup: s.cup, hole: s.hole, gnome: s.gnome || "classic" });
  if (s.weather) q.set("weather", s.weather);
  if (s.build) q.set("build", "");
  if (s.by) q.set("by", s.by); // a duel: that player's ghost raced (their best here)
  if (s.screen) q.set("screen", s.screen); // a screen of the game's (its ui shown), not the course
  const url = `${APP}/?${s.screen ? "" : "play&"}promo&${q}`;
  // a duel's reads, kept from the first render (web/lib/promo.ts attach)
  const reads = s.by && (await c.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__promoReads=${JSON.stringify(paths.reads || {})}` })).identifier;
  await c.send("Page.navigate", { url });
  for (let k = 0; !(await c.js("!!(window.__promo && __promo.ready())").catch(() => false)); k++) {
    // now and then the page comes up without its query (the title screen): ask again
    if (k % 40 === 39 && !(await c.js("location.search.includes('promo')").catch(() => true))) await c.send("Page.navigate", { url });
    if (k === 240) await c.send("Page.reload"); // the dev server was busy recompiling: once more
    if (k > 480) throw new Error(`shot ${s.name}: the hole never loaded (${await c.js("location.href + ' ' + document.body.innerText.slice(0, 300)").catch((e) => e.message)})`);
    await sleep(250);
  }
  await c.js(`document.fonts.load("700 100px Fredoka").then(() => document.fonts.ready)`);
  await sleep(1200); // the world's pieces settle in
  // the chain's answers, fetched once and kept
  const key = (f) => `${s.cup}${s.hole}|${f.deg},${f.power}${f.tick != null ? "@" + f.tick : ""}`;
  const cache = {};
  for (const f of (s.fire || []).slice(0, 1)) { // (a later stroke is played from the ball's rest: a duel's reads keep it)
    if (!paths[key(f)]) {
      paths[key(f)] = await c.js(`__promo.simulate([[${f.deg}, ${f.power}, ${f.tick ?? null}]])`);
      fs.writeFileSync(pathsFile, JSON.stringify(paths));
    }
    cache[`${f.deg},${f.power}`] = paths[key(f)];
  }
  // dropAt: the shot is timed so the ball drops in the cup at that second of the shot
  // eventAt: a moment inside the shot (a splash, a bounce) lands at that second; fire[0].eventT is
  // how long after the putt it comes (from the trap search), plus what frame-stepping adds (~16%)
  if (s.eventAt != null && s.fire && s.fire[0] && s.fire[0].eventT != null) s.fire[0].at = s.eventAt - s.fire[0].eventT * 1.16;
  else if ((s.dropAt != null || s.eventAt != null) && s.fire && s.fire[0]) {
    const pts = cache[`${s.fire[0].deg},${s.fire[0].power}`].path;
    const upto = s.eventAt != null ? s.fire[0].event : pts.length - 1;
    let T = 0;
    for (let k = 0; k < upto; k++) T += s.dropAt != null && k === pts.length - 2 ? 0.32 : Math.max(0.072, Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]) / 26);
    if (s.eventAt != null) s.dropAt = s.eventAt;
    // in the game's time: a slow-motion ramp before the drop stretches the shot's seconds (the page's own pace, web/lib/promo.ts)
    const G = s.ramp ? await c.js(`__promo.gameTime(${JSON.stringify(s.ramp)}, ${s.dropAt})`) : s.dropAt;
    s.fire[0].at = G - T - (s.dropLag ?? 0.013 * upto); // dropLag: what the frame-stepped replay adds, measured (see the "sinks at" log)
  }
  const frames = s.f1 - s.f0, dur = frames / FPS;
  const cfg = { ...s, paths: cache };
  await c.js(`__promo.setup(${JSON.stringify(cfg)})`);
  // MEASURE=1: play each trap shot from its putt and print when the ball goes in (no capture)
  if (process.env.MEASURE && s.fire && s.fire[0]) {
    const f0 = s.fire[0];
    for (let k = 0; k < 6 * FPS; k++) {
      const st = await c.js("__promo.step(1)");
      if (st.scale < 0.97 || !st.visible || st.y < -0.6) { console.log(`  ${s.name}: in at (y ${st.y.toFixed(2)}) ${(st.t - f0.at).toFixed(3)} s after the putt`); break; }
    }
    return;
  }
  const pre = Math.round((s.pre || 0) * FPS);
  if (pre) await c.js(`__promo.step(${pre})`);
  const every = Number(process.env.EVERY) || 0; // stills every N frames, instead of first/middle/last
  const want = STILLS ? new Set(every ? Array.from({ length: Math.ceil(frames / every) }, (_, k) => k * every) : [0, Math.floor(frames / 2), frames - 1]) : null;
  for (let f = 0; f < frames; f++) {
    const st = await c.js("__promo.step(1)");
    if (st.ghost && !s.ghostIn && (st.ghost.scale < 0.75 || !st.ghost.visible)) (s.ghostIn = true), console.log(`  ${s.name}: the ghost sinks at ${(f / FPS).toFixed(3)} s`);
    if ((s.dropAt != null || s.eventAt != null || s.by) && !s.sunk && (st.scale < (s.eventAt != null ? 0.97 : 0.75) || !st.visible || (s.eventAt != null && st.y < -0.6))) (s.sunk = true), console.log(`  ${s.name}: the ball sinks at ${(f / FPS).toFixed(3)} s (target ${s.dropAt ?? s.eventAt ?? "-"})`);
    if (want && !want.has(f)) continue;
    const { data } = await c.send("Page.captureScreenshot", { format: STILLS ? "png" : "jpeg", quality: STILLS ? undefined : 94 });
    fs.writeFileSync(STILLS ? path.join(out, `${String(i).padStart(2, "0")}-${s.name}-${f}.png`) : path.join(out, `${String(s.f0 + f).padStart(5, "0")}.jpg`), Buffer.from(data, "base64"));
    if (f % 15 === 0) await sleep(40); // a modest pace: the laptop stays cool
  }
  if (!STILLS && !CLEAN) {
    const wav = await c.js(`__promo.audio(${s.pre || 0}, ${dur})`);
    if (wav) fs.writeFileSync(path.join(WORK, `sfx-${i}.wav`), Buffer.from(wav, "base64"));
  }
  if (reads) {
    paths.reads = { ...paths.reads, ...(await c.js("window.__promoReads")) };
    fs.writeFileSync(pathsFile, JSON.stringify(paths));
    await c.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: reads });
  }
  console.log(`shot ${i} ${s.name}: ${frames} frames`);
}

// ------------------------------------------------------------- the cups
//
// Each cup card plays a clip on hover: four of its holes (cups.json), each
// an orbit a third of the way round, closing in a little from above, drawn
// by the title's own scene at golden hour on the card's sky (web/lib/scene/
// titlebake.ts cupClip, ?titlebake). The first hole starts on the card's still,
// and the loop cross-fades back to it: the still, the clip and its loop meet
// without a jump. 640x480 for a card about 300 px wide at 2x, 24 fps.
/** A hole's state as the chain gives it (HoleState: a JSON string in a Gno typed result). */
async function holeState(slot) {
  const hex = Buffer.from(`${REALM}.HoleState(${JSON.stringify(slot)})`).toString("hex");
  const r = await (await fetch(`${RPC}/abci_query?path=%22vm/qeval%22&data=0x${hex}`)).json();
  const raw = Buffer.from(r.result.response.ResponseBase.Data || "", "base64").toString();
  return JSON.parse(JSON.parse(raw.slice(raw.indexOf("(") + 1, raw.lastIndexOf(" string)"))));
}
async function renderCups() {
  const W = 640, H = 480, CFPS = 24, D = 3, X = 0.5; // each hole's seconds, the cross-fades'
  const plan = JSON.parse(fs.readFileSync(path.join(HERE, "cups.json"), "utf8"));
  const worlds = Object.keys(plan).filter((w) => !ONLY || ONLY.split(",").includes(w));
  const dir = (w, k) => path.join(WORK, "cups", w, String(k));
  if (!process.argv.includes("--encode")) {
    const b = await launch({ width: W, height: H, dir: path.join(WORK, "profile") });
    try {
      await b.send("Page.navigate", { url: `${APP}/?titlebake` });
      for (let i = 0; i < 120 && !(await b.ev("!!window.__cupClip")); i++) await sleep(500);
      for (const w of worlds)
        for (const [k, shot] of plan[w].entries()) {
          // the hole as the chain has it (the first, the card's landmark, as the title has it)
          const hole = shot.still ? null : await holeState(shot.hole);
          const out = STILLS ? path.join(HERE, "stills-check") : dir(w, k), n = D * CFPS;
          if (!STILLS) fs.rmSync(out, { recursive: true, force: true });
          fs.mkdirSync(out, { recursive: true });
          await b.js(`(async () => { window.__clip = await window.__cupClip(${JSON.stringify(w)}, ${JSON.stringify(hole)}, ${W}, ${H}, ${JSON.stringify(shot)}); })()`);
          for (let f = 0; f < n; f++) {
            if (STILLS && ![0, n >> 1, n - 1].includes(f)) continue;
            const url = await b.js(`__clip.frame(${f / (n - 1)}, ${f / CFPS})`);
            fs.writeFileSync(path.join(out, STILLS ? `cup-${w}-${k}-${f}.jpg` : `${String(f).padStart(3, "0")}.jpg`), Buffer.from(url.split(",")[1], "base64"));
            if (f % 12 === 11) await sleep(40); // a modest pace
          }
          await b.js("__clip.destroy()");
          console.log(`cup ${w} ${k} ${shot.hole}: ${STILLS ? 3 : n} frames`);
        }
      if (b.errors.length) console.log(b.errors.slice(0, 5));
    } finally {
      b.kill();
    }
  }
  if (STILLS) return;
  // one ffmpeg at a time: the four holes cross-faded, the last into the first's
  // first frame; a light denoise, so the toon flats code clean. Under ~150 KB
  // each at about 100 kbps: AV1 (a constant quality this small blocks up or
  // runs over), VP9 in two passes, H.264 in two at 480x360 (it holds up
  // better smaller for the bytes).
  const DEST = path.join(HERE, "..", "..", "web", "public", "title");
  const ff = (...a) => execFileSync("nice", ["-n", "20", FFMPEG, "-y", "-v", "error", ...a], { stdio: "inherit", cwd: WORK });
  const KBPS = Number(process.env.KBPS) || 100;
  for (const w of worlds) {
    const seq = (k) => ["-framerate", String(CFPS), "-i", path.join(dir(w, k), "%03d.jpg")];
    const xf = (a, b, o, to) => `[${a}][${b}]xfade=transition=fade:duration=${X}:offset=${o}[${to}]`;
    const len = 4 * D - 3 * X;
    const mid = path.join(WORK, `cup-${w}.mkv`);
    ff(...seq(0), ...seq(1), ...seq(2), ...seq(3), "-loop", "1", "-framerate", String(CFPS), "-t", String(X), "-i", path.join(dir(w, 0), "000.jpg"),
      "-filter_complex", [xf(0, 1, D - X, "a"), xf("a", 2, 2 * (D - X), "b"), xf("b", 3, 3 * (D - X), "c"), xf("c", 4, len - X, "d"), "[d]hqdn3d=1.5:1.5:3:3,format=yuv420p[v]"].join(";"),
      "-map", "[v]", "-t", String(len), "-c:v", "ffv1", mid);
    const src = ["-i", mid];
    const dst = (ext) => path.join(DEST, `cup-${w}.${ext}`);
    ff(...src, "-an", "-c:v", "libsvtav1", "-preset", "3", "-b:v", `${KBPS}k`, "-svtav1-params", "tune=0:enable-overlays=1:scd=1", "-g", String(len * CFPS), dst("av1.webm"));
    const two = (codec, kbps, file, extra) => {
      for (const pass of [1, 2])
        ff(...src, "-an", ...codec, "-b:v", `${kbps}k`, "-maxrate", `${Math.round(kbps * 1.5)}k`, "-bufsize", `${kbps * 3}k`, ...extra, "-g", String(len * CFPS),
          "-pass", String(pass), "-passlogfile", path.join(WORK, `cup-${w}`), ...(pass === 1 ? ["-f", "null", "/dev/null"] : [file]));
    };
    two(["-c:v", "libvpx-vp9", "-deadline", "good", "-cpu-used", "1", "-row-mt", "1", "-auto-alt-ref", "1", "-lag-in-frames", "25", "-aq-mode", "0"], KBPS, dst("vp9.webm"), []);
    two(["-vf", "scale=480:360:flags=lanczos", "-c:v", "libx264", "-preset", "veryslow", "-tune", "animation", "-profile:v", "high"], Math.round(KBPS * 1.2), dst("mp4"), ["-movflags", "+faststart"]);
    console.log(w, len, "s:", ["av1.webm", "vp9.webm", "mp4"].map((e) => `${e} ${Math.round(fs.statSync(dst(e)).size / 1024)} KB`).join(", "));
  }
}
if (CUPS) await renderCups(), process.exit(0);

const out = STILLS ? path.join(HERE, "stills-check") : path.join(WORK, CLEAN ? "frames-clean" : "frames");
fs.mkdirSync(out, { recursive: true });
if (!STILLS && !CLEAN && !ONLY && !process.argv.includes("--encode")) for (const f of fs.readdirSync(WORK)) if (f.startsWith("sfx-")) fs.unlinkSync(path.join(WORK, f));
const ENCODE = process.argv.includes("--encode"); // only re-encode the frames and sounds already captured
const c = ENCODE ? { kill() {} } : await chrome();
try {
  if (!ENCODE) for (const [i, s] of SHOTS.entries()) if (!ONLY || ONLY.split(",").some((n) => s.name === n || s.name.startsWith(n + "-"))) await shoot(c, s, i, out);
} finally {
  c.kill();
}
if (STILLS) process.exit(0);

// ------------------------------------------------------------ encode: clean
//
// 24 fps, no audio track, each file under ~520 KB (below the site's gzipped
// JS; the browser takes one). A very light denoise first, so the toon flats
// code clean, without blocks. AV1: 1280x720, constant quality at the
// slowest preset worth it, visual tuning, no film grain (the grain's noise
// shows on the flats). VP9: 1280x720, two passes. H.264 holds up better at
// 960x540 for the same bytes (two passes, animation tuning).
if (CLEAN) {
  const DEST = path.join(HERE, "..", "..", "web", "public", "title");
  const ff = (...a) => execFileSync("nice", ["-n", "20", FFMPEG, "-y", "-v", "error", ...a], { stdio: "inherit", cwd: WORK });
  const src = ["-framerate", String(FPS), "-i", path.join(out, "%05d.jpg"), "-t", String(LEN)];
  const vf = (size) => `scale=${size}:flags=lanczos,fps=24,hqdn3d=1.5:1.5:3:3,format=yuv420p`;
  const CRF = Number(process.env.CRF) || 60, KBPS = Number(process.env.KBPS) || 330;
  ff(...src, "-vf", vf("1280:720"), "-an", "-c:v", "libsvtav1", "-preset", "2", "-crf", String(CRF), "-svtav1-params", "tune=0:enable-overlays=1:scd=1", "-g", "240", path.join(DEST, "bg.av1.webm"));
  for (const pass of [1, 2])
    ff(...src, "-vf", vf("1280:720"), "-an", "-c:v", "libvpx-vp9", "-b:v", `${KBPS}k`, "-maxrate", `${Math.round(KBPS * 1.5)}k`, "-bufsize", `${KBPS * 3}k`, "-deadline", "good", "-cpu-used", "0", "-row-mt", "1", "-auto-alt-ref", "1", "-lag-in-frames", "25", "-aq-mode", "0", "-g", "240",
      "-pass", String(pass), "-passlogfile", path.join(WORK, "vp9"), ...(pass === 1 ? ["-f", "null", "/dev/null"] : [path.join(DEST, "bg.vp9.webm")]));
  for (const pass of [1, 2])
    ff(...src, "-vf", vf("960:540"), "-an", "-c:v", "libx264", "-preset", "veryslow", "-tune", "animation", "-b:v", `${KBPS}k`, "-maxrate", `${Math.round(KBPS * 1.5)}k`, "-bufsize", `${KBPS * 3}k`, "-profile:v", "high", "-movflags", "+faststart", "-g", "240",
      "-pass", String(pass), "-passlogfile", path.join(WORK, "x264"), ...(pass === 1 ? ["-f", "null", "/dev/null"] : [path.join(DEST, "bg.mp4")]));
  for (const f of ["bg.av1.webm", "bg.vp9.webm", "bg.mp4"]) console.log(f, Math.round(fs.statSync(path.join(DEST, f)).size / 1024), "KB");
  console.log("clean cut:", LEN.toFixed(2), "s");
  process.exit(0);
}

// ------------------------------------------------------------------ encode

const sfx = SHOTS.map((s, i) => [i, path.join(WORK, `sfx-${i}.wav`), s.f0 / FPS]).filter(([, f]) => fs.existsSync(f));
// (each part of the music but the first comes in X s early, cross-faded at equal power over the
// last quarter of the beat before its splice: the splice's downbeat is the new part's own, whole
// (a whole beat's doubled both bars and swelled the level 2 dB; a linear one dipped it 3 to 4 dB))
const X = BEAT / 4, N = PARTS.length;
const inputs = ["-framerate", String(FPS), "-i", path.join(out, "%05d.jpg")];
for (const [k, [at, len]] of PARTS.entries()) inputs.push("-ss", String(k ? at - X : at), "-t", String(k === N - 1 ? LEN : k ? len + X : len), "-i", MUSIC);
for (const [, f] of sfx) inputs.push("-i", f);
const delays = sfx.map(([, , at], k) => `[${k + N + 1}:a]adelay=${Math.round(at * 1000)}:all=1[s${k}]`).join(";");
const filter = [
  delays,
  ...PARTS.slice(1).map((_, k) => `[${k ? `m${k}` : "1:a"}][${k + 2}:a]acrossfade=d=${X}:c1=qsin:c2=qsin[m${k + 1}]`),
  `${sfx.map((_, k) => `[s${k}]`).join("")}amix=inputs=${sfx.length}:normalize=0,volume=2.8,asplit[fx][key]`,
  // the music gives way a little under the game's sounds (the putt, the cup, the confetti)
  // dip: [from, to] in a shot's seconds, the music held back (a breath before a hit)
  `[${N > 1 ? `m${N - 1}` : "1:a"}]volume=0.7,volume='${SHOTS.flatMap((s) => (s.dip && !s.t0 ? [[s.f0 / FPS + s.dip[0], s.f0 / FPS + s.dip[1]]] : [])).reduce((e, [a, b]) => `if(between(t,${a.toFixed(3)},${b.toFixed(3)}),0.12,${e})`, "1")}':eval=frame,afade=t=in:d=0.08,afade=t=out:st=${(LEN - 0.3).toFixed(2)}:d=0.3[mus]`,
  `[mus][key]sidechaincompress=threshold=0.05:ratio=4:attack=5:release=250[duck]`,
  `[duck][fx]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`,
].join(";");
const MP4 = path.join(HERE, `gnogolf-promo${SUFFIX}.mp4`);
execFileSync("nice", ["-n", "20", FFMPEG, "-y", "-v", "error", ...inputs, "-filter_complex", filter, "-map", "0:v", "-map", "[a]",
  "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart",
  "-c:a", "aac", "-b:a", "192k", "-t", String(LEN), MP4], { stdio: "inherit" });
execFileSync("nice", ["-n", "20", FFMPEG, "-y", "-v", "error", "-i", MP4, "-vf", "scale=1280:720:flags=lanczos", "-c:v", "libx264",
  "-preset", "slow", "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "copy", path.join(HERE, `gnogolf-promo${SUFFIX}-720p.mp4`)], { stdio: "inherit" });
console.log("done:", MP4);
