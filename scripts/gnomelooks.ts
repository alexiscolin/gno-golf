#!/usr/bin/env -S node --experimental-strip-types
// The golden looks (data/gnomes/looks.golden.json): for every token of the
// catalogue and the nine earned kinds, a record of what makeBall builds from
// its traits (web/test/looks.ts). The unit tests hold every gnome to it
// (web/test/looks.test.ts). --write takes the records again, but never
// changes one of a released series nor of an earned kind: a released look
// is changed by a new trait format, never in place (docs/gnomes/design.md,
// "Permanence"). A record format that sees more (RECORD) is taken on only
// where the gnome still draws as the file's own format recorded him.
// Without --write, it says what differs and exits non-zero.
//
//   node --experimental-strip-types scripts/gnomelooks.ts [--write]
//   (from web/: npm run gnomes:looks [-- --write])

import fs from "node:fs";
// the client's modules as the unit tests load them (".ts" tried, "@/" read)
import "../web/test/setup.mjs";

const { lookRecord, RECORD } = await import("../web/test/looks.ts");
const { skinOfTraits } = await import("../web/lib/gnomes/skin.ts");
const { goldenKeys } = await import("../web/lib/gnomes/catalogue.ts");
type Catalogue = import("../web/lib/gnomes/catalogue.ts").Catalogue;

const FILE = new URL("../data/gnomes/looks.golden.json", import.meta.url);
const catalogue = JSON.parse(fs.readFileSync(new URL("../data/gnomes.json", import.meta.url), "utf8")) as Catalogue;
const saved = (fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : { record: RECORD, looks: {} }) as { record?: number; looks?: Record<string, unknown> };
// (the first file was the looks alone, in format 1)
const was = saved.record ?? 1, golden = (saved.looks ?? saved) as Record<string, unknown>;
const write = process.argv.includes("--write");

const now: Record<string, unknown> = {};
let changed = 0, refused = 0;
for (const { key, traits, name, released } of goldenKeys(catalogue)) {
  const skin = skinOfTraits(traits, { id: key, name, line: "" });
  now[key] = lookRecord(skin);
  // compared in the file's own format: a richer record of the same drawing is no change
  if (key in golden && JSON.stringify(golden[key]) !== JSON.stringify(was === RECORD ? now[key] : lookRecord(skin, was))) {
    changed++;
    if (released) {
      refused++;
      console.log(`FAIL ${key} ${name}: a released look changed. Draw it as it was; a new look needs a new trait format.`);
    } else console.log(`changed ${key} ${name}`);
  }
}
const added = Object.keys(now).filter((k) => !(k in golden)).length;
if (!write) {
  console.log(`${changed} changed, ${added} new, of ${Object.keys(now).length}${was !== RECORD ? `; the file is in record format ${was}, not ${RECORD}: --write` : ""}`);
  process.exit(changed || added || was !== RECORD ? 1 : 0);
}
if (refused) process.exit(1);
// one look a line
fs.writeFileSync(FILE, `{\n "record": ${RECORD},\n "looks": {\n` + Object.entries(now).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n") + "\n }\n}\n");
console.log(`wrote data/gnomes/looks.golden.json: ${Object.keys(now).length} looks in record format ${RECORD}, ${changed} changed, ${added} new`);
