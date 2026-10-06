// @ts-check
// The mockups' screenshots, in screens/, their index (index.html), and an
// audit of every page and state at 320, 390, 768 and 1280 px wide: the page
// never scrolls sideways, nothing runs off the screen, no two controls
// overlap, body text is 15 px at least on a phone, and text meets WCAG's AA
// contrast (AAA for small text on the Legendary's night). One headless
// Chrome (media/lib/cdp.mjs, no new dependency), from a server on the repo.
//
//   node docs/superpowers/mockups/shoot.mjs            every shot, the index and the audit
//   node docs/superpowers/mockups/shoot.mjs gnome-buy  one page's shots and audit, and the index
//   AUDIT=0 node docs/superpowers/mockups/shoot.mjs    the shots alone
// Exits non-zero when the audit finds anything.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { launch, sleep } from "../../../media/lib/cdp.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, "../../..");
const OUT = path.join(HERE, "screens");

/** @typedef {{ width: number, height: number, scale: number, mobile: boolean, tag?: string }} Size */
const DESK = /** @type {Size} */ ({ width: 1440, height: 900, scale: 1, mobile: false });
const PHONE = /** @type {Size} */ ({ width: 390, height: 844, scale: 2, mobile: true, tag: "phone" });
const CARD = /** @type {Size} */ ({ width: 1200, height: 630, scale: 1, mobile: false });
const SQUARE = /** @type {Size} */ ({ width: 1080, height: 1080, scale: 1, mobile: false });
/** a 13" laptop and a small one: the Builder's own sizes */
const MID = /** @type {Size} */ ({ width: 1280, height: 800, scale: 1, mobile: false, tag: "1280" });
const LAPTOP = /** @type {Size} */ ({ width: 1024, height: 700, scale: 1, mobile: false, tag: "1024" });
/** the widths every state is audited at */
const AUDIT = [320, 390, 768, 1280];
/** the Builder's computer screens: never under 900 px (a phone gets builder-phone.html) */
const DESKTOP = [1024, 1280, 1440];
/** @typedef {[string, Size]} Shot a state ("" the page's default) and a size */

/** the pages, in the spec's order (docs/superpowers/specs/2026-10-06-gui-design.md); audit: false for a picture, not a screen */
const PAGES = /** @type {{ page: string, title: string, shots: Shot[], audit?: boolean, widths?: number[] }[]} */ ([
  { page: "gnomes-gallery", title: "A1 · The gallery", shots: [["", DESK], ["", PHONE], ["teaser", DESK], ["players", DESK], ["soldout", DESK], ["closed", DESK], ["closed", PHONE], ["loading", DESK], ["empty", DESK], ["error", DESK]] },
  { page: "gnome-detail", title: "A2 · A gnome's page", shots: [["", DESK], ["", PHONE], ["nowallet", DESK], ["locked", DESK], ["cap", DESK], ["mine", DESK], ["taken", DESK], ["later", PHONE], ["nevermade", DESK]] },
  { page: "gnome-buy", title: "A3 · Buying", shots: [["", DESK], ["", PHONE], ["connect", DESK], ["nowallet", DESK], ["elsewhere", PHONE], ["network", DESK], ["short", DESK], ["pending", DESK], ["reading", DESK], ["success", DESK], ["success", PHONE], ["taken", DESK], ["cancelled", DESK], ["unsure", DESK]] },
  { page: "gnome-auction", title: "A4 · A Legendary's auction", shots: [["", DESK], ["", PHONE], ["outbid", DESK], ["leading", DESK], ["extended", DESK], ["ended", DESK], ["won", DESK], ["nobid", DESK], ["upcoming", DESK]] },
  { page: "gnome-locker", title: "A5 · The picker's shelf", shots: [["", DESK], ["", PHONE], ["many", DESK], ["many", PHONE], ["nowallet", DESK], ["locked", DESK]] },
  { page: "collection", title: "A6 · My gnomes, their gnomes", shots: [["", DESK], ["", PHONE], ["few", DESK], ["one", DESK], ["one", PHONE], ["empty", DESK], ["theirs", DESK], ["theirs", PHONE]] },
  { page: "gnome-places", title: "A7 · Where the gnomes show in play", shots: [["", DESK]], audit: false },
  { page: "share", title: "A8 · Share moments", shots: [["", DESK], ["", PHONE], ["equipped", DESK], ["bidding", DESK], ["won", PHONE], ["team", DESK], ["published", DESK], ["clip", DESK]] },
  { page: "share-card", title: "A8 · Share cards", shots: [["", CARD], ["square", SQUARE], ["auction", CARD], ["reveal", CARD], ["team", CARD], ["hole", CARD]], audit: false },
  { page: "builder-editor", title: "B2 · The editor", widths: DESKTOP, shots: [["", DESK], ["", MID], ["", LAPTOP], ["empty", DESK], ["place", DESK], ["invalid", DESK], ["issues", DESK], ["issues", LAPTOP], ["timed", DESK], ["proved", DESK], ["world", DESK]] },
  { page: "builder-test", title: "B3 · Test", widths: DESKTOP, shots: [["", DESK], ["", LAPTOP], ["proved", DESK], ["missed", DESK]] },
  { page: "builder-publish", title: "B4 · Publish", widths: DESKTOP, shots: [["", DESK], ["", LAPTOP], ["refused", DESK], ["newer", DESK], ["closed", DESK], ["pending", DESK], ["done", DESK]] },
  { page: "builder-phone", title: "B6 · The Builder on a phone", shots: [["", PHONE], ["community", PHONE]] },
  { page: "builder-holes", title: "B5 · Your holes, the community's", shots: [["", DESK], ["", PHONE], ["community", DESK], ["community", PHONE], ["empty", DESK]] },
]);
const nameOf = (/** @type {string} */ page, /** @type {string} */ state, /** @type {Size} */ size) => `${page}${state ? `-${state}` : ""}${size.tag ? `-${size.tag}` : ""}.webp`;
const urlOf = (/** @type {number} */ port, /** @type {string} */ page, /** @type {string} */ state) => `http://127.0.0.1:${port}/docs/superpowers/mockups/${page}.html${state ? `?state=${state}` : ""}`;

