// @ts-check
// Every gnome of data/gnomes.json drawn by the game's own makeBall in
// headless Chrome (web/lib/scene/gnome-showcase.ts, bundled here with a
// pinned esbuild: no dependency added), a three-quarter view on his
// tier's plinth: a 256-pixel WebP each, under 10 KB, in media/gnomes/thumbs/,
// and a turntable of each Legendary (an animated WebP, his piece moving) in
// media/gnomes/turntables/. No dev server, no chain.
//   npm run gnomes:thumbs [-- 104 720 | --tier legendary] [--sheet <dir>]
// --sheet also writes contact sheets of what was drawn (a page of 48 a JPEG), to look at.
import fs from "node:fs";
import path from "node:path";
import { bundledPage, SEEDED, sheet, webpUnder } from "../lib/page.mjs";
import { animate } from "./webp.mjs";

const HERE = new URL("./", import.meta.url), ROOT = new URL("../../", import.meta.url);
const THUMBS = new URL("thumbs/", HERE), TURNS = new URL("turntables/", HERE);
const PX = 256, MAX_BYTES = 10_000, TURN_FRAMES = 36, TURN_MS = 90;
const args = process.argv.slice(2);
const flag = (/** @type {string} */ k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : ""; };
const tier = flag("--tier"), sheetDir = flag("--sheet");
const ids = args.map(Number).filter(Boolean);

/** @type {{ gnomes: { id: number, tier: string, name: string, skin: object }[] }} */
const catalogue = JSON.parse(fs.readFileSync(new URL("data/gnomes.json", ROOT), "utf8"));
const todo = catalogue.gnomes.filter((g) => (!ids.length || ids.includes(g.id)) && (!tier || g.tier === tier));

// the game's showcase (web/lib/scene/gnome-showcase.ts) bundled for the page, with the
// same throw of the dice every time: a thumbnail made twice is the same picture
const ENTRY = `import { makeShowcase } from "./web/lib/scene/gnome-showcase";
${SEEDED}
const s = makeShowcase(512);
window.show = (skin, tier) => ((seed = 7), s.show(skin, tier));
window.shot = s.shot;
window.ready = true;`;
// (its imports resolve from the repo's root)
const b = await bundledPage(ENTRY, { cwd: ROOT.pathname, name: "showcase.js", motion: true, width: 600, height: 600 });

/** The page's WebP at the best quality that keeps under max. @param {string} expr a call returning a data URL, Q in it */
const webp = (expr, max = MAX_BYTES) => webpUnder((q) => b.js(expr.replace("Q", q)), max, 0.9);

fs.mkdirSync(THUMBS, { recursive: true });
fs.mkdirSync(TURNS, { recursive: true });
let bytes = 0, over = 0;
for (const g of todo) {
  await b.js(`show(${JSON.stringify(g.skin)}, ${JSON.stringify(g.tier)})`);
  const img = await webp(`shot(${PX}, Q, 0, 0)`);
  fs.writeFileSync(new URL(`${g.id}.webp`, THUMBS), img);
  bytes += img.length;
  if (img.length > MAX_BYTES) over++;
  if (g.tier === "legendary") {
    // a turn about himself, his piece going on with its own motion
    const frames = [];
    for (let k = 0; k < TURN_FRAMES; k++) frames.push(await webp(`shot(${PX}, Q, ${k * TURN_MS}, ${(k / TURN_FRAMES) * Math.PI * 2})`, 9000));
    const anim = animate(frames, PX, PX, TURN_MS);
    fs.writeFileSync(new URL(`${g.id}.webp`, TURNS), anim);
    console.log(`#${g.id} ${g.name}: turntable ${Math.round(anim.length / 1024)} KB`);
  }
}
console.log(`${todo.length} thumbnails, ${Math.round(bytes / 1024)} KB, ${Math.round(bytes / Math.max(1, todo.length))} B each on average${over ? `, ${over} over ${MAX_BYTES} B` : ""}`);
if (b.errors.length) console.log("page errors:", b.errors.slice(0, 5));

if (sheetDir) {
  // contact sheets: 48 a page, the id and name under each
  fs.mkdirSync(sheetDir, { recursive: true });
  for (let p = 0; p * 48 < todo.length; p++) {
    const cells = todo.slice(p * 48, p * 48 + 48).map((g) => `<figure><img src="data:image/webp;base64,${fs.readFileSync(new URL(`${g.id}.webp`, THUMBS)).toString("base64")}"><figcaption>#${g.id} ${g.name}</figcaption></figure>`).join("");
    const jpg = await sheet(b, `<style>body{margin:0;display:grid;grid-template-columns:repeat(8,150px);font:10px system-ui;background:#fff}figure{margin:0;width:150px;height:172px;overflow:hidden}img{width:150px;height:150px}figcaption{white-space:nowrap;overflow:hidden;padding:2px 4px}</style>${cells}`, 8 * 150, 6 * 172, 80);
    fs.writeFileSync(path.join(sheetDir, `sheet-${String(p + 1).padStart(2, "0")}.jpg`), jpg);
  }
  console.log(`contact sheets in ${sheetDir}`);
}
b.kill();
process.exit(0);
