// @ts-check
// Does the realm's portrait look like the game's gnome? Every gnome of the
// catalogue (and the earned nine) drawn by the realm itself (svg.gno, run by
// gno test), beside its 3D thumbnail (media/gnomes/thumbs/; the earned
// drawn by the client's showcase): a score each, and contact sheets to look at.
//   GNO=<onyx gno> DESIGNS=<the client's checkout> node media/gnomes/portrait/likeness.mjs [--out dir] [ids…]
// Writes to --out (default: a folder in the system's temp): sheet-NN.png
// (60 pairs a page, the realm's left), legendaries.png (large), earned.png,
// traits.png (each trait value alone on the Classic: the realm's, the
// client's), scores.tsv (worst first) and each SVG; prints the sizes and
// the worst ten.
//
// The score: of the pixels either picture puts the gnome on (not the ground,
// the plinth or the frame), the share both do (silhouette), and the mean
// colour distance where both do (0 the same, 441 black on white).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DESIGNS, gnomePage } from "./extract.mjs";
import { launch, sleep } from "../../lib/cdp.mjs";

const ROOT = new URL("../../../", import.meta.url).pathname;
const PKG = path.join(ROOT, "gno.land/r/gnogolf/gnomes");
const args = process.argv.slice(2);
const flag = (/** @type {string} */ k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : ""; };
const out = path.resolve(flag("--out") || path.join(os.tmpdir(), "gnogolf-likeness"));
const only = args.map(Number).filter(Boolean);
const GNO = process.env.GNO || path.join(process.env.GNO_TOOLCHAIN || path.join(os.homedir(), ".cache/gno-toolchains/onyx"), "gno");

/** @type {{ gnomes: { id: number, tier: string, name: string, traits: string, skin: object }[], earned: { kind: number, unlock: string, name: string, traits: string }[] }} */
const cat = JSON.parse(fs.readFileSync(path.join(DESIGNS, "data/gnomes.json"), "utf8"));
const EARNED = 1_000_000; // an earned kind k is shown as id EARNED + k
const TRAIT = 2_000_000; // the n-th trait value alone, as id TRAIT + n

// each value of each drawn field, alone on the Classic (format 1: docs/gnomes/design.md)
const vocab = JSON.parse(fs.readFileSync(path.join(DESIGNS, "data/gnomes.json"), "utf8")).vocab;
const CLASSIC = "01010100000000ffff00ffff00ff00000000ff00ff00ff00ff00ff00ff";
const withByte = (/** @type {string} */ t, /** @type {number} */ f, /** @type {number} */ v) => t.slice(0, 2 * f) + v.toString(16).padStart(2, "0") + t.slice(2 * f + 2);
/** @type {{ label: string, traits: string, look: Record<string, unknown> }[]} */
const traitLooks = [];
for (const [f, key, table] of /** @type {[number, string, string][]} */ ([[6, "hat", "hats"], [9, "beard", "beards"], [12, "pattern", "patterns"],
  [19, "piece", "pieces"], [21, "material", "materials"], [23, "trail", "trails"], [27, "prop", "props"]]))
  vocab[table].forEach((/** @type {string} */ v, /** @type {number} */ k) => k && traitLooks.push({ label: `${key} ${v}`, traits: withByte(CLASSIC, f, k), look: { [key]: v } }));
vocab.accessories.forEach((/** @type {string} */ a, /** @type {number} */ k) => traitLooks.push({
  label: a, traits: CLASSIC.slice(0, 28) + (1 << k >>> 0).toString(16).padStart(8, "0") + CLASSIC.slice(36), look: { accessories: [a] } }));
const todo = [
  ...cat.gnomes.filter((g) => !only.length || only.includes(g.id)).map((g) => ({ id: g.id, tier: g.tier, name: g.name, traits: g.traits })),
  ...cat.earned.filter((e) => !only.length || only.includes(EARNED + e.kind)).map((e) => ({ id: EARNED + e.kind, tier: "earned", name: e.name, traits: e.traits })),
  ...traitLooks.map((t, n) => ({ id: TRAIT + n, tier: "common", name: t.label, traits: t.traits })).filter((g) => !only.length || only.includes(g.id)),
];

