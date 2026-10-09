// @ts-check
// Collection gnomes in the real game (the dev server at APP, the chain at RPC
// read only: holes, simulations, a rival's ghost; nothing is ever sent):
// each played as the player (?traits=, a test hook) on a garden hole in clear
// weather, an island hole in a storm and a Crystal Mines gallery in Lights
// out, and raced as a rival's ghost (?rivaltraits=). For each: the play view
// and a close-up; the cup never under him; a holing shot played with the CPU
// slowed 4× (a phone), its frame rate, his trail while he rolls, his holing
// played and ended (and no shader program linked for it: compiled with the
// hole); his ghost; his headlamp in the dark. Pictures and a report
// (report.json) in media/gnomes/inplay/, and a contact sheet.
//   APP=http://localhost:3417 RPC=https://rpc.onyx.testnets.gno.land:443 node media/gnomes/inplay.mjs [ids…]
import fs from "node:fs";
import { launch, sleep, APP, RPC } from "../lib/cdp.mjs";

const ROOT = new URL("../../", import.meta.url), OUT = new URL("inplay/", import.meta.url);
/** @type {{ gnomes: { id: number, tier: string, name: string, traits: string }[] }} */
const catalogue = JSON.parse(fs.readFileSync(new URL("data/gnomes.json", ROOT), "utf8"));
// three of each sold tier from three homes, and every Legendary; 0 is the Classic, for comparison
const PICK = [0, 1, 105, 415, 73, 177, 487, 94, 203, 511, 104, 208, 311, 414, 516, 618, 720];
const ids = process.argv.slice(2).map(Number);
const todo = (ids.length ? ids : PICK).map((id) => (id ? catalogue.gnomes.find((g) => g.id === id) : { id: 0, tier: "earned", name: "The Classic", traits: "" }));
const HOLES = [
  { key: "garden", slot: "garden/3", weather: "clear", shoot: true, ghost: true }, // (a hole-in-one on record: a shot that holes is there to find)
  { key: "storm", slot: "island/2", weather: "storm", roll: true },
  { key: "dark", slot: "mines/2", weather: "fog" }, // the Crystal Mines' "Lights out": any gnome wears a headlamp there
];
fs.mkdirSync(OUT, { recursive: true });

