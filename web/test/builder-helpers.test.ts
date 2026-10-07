// One home each for what the Builder and the game share, so copies cannot
// drift (the header and the phone's list once kept 7 characters of an
// address, the share card 8): the takedown list's read (lib/takedown.ts
// loadTakedown), an address shortened (lib/chain.ts shortAddr), a
// world's name (card.ts cap, rules.ts worldName), a file saved (share.ts saveFile), the
// name's and the note's lengths (draft.ts MAX_TITLE, MAX_NOTE).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(import.meta.dirname, "..");
const sources = (dir: string): string[] =>
  fs.readdirSync(path.join(WEB, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []);
const ALL = ["lib", "components", "app"].flatMap(sources).map((f) => [f, fs.readFileSync(path.join(WEB, f), "utf8")] as const);
const where = (re: RegExp) => ALL.filter(([, s]) => re.test(s)).map(([f]) => f);

void test("one home each for the helpers the Builder shares", () => {
  assert.deepEqual(where(/"\/takedown\.json"/), [path.join("lib", "takedown.ts")]);
  assert.deepEqual(where(/slice\(0, ?\d\)\}…\$\{[^}]*slice\(-\d\)/), [], "an address shortened by hand");
  assert.deepEqual(where(/charAt\(0\)\.toUpperCase\(\)(?: \+ |\}\$\{)[\w.]+\.slice\(1\)/), [path.join("lib", "card.ts")], "a world's name, a sentence capitalised by hand");
  assert.deepEqual(where(/\.download = /), [path.join("components", "builder", "share.ts")], "a file saved by hand");
  assert.deepEqual(where(/MAX_NAME = 40|MAX_NOTE = 140/).filter((f) => !f.endsWith("draft.ts")), [], "the name's and the note's lengths said twice");
});

void test("one home each for the Builder's own words and numbers: a point, a list, a capital, a weather's name, Fit's margin", () => {
  const builder = (re: RegExp) => where(re).filter((f) => f.includes(`${path.sep}builder${path.sep}`));
  assert.deepEqual(builder(/\$\{\+\w+\[0\]\.toFixed\(2\)\}, \$\{\+\w+\[1\]\.toFixed\(2\)\}/), [path.join("lib", "builder", "rules.ts")], "a board point written by hand");
  assert.deepEqual(builder(/slice\(0, -1\)\.join\(", "\)/), [path.join("lib", "builder", "rules.ts")], "a list joined by hand");
  assert.deepEqual(builder(/\[0\]\.toUpperCase\(\)/), [], "a capital by hand (rules.ts cap)");
  assert.deepEqual(builder(/"Clear"/), [path.join("lib", "builder", "carry.ts")], "a weather named twice (carry.ts weatherName)");
  assert.deepEqual(builder(/MARGIN = 1\.5/), [path.join("lib", "builder", "gg1.ts")], "Fit's margin said twice");
});