// a static server on the repo: the mockups reach the game's font and stills by relative paths
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url || "/", "http://x").pathname));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[/** @type {keyof typeof TYPES} */ (path.extname(file))] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", () => r(undefined)));
const port = /** @type {import("node:net").AddressInfo} */ (server.address()).port;

const b = await launch(DESK);
async function open(/** @type {string} */ url, /** @type {Size} */ size) {
  await b.send("Emulation.setDeviceMetricsOverride", { width: size.width, height: size.height, deviceScaleFactor: size.scale, mobile: size.mobile });
  await b.send("Page.navigate", { url });
  await sleep(1400); // the font, the images, the iframe behind a sheet
  // the motion stopped where it rests, so a shot is the same every run (an endless one goes back to its rest)
  await b.ev(`document.getAnimations().forEach((a) => { try { a.finish(); } catch { a.cancel(); } })`);
}

// the audit, run in the page: what it finds, as sentences
const CHECK = `(() => {
  const out = [], W = document.documentElement.clientWidth, phone = W <= 600;
  if (document.documentElement.scrollWidth > W) out.push("the page scrolls sideways: " + document.documentElement.scrollWidth + " > " + W);
  const seen = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !el.closest("[aria-hidden=true], details:not([open]) > :not(summary), .behind"); };
  // a box that scrolls in itself holds what runs past its edge: only the page's own edge counts
  const scroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") return true; } return false; };
  const name = (el) => (el.getAttribute("aria-label") || el.textContent || el.className || el.tagName).trim().replace(/\\s+/g, " ").slice(0, 40);
  for (const el of document.querySelectorAll("body *")) {
    if (!seen(el) || el.closest("svg")) continue;
    const r = el.getBoundingClientRect();
    if ((r.right > W + 1 || r.left < -1) && !scroller(el) && getComputedStyle(el).position !== "fixed") out.push("off the screen: " + name(el));
  }
  // two controls on top of each other
  const ctl = [...document.querySelectorAll("button, a[href], input, textarea, summary")].filter(seen);
  for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
    const a = ctl[i], c = ctl[j]; if (a.contains(c) || c.contains(a)) continue;
    const p = a.getBoundingClientRect(), q = c.getBoundingClientRect();
    const x = Math.min(p.right, q.right) - Math.max(p.left, q.left), y = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
    if (x > 3 && y > 3) out.push("controls overlap: " + name(a) + " / " + name(c));
  }
  // text: its size on a phone, its contrast on what is under it
  const rgb = (c) => (c.match(/[\\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const under = (el) => { for (let p = el; p; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.backgroundImage !== "none" && !/radial-gradient/.test(cs.backgroundImage)) return null; const c = rgb(cs.backgroundColor); if (c.length === 3 || (c.length === 4 && c[3] > .9)) return c.slice(0, 3); } return [255, 255, 255]; };
  for (const el of document.querySelectorAll("body *")) {
    if (!seen(el) || el.closest("svg, .card, .board, .preview, .shot, iframe")) continue;
    const text = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!text) continue;
    const cs = getComputedStyle(el), size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700;
    if (parseFloat(cs.webkitTextStrokeWidth) > 0) continue; // inked display text: its outline is its contrast
    if (phone && el.matches("p, li, dd, summary, .lead, .fine, .note, .words") && size < 15 && cs.textTransform !== "uppercase") out.push("small text on a phone (" + size + " px): " + name(el));
    const bg = under(el); if (!bg) continue;
    const fg = rgb(cs.color), alpha = fg.length === 4 ? fg[3] : 1, op = parseFloat(cs.opacity);
    if (alpha < 1 || op < 1) continue; // see-through text is decoration here (a disabled control, a dim tag)
    if (el.closest("[disabled]")) continue;
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
    const large = size >= 24 || (size >= 18.66 && bold);
    const night = lum(bg) < .1 && !large; // small text on the night (the Legendary's): AAA
    const need = night ? 7 : large ? 3 : 4.5;
    if (ratio < need) out.push("contrast " + ratio.toFixed(2) + " < " + need + ": " + name(el));
  }
  return [...new Set(out)];
})()`;

