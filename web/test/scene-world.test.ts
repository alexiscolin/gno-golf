// A built hole says which world's module drew its scenery (course.ts
// userData.scenery, worlds.ts drawnBy): its own once loaded, the garden it
// falls back to before. The Builder's bench reads it after each world switch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build, loadWorld } from "./scene-harness.ts";
import holes from "../lib/scene/title-holes.json" with { type: "json" };
import type { Course, Hole } from "../lib/scene/data.ts";

void test("a hole's scenery is its own world's once its module is loaded, the garden's before (said so)", async () => {
  const s = holes.town as unknown as Hole;
  assert.equal((build(s) as Course).userData.scenery, "garden", "before the town's module");
  for (const h of Object.values(holes) as unknown as Hole[]) {
    await loadWorld(h.world);
    assert.equal((build(h) as Course).userData.scenery, h.world);
  }
});
