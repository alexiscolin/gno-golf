// @ts-check
// Every gnome of data/gnomes.json drawn by the game's own makeBall in
// headless Chrome (web/lib/scene/gnome-showcase.ts, bundled here with a
// pinned esbuild: no dependency added), a three-quarter view on his
// tier's plinth: a 256-pixel WebP each, under 10 KB, in media/gnomes/thumbs/,
// and a turntable of each Legendary (an animated WebP, his piece moving) in
// media/gnomes/turntables/. No dev server, no chain.
//   npm run gnomes:thumbs [-- 104 720 | --tier legendary] [--sheet <dir>]
// --sheet also writes contact sheets of what was drawn (a page of 48 a JPEG), to look at.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launch, sleep } from "../lib/cdp.mjs";
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
let seed = 7;
Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const s = makeShowcase(512);
window.show = (skin, tier) => ((seed = 7), s.show(skin, tier));
window.shot = s.shot;
window.ready = true;`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gnogolf-gnomes-"));
const bundle = path.join(tmp, "showcase.js");
// (from stdin, its imports resolve from the working directory: the repo's root)
execFileSync("npx", ["--yes", "esbuild@0.24.2", "--bundle", "--format=iife", "--sourcefile=showcase.js", `--outfile=${bundle}`, "--log-level=warning"], {
  input: ENTRY, stdio: ["pipe", "inherit", "inherit"], cwd: ROOT.pathname,
});

const b = await launch({ width: 600, height: 600 });
// headless Chrome asks for less motion: the game would draw no trail
await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
await b.send("Page.navigate", { url: "about:blank" });
await sleep(300);
await b.js(fs.readFileSync(bundle, "utf8") + ";1");
if (!(await b.ev("window.ready"))) throw new Error(`the showcase did not start: ${b.errors.slice(0, 3)}`);

/** The page's WebP at the best quality that keeps under MAX_BYTES. @param {string} expr a call returning a data URL, Q in it */
async function webp(expr, max = MAX_BYTES) {
  let out = Buffer.alloc(0);
  for (let q = 0.9; q >= 0.3; q -= 0.06) {
    out = Buffer.from((await b.js(expr.replace("Q", q.toFixed(2)))).split(",")[1], "base64");
    if (out.length <= max) break;
  }
  return out;
}

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
  const { frameTree } = await b.send("Page.getFrameTree");
  await b.send("Emulation.setDeviceMetricsOverride", { width: 8 * 150, height: 6 * 172, deviceScaleFactor: 1, mobile: false });
  for (let p = 0; p * 48 < todo.length; p++) {
    const cells = todo.slice(p * 48, p * 48 + 48).map((g) => `<figure><img src="data:image/webp;base64,${fs.readFileSync(new URL(`${g.id}.webp`, THUMBS)).toString("base64")}"><figcaption>#${g.id} ${g.name}</figcaption></figure>`).join("");
    await b.send("Page.setDocumentContent", { frameId: frameTree.frame.id, html: `<style>body{margin:0;display:grid;grid-template-columns:repeat(8,150px);font:10px system-ui;background:#fff}figure{margin:0;width:150px;height:172px;overflow:hidden}img{width:150px;height:150px}figcaption{white-space:nowrap;overflow:hidden;padding:2px 4px}</style>${cells}` });
    await sleep(400);
    const jpg = Buffer.from((await b.send("Page.captureScreenshot", { format: "jpeg", quality: 80 })).data, "base64");
    fs.writeFileSync(path.join(sheetDir, `sheet-${String(p + 1).padStart(2, "0")}.jpg`), jpg);
  }
  console.log(`contact sheets in ${sheetDir}`);
}
b.kill();
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(0);
