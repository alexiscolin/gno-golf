import { test } from "node:test";
import assert from "node:assert/strict";
import { fnv1a, skyOf, CLIMATES } from "../lib/sky.ts";

test("sky: FNV-1a 64 as course.gno hashes (the reference vectors)", () => {
  assert.equal(fnv1a(""), 14695981039346656037n);
  assert.equal(fnv1a("a"), 0xaf63dc4c8601ec8cn);
  assert.equal(fnv1a("foobar"), 0x85944171f73967e8n);
});

// what onyx's own Weather(hole, period) said, 2026-10-02: the five worlds, past and recent periods
const ONYX: [string, string, number, string][] = [["garden/2/v1","garden",5969562,""],["garden/2/v1","garden",5969363,""],["garden/2/v1","garden",5964563,"rain"],["garden/2/v1","garden",5969487,"wind"],["island/9/v1","island",5969562,""],["island/9/v1","island",5969363,"rain"],["island/9/v1","island",5964563,""],["island/9/v1","island",5969487,"wind"],["town/4/v1","town",5969562,""],["town/4/v1","town",5969363,""],["town/4/v1","town",5964563,""],["town/4/v1","town",5969487,"rain"],["mountain/13/v1","mountain",5969562,""],["mountain/13/v1","mountain",5969363,""],["mountain/13/v1","mountain",5964563,"wind"],["mountain/13/v1","mountain",5969487,"wind"],["mines/3/v1","mines",5969562,"fog"],["mines/3/v1","mines",5969363,""],["mines/3/v1","mines",5964563,"rain"],["mines/3/v1","mines",5969487,""]];

test("sky: a record's weather is the chain's, every world (the mines on the garden's climate)", () => {
  for (const [id, world, period, kind] of ONYX) assert.equal(skyOf(id, world, period), kind, `${id} ${period}`);
});

test("sky: every climate sums to 100, the unknown world falls back to the garden's", () => {
  for (const [w, t] of Object.entries(CLIMATES)) assert.equal(t.reduce((x, [p]) => x + p, 0), 100, w);
  assert.equal(skyOf("x/1/v1", "nowhere", 42), skyOf("x/1/v1", "garden", 42));
  // each kind of a world's climate shows up over enough periods
  for (const [w, t] of Object.entries(CLIMATES)) {
    const seen = new Set(Array.from({ length: 400 }, (_, i) => skyOf(`${w}/1/v1`, w, i)));
    for (const [, k] of t) assert.ok(seen.has(k), `${w} ${k}`);
  }
});
