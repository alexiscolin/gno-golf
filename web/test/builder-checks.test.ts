// The builder's own checks (lib/builder/checks.ts): each with a hole that
// passes and one that fails, the issue naming its piece and its place. And
// the work gauges, from builder.wasm's check on real holes.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { checkHole, counts, inLane, work, PULSE_EVERY, WORK_WARN } from "../lib/builder/checks.ts";
import { LIMITS, type GHole, type GWall } from "../lib/builder/gg1.ts";
import { makeBuilderHost } from "../lib/builder/wasm.ts";

const box = (x0: number, y0: number, x1: number, y1: number): GWall[] =>
  [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]].map(([a, b, c, d]) => ({ a: [a, b], b: [c, d] }));
const hole = (over: Partial<GHole> = {}): GHole => ({
  w: 40, h: 20, par: 3, substeps: 22, world: "garden", order: 0, title: "Checked",
  tee: [4, 10], pin: [34, 10], cupR: 1.2, shelter: 0, friction: 0.86, bounce: 0.85, ballR: 0.5,
  walls: box(0, 0, 40, 20), posts: [], zones: [], pulses: [], ...over,
});
const rules = (h: GHole) => checkHole(h).map((i) => `${i.rule} ${i.text}`);

void test("a plain lane passes every check", () => {
  assert.deepEqual(checkHole(hole()), []);
});

void test("the lane is where a ball cannot leave the board: closed in by the untimed walls", () => {
  const h = hole({ walls: [...box(0, 0, 40, 20), { a: [10, 2], b: [10, 18] }, { a: [20, 3], b: [26, 17] }] });
  const lane = inLane(h);
  assert.equal(lane([4, 10]), true);
  assert.equal(lane([15, 10]), true, "past a rail in the lane (an even-odd count across it would say outside)");
  assert.equal(lane([23, 10]), true, "past a slanted one");
  assert.equal(lane([50, 10]), false);
  const open = hole({ walls: box(0, 0, 40, 20).slice(0, 3) });
  assert.equal(inLane(open)([4, 10]), false, "an outline with a side missing closes nothing");
  const gap = (lo: number, hi: number) => hole({ walls: [{ a: [0, 0], b: [40, 0] }, { a: [40, 0], b: [40, 20] }, { a: [40, 20], b: [0, 20] }, { a: [0, 20], b: [0, hi] }, { a: [0, lo], b: [0, 0] }] });
  assert.equal(inLane(gap(9.6, 10.4))([4, 10]), true, "a gap narrower than the ball keeps it in");
  assert.equal(inLane(gap(9.2, 10.8))([4, 10]), false, "one it fits through lets it out");
  const timed = hole({ walls: [...box(0, 0, 40, 20).slice(0, 3), { a: [0, 20], b: [0, 0], every: 40, on: 20 }] });
  assert.equal(inLane(timed)([4, 10]), false, "a timed wall is no edge");
});

void test("E2: the tee off the board's lane, on a wall, a post, in water, in a pulse's hazard", () => {
  assert.deepEqual(rules(hole({ tee: [45, 10] })).filter((r) => r.startsWith("E2")).length, 1);
  assert.match(rules(hole({ tee: [0.4, 10] }))[0], /^E2 The tee touches the plain wall at \(0.4, 10\)/);
  assert.match(rules(hole({ walls: [...box(0, 0, 40, 20), { a: [4.54, 8], b: [4.54, 12], skin: "hedge" }] }))[0], /^E2 The tee touches the hedge wall/, "0.54 away: inside the ball and its gap");
  assert.deepEqual(rules(hole({ walls: [...box(0, 0, 40, 20), { a: [4.56, 2], b: [4.56, 8] }] })), [], "0.56 away: clear");
  assert.match(rules(hole({ posts: [{ c: [5, 10], r: 0.6, skin: "rock" }] }))[0], /^E2 The tee touches the rock post/);
  assert.match(rules(hole({ zones: [{ kind: "hazard", min: [2, 8], max: [6, 12], skin: "water", round: true }] }))[0], /^E2 The tee touches the water zone/);
  const pulsed = hole({ pulses: [{ every: 3, on: 1, phase: 0, walls: [], posts: [], zones: [{ kind: "hazard", min: [3, 9], max: [5, 11] }] }] });
  assert.match(rules(pulsed)[0], /^E2 The tee touches the plain zone \(pulse 1\)/);
  assert.deepEqual(rules(hole({ zones: [{ kind: "surface", min: [2, 8], max: [6, 12], skin: "sand", scale: 0.5 }] })), [], "the tee may stand on sand");
});

