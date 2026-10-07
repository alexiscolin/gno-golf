// A hole's name suggested (lib/builder/naming.ts): playful, from a small
// list of the world's own words, the same for a draft and a roll (no
// Math.random), another at each roll, within the realm's name limit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestName, WORDS, seedOf } from "../lib/builder/naming.ts";
import { MAX_TITLE } from "../lib/builder/draft.ts";
import { FIELD } from "../lib/builder/rules.ts";
import { STARTERS } from "../lib/builder/starters.ts";

void test("suggestName: the same for a draft and a roll, another at the next roll, the world's words, within the limit", () => {
  for (const w of Object.keys(FIELD)) {
    const seed = seedOf(STARTERS[w].dogleg);
    assert.equal(suggestName(w, seed, 0), suggestName(w, seed, 0), "deterministic");
    const names = Array.from({ length: 12 }, (_, n) => suggestName(w, seed, n));
    for (let n = 1; n < names.length; n++) assert.notEqual(names[n], names[n - 1], `${w}: roll ${n} changes it`);
    assert.ok(new Set(names).size >= 10, `${w}: a dozen rolls, mostly new names`);
    for (const name of names) {
      assert.ok([...name].length <= MAX_TITLE, name);
      const [adj, ...noun] = name.split(" ");
      assert.ok(WORDS[w].adjectives.includes(adj) && WORDS[w].nouns.includes(noun.join(" ")), `${w}: ${name}, its world's words`);
    }
  }
});

void test("seedOf: a draft's own (its world, its starting place and pieces), not its name", () => {
  const d = STARTERS.garden.dogleg;
  assert.equal(seedOf(d), seedOf({ ...d, title: "Another" }));
  assert.notEqual(seedOf(d), seedOf(STARTERS.garden.straight));
  assert.notEqual(suggestName("garden", seedOf(d), 0), suggestName("garden", seedOf(STARTERS.garden.straight), 0));
});

void test("WORDS: every world's lists, short, unique, and kind (none of a short list of words a child should not read)", () => {
  const unkind = /\b(kill|dead|death|hell|damn|stupid|ugly|fat|drunk|blood|hate)\b/i;
  for (const w of Object.keys(FIELD)) {
    const { adjectives, nouns } = WORDS[w];
    assert.ok(adjectives.length >= 10 && nouns.length >= 10, w);
    assert.equal(new Set(adjectives).size, adjectives.length);
    assert.equal(new Set(nouns).size, nouns.length);
    for (const x of [...adjectives, ...nouns]) assert.doesNotMatch(x, unkind, x);
    assert.ok(adjectives.every((a) => !a.includes(" ")), "an adjective is one word");
  }
});
