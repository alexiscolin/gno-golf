// @ts-check
// The gnomes' link cards (ADR-003; GUI spec A8, "A gnome"): one 1200×630
// JPEG per gnome of data/gnomes.json in web/public/og/g/<id>.jpg, the og:image
// of his page /g/<id>/, and the gallery's, web/public/og/g.jpg. Each is a page
// of HTML laid out in the repo's headless Chrome and screenshotted, as
// media/og/og.mjs makes the holes': his tile (his thumbnail, media/gnomes/thumbs,
// on his tier's stage), his tier, name, line and wave, the game's word and his
// address. No dev server, no chain: the thumbnails and the game's font go in
// as data URIs.
//   node media/gnomes/cards.mjs --wave 1   (a wave's gnomes and the gallery's card)
//   node media/gnomes/cards.mjs [ids…]    (none: every gnome and the gallery)
// Make them again when a thumbnail, a name or a line changes.
import fs from "node:fs";
import os from "node:os";
import { launch } from "../lib/cdp.mjs";

const ROOT = new URL("../../", import.meta.url);
const WEB = new URL("web/", ROOT);
const THUMBS = new URL("media/gnomes/thumbs/", ROOT);
const OUT = new URL("public/og/g/", WEB);
const W = 1200, H = 630, Q = 80, MAX_BYTES = 60e3;

/** @typedef {"common" | "rare" | "epic" | "legendary"} Tier */
/** @typedef {{ id: number, tier: Tier, name: string, line: string, home: string, wave: number }} Gnome */
/** @type {{ gnomes: Gnome[] }} */
const catalogue = JSON.parse(fs.readFileSync(new URL("data/gnomes.json", ROOT), "utf8"));
// --wave n: the gnomes of wave n (a wave's cards are made and committed as it
// opens: a gnome's page without its card links the gallery's, app/g)
const args = process.argv.slice(2), at = args.indexOf("--wave");
const wave = at >= 0 ? Number(args.splice(at, 2)[1]) : 0;
const named = args.map(Number).filter(Boolean);
const todo = catalogue.gnomes.filter((g) => (named.length ? named.includes(g.id) : !wave || g.wave === wave));
const gallery = !named.length;
fs.mkdirSync(OUT, { recursive: true });

