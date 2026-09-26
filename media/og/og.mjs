// @ts-check
// The link cards (ADR-003): one 1200×630 JPEG per hole, per cup and for the
// home page, in web/public/og/, and the holes' names and pars for their pages
// (web/app/h/holes.json). Each hole is shot in the game's Far view, by day and
// in clear weather (?og, ?weather=clear), the HUD hidden; the card is then laid
// out as a page of its own in the same headless Chrome and screenshotted.
//   npm run og [-- garden/3 town/18]   (the dev server on APP, the local chain on RPC)
// Make them again when a hole changes: the cards show its layout.
import fs from "node:fs";
import { launch, chainUp, sleep, APP } from "../lib/cdp.mjs";

const WEB = new URL("../../web/", import.meta.url);
const OUT = new URL("public/og/", WEB);
const NAMES = new URL("app/h/holes.json", WEB);
const W = 1200, H = 630, Q = 80;
const CUPS = ["garden", "island", "town", "mountain"];
const ALL = fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").split("\n").filter(Boolean).map((l) => l.split(" ")[0]);
const named = process.argv.slice(2);
const HOLES = named.length ? ALL.filter((s) => named.includes(s)) : ALL;
fs.mkdirSync(OUT, { recursive: true });

/** @type {Record<string, { name: string, par: number }>} */
const known = fs.existsSync(NAMES) ? JSON.parse(fs.readFileSync(NAMES, "utf8")) : {};
const cap = (/** @type {string} */ w) => w[0].toUpperCase() + w.slice(1);
const cupName = (/** @type {string} */ w) => (CUPS.includes(w) ? `${cap(w)} Cup` : cap(w));
const esc = (/** @type {string} */ s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

await chainUp();
const b = await launch({ width: W, height: H });
const { send, ev, js } = b;
await send("Page.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("gnogolf.gnome","classic");sessionStorage.setItem("gnogolf.cam.session","third");` });
const png = async (/** @type {object} */ o = {}) => "data:image/png;base64," + (await send("Page.captureScreenshot", { format: "png", ...o })).data;

// the logo, as the title screen draws it, on nothing (the sky and the rest hidden)
await send("Page.navigate", { url: `${APP}/` });
for (let i = 0; i < 100 && !(await ev(`!!document.querySelector(".title__art")`)); i++) await sleep(300);
await js(`(() => { const s = document.createElement("style"); s.textContent = "html,body,.screen{background:transparent!important} .screen>:not(.title), .title>:not(.title__logo), .title__sun, nextjs-portal{display:none!important} *{animation:none!important;transition:none!important}"; document.head.append(s); })()`);
await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
await sleep(1500);
const r = JSON.parse(await js(`JSON.stringify(document.querySelector(".title__art").getBoundingClientRect())`));
const LOGO = await png({ clip: { x: r.x - 12, y: r.y - 12, width: r.width + 24, height: r.height + 40, scale: 2 } });
await send("Emulation.setDefaultBackgroundColorOverride", {});

/** The hole in the Far view, by day, the HUD hidden: its image, name, par. */
async function shoot(/** @type {string} */ slot) {
  await send("Page.navigate", { url: `${APP}/?play&camlog&og&weather=clear&hole=${slot}` });
  for (let i = 0; i < 150; i++) { await sleep(300); if (await ev(`!!(window.__g&&window.__g.farOrbit()&&document.querySelector('.cam-btn'))`)) break; }
  if (!(await ev(`!!(window.__g&&window.__g.farOrbit())`))) throw new Error(`${slot} did not load ${b.errors.slice(-2)}`);
  for (let i = 0; i < 30; i++) { await sleep(200); if (await ev(`window.__g.boardFrame().view === "ball" && !window.__g.cam?.gliding?.()`)) break; }
  const name = await js(`document.querySelector(".card--hole h1").textContent`);
  const par = Number((await js(`document.querySelector(".card__par").textContent`)).replace(/\D/g, "")) || 3;
  await js(`(() => { const s = document.createElement("style"); s.textContent = "#stage ~ *, nextjs-portal { display: none !important; }"; document.head.append(s); })()`);
  await ev(`window.__g.setCam("far")`);
  await sleep(2400);
  return { img: await png(), name, par };
}

/** A card: the shot, the logo, and a label (eyebrow, title, chip). */
async function card(/** @type {string} */ img, /** @type {string} */ eyebrow, /** @type {string} */ title, /** @type {string} */ chip, /** @type {string} */ file) {
  const html = `<!doctype html><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&display=block" rel="stylesheet">
<style>
  :root { --paper: #fdf6e9; --ink: #144134; --green: #226c57; --hat: #e0524b; --gold: #f2c14e; }
  * { box-sizing: border-box; margin: 0; }
  body { width: ${W}px; height: ${H}px; overflow: hidden; font-family: Fredoka, ui-rounded, system-ui, sans-serif; color: var(--ink);
    background: var(--paper) url(${img}) center / cover; position: relative; }
  body::after { content: ""; position: absolute; inset: 0; background: linear-gradient(0deg, rgba(20,65,52,.28), transparent 38%); }
  .logo { position: absolute; left: 22px; top: 14px; width: 230px; z-index: 1; }
  .label { position: absolute; left: 36px; bottom: 34px; max-width: 900px; z-index: 1; padding: 18px 28px 20px; background: var(--paper);
    border: 4px solid var(--ink); border-radius: 22px; box-shadow: 0 7px 0 var(--ink), 0 18px 30px rgba(20,65,52,.35); transform: rotate(-1.2deg); }
  .eyebrow { font-weight: 600; font-size: 24px; letter-spacing: .12em; text-transform: uppercase; color: var(--green); }
  h1 { font-weight: 700; font-size: 64px; line-height: 1.02; margin: 4px 0 12px; }
  .row { display: flex; align-items: center; gap: 14px; font-weight: 500; font-size: 24px; }
  .chip { padding: 3px 16px 5px; background: var(--gold); border: 3px solid var(--ink); border-radius: 999px; font-weight: 700; }
  .row b { color: var(--hat); font-weight: 600; }
</style>
<img class="logo" src="${LOGO}">
<div class="label"><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1>
<div class="row">${chip ? `<span class="chip">${esc(chip)}</span>` : ""}<span>mini-golf on-chain · played on <b>gno.land</b></span></div></div>`;
  await render(html, file);
}

/** A page of its own, screenshotted to a JPEG in public/og. */
async function render(/** @type {string} */ html, /** @type {string} */ file) {
  const { frameTree } = await send("Page.getFrameTree");
  await send("Page.setDocumentContent", { frameId: frameTree.frame.id, html });
  await js(`document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode()))).then(() => 1)`);
  await sleep(200);
  // a busy scene (a town's roofs) is squeezed harder, to stay under ~120 KB
  let jpg = Buffer.alloc(0);
  for (let q = Q; q >= 50 && !(jpg.length && jpg.length <= 120e3); q -= 6) jpg = Buffer.from((await send("Page.captureScreenshot", { format: "jpeg", quality: q })).data, "base64");
  fs.writeFileSync(new URL(file, OUT), jpg);
  console.log(file, Math.round(jpg.length / 1024) + " KB");
}

/** @type {Record<string, string>} */
const firsts = {}; // each cup's first hole: its card's shot, and the home page's
for (const slot of HOLES) {
  const [world, n] = slot.split("/");
  const s = await shoot(slot);
  known[slot] = { name: s.name, par: s.par };
  if (n === "1" && CUPS.includes(world)) firsts[world] = s.img;
  await card(s.img, `${cupName(world)} · hole ${n}`, s.name, `par ${s.par}`, `${world}-${n}.jpg`);
}
fs.writeFileSync(NAMES, JSON.stringify(Object.fromEntries(ALL.filter((s) => known[s]).map((s) => [s, known[s]])), null, 1) + "\n"); // in the course's order
if (CUPS.every((c) => firsts[c])) { // (npm run og -- garden/1 island/1 town/1 mountain/1: just these)
  for (const c of CUPS) await card(firsts[c], `${ALL.filter((s) => s.startsWith(c + "/")).length} holes`, cupName(c), "", `${c}.jpg`);
}
// the home page: the title screen as a poster, the badge its hero over the
// island's sky, the course only a soft backdrop
const still = "data:image/webp;base64," + fs.readFileSync(new URL("public/title/island.webp", WEB)).toString("base64");
await render(`<!doctype html><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: ${W}px; height: ${H}px; overflow: hidden; position: relative; font-family: Fredoka, ui-rounded, system-ui, sans-serif;
    background: radial-gradient(circle at 50% 44%, #fff6d8 0 18%, transparent 48%), linear-gradient(180deg, #54b8f5, #b8ecff 62%, #ffe2a8); }
  .bg { position: absolute; inset: -30px; background: url(${still}) center 70% / cover; filter: blur(9px) saturate(1.1); opacity: .5;
    -webkit-mask: linear-gradient(transparent 30%, #000 75%); }
  .dots { position: absolute; inset: 0; background: radial-gradient(rgba(255,255,255,.28) 1.6px, transparent 2px) 0 0 / 18px 18px; }
  .frame { position: absolute; inset: 16px; border: 3px solid #226c57; border-radius: 10px; }
  .hero { position: absolute; inset: 0; display: grid; justify-items: center; align-content: center; gap: 4px; padding-bottom: 6px; }
  .logo { height: 430px; margin: -8px 0 -14px; }
  .tag { padding: 4px 30px 7px; font-size: 38px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: #fdf6e9;
    background: #226c57; border: 4px solid #144134; border-radius: 999px; box-shadow: 0 6px 0 #144134; transform: rotate(-2deg); }
  .line { margin-top: 14px; padding: 4px 18px 6px; font-size: 27px; font-weight: 600; color: #144134; background: #fdf6e9;
    border: 3px solid #144134; border-radius: 14px; box-shadow: 0 4px 0 #144134; }
  .line b { color: #e0524b; font-weight: 700; }
</style>
<div class="bg"></div><div class="dots"></div><div class="frame"></div>
<div class="hero"><img class="logo" src="${LOGO}"><div class="tag">Mini-golf on-chain</div>
<div class="line">Every shot computed by the chain · play free on <b>gno.land</b></div></div>`, "default.jpg");
if (b.errors.length) console.log("page errors:", b.errors.slice(0, 5));
b.kill();
process.exit(0);
