// Frame pacing: pace()'s carried budget, slowFrames()'s trimmed-mean hitch
// detector, and frameMs()'s tier table (60/30/10/sleep).
import { test } from "node:test";
import assert from "node:assert/strict";
import { AWAY_MS, capped30, frameMs, pace, slowFrames } from "../lib/engine/pace.ts";

void test("pace draws once a whole interval (less 1ms jitter) is owed, else carries the gap", () => {
  // a 10ms interval: an 8ms gap alone is not owed yet
  let out = pace(0, 8, 10);
  assert.equal(out.draw, false);
  assert.equal(out.budget, 8);
  // 2ms more reaches the interval: drawn, nothing left over
  out = pace(out.budget, 2, 10);
  assert.equal(out.draw, true);
  assert.equal(out.budget, 0);
});

void test("pace carries at most one interval, so a stalled tab does not burst-draw", () => {
  // a huge gap (tab was backgrounded) is capped to one interval's worth carried forward
  const interval = 1000 / 60;
  const out = pace(0, 5000, interval);
  assert.equal(out.draw, true);
  assert.ok(Math.abs(out.budget - interval) < 1e-9);
});

void test("pace returns the same object every call", () => {
  const a = pace(0, 0, 16);
  const b = pace(0, 0, 16);
  assert.equal(a, b);
});

void test("pace averages a 90Hz display to 60 draws a second (30 of every 3 refreshes)", () => {
  const interval = 1000 / 60, refresh = 1000 / 90;
  let budget = 0, drawn = 0;
  for (let i = 0; i < 90; i++) {
    const out = pace(budget, refresh, interval);
    budget = out.budget;
    if (out.draw) drawn++;
  }
  assert.equal(drawn, 60);
});

void test("slowFrames flags a GPU averaging over 20ms, the slowest tenth left out", () => {
  const busy = Array.from({ length: 20 }, () => 25); // steady 25ms: over the 16.7ms cap
  assert.equal(slowFrames(busy), true);
  const fine = Array.from({ length: 20 }, () => 15);
  assert.equal(slowFrames(fine), false);
});

void test("slowFrames drops the slowest 10% so one hitch does not read as a slow GPU", () => {
  const mostlyFine = [...Array.from({ length: 18 }, () => 10), 500, 500]; // two huge hitches among 18 fine frames
  assert.equal(slowFrames(mostlyFine), false);
});

void test("slowFrames on a single sample keeps it (ceil(0.9) of 1 is 1: nothing to drop)", () => {
  assert.equal(slowFrames([100]), true);
  assert.equal(slowFrames([10]), false);
});

void test("capped30 tells a steady 30 fps cap (a battery saver) from a GPU slow on its own", () => {
  const cap = Array.from({ length: 60 }, (_, i) => 33.3 + (i % 3) - 1); // 32.3 to 34.3 ms
  assert.equal(slowFrames(cap), true); // slow, as the probe sees it
  assert.equal(capped30(cap), true); // but held there by the browser: not remembered
  assert.equal(capped30(Array.from({ length: 60 }, (_, i) => 22 + (i % 20))), false); // spread out: the GPU
  assert.equal(capped30(Array.from({ length: 60 }, () => 50)), false); // well under 30 fps
  assert.equal(capped30([...Array.from({ length: 50 }, () => 33), ...Array.from({ length: 10 }, () => 16.7)]), false); // some frames at 60: no cap
});

void test("frameMs: busy always wins, 60fps regardless of anything else", () => {
  assert.equal(frameMs(true, false, false, 0, 0), 1000 / 60);
  assert.equal(frameMs(true, true, true, 999999, 999999), 1000 / 60);
});

void test("frameMs: nothing moving sleeps a second after the last change, else ticks at 10fps", () => {
  assert.equal(frameMs(false, false, false, 0, 500), 1000 / 10);
  assert.equal(frameMs(false, false, false, 0, 1000), 1000 / 10); // boundary: not yet past 1000
  assert.equal(frameMs(false, false, false, 0, 1001), 0);
});

void test("frameMs: moving but away (no input past AWAY_MS) settles to 10fps", () => {
  assert.equal(frameMs(false, true, false, AWAY_MS, 0), 1000 / 30); // boundary: not yet past AWAY_MS
  assert.equal(frameMs(false, true, false, AWAY_MS + 1, 0), 1000 / 10);
  assert.equal(frameMs(false, true, true, AWAY_MS + 1, 0), 1000 / 10); // a fast mover dozes too
  assert.equal(AWAY_MS, 60_000); // the doze: after a minute
});

void test("frameMs: present and moving, fast movers get 60fps, slow decor 30fps", () => {
  assert.equal(frameMs(false, true, true, 0, 0), 1000 / 60);
  assert.equal(frameMs(false, true, false, 0, 0), 1000 / 30);
});

void test("pace holds 60, 30 and 10 fps on 60 to 165 Hz screens, the 30 in even gaps", () => {
  // four seconds of refreshes at hz, drawn at interval: the frames drawn a second, and the gaps between them
  const run = (hz: number, interval: number) => {
    let budget = 0, drawn = 0, since = 0;
    const gaps: number[] = [];
    for (let i = 0; i < hz * 4; i++) {
      since += 1000 / hz;
      const p = pace(budget, 1000 / hz, interval);
      budget = p.budget;
      if (!p.draw) continue;
      drawn++;
      gaps.push(since);
      since = 0;
    }
    return { fps: drawn / 4, gaps };
  };
  for (const hz of [60, 75, 90, 120, 144, 165]) {
    const busy = run(hz, 1000 / 60), idle = run(hz, 1000 / 30), doze = run(hz, 1000 / 10);
    assert.ok(Math.abs(busy.fps - 60) <= 2, `${hz} Hz busy: ${busy.fps} fps`);
    assert.ok(Math.abs(idle.fps - 30) <= 1.5, `${hz} Hz idle: ${idle.fps} fps`);
    assert.ok(Math.abs(doze.fps - 10) <= 1, `${hz} Hz away: ${doze.fps} fps`);
    assert.ok(!slowFrames(busy.gaps), `${hz} Hz on time: not slow`);
    // no idle gap over two refreshes past the interval
    assert.ok(Math.max(...idle.gaps.slice(1)) <= 1000 / 30 + 1000 / hz + 1, `${hz} Hz idle: even gaps`);
  }
});
