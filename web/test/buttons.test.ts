// One button (components/ui.tsx): every button is a Button, every link that
// looks like one takes buttonClass (components/button.ts, the map of variants
// and sizes, a server page's too), so they all follow its variants and sizes.
// No component or page writes the base class ("btn"), a variant's
// ("btn--main", "btn--ghost", ...) or a size's ("btn--s", "btn--m") by hand: a
// change to the map (VARIANTS, SIZES) would miss it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WEB = new URL("../", import.meta.url).pathname;
const sources = (dir: string): string[] =>
  fs.readdirSync(path.join(WEB, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(path.join(dir, e.name)) : /\.tsx$/.test(e.name) ? [path.join(dir, e.name)] : []));

void test("no button class written by hand outside ui.tsx: the base class, a variant, a size", () => {
  const hand: string[] = [];
  for (const f of [...sources("components"), ...sources("app")].filter((f) => f !== "components/ui.tsx"))
    fs.readFileSync(path.join(WEB, f), "utf8").split("\n").forEach((line, i) => {
      // "btn" as a class (not btn--x, nor part of a longer name), or a variant's or a size's (not btn--save-rank's)
      if (/["'` ]btn["'` ]|\bbtn--(main|ghost|gold|save|chip|icon|s|m)(?![\w-])/.test(line)) hand.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  assert.deepEqual(hand, []);
});
