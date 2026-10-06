#!/usr/bin/env -S node --experimental-strip-types
// The golden looks (data/gnomes/looks.golden.json): for every token of the
// catalogue and the nine earned kinds, a record of what makeBall builds from
// its traits (web/test/looks.ts). The unit tests hold every gnome to it
// (web/test/looks.test.ts). --write takes the records again, but never
// changes one of a released series nor of an earned kind: a released look
// is changed by a new trait format, never in place (docs/gnomes/design.md,
// "Permanence"). Without --write, it says what differs and exits non-zero.
//
//   node --experimental-strip-types scripts/gnomelooks.ts [--write]
//   (from web/: npm run gnomes:looks [-- --write])

import fs from "node:fs";
// the client's modules as the unit tests load them (".ts" tried, "@/" read)
import "../web/test/setup.mjs";

const { lookRecord } = await import("../web/test/looks.ts");
const { skinOfTraits } = await import("../web/lib/gnomes/skin.ts");
const { goldenKeys } = await import("../web/lib/gnomes/catalogue.ts");
type Catalogue = import("../web/lib/gnomes/catalogue.ts").Catalogue;

const FILE = new URL("../data/gnomes/looks.golden.json", import.meta.url);
const catalogue = JSON.parse(fs.readFileSync(new URL("../data/gnomes.json", import.meta.url), "utf8")) as Catalogue;
const golden = (fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {}) as Record<string, unknown>;
const write = process.argv.includes("--write");

const now: Record<string, unknown> = {};
let changed = 0, refused = 0;
for (const { key, traits, name, released } of goldenKeys(catalogue)) {
  now[key] = lookRecord(skinOfTraits(traits, { id: key, name, line: "" }));
  if (key in golden && JSON.stringify(golden[key]) !== JSON.stringify(now[key])) {
    changed++;
    if (released) {
      refused++;
      console.log(`FAIL ${key} ${name}: a released look changed. Draw it as it was; a new look needs a new trait format.`);
    } else console.log(`changed ${key} ${name}`);
  }
}
const added = Object.keys(now).filter((k) => !(k in golden)).length;
if (!write) {
  console.log(`${changed} changed, ${added} new, of ${Object.keys(now).length}`);
  process.exit(changed || added ? 1 : 0);
}
if (refused) process.exit(1);
// released records kept as they were; one a line
const keep = { ...now, ...Object.fromEntries(goldenKeys(catalogue).filter((k) => k.released && k.key in golden).map((k) => [k.key, golden[k.key]])) };
fs.writeFileSync(FILE, "{\n" + Object.entries(keep).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n") + "\n}\n");
console.log(`wrote data/gnomes/looks.golden.json: ${Object.keys(keep).length} looks, ${changed} changed, ${added} new`);
