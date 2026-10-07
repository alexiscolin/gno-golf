// The Builder's feel (lib/builder/juice.ts), pure: a tick at most so often
// (the snap's), a label kept by the pointer and inside its box (a refusal
// said where the cursor is), and the celebration's confetti, the same each
// time (no Math.random in a render).
import { test } from "node:test";
import assert from "node:assert/strict";
import { confetti, labelAt, throttle } from "../lib/builder/juice.ts";

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