// the realm draws them: a test of its own, for this run only
const TEST = path.join(PKG, "zz_likeness_test.gno");
const q = (/** @type {string} */ s) => JSON.stringify(s);
fs.writeFileSync(TEST, `package gnomes

import "testing"

// (written and removed by media/gnomes/portrait/likeness.mjs)
func TestLikeness(t *testing.T) {
	for _, g := range []gnome{
${todo.map((g) => `		{id: ${g.id}, tier: ${g.tier === "earned" ? "earnedTier" : `tierAt(${q(g.tier)})`}, name: ${q(g.name)}, traits: ${q(g.traits)}},`).join("\n")}
	} {
		t.Logf("SVG %d %s", g.id, drawGnome(g))
	}
}
`);
/** @type {Map<number, string>} */
const svgs = new Map();
try {
  // (gno test logs to stderr)
  const run = spawnSync(GNO, ["test", "-v", "-run", "TestLikeness", "."], { cwd: PKG, encoding: "utf8", maxBuffer: 1 << 30 });
  if (run.status !== 0) throw new Error(`likeness: gno test failed\n${(run.stderr || "").slice(-2000)}`);
  for (const m of (run.stdout + run.stderr).matchAll(/SVG (\d+) (<svg.*?<\/svg>)/g)) svgs.set(Number(m[1]), m[2]);
} finally {
  fs.rmSync(TEST, { force: true });
}
if (svgs.size !== todo.length) throw new Error(`likeness: the realm drew ${svgs.size} of ${todo.length}`);

fs.mkdirSync(path.join(out, "svg"), { recursive: true });
for (const [id, s] of svgs) fs.writeFileSync(path.join(out, "svg", `${id}.svg`), s);
const sizes = [...svgs.values()].map((s) => s.length).sort((a, b) => a - b);
const pct = (/** @type {number} */ p) => sizes[Math.min(sizes.length - 1, Math.floor(p * sizes.length))];
console.log(`SVG bytes: min ${sizes[0]}, median ${pct(0.5)}, p95 ${pct(0.95)}, max ${sizes[sizes.length - 1]}; over 6 KB: ${sizes.filter((n) => n > 6144).length}`);

// the earned have no thumbnail on file: the client draws them as render.mjs would
const page = await gnomePage();
/** @type {Map<number, string>} */
const thumbs = new Map();
const gnomes = /** @type {{ unlock?: string }[]} */ (await page.page("gnomes"));
for (const g of todo) {
  if (g.id >= TRAIT) {
    const skin = await page.page(`skinOf(${JSON.stringify(traitLooks[g.id - TRAIT].look)})`);
    thumbs.set(g.id, await page.page(`thumb(${JSON.stringify(skin)}, "common")`));
  } else if (g.tier !== "earned") thumbs.set(g.id, "data:image/webp;base64," + fs.readFileSync(path.join(DESIGNS, "media/gnomes/thumbs", `${g.id}.webp`)).toString("base64"));
  else {
    const skin = gnomes.find((s) => s.unlock === cat.earned.find((e) => EARNED + e.kind === g.id)?.unlock);
    thumbs.set(g.id, await page.page(`thumb(${JSON.stringify(skin)}, "earned")`));
  }
}
page.kill();

// side by side in a page: scored there (canvas pixels), then shot a sheet at a time
const b = await launch({ width: 1600, height: 1200 });
const svgURI = (/** @type {number} */ id) => "data:image/svg+xml;base64," + Buffer.from(/** @type {string} */ (svgs.get(id))).toString("base64");
await b.send("Page.navigate", { url: "about:blank" });
await sleep(300);
await b.js(`window.score = async (a, b, ground) => {
  const px = async (src) => { const i = new Image(); i.src = src; await i.decode(); const c = document.createElement("canvas"); c.width = c.height = 128;
    const x = c.getContext("2d"); x.drawImage(i, 0, 0, 128, 128); return x.getImageData(0, 0, 128, 128).data; };
  const [p, q] = [await px(a), await px(b)];
  // the gnome: what is far from each of the frame's colours (ground, plinth, frame, its shadow on the plinth)
  const isGnome = (d, o) => ground.every(([r, g, b]) => Math.hypot(d[o] - r, d[o + 1] - g, d[o + 2] - b) > 34);
  let both = 0, either = 0, dist = 0;
  for (let o = 0; o < p.length; o += 4) {
    const [u, v] = [isGnome(p, o), isGnome(q, o)];
    if (u || v) either++;
    if (u && v) (both++, dist += Math.hypot(p[o] - q[o], p[o + 1] - q[o + 1], p[o + 2] - q[o + 2]));
  }
  return [either ? both / either : 1, both ? dist / both : 0];
}; 1`);
const TIER = { earned: [0xe8f1ec, 0xb9d4c6, 0x226c57], common: [0xf3eee4, 0xd9d0c0, 0x8b939a], rare: [0xe4ecf7, 0xbfd0ea, 0x3f6aa8],
  epic: [0xede5f7, 0xd3c3ec, 0x7a4fc0], legendary: [0xfbf0d6, 0xf0d79a, 0xd9962b] };