// The site's public address, as web/lib/site.ts takes it (NEXT_PUBLIC_SITE_URL);
// unset, the one the client is built with (web/.env.production.local), else
// the documented one (web/.env.example). Never a local dev address on a card.
/** @param {string} file */
const envSite = (file) => {
  try { return /^NEXT_PUBLIC_SITE_URL=(.+)$/m.exec(fs.readFileSync(new URL(file, WEB), "utf8"))?.[1].trim() || ""; } catch { return ""; }
};
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || envSite(".env.production.local") || envSite(".env.example") || "https://gnogolf.xyz").replace(/\/$/, "");
const HOST = SITE.replace(/^https?:\/\//, "");

// How a tier shows (web/lib/gnomes/catalogue.ts TIER_LOOK): its frame, the
// ground its thumbnail stands on, its plinth. The chip's shape (the GUI kit's
// tier icons): a disc, a diamond, a gem, a crown.
/** @type {Record<Tier, { label: string, frame: string, ground: string, plinth: string, icon: string }>} */
const TIER = {
  common: { label: "Common", frame: "#8b939a", ground: "#f3eee4", plinth: "#d9d0c0", icon: `<circle cx="8" cy="8" r="5.5"/>` },
  rare: { label: "Rare", frame: "#3f6aa8", ground: "#e4ecf7", plinth: "#bfd0ea", icon: `<path d="M8 1.5 14.5 8 8 14.5 1.5 8z"/>` },
  epic: { label: "Epic", frame: "#7a4fc0", ground: "#ede5f7", plinth: "#d3c3ec", icon: `<path d="M4 2h8l3 4-7 8.5L1 6z M1 6h14 M6 2 5 6l3 8.5L11 6l-1-4"/>` },
  legendary: { label: "Legendary", frame: "#d9962b", ground: "#fbf0d6", plinth: "#f0d79a", icon: `<path d="M1.5 5 5 8l3-5.5L11 8l3.5-3-1.5 9H3z"/>` },
};
const cap = (/** @type {string} */ s) => s.charAt(0).toUpperCase() + s.slice(1);
const esc = (/** @type {string} */ s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const thumb = (/** @type {number} */ id) => `data:image/webp;base64,${fs.readFileSync(new URL(`${id}.webp`, THUMBS)).toString("base64")}`;

// the game's font (web/public/fonts, SIL OFL) and palette (web/app/globals.css)
const FONT = `@font-face { font-family: Fredoka; src: url(data:font/woff2;base64,${fs.readFileSync(new URL("public/fonts/fredoka.woff2", WEB)).toString("base64")}) format("woff2"); font-weight: 300 700; font-display: block; }`;
const STYLE = `${FONT}
  :root { --paper: #fdf6e9; --ink: #144134; --ink-soft: #4f7a6c; --green: #226c57; --ink-rgb: 20, 65, 52;
    --gold-grad: linear-gradient(180deg, #ffe066 0%, #ffc53d 55%, #f59f1f 100%);
    --sunburst: repeating-conic-gradient(from 0deg at 50% 46%, #ffe69a 0 7.5deg, #ffd25a 7.5deg 15deg); }
  * { box-sizing: border-box; margin: 0; }
  body { width: ${W}px; height: ${H}px; overflow: hidden; position: relative; font-family: Fredoka, ui-rounded, system-ui, sans-serif; color: var(--ink);
    background: radial-gradient(circle, rgba(var(--ink-rgb), .09) 2px, transparent 2.5px) 0 0 / 18px 18px, var(--paper); }
  body::after { content: ""; position: absolute; inset: 18px; border: 4px solid var(--green); border-radius: 14px; pointer-events: none; }
  /* inked display text: paper, a thick ink outline on its drop (globals.css) */
  .inked { color: var(--paper); -webkit-text-stroke: var(--ink-w, 5px) var(--ink); paint-order: stroke fill; text-shadow: 0 var(--ink-drop, 3px) 0 var(--ink); }
  /* a gnome's tile: his thumbnail on his tier's ground, framed in ink, his tier's rim over it */
  .tile { position: relative; display: block; aspect-ratio: 1; border: 4px solid var(--ink); border-radius: 30px; overflow: hidden; background: var(--ground); }
  .tile img { display: block; width: 100%; height: 100%; }
  .tile::before { content: ""; position: absolute; inset: 0; z-index: 1; border-radius: inherit; box-shadow: inset 0 0 0 var(--rim, 0) var(--frame), inset 0 0 0 calc(var(--rim, 0px) + 2px) var(--ink); }
  .tile--common::before { box-shadow: none; }
  .tile--rare { --rim: 6px; } .tile--epic { --rim: 7px; } .tile--legendary { --rim: 8px; }
  /* a Legendary on his sunburst: his picture fades into it at its edges */
  .tile--legendary { background: var(--sunburst); }
  .tile--legendary img { -webkit-mask-image: radial-gradient(closest-side circle at 50% 50%, #000 78%, transparent 100%); }
  .word { display: block; height: 52px; width: auto; }`;

/** A tier's chip: its shape and its name, on its colour. */
const chip = (/** @type {Tier} */ t) => {
  const k = TIER[t];
  return `<span class="chip" style="background:${t === "legendary" ? "var(--gold-grad)" : k.plinth}"><svg viewBox="0 0 16 16" aria-hidden="true" style="fill:${k.frame}">${k.icon}</svg>${k.label}</span>`;
};
/** A gnome's tile, as large as its box. */
const tile = (/** @type {Gnome} */ g) =>
  `<span class="tile tile--${g.tier}" style="--ground:${TIER[g.tier].ground};--frame:${TIER[g.tier].frame}"><img src="${thumb(g.id)}" alt=""></span>`;
// the game's word, as the title draws it (title.css .title__word)
const WORD = `<svg class="word" viewBox="0 0 300 64" aria-label="Gnogolf"><defs><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fe0a8"/><stop offset=".55" stop-color="#2a9d74"/><stop offset="1" stop-color="#1c7a5a"/></linearGradient></defs>
  <text x="4" y="52" font-family="Fredoka" font-weight="700" font-size="56" letter-spacing="3" fill="url(#w)" stroke="#144134" stroke-width="5" paint-order="stroke" stroke-linejoin="round">GNOGOLF</text></svg>`;
const FOOT = (/** @type {string} */ path) =>
  `<div class="foot"><div class="brand">${WORD}<span>mini-golf on-chain</span></div><span class="addr">${esc(`${HOST}/${path}`)}</span></div>`;
const FOOT_STYLE = `
  .foot { display: grid; gap: 6px; }
  .brand { display: flex; align-items: center; gap: 14px; font-size: 24px; font-weight: 600; color: var(--green); }
  .addr { font-size: 22px; font-weight: 700; color: var(--ink-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`;

/** A gnome's card: his tile left; his tier, name, line, number and the game's word right. */
const gnomeCard = (/** @type {Gnome} */ g) => `<!doctype html><meta charset="utf-8"><style>${STYLE}${FOOT_STYLE}
  .card { position: absolute; inset: 0; display: grid; grid-template-columns: 464px 1fr; gap: 50px; padding: 72px 70px 72px 62px; align-items: center; }
  .card .tile { width: 464px; box-shadow: 0 10px 0 var(--ink); }
  .text { display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: 16px; height: 100%; min-width: 0; }
  .chip { display: inline-flex; align-items: center; gap: 8px; padding: 4px 18px 5px 11px; border: 3px solid var(--ink); border-radius: 999px;
    font-size: 21px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; }
  .chip svg { width: 23px; height: 23px; stroke: var(--ink); stroke-width: 2; stroke-linejoin: round; }
  h1 { max-width: 100%; font-size: 76px; line-height: 1.04; font-weight: 700; --ink-w: 10px; --ink-drop: 7px; padding: 4px 6px 8px 4px; margin: -4px 0 -6px -4px;
    transform: rotate(-2deg); transform-origin: left; overflow-wrap: break-word; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
  .line { font-size: 27px; font-weight: 600; line-height: 1.28; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
  .meta { font-size: 23px; font-weight: 700; color: var(--green); }
  .foot { margin-top: 8px; }
</style>
<div class="card">${tile(g)}<div class="text">${chip(g.tier)}<h1 class="inked">${esc(g.name)}</h1><p class="line">${esc(g.line)}</p>
<p class="meta">#${g.id} · Wave ${g.wave} · ${esc(cap(g.home))}</p>${FOOT(`g/${g.id}/`)}</div></div>`;

// the name as large as fits: two lines at most, no word cut, the column not overflowing
// (the line then loses a line before the name goes under 48 px); clamped with an ellipsis past that
const FIT = `(() => {
  const h = document.querySelector("h1"), t = document.querySelector(".text"), l = document.querySelector(".line");
  const over = () => h.scrollWidth > h.clientWidth + 1 || h.scrollHeight > h.clientHeight + 1 || t.scrollHeight > t.clientHeight + 1;
  for (let px = 76; px > 48 && over(); px -= 2) h.style.fontSize = px + "px";
  if (over()) l.style.webkitLineClamp = "2";
  return over() ? 0 : 1;
})()`;

/** The gallery's card: the question, a strip of tiles across the tiers, the count. */
function galleryCard() {
  // one of each tier from as many waves as can be, a Legendary in the middle
  const pick = (/** @type {Tier} */ t, /** @type {number} */ wave) => catalogue.gnomes.find((g) => g.tier === t && g.wave === wave) || catalogue.gnomes.find((g) => g.tier === t);
  const strip = /** @type {[Tier, number][]} */ ([["common", 2], ["rare", 3], ["epic", 1], ["legendary", 1], ["epic", 5], ["rare", 6], ["common", 7]]).map(([t, w]) => pick(t, w)).filter((g) => !!g);
  return `<!doctype html><meta charset="utf-8"><style>${STYLE}${FOOT_STYLE}
  .card { position: absolute; inset: 0; display: grid; justify-items: center; align-content: center; gap: 30px; padding: 56px 60px; text-align: center; }
  h1 { font-size: 84px; line-height: 1.05; font-weight: 700; --ink-w: 11px; --ink-drop: 7px; transform: rotate(-2deg); }
  .strip { display: flex; gap: 18px; align-items: center; }
  .strip .tile { width: 138px; border-width: 4px; border-radius: 20px; box-shadow: 0 6px 0 var(--ink); }
  .strip .tile--legendary { width: 168px; }
  .strip .tile--rare { --rim: 4px; } .strip .tile--epic { --rim: 5px; } .strip .tile--legendary { --rim: 6px; }
  .count { font-size: 32px; font-weight: 700; color: var(--green); }
  .foot { justify-items: center; }
</style>
<div class="card"><h1 class="inked">Who's on the ball?</h1><div class="strip">${strip.map(tile).join("")}</div>
<p class="count">${catalogue.gnomes.length} gnomes · each one of a kind</p>${FOOT("g/")}</div>`;
}

/** @typedef {Awaited<ReturnType<typeof launch>>} Browser */
/** A page laid out and screenshotted to a JPEG under MAX_BYTES; whether its text fitted. @param {Browser} b */
async function render(b, /** @type {string} */ html, /** @type {URL} */ file, fit = "") {
  const { frameTree } = await b.send("Page.getFrameTree");
  await b.send("Page.setDocumentContent", { frameId: frameTree.frame.id, html });
  await b.js(`document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode()))).then(() => 1)`);
  const fitted = fit ? await b.js(fit) : 1;
  let jpg = Buffer.alloc(0);
  for (let q = Q; q >= 50 && !(jpg.length && jpg.length <= MAX_BYTES); q -= 6) jpg = Buffer.from((await b.send("Page.captureScreenshot", { format: "jpeg", quality: q })).data, "base64");
  fs.writeFileSync(file, jpg);
  return { bytes: jpg.length, fitted: !!fitted };
}

const t0 = Date.now();
const WORKERS = Math.max(1, Math.min(6, Math.floor(os.availableParallelism() / 2), todo.length));
const queue = [...todo];
/** @type {number[]} */
const sizes = [];
/** @type {string[]} */
const clamped = [];
const browsers = await Promise.all(Array.from({ length: WORKERS }, () => launch({ width: W, height: H })));
if (gallery) {
  const r = await render(browsers[0], galleryCard(), new URL("../g.jpg", OUT));
  console.log(`g.jpg ${Math.round(r.bytes / 1024)} KB`);
}
await Promise.all(browsers.map(async (b) => {
  for (let g = queue.shift(); g; g = queue.shift()) {
    const r = await render(b, gnomeCard(g), new URL(`${g.id}.jpg`, OUT), FIT);
    sizes.push(r.bytes);
    if (!r.fitted) clamped.push(`#${g.id}`);
    if (named.length || sizes.length % 60 === 0) console.log(`${sizes.length}/${todo.length} (#${g.id} ${Math.round(r.bytes / 1024)} KB)`);
  }
}));
const errors = browsers.flatMap((b) => b.errors);
for (const b of browsers) b.kill();
const kb = (/** @type {number} */ n) => (n / 1024).toFixed(1) + " KB";
if (sizes.length) {
  const total = sizes.reduce((a, n) => a + n, 0);
  console.log(`${sizes.length} cards in ${((Date.now() - t0) / 1000).toFixed(0)} s on ${WORKERS} pages: ${kb(total)}, ${kb(Math.min(...sizes))} to ${kb(Math.max(...sizes))}, ${kb(total / sizes.length)} on average${sizes.some((n) => n > MAX_BYTES) ? `, ${sizes.filter((n) => n > MAX_BYTES).length} over ${kb(MAX_BYTES)}` : ""}`);
}
if (clamped.length) console.log(`text clamped on ${clamped.length}: ${clamped.join(" ")}`);
if (errors.length) console.log("page errors:", errors.slice(0, 5));
process.exit(0);
