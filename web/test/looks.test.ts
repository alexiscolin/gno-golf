// Permanence (docs/gnomes/design.md): every token of the catalogue and the
// nine earned kinds is drawn from its traits exactly as the golden file
// says (data/gnomes/looks.golden.json, scripts/gnomelooks.ts). A change to
// the drawing that moves one vertex, one colour or one texture of a gnome
// fails here, naming him.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { RECORD, lookRecord } from "./looks.ts";
import { skinOfTraits } from "../lib/gnomes/skin.ts";
import { goldenKeys, type Catalogue } from "../lib/gnomes/catalogue.ts";

const read = (f: string): unknown => JSON.parse(fs.readFileSync(new URL(`../../data/${f}`, import.meta.url), "utf8"));
const catalogue = read("gnomes.json") as Catalogue;
const file = read("gnomes/looks.golden.json") as { record: number; looks: Record<string, unknown> };
const golden = file.looks;

test("the golden file is kept in the record format the tests read", () => assert.equal(file.record, RECORD));

test("every gnome, and every earned kind, is drawn from its traits as the golden file holds", () => {
  const keys = goldenKeys(catalogue);
  assert.equal(keys.length, catalogue.gnomes.length + 9);
  const changed: string[] = [];
  for (const { key, traits, name } of keys) {
    assert.ok(key in golden, `${key} ${name} has no golden look: npm run gnomes:looks -- --write`);
    if (JSON.stringify(lookRecord(skinOfTraits(traits, { id: key, name, line: "" }))) !== JSON.stringify(golden[key])) changed.push(`${key} ${name}`);
  }
  assert.deepEqual(changed, [], "these gnomes no longer draw as they did");
});

test("a look's record sees the light: each material's bands and the strength of its glow", () => {
  const skinOf = (pick: (s: Catalogue["gnomes"][number]["skin"]) => boolean) => catalogue.gnomes.find((g) => pick(g.skin))!.skin;
  const toon = lookRecord(skinOf((s) => !s.material)).materials, glaze = lookRecord(skinOf((s) => s.material === "glaze")).materials;
  const lava = lookRecord(skinOf((s) => s.material === "lava")).materials;
  // the game's three bands, a polished thing's five
  assert.ok(toon.some((m) => m.includes("|g104,178,255|")), toon.join(" "));
  assert.ok(glaze.some((m) => m.includes("|g92,165,225,225,255|")), glaze.join(" "));
  assert.ok(lava.some((m) => /\|e0\.\d+$/.test(m) && !m.endsWith("|e1")), lava.join(" "));
});

test("the golden file holds no look the catalogue lost", () => {
  const keys = new Set(goldenKeys(catalogue).map((k) => k.key));
  assert.deepEqual(Object.keys(golden).filter((k) => !keys.has(k)), []);
});

test("the earned kinds and a released series are final: the writer may not change them", () => {
  for (const k of goldenKeys(catalogue)) if (k.key.startsWith("earned:")) assert.equal(k.released, true);
  const released = goldenKeys({ ...catalogue, series: catalogue.series.map((s) => ({ ...s, released: true })) });
  assert.ok(released.every((k) => k.released));
});