const rgb = (/** @type {number} */ v) => [(v >> 16) & 255, (v >> 8) & 255, v & 255];
/** @type {{ id: number, name: string, tier: string, shape: number, colour: number, bytes: number }[]} */
const scores = [];
for (const g of todo) {
  const look = TIER[/** @type {keyof TIER} */ (g.tier)];
  const shadow = rgb(look[1]).map((c) => Math.round(c * 0.86));
  const [shape, colour] = await b.js(`score(${q(svgURI(g.id))}, ${q(/** @type {string} */ (thumbs.get(g.id)))}, ${JSON.stringify([...look.map(rgb), shadow])})`);
  scores.push({ id: g.id, name: g.name, tier: g.tier, shape, colour, bytes: /** @type {string} */ (svgs.get(g.id)).length });
}
const worst = [...scores].sort((a, b) => a.shape - b.shape - (a.colour - b.colour) / 200);
fs.writeFileSync(path.join(out, "scores.tsv"), "id\ttier\tname\tsilhouette\tcolour\tbytes\n" +
  worst.map((s) => [s.id, s.tier, s.name, s.shape.toFixed(3), s.colour.toFixed(1), s.bytes].join("\t")).join("\n") + "\n");
const mean = (/** @type {number[]} */ v) => v.reduce((a, c) => a + c, 0) / v.length;
console.log(`silhouette shared: mean ${mean(scores.map((s) => s.shape)).toFixed(3)}, worst ${worst[0].shape.toFixed(3)} (#${worst[0].id}); colour distance: mean ${mean(scores.map((s) => s.colour)).toFixed(1)}`);
for (const s of worst.slice(0, 10)) console.log(`  #${s.id} ${s.name} (${s.tier}): ${s.shape.toFixed(3)} / ${s.colour.toFixed(1)}`);

/** A sheet of pairs (the realm's left, the game's right), shot to a PNG. */
async function sheet(/** @type {typeof todo} */ list, /** @type {string} */ file, px = 160, cols = 5) {
  const cell = (/** @type {typeof todo[0]} */ g) => `<figure><img src="${svgURI(g.id)}"><img src="${thumbs.get(g.id)}"><figcaption>#${g.id} ${g.name.replace(/[<&]/g, "")}</figcaption></figure>`;
  const html = `<style>body{margin:0;background:#fff;font:11px sans-serif}main{display:grid;grid-template-columns:repeat(${cols},auto);gap:6px;padding:6px}
figure{margin:0;display:grid;grid-template-columns:${px}px ${px}px;gap:2px}img{width:${px}px;height:${px}px}figcaption{grid-column:1/3}</style><main>${list.map(cell).join("")}</main>`;
  await b.js(`document.open(); document.write(${q(html)}); document.close(); Promise.all([...document.images].map((i) => i.decode().catch(() => 0))).then(() => 1)`);
  const h = await b.js("document.documentElement.scrollHeight"), w = await b.js("document.documentElement.scrollWidth");
  await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const shot = await b.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(out, file), Buffer.from(shot.data, "base64"));
}
const sale = todo.filter((g) => g.tier !== "earned" && g.id < TRAIT);
for (let k = 0; k < sale.length; k += 60) await sheet(sale.slice(k, k + 60), `sheet-${String(k / 60 + 1).padStart(2, "0")}.png`);
const legends = todo.filter((g) => g.tier === "legendary"), earned = todo.filter((g) => g.tier === "earned");
if (legends.length) await sheet(legends, "legendaries.png", 384, 2);
if (earned.length) await sheet(earned, "earned.png", 256, 3);
const traits = todo.filter((g) => g.id >= TRAIT);
if (traits.length) await sheet(traits, "traits.png", 128, 8);
b.kill();
console.log(`sheets, scores and SVGs in ${out}`);
process.exit(0);