const only = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
let found = 0;
for (const { page, shots, audit = true, widths = AUDIT } of PAGES) {
  if (only && page !== only) continue;
  for (const [state, size] of shots) {
    await open(urlOf(port, page, state), size);
    const { data } = await b.send("Page.captureScreenshot", { format: "webp", quality: 82 }); // (a tenth of a PNG)
    fs.writeFileSync(path.join(OUT, nameOf(page, state, size)), Buffer.from(data, "base64"));
    console.log(nameOf(page, state, size));
  }
  if (!audit || process.env.AUDIT === "0") continue;
  for (const state of [...new Set(shots.map(([st]) => st))]) {
    for (const width of widths) {
      await open(urlOf(port, page, state), { width, height: width < 600 ? 800 : 900, scale: 1, mobile: width < 600 });
      const issues = /** @type {string[]} */ ((await b.ev(CHECK)) || []);
      for (const i of issues) console.error(`  ✗ ${page}${state ? `?state=${state}` : ""} @${width}: ${i}`);
      found += issues.length;
    }
  }
}
if (b.errors.length) console.error("page errors:", b.errors);
b.kill();
server.close();

// the index: every page's shots, each a link to its live state
const esc = (/** @type {string} */ s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const sections = PAGES.map(({ page, title, shots }) => `<section><h2>${esc(title)} <a href="${page}.html">${page}.html</a></h2><div class="shots">${shots
  .map(([state, size]) => `<a class="${size.tag || (size === SQUARE ? "square" : "")}" href="${page}.html${state ? `?state=${state}` : ""}"><img src="screens/${nameOf(page, state, size)}" alt="${esc(`${title}, ${state || "default"}${size.tag ? `, ${size.tag}` : ""}`)}" loading="lazy"><span>${state || "default"}${size.tag ? ` · ${size.tag}` : ""}</span></a>`)
  .join("")}</div></section>`).join("\n");
fs.writeFileSync(path.join(HERE, "index.html"), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mockups · Gnogolf</title>
<link rel="stylesheet" href="kit.css">
<!-- written by shoot.mjs: edit PAGES there, not this file -->
<style>
  body { padding: 28px clamp(16px, 4vw, 48px) 60px; background: var(--paper); }
  h1 { margin: 0 0 4px; font-size: 34px; }
  body > p { margin: 0 0 24px; color: var(--ink-soft); max-width: 760px; line-height: 1.5; font-size: 15px; }
  section { margin: 0 0 30px; }
  h2 { margin: 0 0 10px; font-size: 20px; } h2 a { margin-left: 8px; font-size: 14px; color: var(--green); }
  .shots { display: flex; flex-wrap: wrap; gap: 14px; }
  .shots a { display: grid; gap: 4px; width: min(288px, 100%); color: var(--ink); text-decoration: none; font-size: 14px; font-weight: 700; }
  .shots a.phone { width: 104px; } .shots a.square { width: 160px; }
  .shots img { width: 100%; border: var(--edge); border-radius: 10px; box-shadow: var(--shadow-btn); background: var(--white); }
</style>
</head>
<body>
<h1>Gnomes and the Builder: the mockups</h1>
<p>Static pages on the game's own font and tokens (kit.css), for docs/superpowers/specs/2026-10-06-gui-design.md. Each picture opens its page in that state; every page lists its states at its top (?state=). The gnomes' art is the picker's 14 renders standing in for the catalogue's.</p>
${sections}
</body>
</html>
`);
console.log("index.html");
if (found) (console.error(`the audit found ${found} issue(s)`), (process.exitCode = 1));
