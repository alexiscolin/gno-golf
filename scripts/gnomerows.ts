#!/usr/bin/env -S node --experimental-strip-types
// The realm's rows for each series of data/gnomes.json: data/gnomes/rows/<series>.txt,
// "id|tier|name|traits" a line, what the owner sends as AddSeries(name, rows).
// Every row is checked first (web/lib/gnomes/rows.ts): ids following on,
// fields the realm accepts, a row's tier equal to its traits' tier byte.
// With --check nothing is written: the files must be what the catalogue
// makes, and pass. Any failure exits non-zero.
//
//   node --experimental-strip-types scripts/gnomerows.ts [--check]
//   (from web/: npm run gnomes:rows [-- --check])

import fs from "node:fs";
// the client's modules as the unit tests load them (".ts" tried, "@/" read)
import "../web/test/setup.mjs";

const { rowsOf, checkRows } = await import("../web/lib/gnomes/rows.ts");
type Catalogue = import("../web/lib/gnomes/catalogue.ts").Catalogue;

const OUT = new URL("../data/gnomes/rows/", import.meta.url);
const catalogue = JSON.parse(fs.readFileSync(new URL("../data/gnomes.json", import.meta.url), "utf8")) as Catalogue;
const check = process.argv.includes("--check");
let failed = 0;
fs.mkdirSync(OUT, { recursive: true });
for (const s of catalogue.series) {
  const rows = rowsOf(catalogue, s.id), file = new URL(`${s.id}.txt`, OUT);
  const errors = checkRows(rows, s.first);
  for (const e of errors) console.log(`FAIL ${s.id} ${e}`);
  failed += errors.length;
  const text = rows; // (no newline at the end: the realm would read an empty last row)
  if (check) {
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text) {
      failed++;
      console.log(`FAIL data/gnomes/rows/${s.id}.txt is not what data/gnomes.json makes: run npm run gnomes:rows`);
    } else console.log(`ok   ${s.id}: ${rows.split("\n").length} rows, ${rows.length} bytes`);
  } else if (!errors.length) {
    fs.writeFileSync(file, text);
    console.log(`wrote data/gnomes/rows/${s.id}.txt: ${rows.split("\n").length} rows, ${rows.length} bytes`);
  }
}
if (failed) process.exit(1);
