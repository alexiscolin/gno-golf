#!/usr/bin/env -S node --experimental-strip-types
// The gnome collection's catalogue: data/gnomes.json made from data/gnomes/
// (series.json, and each series' archetypes.json, epics.json and
// legendaries.json), then every rule of docs/gnomes/design.md checked
// (web/lib/gnomes/validate.ts). With --check nothing is written: the file
// must be what the data makes, and pass. Any failure exits non-zero.
//
//   node --experimental-strip-types scripts/gnomes.ts [--check]
//   (from web/: npm run gnomes [-- --check])

import fs from "node:fs";
// the client's modules as the unit tests load them (".ts" tried, "@/" read)
import "../web/test/setup.mjs";

const { makeCatalogue } = await import("../web/lib/gnomes/generate.ts");
const { validate } = await import("../web/lib/gnomes/validate.ts");
const { lookOf } = await import("../web/lib/gnomes/skin.ts");
const { GNOMES } = await import("../web/lib/scene/gnome.ts");

const DATA = new URL("../data/gnomes/", import.meta.url), OUT = new URL("../data/gnomes.json", import.meta.url);
const catalogue = makeCatalogue((f) => JSON.parse(fs.readFileSync(new URL(f, DATA), "utf8")) as unknown);

// one gnome a line: a change to one is a one-line diff
const text = JSON.stringify({ ...catalogue, gnomes: [] }, null, 1).replace(/"gnomes": \[\]/, `"gnomes": [\n${catalogue.gnomes.map((e) => " " + JSON.stringify(e)).join(",\n")}\n]`) + "\n";

const report = validate(catalogue, GNOMES.map((g) => lookOf(g)));
for (const [k, v] of Object.entries(report.counts)) console.log(`${k}:`, Object.entries(v).map(([n, c]) => `${n} ${c}`).join(", "));
for (const e of report.errors) console.log("FAIL", e);

if (process.argv.includes("--check")) {
  const same = fs.existsSync(OUT) && fs.readFileSync(OUT, "utf8") === text;
  if (!same) console.log("FAIL data/gnomes.json is not what data/gnomes/ makes: run npm run gnomes");
  if (!same || report.errors.length) process.exit(1);
  console.log(`ok   ${catalogue.gnomes.length} gnomes, data/gnomes.json as made`);
} else {
  fs.writeFileSync(OUT, text);
  console.log(`wrote data/gnomes.json: ${catalogue.gnomes.length} gnomes${report.errors.length ? `, ${report.errors.length} failing` : ""}`);
  if (report.errors.length) process.exit(1);
}
