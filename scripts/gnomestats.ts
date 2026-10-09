#!/usr/bin/env -S node --experimental-strip-types
// How far apart the catalogue's gnomes are (web/lib/gnomes/validate.ts
// visualDiff, apart): for each gnome, the fewest visual fields it differs
// in from any other, as a distribution; and the pairs the rule refuses.
//
//   node --experimental-strip-types scripts/gnomestats.ts [catalogue.json]
//   (from web/: npm run gnomes:stats)

import fs from "node:fs";
// the client's modules as the unit tests load them (".ts" tried, "@/" read)
import "../web/test/setup.mjs";

const { visualDiff, apart } = await import("../web/lib/gnomes/validate.ts");
const { decode } = await import("../web/lib/gnomes/codec.ts");
type Catalogue = import("../web/lib/gnomes/catalogue.ts").Catalogue;

const file = process.argv[2] ?? new URL("../data/gnomes.json", import.meta.url).pathname;
const c = JSON.parse(fs.readFileSync(file, "utf8")) as Catalogue;
const looks = c.gnomes.map((g) => ({ id: g.id, t: decode(g.traits)! }));
const least = new Map<number, number>(), refused: string[] = [];
for (let i = 0; i < looks.length; i++)
  for (let j = i + 1; j < looks.length; j++) {
    const d = visualDiff(looks[i].t, looks[j].t);
    for (const k of [i, j]) least.set(looks[k].id, Math.min(least.get(looks[k].id) ?? Infinity, d.length));
    if (!apart(looks[i].t, looks[j].t)) refused.push(`#${looks[i].id} #${looks[j].id}: ${d.join(", ") || "the same"}`);
  }
const hist: Record<number, number> = {};
for (const n of least.values()) hist[n] = (hist[n] ?? 0) + 1;
console.log("the fewest fields each gnome differs in from another:", Object.entries(hist).map(([n, k]) => `${n}: ${k}`).join(", "));
console.log(`${refused.length} pairs refused (under 3 fields, or no hat, hat colour, body, pattern, material or prop among them)`);
for (const r of refused.slice(0, 12)) console.log("  " + r);
