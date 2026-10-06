// @ts-check
// The mockups' screenshots, in screens/, and their index (index.html): every
// page and state of PAGES, at a laptop's size or a phone's, taken by one
// headless Chrome (media/lib/cdp.mjs, no new dependency) from a server on
// this folder's repo, started here.
//
//   node docs/superpowers/mockups/shoot.mjs            every shot, and the index
//   node docs/superpowers/mockups/shoot.mjs gnome-buy  the shots of one page, and the index
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { launch, sleep } from "../../../media/lib/cdp.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, "../../..");
const OUT = path.join(HERE, "screens");

const DESK = { width: 1440, height: 900, scale: 1, mobile: false };
const PHONE = { width: 390, height: 844, scale: 2, mobile: true };
/** @typedef {[string, typeof DESK]} Shot a state ("" the page's default) and a size */

/** the pages, in the spec's order (docs/superpowers/specs/2026-10-06-gui-design.md) */
const PAGES = /** @type {{ page: string, title: string, shots: Shot[] }[]} */ ([
  { page: "gnomes-gallery", title: "A1 · The gallery", shots: [["", DESK], ["", PHONE], ["players", DESK], ["soldout", DESK], ["teaser", DESK], ["loading", DESK], ["empty", DESK], ["error", DESK]] },
  { page: "gnome-detail", title: "A2 · A gnome's page", shots: [["", DESK], ["", PHONE], ["nowallet", DESK], ["mine", DESK], ["taken", DESK], ["locked", DESK], ["cap", DESK], ["later", PHONE]] },
  { page: "gnome-buy", title: "A3 · Buying", shots: [["", DESK], ["", PHONE], ["connect", DESK], ["nowallet", DESK], ["elsewhere", PHONE], ["network", DESK], ["short", DESK], ["pending", DESK], ["reading", DESK], ["success", DESK], ["success", PHONE], ["taken", DESK], ["cancelled", DESK], ["unsure", DESK]] },
  { page: "gnome-auction", title: "A4 · A Legendary's auction", shots: [["", DESK], ["", PHONE], ["outbid", DESK], ["leading", DESK], ["extended", DESK], ["ended", DESK], ["won", DESK], ["nobid", DESK], ["upcoming", DESK]] },
  { page: "gnome-locker", title: "A5 · The picker's shelf", shots: [["", DESK], ["", PHONE], ["nowallet", DESK], ["locked", DESK]] },
  { page: "gnome-places", title: "A6 · Where the gnomes show in play", shots: [["", DESK]] },
  { page: "builder-editor", title: "B1 · The editor", shots: [["", DESK], ["timed", DESK], ["issues", DESK], ["proved", DESK], ["touch", PHONE]] },
  { page: "builder-test", title: "B2 · Test mode", shots: [["", DESK], ["proved", DESK], ["missed", DESK]] },
  { page: "builder-publish", title: "B3 · Publishing", shots: [["", DESK], ["refused", DESK], ["checks", DESK], ["newer", DESK], ["cost", DESK], ["pending", DESK], ["done", DESK], ["closed", DESK]] },
  { page: "builder-holes", title: "B4 · Your holes, the community's", shots: [["", DESK], ["community", DESK], ["community", PHONE], ["empty", DESK]] },
]);
const nameOf = (/** @type {string} */ page, /** @type {string} */ state, /** @type {typeof DESK} */ size) => `${page}${state ? `-${state}` : ""}${size.mobile ? "-phone" : ""}.webp`;

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

const only = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const b = await launch(DESK);
for (const { page, shots } of PAGES) {
  if (only && page !== only) continue;
  for (const [state, size] of shots) {
    await b.send("Emulation.setDeviceMetricsOverride", { width: size.width, height: size.height, deviceScaleFactor: size.scale, mobile: size.mobile });
    await b.send("Page.navigate", { url: `http://127.0.0.1:${port}/docs/superpowers/mockups/${page}.html${state ? `?state=${state}` : ""}` });
    await sleep(1400); // the font, the images, the iframe behind a sheet
    // the motion stopped where it rests, so a shot is the same every run
    // (an endless one cannot finish: it goes back to its rest)
    await b.ev(`document.getAnimations().forEach((a) => { try { a.finish(); } catch { a.cancel(); } })`);
    const { data } = await b.send("Page.captureScreenshot", { format: "webp", quality: 82 }); // (a tenth of a PNG)
    fs.writeFileSync(path.join(OUT, nameOf(page, state, size)), Buffer.from(data, "base64"));
    console.log(nameOf(page, state, size));
  }
}
if (b.errors.length) console.error("page errors:", b.errors);
b.kill();
server.close();

// the index: every page's shots, each a link to its live state
const esc = (/** @type {string} */ s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const sections = PAGES.map(({ page, title, shots }) => `<section><h2>${esc(title)} <a href="${page}.html">${page}.html</a></h2><div class="shots">${shots
  .map(([state, size]) => `<a class="${size.mobile ? "phone" : ""}" href="${page}.html${state ? `?state=${state}` : ""}"><img src="screens/${nameOf(page, state, size)}" alt="${esc(`${title}, ${state || "default"}${size.mobile ? ", phone" : ""}`)}" loading="lazy"><span>${state || "default"}${size.mobile ? " · phone" : ""}</span></a>`)
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
  body > p { margin: 0 0 24px; color: var(--ink-soft); max-width: 760px; line-height: 1.5; }
  section { margin: 0 0 30px; }
  h2 { margin: 0 0 10px; font-size: 20px; } h2 a { margin-left: 8px; font-size: 13px; color: var(--green); }
  .shots { display: flex; flex-wrap: wrap; gap: 14px; }
  .shots a { display: grid; gap: 4px; width: 288px; color: var(--ink); text-decoration: none; font-size: 13px; font-weight: 700; }
  .shots a.phone { width: 104px; }
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