const b = await launch({ width: 1100, height: 700 });
// the shader programs linked, counted from the first script
await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__linked = 0; { const p = WebGL2RenderingContext.prototype, make = p.createProgram; p.createProgram = function () { window.__linked++; return make.call(this); }; }` });
await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
/** @param {string} expr @param {number} tries */
async function until(expr, tries = 120, ms = 250) {
  let v = await b.ev(expr);
  for (let i = 0; i < tries && !v; i++) (await sleep(ms)), (v = await b.ev(expr));
  return v;
}
/** A picture of the page, half size, into inplay/. @param {string} name */
async function shot(name) {
  const jpg = Buffer.from((await b.send("Page.captureScreenshot", { format: "jpeg", quality: 72, clip: { x: 0, y: 0, width: 1100, height: 700, scale: 0.5 } })).data, "base64");
  fs.writeFileSync(new URL(name, OUT), jpg);
  return name;
}
/** Whether the cup's centre, in front of the camera, is under his box on screen. */
const cupUnder = async () => {
  const o = await b.ev(`window.__g.onScreen()`);
  if (!o) return null;
  const [x, y, front] = o.cup, [x0, y0, x1, y1] = o.gnome;
  return { covered: !!front && x >= x0 && x <= x1 && y >= y0 && y <= y1, box: [x1 - x0, y1 - y0], cup: o.cup };
};

/** A shot that holes in one from the tee now (free reads of the chain), or null: the record's own
 *  hole-in-one if this weather still lets it, else around it, else along the line to the cup. */
const FIND = `(async () => {
  const h = __g.holeNow(), c = __g.chain, period = await c.period();
  const holes = async (a, pw) => { const r = await c.simulateRound(h.id, [a.toFixed(4) + "," + pw.toFixed(4)], period); return r.holed && r.strokes === 1 ? r : null; };
  for (const mode of ["assisted", "pro"]) {
    const lb = await c.holeLeaderboard(h.id, 0, 3, mode);
    for (const row of (lb.rows || []).filter((x) => x.strokes === 1)) {
      const gh = await c.ghost(h.id, mode, row.player);
      if (!gh) continue;
      const [a, pw] = gh.shots.split(";")[0].split(",").map(Number);
      // the weather moves the ball: around the record's shot, nearest first
      const near = [];
      for (let da = -3; da <= 3; da += 0.5) for (let dp = -1; dp <= 1; dp += 0.25) near.push([da, dp]);
      near.sort((p, q) => Math.hypot(p[0], p[1] * 2) - Math.hypot(q[0], q[1] * 2));
      for (const [da, dp] of near) if (pw + dp <= 10 && (await holes(a + da, pw + dp))) return [a + da, pw + dp];
    }
  }
  const base = Math.atan2(h.cup[1] - h.ball[1], h.cup[0] - h.ball[0]) * 180 / Math.PI;
  const off = (r) => { const p = r.path[r.path.length - 1]; return Math.hypot(p[0] - h.cup[0], p[1] - h.cup[1]); };
  let best = null;
  for (let pw = 2; pw <= 10; pw += 0.5) {
    const r = await c.simulateRound(h.id, [base.toFixed(4) + "," + pw.toFixed(4)], period);
    if (r.holed && r.strokes === 1) return [base, pw];
    if (!best || off(r) < best.d) best = { d: off(r), pw };
  }
  for (const da of [-0.5, 0.5, -1, 1, -1.5, 1.5, -2, 2, -3, 3, -4, 4])
    for (const dp of [0, -0.25, 0.25, -0.5, 0.5, -0.75, 0.75]) {
      const a = base + da, pw = best.pw + dp, r = await c.simulateRound(h.id, [a.toFixed(4) + "," + pw.toFixed(4)], period);
      if (r.holed && r.strokes === 1) return [a, pw];
    }
  return null;
})()`;

/** A rival's ghost on this hole (its board's first row), raced: whether one came. */
const RACE = `(async () => {
  const h = __g.holeNow(), c = __g.chain;
  for (const mode of ["assisted", "pro"]) {
    const lb = await c.holeLeaderboard(h.id, 0, 3, mode);
    for (const row of lb.rows || []) {
      const gh = await c.ghost(h.id, mode, row.player);
      if (gh) return (__g.race(gh), true);
    }
  }
  return false;
})()`;

const report = [];
let holing = null; // the holing shot found for the garden hole, kept while it still holes
/** The garden hole to hole out on, and its shot, in this weather: the first of those with a hole-in-one on record. */
async function findHoling() {
  for (const slot of ["garden/3", "garden/4", "garden/14"]) {
    await b.send("Page.navigate", { url: `${APP}/?play&camlog&rpc=${encodeURIComponent(RPC)}&hole=${slot}&weather=clear` });
    if (!(await until(`!!(window.__g && window.__g.holeNow() && document.querySelector('.cam-btn'))`, 160))) continue;
    const s = await b.ev(FIND);
    if (s) return (HOLES[0].slot = slot), s;
  }
  return null;
}
for (const g of todo) {
  const r = { id: g.id, tier: g.tier, name: g.name, holes: {}, pictures: [] };
  if (!holing) holing = await findHoling();
  for (const h of HOLES) {
    const q = `?play&camlog&rpc=${encodeURIComponent(RPC)}&hole=${h.slot}&weather=${h.weather}` + (g.traits ? `&traits=${g.traits}` : "") + (h.ghost && g.traits ? `&rivaltraits=${g.traits}` : "");
    await b.send("Page.navigate", { url: `${APP}/${q}` });
    if (!(await until(`!!(window.__g && window.__g.holeNow() && document.querySelector('.cam-btn'))`, 160))) {
      r.holes[h.key] = { error: `did not load ${b.errors.slice(-2)}` };
      continue;
    }
    await sleep(2500);
    const out = (r.holes[h.key] = { cupAtPlay: await cupUnder() });
    r.pictures.push(await shot(`${g.id}-${h.key}-play.jpg`));
    // a close-up: a little above and in front of him, on his side
    const at = (await b.ev(`window.__g.ballAt()`)).p;
    await b.ev(`window.__g.pose([${at[0] + 1.6}, ${at[1] + 1.1}, ${at[2] + 2.4}], [${at[0]}, ${at[1] + 0.35}, ${at[2]}], 32)`);
    await sleep(900);
    r.pictures.push(await shot(`${g.id}-${h.key}-close.jpg`));
    await b.ev(`window.__g.pose()`);
    await sleep(600);
    if (h.roll) {
      // a shot toward the cup, his trail behind him: pictures as he rolls (the CPU at full speed: a picture takes its time)
      await b.ev(`(() => { const s = __g.holeNow(); return __g.shoot(Math.atan2(s.cup[1] - s.ball[1], s.cup[0] - s.ball[0]) * 180 / Math.PI, 6); })(), 1`);
      let n = 0, trail = false;
      for (let i = 0; i < 60 && n < 2; i++) {
        await sleep(80);
        const p = await b.ev(`window.__g.pullState()`), fx = await b.ev(`window.__g.fx()`);
        trail ||= !!(fx && fx.trail);
        if (p && p.flying && i >= 3 + n * 6) r.pictures.push(await shot(`${g.id}-${h.key}-roll${++n}.jpg`));
      }
      out.roll = { pictures: n, trail };
    }
    if (h.shoot) {
      if (!holing) out.shot = "no holing shot found";
      else {
        // a phone: the CPU slowed 4×, every frame's gap counted while he flies and the cup cheers
        await b.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        await b.ev(`(window.__gaps = [], window.__fx = [], (() => { let p = 0; const f = (t) => { if (p) __gaps.push(t - p); p = t; __fx.push(window.__g.fx()); if (__gaps.length < 4000) requestAnimationFrame(f); }; requestAnimationFrame(f); })(), 1)`);
        const linked0 = await b.ev(`window.__linked`);
        await b.ev(`window.__g.shoot(${holing[0]}, ${holing[1]})`);
        let rolled = false;
        for (let i = 0; i < 200; i++) {
          await sleep(60);
          const p = await b.ev(`window.__g.pullState()`);
          // mid-roll: as soon as his trail is down behind him (a gnome without one: half a second in)
          if (p && p.flying) rolled = true;
          if (await b.ev(`window.__g.fx().holing`)) {
            await sleep(250);
            r.pictures.push(await shot(`${g.id}-${h.key}-holed.jpg`));
            break;
          }
          if (p && !p.flying && rolled && !(await b.ev(`window.__g.fx().holing`)) && i > 60) break;
        }
        await sleep(2500);
        const linked = (await b.ev(`window.__linked`)) - linked0;
        const f = await b.ev(`(() => { const g = __gaps.slice().sort((a, b) => a - b); const fx = __fx; return { n: g.length, median: g[g.length >> 1], p95: g[Math.floor(g.length * 0.95)], trail: fx.some((x) => x.trail), holing: fx.some((x) => x.holing), holingEnded: fx.length > 0 && !fx[fx.length - 1].holing }; })()`);
        await b.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        out.shot = { hole: h.slot, angle: +holing[0].toFixed(2), power: holing[1], banner: await b.ev(`!!document.querySelector('.banner--win')`), fps: f.median ? Math.round(1000 / f.median) : 0, frameMs: { median: +(f.median || 0).toFixed(1), p95: +(f.p95 || 0).toFixed(1) }, trail: f.trail, holing: f.holing, holingEnded: f.holingEnded, linked };
        if (!out.shot.banner) holing = null; // the weather moved on: found again for the next gnome
      }
    }
    if (h.ghost && g.traits) {
      // his ghost, a rival's, on the tee beside the Classic... the player plays this gnome too: the ghost is the one to look at
      await b.send("Page.navigate", { url: `${APP}/?play&camlog&rpc=${encodeURIComponent(RPC)}&hole=${h.slot}&weather=${h.weather}&rivaltraits=${g.traits}` });
      if (await until(`!!(window.__g && window.__g.holeNow() && document.querySelector('.cam-btn'))`, 160)) {
        await sleep(1500);
        out.ghost = await b.ev(RACE);
        await sleep(2500);
        if (out.ghost) {
          const at2 = (await b.ev(`window.__g.ballAt()`)).p;
          await b.ev(`window.__g.pose([${at2[0] + 1.2}, ${at2[1] + 1.8}, ${at2[2] + 3.6}], [${at2[0]}, ${at2[1] + 0.3}, ${at2[2]}], 40)`);
          await sleep(900);
          r.pictures.push(await shot(`${g.id}-${h.key}-ghost.jpg`));
          await b.ev(`window.__g.pose()`);
        }
      }
    }
  }
  r.errors = b.errors.splice(0);
  report.push(r);
  console.log(JSON.stringify({ id: r.id, name: r.name, ...Object.fromEntries(Object.entries(r.holes).map(([k, v]) => [k, { ...v, cupAtPlay: v.cupAtPlay && v.cupAtPlay.covered }])), errors: r.errors.length }));
}
// some ids played again: their rows replaced in the report as it was, the others kept
const REPORT = new URL("report.json", OUT);
/** @type {typeof report} */
const before = ids.length && fs.existsSync(REPORT) ? JSON.parse(fs.readFileSync(REPORT, "utf8")) : [];
const all = before.map((r) => report.find((x) => x.id === r.id) || r).concat(report.filter((r) => !before.some((x) => x.id === r.id)));
fs.writeFileSync(REPORT, JSON.stringify(all, null, 1) + "\n");

// the contact sheet: each gnome a row of his pictures
const { frameTree } = await b.send("Page.getFrameTree");
await b.send("Emulation.setDeviceMetricsOverride", { width: 120 + 11 * 224, height: all.length * 170 + 10, deviceScaleFactor: 1, mobile: false });
const rows = all.map((r) => `<div class=row><b>#${r.id} ${r.name}<br><small>${r.tier}</small></b>${r.pictures.map((p) => `<img src="data:image/jpeg;base64,${fs.readFileSync(new URL(p, OUT)).toString("base64")}"><span>${p.replace(/^\d+-/, "").replace(".jpg", "")}</span>`).join("")}</div>`).join("");
await b.send("Page.setDocumentContent", { frameId: frameTree.frame.id, html: `<style>body{margin:4px;font:11px system-ui}.row{display:flex;gap:4px;height:166px;align-items:flex-start;flex-wrap:nowrap;overflow:hidden}.row b{width:110px;flex:none}img{width:220px;height:140px;object-fit:cover}span{display:none}</style>${rows}` });
await sleep(800);
fs.writeFileSync(new URL("sheet.jpg", OUT), Buffer.from((await b.send("Page.captureScreenshot", { format: "jpeg", quality: 70 })).data, "base64"));
b.kill();
process.exit(0);
