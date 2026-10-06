// The builder's checks, unit by unit (lib/builder/lane.ts, checks.ts): the
// lane and the way from the tee, the rules on a hole as fit gives it, the
// work gauges. (Every rule end to end, through the pipeline, and every
// course hole: builder-golden.test.ts.)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { checkHole, counts, work, ROUND_STROKES, WORK_WARN } from "../lib/builder/checks.ts";
import { laneOf, reach } from "../lib/builder/lane.ts";
import { LIMITS } from "../lib/builder/gg1.ts";
import type { HoleIn, WallIn } from "../lib/builder/types.ts";
import { host } from "./builder-fixture.ts";

const box = (x0: number, y0: number, x1: number, y1: number): WallIn[] =>
  [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]].map(([a, b, c, d]) => ({ a: [a, b], b: [c, d] }));
const hole = (over: Partial<HoleIn> = {}): HoleIn => ({
  w: 40, h: 20, par: 3, substeps: 22, world: "garden", order: 0, title: "Checked",
  tee: [4, 10], pin: [34, 10], cupR: 1.2, shelter: 0, friction: 0.86, bounce: 0.85, ballR: 0.5,
  walls: box(0, 0, 40, 20), posts: [], zones: [], pulses: [], ...over,
});
const rules = (h: HoleIn) => checkHole(h).map((i) => `${i.rule} ${i.text}`);

void test("a plain lane passes every check", () => {
  assert.deepEqual(checkHole(hole()), []);
});

void test("the lane is where a ball cannot leave the board: closed in by the fixed walls, posts and hazards", () => {
  const h = hole({ walls: [...box(0, 0, 40, 20), { a: [10, 2], b: [10, 18] }, { a: [20, 3], b: [26, 17] }] });
  const lane = laneOf(h);
  assert.equal(lane([4, 10]), true);
  assert.equal(lane([15, 10]), true, "past a rail in the lane (an even-odd count across it would say outside)");
  assert.equal(lane([50, 10]), false);
  assert.equal(laneOf(hole({ walls: box(0, 0, 40, 20).slice(0, 3) }))([4, 10]), false, "an outline with a side missing closes nothing");
  const gap = (lo: number, hi: number) => hole({ walls: [{ a: [0, 0], b: [40, 0] }, { a: [40, 0], b: [40, 20] }, { a: [40, 20], b: [0, 20] }, { a: [0, 20], b: [0, hi] }, { a: [0, lo], b: [0, 0] }] });
  assert.equal(laneOf(gap(9.6, 10.4))([4, 10]), true, "a gap narrower than the ball keeps it in");
  assert.equal(laneOf(gap(9.2, 10.8))([4, 10]), false, "one it fits through lets it out");
  const timed = hole({ walls: [...box(0, 0, 40, 20).slice(0, 3), { a: [0, 20], b: [0, 0], every: 40, on: 20 }] });
  assert.equal(laneOf(timed)([4, 10]), false, "a timed wall is no edge");
  const sea = hole({ walls: [], zones: [{ kind: "hazard", min: [-5, -5], max: [45, 25], outside: true, poly: [[0, 0], [40, 0], [40, 20], [0, 20]], skin: "sea" }] });
  assert.equal(laneOf(sea)([4, 10]), true, "the sea round a lane closes it as rails would");
});

void test("the way: a wall across stops it; a tunnel of any clock, and a hop off a hill's crest, carry it over", () => {
  const across = hole({ walls: [...box(0, 0, 40, 20), { a: [20, 0], b: [20, 20] }] });
  assert.equal(reach(across).reached, false);
  assert.equal(reach({ ...across, zones: [{ kind: "tunnel", min: [16, 8], max: [19, 11], vec: [24, 10], every: 30, on: 10 }] }).reached, true, "a geyser that opens now and then");
  const crevasse = hole({ zones: [{ kind: "hazard", min: [20, 0], max: [23, 20] }] });
  assert.equal(reach(crevasse).reached, false);
  assert.equal(reach({ ...crevasse, zones: [{ kind: "slope", min: [16, 0], max: [19.5, 20], vec: [-0.35, 0] }, ...crevasse.zones] }).reached, true, "a kicker's hop over it");
  assert.equal(reach({ ...crevasse, zones: [{ kind: "slope", min: [16, 0], max: [19.5, 20], vec: [-0.1, 0] }, ...crevasse.zones] }).reached, false, "a hill too gentle to launch");
});

