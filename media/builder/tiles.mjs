// @ts-check
// The Builder palette's pictures: every look of every Builder world (its
// palette's entries) drawn by the game's own buildHole in headless Chrome
// (web/lib/scene/piece-showcase.ts, bundled here with a pinned esbuild: no
// dependency added), one piece on a lane of its world from one fixed
// three-quarter view, a small WebP each in web/public/builder/tiles/<world>/
// (lib/builder/tiles.ts pictureOf names them; builder-tiles.test.ts holds
// every look to have one). The holes are scripts/tileholes.ts's (builder.wasm
// in Node). No dev server, no chain. Run it again after a change to the
// palette or to how a piece is drawn.
//   node media/builder/tiles.mjs [garden/post-rock …] [--sheet <dir>]
// --sheet also writes a contact sheet of each world's pictures (a JPEG), to look at.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launch, sleep } from "../lib/cdp.mjs";

const ROOT = new URL("../../", import.meta.url), WEB = new URL("web/", ROOT);
const OUT = new URL("web/public/builder/tiles/", ROOT);
/** The picture's side (shown at 64 to 72 CSS pixels, twice that on a dense screen), drawn at RENDER first; its bytes at most. */
const PX = 144, RENDER = 432, MAX_BYTES = 8000;
const args = process.argv.slice(2);
const flag = (/** @type {string} */ k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : ""; };
const sheetDir = flag("--sheet");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gnogolf-tiles-"));
// the holes: one a look, from builder.wasm in Node
const holes = path.join(tmp, "holes.json");
execFileSync("node", ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", "--import", "./test/setup.mjs", "../scripts/tileholes.ts", holes, ...args], { cwd: WEB.pathname, stdio: "inherit" });
/** @type {{ file: string, world: string, mid: [number, number], span: number, lift: number, from?: number[], state: object }[]} */
const jobs = JSON.parse(fs.readFileSync(holes, "utf8"));

// the showcase bundled for the page, with the same throw of the dice every time: a picture made twice is the same
const ENTRY = `import { makePieceShowcase } from "./web/lib/scene/piece-showcase";
let seed = 7;
Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const s = makePieceShowcase(${RENDER});
window.shot = (state, mid, span, lift, px, q, from) => ((seed = 7), s.shot(state, mid, span, lift, px, q, from));
window.ready = true;`;
const bundle = path.join(tmp, "tiles.js");
// (from stdin, its imports resolve from the working directory: the repo's root)
execFileSync("npx", ["--yes", "esbuild@0.24.2", "--bundle", "--format=iife", "--sourcefile=tiles.js", `--outfile=${bundle}`, "--log-level=warning", "--define:process.env.NODE_ENV=\"production\""], {
  input: ENTRY, stdio: ["pipe", "inherit", "inherit"], cwd: ROOT.pathname,
});

const b = await launch({ width: 600, height: 600 });
await b.send("Page.navigate", { url: "about:blank" });
await sleep(300);
await b.js(fs.readFileSync(bundle, "utf8") + ";1");
if (!(await b.ev("window.ready"))) throw new Error(`the showcase did not start: ${b.errors.slice(0, 3)}`);

/** A job's WebP at the best quality that keeps under MAX_BYTES. @param {typeof jobs[number]} j */
async function webp(j) {
  let out = Buffer.alloc(0);
  for (let q = 0.86; q >= 0.3; q -= 0.06) {
    const url = await b.js(`shot(${JSON.stringify(j.state)}, ${JSON.stringify(j.mid)}, ${j.span}, ${j.lift}, ${PX}, ${q.toFixed(2)}, ${JSON.stringify(j.from)})`);
    out = Buffer.from(url.split(",")[1], "base64");
    if (out.length <= MAX_BYTES) break;
  }
  return out;
}

let bytes = 0, most = 0;
for (const j of jobs) {
  const img = await webp(j), file = new URL(j.file, OUT);
  fs.mkdirSync(new URL("./", file), { recursive: true });
  fs.writeFileSync(file, img);
  bytes += img.length;
  most = Math.max(most, img.length);
}
console.log(`${jobs.length} pictures, ${Math.round(bytes / 1024)} KB, ${Math.round(bytes / Math.max(1, jobs.length))} B each on average, ${most} B at most`);
if (b.errors.length) console.log("page errors:", b.errors.slice(0, 5));

if (sheetDir) {
  // a sheet a world: every picture, its file under it
  fs.mkdirSync(sheetDir, { recursive: true });
  const { frameTree } = await b.send("Page.getFrameTree");
  for (const world of [...new Set(jobs.map((j) => j.world))]) {
    const mine = jobs.filter((j) => j.world === world), rows = Math.ceil(mine.length / 10);
    await b.send("Emulation.setDeviceMetricsOverride", { width: 10 * 150, height: rows * 170, deviceScaleFactor: 1, mobile: false });
    const cells = mine.map((j) => `<figure><img src="data:image/webp;base64,${fs.readFileSync(new URL(j.file, OUT)).toString("base64")}"><figcaption>${j.file.split("/")[1].replace(".webp", "")}</figcaption></figure>`).join("");
    await b.send("Page.setDocumentContent", { frameId: frameTree.frame.id, html: `<style>body{margin:0;display:grid;grid-template-columns:repeat(10,150px);font:11px system-ui;background:#fff}figure{margin:0;width:150px;height:170px;overflow:hidden}img{width:144px;height:144px;margin:3px}figcaption{white-space:nowrap;overflow:hidden;padding:0 4px}</style>${cells}` });
    await sleep(500);
    const jpg = Buffer.from((await b.send("Page.captureScreenshot", { format: "jpeg", quality: 82 })).data, "base64");
    fs.writeFileSync(path.join(sheetDir, `${world}.jpg`), jpg);
  }
  console.log(`contact sheets in ${sheetDir}`);
}
b.kill();
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(0);
