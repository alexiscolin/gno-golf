// @ts-check
// Renders the Gnogolf trailer: node media/promo/render.mjs [--stills] [--only=name] [--clean]
//
// --clean: the title screen's background instead (web/public/title/bg.*): a
// short cut of the calmer shots, no titles, flashes, shakes or sound, encoded
// small for the web (AV1 and VP9 webm, H.264 mp4, a poster).
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
import { launch, sleep, APP } from "../lib/cdp.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const WORK = path.join(os.tmpdir(), "gnogolf-promo");
const STILLS = process.argv.includes("--stills");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7);
const FPS = 30;
const CLEAN = process.argv.includes("--clean");
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
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? r0 : r1;
    return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
  }).join(" ");
// the title screen's own badge (components/Title.jsx), with its classes
const club = (rot, head) => `<g transform="rotate(${rot} 300 330)"><rect x="293" y="118" width="14" height="360" rx="7" class="title__shaft"/><rect x="289" y="118" width="22" height="62" rx="9" class="title__grip"/><path d="${head}" class="title__head"/></g>`;
const LOGO = (w = 900) => `<svg class="logo" style="width:${w}px" viewBox="0 0 600 505"><defs><path id="arc" d="M 70 330 A 230 230 0 0 1 530 330"/></defs>
<text class="title__word"><textPath href="#arc" startOffset="50%" text-anchor="middle">GNOGOLF</textPath></text>
<g>${club(-44, "M 283 470 L 343 470 Q 355 470 355 482 L 355 492 Q 355 500 345 500 L 283 500 Z")}${club(44, "M 317 470 L 257 470 Q 245 470 245 482 L 245 492 Q 245 500 255 500 L 317 500 Z")}</g>
<g transform="translate(300 298) scale(1.25) translate(-100 -110)"><polygon points="${burst(18, 86, 104)}" class="title__burst"/>
<g class="title__outline"><rect x="40" y="100" width="120" height="44" rx="6"/><path d="M 40 116 Q 34 190 100 214 Q 166 190 160 116 Q 140 146 100 142 Q 60 146 40 116 Z"/><path d="M 32 100 L 100 2 L 168 100 Z"/><rect x="26" y="90" width="148" height="20" rx="10"/></g>
<rect x="40" y="100" width="120" height="44" rx="6" class="title__face"/><path d="M 40 116 Q 34 190 100 214 Q 166 190 160 116 Q 140 146 100 142 Q 60 146 40 116 Z" class="title__beard"/>
<path d="M 32 100 L 100 2 L 168 100 Z" class="title__hat"/><rect x="26" y="90" width="148" height="20" rx="10" class="title__hat"/>
<circle cx="80" cy="120" r="7" class="title__ink"/><circle cx="120" cy="120" r="7" class="title__ink"/><circle cx="100" cy="134" r="9" class="title__nose"/></g></svg>`;
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
const SHOTS = ((a) => (CLEAN ? cleanOf(a) : a))(JSON.parse(fs.readFileSync(path.join(HERE, "shots.json"), "utf8"))).flatMap((s) => {
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
const LEN = F(LAST) / FPS, MUSIC_AT = +(MUSIC_END - LAST * BEAT).toFixed(3);

// ------------------------------------------------------------------ chrome

async function chrome() {
  const [w, h] = CLEAN ? [1280, 720] : [1920, 1080];
  const { send, js, kill } = await launch({ width: w, height: h, dir: path.join(WORK, "profile"), args: [`--window-size=${w},${h}`, "--hide-scrollbars", "--mute-audio"] });
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
  await c.send("Page.navigate", { url: `${APP}/?play&promo&${q}` });
  for (let k = 0; !(await c.js("!!(window.__promo && __promo.ready())").catch(() => false)); k++) {
    // now and then the page comes up without its query (the title screen): ask again
    if (k % 40 === 39 && !(await c.js("location.search.includes('promo')").catch(() => true))) await c.send("Page.navigate", { url: `${APP}/?play&promo&${q}` });
    if (k === 240) await c.send("Page.reload"); // the dev server was busy recompiling: once more
    if (k > 480) throw new Error(`shot ${s.name}: the hole never loaded (${await c.js("location.href + ' ' + document.body.innerText.slice(0, 300)").catch((e) => e.message)})`);
    await sleep(250);
  }
  await c.js(`document.fonts.load("700 100px Fredoka").then(() => document.fonts.ready)`);
  await sleep(1200); // the world's pieces settle in
  // the chain's answers, fetched once and kept
  const key = (f) => `${s.cup}${s.hole}|${f.deg},${f.power}${f.tick != null ? "@" + f.tick : ""}`;
  const cache = {};
  for (const f of s.fire || []) {
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
    // in the game's time: a slow-motion ramp before the drop stretches the shot's seconds
    const G = (t) => (s.ramp ? Math.min(t, s.ramp[0]) + Math.max(0, Math.min(t, s.ramp[1]) - s.ramp[0]) * s.ramp[2] + Math.max(0, t - s.ramp[1]) : t);
    s.fire[0].at = G(s.dropAt) - T - (s.dropLag ?? 0.013 * upto); // dropLag: what the frame-stepped replay adds, measured (see the "sinks at" log)
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
    if ((s.dropAt != null || s.eventAt != null) && !s.sunk && (st.scale < (s.eventAt != null ? 0.97 : 0.75) || !st.visible || (s.eventAt != null && st.y < -0.6))) (s.sunk = true), console.log(`  ${s.name}: the ball sinks at ${(f / FPS).toFixed(3)} s (target ${s.dropAt ?? s.eventAt})`);
    if (want && !want.has(f)) continue;
    const { data } = await c.send("Page.captureScreenshot", { format: STILLS ? "png" : "jpeg", quality: STILLS ? undefined : 94 });
    fs.writeFileSync(STILLS ? path.join(out, `${String(i).padStart(2, "0")}-${s.name}-${f}.png`) : path.join(out, `${String(s.f0 + f).padStart(5, "0")}.jpg`), Buffer.from(data, "base64"));
    if (f % 15 === 0) await sleep(40); // a modest pace: the laptop stays cool
  }
  if (!STILLS && !CLEAN) {
    const wav = await c.js(`__promo.audio(${s.pre || 0}, ${dur})`);
    if (wav) fs.writeFileSync(path.join(WORK, `sfx-${i}.wav`), Buffer.from(wav, "base64"));
  }
  console.log(`shot ${i} ${s.name}: ${frames} frames`);
}

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
  // the poster: the first frame, what shows while the video loads
  ff("-i", path.join(out, "00000.jpg"), "-vf", "scale=1280:720:flags=lanczos", path.join(WORK, "poster.png"));
  execFileSync("cwebp", ["-quiet", "-q", "70", path.join(WORK, "poster.png"), "-o", path.join(DEST, "bg-poster.webp")]);
  for (const f of ["bg.av1.webm", "bg.vp9.webm", "bg.mp4", "bg-poster.webp"]) console.log(f, Math.round(fs.statSync(path.join(DEST, f)).size / 1024), "KB");
  console.log("clean cut:", LEN.toFixed(2), "s");
  process.exit(0);
}

// ------------------------------------------------------------------ encode

const sfx = SHOTS.map((s, i) => [i, path.join(WORK, `sfx-${i}.wav`), s.f0 / FPS]).filter(([, f]) => fs.existsSync(f));
const inputs = ["-framerate", String(FPS), "-i", path.join(out, "%05d.jpg"), "-ss", String(MUSIC_AT), "-t", String(LEN), "-i", MUSIC];
for (const [, f] of sfx) inputs.push("-i", f);
const delays = sfx.map(([, , at], k) => `[${k + 2}:a]adelay=${Math.round(at * 1000)}:all=1[s${k}]`).join(";");
const filter = [
  delays,
  `${sfx.map((_, k) => `[s${k}]`).join("")}amix=inputs=${sfx.length}:normalize=0,volume=2.8,asplit[fx][key]`,
  // the music gives way a little under the game's sounds (the putt, the cup, the confetti)
  // dip: [from, to] in a shot's seconds, the music held back (a breath before a hit)
  `[1:a]volume=0.7,volume='${SHOTS.flatMap((s) => (s.dip && !s.t0 ? [[s.f0 / FPS + s.dip[0], s.f0 / FPS + s.dip[1]]] : [])).reduce((e, [a, b]) => `if(between(t,${a.toFixed(3)},${b.toFixed(3)}),0.12,${e})`, "1")}':eval=frame,afade=t=in:d=0.08,afade=t=out:st=${(LEN - 0.3).toFixed(2)}:d=0.3[mus]`,
  `[mus][key]sidechaincompress=threshold=0.05:ratio=4:attack=5:release=250[duck]`,
  `[duck][fx]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`,
].join(";");
const MP4 = path.join(HERE, "gnogolf-promo.mp4");
execFileSync("nice", ["-n", "20", FFMPEG, "-y", "-v", "error", ...inputs, "-filter_complex", filter, "-map", "0:v", "-map", "[a]",
  "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart",
  "-c:a", "aac", "-b:a", "192k", "-t", String(LEN), MP4], { stdio: "inherit" });
execFileSync("nice", ["-n", "20", FFMPEG, "-y", "-v", "error", "-i", MP4, "-vf", "scale=1280:720:flags=lanczos", "-c:v", "libx264",
  "-preset", "slow", "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "copy", path.join(HERE, "gnogolf-promo-720p.mp4")], { stdio: "inherit" });
console.log("done:", MP4);