void test("E7: a timed piece on for part of its cycle; a pulse that comes and goes within a round", () => {
  const timed = (on: number) => hole({ walls: [...box(0, 0, 40, 20), ...box(20, 4, 21, 6).map((w) => ({ ...w, every: 10, on }))] });
  assert.deepEqual(rules(timed(5)), []);
  assert.equal(rules(timed(10)).filter((r) => r.startsWith("E7")).length, 4, "always on: each of its four walls");
  const pulse = (every: number, on: number, phase = 0) => hole({ pulses: [{ every, on, phase, walls: [], posts: [{ c: [20, 5], r: 0.5 }], zones: [] }] });
  assert.deepEqual(rules(pulse(3, 1)), []);
  assert.match(rules(pulse(64, 62, 0))[0], new RegExp(`^E7 Pulse 1 \\(on for 62 of every 64 strokes\\) never goes in a round's ${ROUND_STROKES} strokes`), "off only at strokes 62 and 63: past a round");
  assert.deepEqual(rules(pulse(64, 62, 10)), [], "the same, its phase bringing them into the round (the mines' own)");
  assert.match(rules(pulse(80, 70))[0], /^E7 Pulse 1 \(on for 70 of every 80 strokes\) never goes in a round's 60 strokes/);
  assert.match(rules(pulse(1, 1))[0], /^E7 Pulse 1/);
});

void test("E8: GG1's limits, pulses' pieces counted in", () => {
  const many = (n: number) => Array.from({ length: n }, (_, k): WallIn => ({ a: [5 + (k % 30), 2], b: [5 + (k % 30), 3] }));
  assert.deepEqual(counts(hole()).walls, [4, LIMITS.walls]);
  const over = hole({ walls: [...box(0, 0, 40, 20), ...many(LIMITS.walls - 5)], pulses: [{ every: 3, on: 1, phase: 0, walls: many(2), posts: [], zones: [] }] });
  assert.ok(rules(over).includes(`E8 Too many walls: ${LIMITS.walls + 1} of ${LIMITS.walls}`));
});

void test("GG1's limits are the course package's own (data.gno)", () => {
  const src = fs.readFileSync(new URL("../../gno.land/p/gnogolf/course/data.gno", import.meta.url), "utf8");
  const go = (name: string) => Number(new RegExp(`\\b${name}\\s*=\\s*(\\d+)`).exec(src)![1]);
  assert.deepEqual(LIMITS, { walls: go("MaxWalls"), posts: go("MaxPosts"), zones: go("MaxZones"), poly: go("MaxPoly"), polyTotal: go("MaxPolyTotal"), pulses: go("MaxPulses"), skins: go("MaxSkins") });
});

void test("work: the gauges from the realm's own numbers; E11 as either nears its limit", () => {
  const lines = fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").trim().split("\n").map((l) => l.split(" "));
  const shares = lines.map(([slot, , , hex]) => {
    const c = host.check("x", hex);
    assert.ok(c.ok, slot);
    const w = work(c.cost);
    assert.ok(w.shot.share > 0 && w.shot.share <= 1 && w.storm.share > 0 && w.storm.share <= 1, slot);
    assert.equal(w.issues.length, (w.shot.share > WORK_WARN ? 1 : 0) + (w.storm.share > WORK_WARN ? 1 : 0), slot);
    assert.ok(w.issues.every((i) => i.severity === "warning"));
    return w.storm.share;
  });
  assert.ok(Math.max(...shares) > WORK_WARN, `${Math.max(...shares)}`);
});
