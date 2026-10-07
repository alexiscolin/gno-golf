// A hole's build finished once (lib/scene/course.ts finishHole): finishing it
// again changes nothing, neither its merge nor a world's own pass over it
// (the mines' light pools, which shade the vertex colours in place).
import { test } from "node:test";
import assert from "node:assert/strict";
import { build, keysOf, loadWorld } from "./scene-harness.ts";
import holes from "../lib/scene/title-holes.json" with { type: "json" };
import type { Course, Hole } from "../lib/scene/data.ts";

const { finishHole } = await import("../lib/scene/course.ts");

void test("a finished hole finished again is drawn the same", async () => {
  for (const s of Object.values(holes) as unknown as Hole[]) {
    await loadWorld(s.world);
    const g = build(s) as Course, once = keysOf(g);
    finishHole(g);
    assert.deepEqual(keysOf(g), once, s.world);
  }
});
