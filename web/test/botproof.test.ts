import { test } from "node:test";
import assert from "node:assert/strict";
import { forgedShot, parseShot } from "../lib/botproof.ts";
import { pullShot, shotOf } from "../lib/chain.ts";

test("botproof: what the game sends is never finer than it, whatever the pull", () => {
  // every angle the game can send, at 0.01, from a pull's own rounding (359.995 wraps to 0)
  for (const rad of [0, 0.1, 1, Math.PI, 2 * Math.PI - 1e-9, -0.0001, 6.283])
    for (const px of [0, 1, 37, 120, 1e6]) {
      const { deg, power } = pullShot(px, 400, 800, rad);
      if (power > 0) assert.equal(forgedShot(parseShot(shotOf(deg, power, 0))), false, `${deg},${power}`);
    }
  for (const x of ["0.0000,10.0000,0", "359.9900,0.0100,12"]) assert.equal(forgedShot(parseShot(x)), false, "the extremes the game sends");
});

test("botproof: a shot finer than 0.01 is not the game's", () => {
  assert.equal(forgedShot(parseShot("7.8750,9.5500,0")), true, "a third decimal");
  assert.equal(forgedShot(parseShot("7.88,9.5550,0")), true, "the power's third decimal");
  assert.equal(forgedShot(parseShot("355.1200,3.4700,0")), false);
});
