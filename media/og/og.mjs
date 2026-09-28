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
const ALL = fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").split("\n").filter(Boolean).map((l) => l.split(" ")[0]);
const named = process.argv.slice(2);
const HOLES = named.length ? ALL.filter((s) => named.includes(s)) : ALL;
fs.mkdirSync(OUT, { recursive: true });

/** @type {Record<string, { name: string, par: number }>} */
const known = fs.existsSync(NAMES) ? JSON.parse(fs.readFileSync(NAMES, "utf8")) : {};
// a cup's name as the game calls it (web/lib/card.ts CUP_NAMES), the extras by their world
/** @type {Record<string, string>} */
const CUP_NAMES = { garden: "Garden Cup", island: "Island Cup", town: "Mushroom Town", mountain: "Mountain Cup" };
const CUPS = Object.keys(CUP_NAMES);
const cupName = (/** @type {string} */ w) => CUP_NAMES[w] || w[0].toUpperCase() + w.slice(1);
// the game's own font, as the app serves it (its origin is the page's: the app's)
const FONT = `@font-face { font-family: Fredoka; src: url(${APP}/fonts/fredoka.woff2) format("woff2"); font-weight: 300 700; font-display: block; }`;
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
// with room for all of its shadow (its soft drop reaches ~56px under it), so nothing is cut square;
// the cards size the art itself, whatever that margin (LOGO_W, LOGO_H: its box in the picture)
const M = { x: 32, top: 16, bottom: 56 };
const LOGO = await png({ clip: { x: r.x - M.x, y: r.y - M.top, width: r.width + 2 * M.x, height: r.height + M.top + M.bottom, scale: 2 } });
const LOGO_W = (w) => `width: ${Math.round((w * (r.width + 2 * M.x)) / r.width)}px; margin: ${-Math.round((w * M.top) / r.width)}px ${-Math.round((w * M.x) / r.width)}px 0;`;
const LOGO_H = (h) => `height: ${Math.round((h * (r.height + M.top + M.bottom)) / r.height)}px; margin: ${-Math.round((h * M.top) / r.height)}px 0 ${-Math.round((h * M.bottom) / r.height)}px;`;
await send("Emulation.setDefaultBackgroundColorOverride", {});

/** The hole in the Far view, by day, the HUD hidden: its image, name, par. */
async function shoot(/** @type {string} */ slot) {
  await send("Page.navigate", { url: `${APP}/?play&camlog&og&weather=clear&hole=${slot}` });
  for (let i = 0; i < 150; i++) { await sleep(300); if (await ev(`!!(window.__g&&window.__g.farOrbit()&&document.querySelector('.cam-btn'))`)) break; }
  if (!(await ev(`!!(window.__g&&window.__g.farOrbit())`))) throw new Error(`${slot} did not load ${b.errors.slice(-2)}`);
  for (let i = 0; i < 30; i++) { await sleep(200); if (await ev(`window.__g.boardFrame().view === "ball" && !window.__g.cam?.gliding?.()`)) break; }
  const name = await js(`document.querySelector(".card--hole h1").textContent`);
  const par = Number(/\d+/.exec(await js(`document.querySelector(".card__par").textContent`))?.[0]) || 3; // "par 3 · last 4": the first number
  await js(`(() => { const s = document.createElement("style"); s.textContent = "#stage ~ *, nextjs-portal { display: none !important; }"; document.head.append(s); })()`);
  await ev(`window.__g.setCam("far")`);
  await sleep(2400);
  return { img: await png(), name, par };
}

/** A card: the shot, the logo, and a label (eyebrow, title, chip). */
async function card(/** @type {string} */ img, /** @type {string} */ eyebrow, /** @type {string} */ title, /** @type {string} */ chip, /** @type {string} */ file) {
  const html = `<!doctype html><meta charset="utf-8">
<style>
  ${FONT}
  :root { --paper: #fdf6e9; --ink: #144134; --green: #226c57; --hat: #e0524b; --gold: #f2c14e; }
  * { box-sizing: border-box; margin: 0; }
  body { width: ${W}px; height: ${H}px; overflow: hidden; font-family: Fredoka, ui-rounded, system-ui, sans-serif; color: var(--ink);
    background: var(--paper) url(${img}) center / cover; position: relative; }
  body::after { content: ""; position: absolute; inset: 0; background: linear-gradient(0deg, rgba(20,65,52,.28), transparent 38%); }
  .logo { position: absolute; right: 34px; top: 26px; z-index: 1; ${LOGO_W(206)} } /* the corner opposite the label */
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
// the home page: the trailer's end card, the badge over golden rays and
// sparkles, and the one thing to do, big
const STAR = (x, y, s, rot = 0) => `<svg class="star" style="left:${x}px;top:${y}px;width:${s}px;height:${s}px;transform:rotate(${rot}deg)" viewBox="-11 -11 22 22"><path d="M0-10Q1.8-1.8 10 0Q1.8 1.8 0 10Q-1.8 1.8-10 0Q-1.8-1.8 0-10Z" fill="#fffaf0" stroke="#144134" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
await render(`<!doctype html><meta charset="utf-8">
<style>
  ${FONT}
  * { box-sizing: border-box; margin: 0; }
  body { width: ${W}px; height: ${H}px; overflow: hidden; position: relative; font-family: Fredoka, ui-rounded, system-ui, sans-serif;
    background: radial-gradient(circle at 50% 36%, #fff8e2 0 16%, #f8e6bb 52%, #ecd49c 100%); }
  .rays { position: absolute; left: 50%; top: 36%; width: 2000px; height: 2000px; margin: -1000px 0 0 -1000px;
    background: repeating-conic-gradient(rgba(255,252,240,.6) 0deg 3deg, transparent 3deg 15deg);
    -webkit-mask-image: radial-gradient(circle, #000 8%, rgba(0,0,0,.5) 24%, transparent 46%); }
  .dots { position: absolute; inset: 0; background-image: radial-gradient(circle, rgba(34,108,87,.35) 1.6px, transparent 2.2px); background-size: 16px 16px;
    -webkit-mask-image: linear-gradient(to top, #000 8%, transparent 55%); }
  .frame { position: absolute; inset: 16px; border: 3px solid #226c57; border-radius: 12px; }
  .hero { position: absolute; inset: 0; display: grid; justify-items: center; align-content: center; gap: 14px; padding-bottom: 8px; }
  .logo { ${LOGO_H(318)} }
  .cta { margin-top: 6px; font-weight: 700; font-size: 46px; letter-spacing: .02em; color: #fdf6e9; background: #226c57;
    border: 5px solid #144134; border-radius: 20px; padding: 6px 42px 10px; box-shadow: 0 8px 0 #144134; }
  .sub { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 25px; color: #fdf6e9; background: #226c57;
    border: 4px solid #144134; border-radius: 999px; padding: 5px 24px 7px; box-shadow: 0 5px 0 #144134; }
  .star { position: absolute; }
</style>
<div class="rays"></div><div class="dots"></div><div class="frame"></div>
${STAR(360, 70, 44, -8)}${STAR(820, 96, 36, 12)}${STAR(330, 262, 64, 6)}${STAR(846, 250, 30, -14)}
<div class="hero"><img class="logo" src="${LOGO}">
<div class="cta">PLAY ON GNO.LAND</div>
<div class="sub">Free to play · Your records on-chain</div></div>`, "default.jpg");
if (b.errors.length) console.log("page errors:", b.errors.slice(0, 5));
b.kill();
process.exit(0);
