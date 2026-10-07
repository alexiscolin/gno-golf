// The hostile holes (test/hostile.ts): what anyone can publish from a terminal
// once publishing opens, within GG1's bounds and past what any course hole
// does. Each is built by the game's own buildHole, in every world, in Node
// (test/scene-harness.ts): it must build, never throw.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hostileHoles, HOSTILE_NAMES } from "./hostile.ts";
import { build, loadWorld } from "./scene-harness.ts";
import { WORLD_NAMES } from "../lib/scene/worlds.ts";

void test("the hostile set: every world, every case", () => {
  for (const w of WORLD_NAMES) {
    const hs = hostileHoles(w);
    assert.ok(hs.some((h) => h.zones.some((z) => z.max[0] < z.min[0])), "an inverted zone");
    assert.ok(hs.some((h) => h.walls.length === 160 && h.walls.every((x) => x.a[0] === x.b[0] && x.a[1] === x.b[1])), "160 zero-length walls");
    assert.ok(hs.some((h) => h.posts.length === 32 && h.posts.every((p) => p.r === 8)), "32 posts of radius 8");
    assert.ok(hs.some((h) => h.zones.reduce((n, z) => n + (z.poly?.length ?? 0), 0) === 512), "512 polygon points");
    for (const k of HOSTILE_NAMES) assert.ok(hs.some((h) => h.zones.some((z) => z.skin === k) && h.posts.some((p) => p.skin === k) && h.walls.some((x) => x.skin === k)), k);
    assert.ok(hs.some((h) => HOSTILE_NAMES.includes(h.world)), "a world named like Object.prototype's keys");
  }
});

void test("every hostile hole builds in every world", async () => {
  for (const w of WORLD_NAMES) {
    await loadWorld(w);
    for (const [i, h] of hostileHoles(w).entries()) {
      assert.doesNotThrow(() => build(h), `${w} #${i}`);
    }
  }
});
