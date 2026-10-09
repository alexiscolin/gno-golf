// @ts-check
// What the site serves of the gnome collection, made from the repo before
// `npm run dev` and `npm run build` (web/package.json): every gnome's
// thumbnail (media/gnomes/thumbs/<id>.webp) and the Legendaries' turntables
// (media/gnomes/turntables/<id>.webp) copied to web/public/gnomes/ and
// web/public/gnomes/turn/, and the catalogue as the screens read it,
// web/public/gnomes/catalogue.json: each gnome's id, series, wave, tier,
// home, archetype, name, line and traits, and the earned kinds (the skins
// are not sent: the client draws them from the traits). Only what changed
// is written; web/public/gnomes/ is not committed (web/.gitignore).
//   node scripts/gnomeassets.mjs
import fs from "node:fs";

const ROOT = new URL("../", import.meta.url);
const OUT = new URL("web/public/gnomes/", ROOT);
const at = (/** @type {string} */ p) => new URL(p, ROOT);

/** Copies every .webp of a folder into another when its size or time differ; how many it wrote. */
function mirror(/** @type {URL} */ from, /** @type {URL} */ to) {
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const f of fs.readdirSync(from).filter((x) => x.endsWith(".webp"))) {
    const a = fs.statSync(new URL(f, from)), dest = new URL(f, to);
    const b = fs.existsSync(dest) ? fs.statSync(dest) : null;
    if (b && b.size === a.size && b.mtimeMs >= a.mtimeMs) continue;
    fs.copyFileSync(new URL(f, from), dest);
    n++;
  }
  return n;
}

/** @type {{ series: { id: string, name: string, first: number, plan: { n: number, home: string, first: number, last: number }[] }[],
 *  gnomes: { id: number, series: string, wave: number, tier: string, home: string, archetype: string, name: string, line: string, traits: string }[],
 *  earned: { kind: number, unlock: string, name: string, line: string, traits: string }[] }} */
const c = JSON.parse(fs.readFileSync(at("data/gnomes.json"), "utf8"));
const shelf = JSON.stringify({
  version: 1,
  series: c.series.map((s) => ({ id: s.id, name: s.name, first: s.first, plan: s.plan.map(({ n, home, first, last }) => ({ n, home, first, last })) })),
  gnomes: c.gnomes.map(({ id, series, wave, tier, home, archetype, name, line, traits }) => ({ id, series, wave, tier, home, archetype, name, line, traits })),
  earned: c.earned.map(({ kind, unlock, name, line, traits }) => ({ kind, unlock, name, line, traits })),
});
fs.mkdirSync(OUT, { recursive: true });
const file = new URL("catalogue.json", OUT);
const fresh = !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== shelf;
if (fresh) fs.writeFileSync(file, shelf);
const thumbs = mirror(at("media/gnomes/thumbs/"), OUT), turns = mirror(at("media/gnomes/turntables/"), new URL("turn/", OUT));
console.log(`gnomeassets: ${thumbs} thumbnails and ${turns} turntables copied, the catalogue ${fresh ? `written (${Math.round(shelf.length / 1024)} KB)` : "unchanged"}`);