void test("E3: the cup's disc in the lane, clear of every piece of any clock", () => {
  assert.match(rules(hole({ pin: [45, 10] }))[0], /^E3 The cup at \(45, 10\) is not wholly in the lane/);
  assert.deepEqual(rules(hole({ pin: [38.5, 10] })), ["E3 The cup touches the plain wall at (38.5, 10)"], "across the edge: the wall it crosses");
  assert.match(rules(hole({ walls: [...box(0, 0, 40, 20), ...box(31.5, 9, 32.5, 11).map((w) => ({ ...w, skin: "plank", every: 40, on: 20 }))] }))[0], /^E3 The cup touches the plank wall/, "a timed bar that closes it");
  assert.match(rules(hole({ zones: [{ kind: "tunnel", min: [35, 9], max: [37, 11], vec: [10, 10], skin: "cave" }] }))[0], /^E3 The cup touches the cave zone/);
  assert.match(rules(hole({ posts: [{ c: [36.5, 10], r: 0.9, skin: "bumper", bounce: 1.2 }] }))[0], /^E3 The cup touches the bumper post/);
  assert.deepEqual(rules(hole({ posts: [{ c: [37.3, 10], r: 0.5 }] })), [], "1.7 clear plus the post");
});

void test("E7: a timed piece is on for part of its cycle; a pulse's cycle fits a round", () => {
  const timed = (on: number) => hole({ walls: [...box(0, 0, 40, 20), ...box(20, 9, 21, 11).map((w) => ({ ...w, every: 10, on }))] });
  assert.deepEqual(rules(timed(5)), []);
  assert.equal(rules(timed(10)).filter((r) => r.startsWith("E7")).length, 4, "always on: each of its four walls");
  assert.equal(rules(timed(0)).filter((r) => r.startsWith("E7")).length, 4, "never on");
  const pulse = (every: number, on: number) => hole({ pulses: [{ every, on, phase: 0, walls: [], posts: [{ c: [20, 10], r: 0.5 }], zones: [] }] });
  assert.deepEqual(rules(pulse(3, 1)), []);
  assert.match(rules(pulse(1, 1))[0], /^E7 Pulse 1 is on for 1 of every 1 strokes/);
  assert.equal(rules(pulse(PULSE_EVERY.max + 1, 1)).length, 1);
});

void test("E8: GG1's limits, pulses' pieces counted in", () => {
  const many = (n: number) => Array.from({ length: n }, (_, k): GWall => ({ a: [5 + (k % 30), 2], b: [5 + (k % 30), 3] }));
  assert.deepEqual(counts(hole()).walls, [4, LIMITS.walls]);
  assert.deepEqual(rules(hole({ walls: [...box(0, 0, 40, 20), ...many(LIMITS.walls - 4)] })), []);
  const over = hole({ walls: [...box(0, 0, 40, 20), ...many(LIMITS.walls - 5)], pulses: [{ every: 3, on: 1, phase: 0, walls: many(2), posts: [], zones: [] }] });
  assert.deepEqual(rules(over), [`E8 Too many walls: ${LIMITS.walls + 1} of ${LIMITS.walls}`]);
  const ring = Array.from({ length: LIMITS.poly + 1 }, (_, k): [number, number] => [20 + 3 * Math.cos(k / 10.5), 10 + 3 * Math.sin(k / 10.5)]);
  assert.match(rules(hole({ zones: [{ kind: "surface", min: [17, 7], max: [23, 13], poly: ring }] }))[0], /^E8 the plain zone has 65 points: at most 64/);
});

void test("GG1's limits are the course package's own (data.gno)", () => {
  const src = fs.readFileSync(new URL("../../gno.land/p/gnogolf/course/data.gno", import.meta.url), "utf8");
  const go = (name: string) => Number(new RegExp(`\\b${name}\\s*=\\s*(\\d+)`).exec(src)![1]);
  assert.deepEqual(LIMITS, { walls: go("MaxWalls"), posts: go("MaxPosts"), zones: go("MaxZones"), poly: go("MaxPoly"), polyTotal: go("MaxPolyTotal"), pulses: go("MaxPulses"), skins: go("MaxSkins") });
});

void test("work: the gauges from the realm's own numbers; E11 as either nears its limit", () => {
  const host = makeBuilderHost(new WebAssembly.Module(fs.readFileSync(new URL("../lib/sim/builder.wasm", import.meta.url))));
  const lines = fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").trim().split("\n").map((l) => l.split(" "));
  const shares = lines.map(([slot, , , hex]) => {
    const c = host.check("x", hex);
    assert.ok(c.ok, slot);
    const w = work(c.cost);
    assert.ok(w.shot.share > 0 && w.shot.share <= 1 && w.storm.share > 0 && w.storm.share <= 1, slot);
    assert.equal(w.issues.length, (w.shot.share > WORK_WARN ? 1 : 0) + (w.storm.share > WORK_WARN ? 1 : 0), slot);
    return w.storm.share;
  });
  // the course's stormiest holes come close to the limit (mountain/7: 39,278 units over the floor)
  assert.ok(Math.max(...shares) > WORK_WARN, `${Math.max(...shares)}`);
});
