// The Builder's feel (lib/builder/juice.ts), pure: a tick at most so often
// (the snap's), a label kept by the pointer and inside its box (a refusal
// said where the cursor is), and the celebration's confetti, the same each
// time (no Math.random in a render).
import { test } from "node:test";
import assert from "node:assert/strict";
import { chain, confetti, labelAt, lean, reactionAt, throttle } from "../lib/builder/juice.ts";
import { lane } from "./builder-fixture.ts";
import type { Piece } from "../lib/builder/draft.ts";

void test("throttle: once, then not again until ms have passed", () => {
  let now = 0, n = 0;
  const tick = throttle(() => n++, 60, () => now);
  tick(), tick();
  assert.equal(n, 1);
  now = 59, tick();
  assert.equal(n, 1);
  now = 60, tick();
  assert.equal(n, 2);
});

void test("labelAt: beside the pointer, kept inside the box", () => {
  const box = { w: 600, h: 400 }, size = { w: 200, h: 28 };
  assert.deepEqual(labelAt([100, 100], box, size), { left: 116, top: 116 }, "below right of the pointer");
  assert.deepEqual(labelAt([550, 100], box, size), { left: 334, top: 116 }, "past the right edge: left of the pointer");
  assert.deepEqual(labelAt([100, 390], box, size), { left: 116, top: 346 }, "past the foot: above the pointer");
  assert.deepEqual(labelAt([10, 10], { w: 150, h: 30 }, size), { left: 8, top: 8 }, "a box smaller than it: its corner");
});

void test("confetti: n pieces, the same each time, each within the screen's width and a short fall", () => {
  const a = confetti(24), b = confetti(24);
  assert.equal(a.length, 24);
  assert.deepEqual(a, b);
  for (const p of a) {
    assert.ok(p.x >= 0 && p.x <= 100, `${p.x}`);
    assert.ok(p.delay >= 0 && p.delay <= 400, `${p.delay}`);
    assert.match(p.color, /^var\(--/);
  }
  assert.ok(new Set(a.map((p) => p.color)).size > 2, "several colours");
});

void test("chain: placements close together step up (the plop's note), a pause starts again", () => {
  let now = 0;
  const step = chain(1500, () => now);
  assert.deepEqual([step(), (now = 500, step()), (now = 1200, step())], [0, 1, 2]);
  now = 4000;
  assert.equal(step(), 0, "after a pause, from the first note");
});

void test("reactionAt: a piece landing in water ripples it, on sand or ground puffs it, elsewhere a little dust", () => {
  const zone = (id: string, entry: string, g: Piece["geometry"]): Piece => ({ id, entry, geometry: g, params: {}, clock: { k: "fixed" } });
  const d = lane("garden", [zone("w", "*/hazard/lagoon", { t: "round", min: [5, 5], max: [9, 9] }), zone("s", "*/surface/sand", { t: "rect", min: [14, 4], max: [18, 8] })]);
  const at = (x: number, y: number) => reactionAt(d, [x, y]);
  const w = d.pieces.find((p) => p.id === "w")!.geometry as { min: [number, number]; max: [number, number] }, s0 = d.pieces.find((p) => p.id === "s")!.geometry as { min: [number, number] };
  assert.equal(at((w.min[0] + w.max[0]) / 2, (w.min[1] + w.max[1]) / 2), "ripple");
  assert.equal(at(s0.min[0] + 1, s0.min[1] + 1), "puff");
  assert.equal(at(1, 1), "dust");
});

void test("lean: a dragged piece tilts a little toward where it goes, never more than 6°", () => {
  assert.equal(lean(0), 0);
  assert.ok(lean(4) > 0 && lean(-4) < 0);
  assert.equal(lean(500), 6);
  assert.equal(lean(-500), -6);
});
