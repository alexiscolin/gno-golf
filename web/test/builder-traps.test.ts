// The pre-launch audit's fixes (2026-10-22) beyond the golden set's broken
// holes (builder-broken.ts): the trap rule's model (lane.ts traps) is
// generous where a ball can climb, a piece's drawing follows the physics'
// shape (a round crevasse or cliff), and the rain's puddles lie on
// the ground drawn under them, slopes too.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { host, hexOf, lane, PERIOD } from "./builder-fixture.ts";
import { loadWorld } from "./scene-harness.ts";
import { garden, put } from "./builder-broken.ts";
import { validate } from "../lib/builder/pipeline.ts";
import { gridOf, traps } from "../lib/builder/lane.ts";
import { checkHole, LOOSE, pushSaid, trapSaid } from "../lib/builder/checks.ts";
import { plainOf } from "../lib/builder/explain.ts";
import type { HoleIn } from "../lib/builder/types.ts";
import { loadPalette } from "../lib/builder/palette.ts";
import { placePiece } from "../lib/builder/edit.ts";
import { makeWeather } from "../lib/scene/weather.ts";
import type { Draft } from "../lib/builder/draft.ts";
import type { Hole } from "../lib/scene/data.ts";

await loadWorld("garden");
await loadWorld("mountain");
const { census } = await import("../lib/builder/drawn.ts");
const { buildHole } = await import("../lib/scene/course.ts");
const errors = (d: Draft, palette = garden) => validate(d, { host, palette, census }).issues.filter((i) => i.severity === "error").map((i) => `${i.rule} ${i.text}`);
type P = [number, number];
const slope = (id: string, min: P, max: P, grade: number, dir: P) => ({ ...put(id, "*/slope/", min, { grade }), geometry: { t: "rect" as const, min, max }, params: { grade, dir } });

void test("traps: a slope a stroke climbs, a dead end a ball rolls back out of, a valley, sand on a steep slope: none is a trap", () => {
  // the corridor of the golden set's dead end, short enough to climb out of (a full stroke climbs about 17 at 0.35, as
  // the physics plays it: rolling spends as much as the slope)
  assert.deepEqual(errors(lane("garden", [put("c", "*/rail/", [8, 5]), slope("x", [10, 0], [22, 5], 0.35, [1, 0])].map((p) => (p.id === "c" ? { ...p, geometry: { t: "rail" as const, a: [8, 5] as P, b: [22, 5] as P } } : p)), 22, 20)), []);
  // a gentle slope (a ball rests on it, and is struck again from there): no length is too long
  assert.deepEqual(errors(lane("garden", [slope("x", [8, 0], [60, 8], 0.2, [-1, 0])], 64, 8)), []);
  // sand laid on a steep one: the ball rests in the sand, and climbs on from there
  const sand = { ...put("s", "*/surface/sand", [8, 0]), geometry: { t: "rect" as const, min: [8, 0] as P, max: [60, 8] as P } };
  assert.deepEqual(errors(lane("garden", [slope("x", [8, 0], [60, 8], 0.35, [-1, 0]), sand], 64, 8)).filter((e) => e.startsWith("E17")), []);
});

void test("traps: generous where a ball can climb (no bounce's loss), never more than a full stroke's climb", () => {
  const g = (len: number) => {
    const d = lane("garden", [slope("x", [8, 0], [8 + len, 8], 0.35, [-1, 0])], 12 + len, 8);
    return traps(host.decode(hexOf(d)), LOOSE(host.decode(hexOf(d))));
  };
  // a full stroke launches at 0.79·10^¾: v²/2 over the grade and the rolling, about 17 up a 0.35 slope of grass
  assert.deepEqual(g(14), [], "within a stroke's climb: the cup is reached");
  assert.equal(g(40)[0]?.kind, "climb", "past it: out of reach");
});

void test("pieces that come and go shut a cell for good only between them: one timed plank alone across the door, the door still opens", () => {
  const door = (pieces: Draft["pieces"]) => lane("garden", [put("u", "*/rail/", [15, 0]), put("v", "*/rail/", [15, 11.5]), ...pieces].map((p) =>
    p.id === "u" ? { ...p, geometry: { t: "rail" as const, a: [15, 0] as P, b: [15, 8.5] as P } } : p.id === "v" ? { ...p, geometry: { t: "rail" as const, a: [15, 11.5] as P, b: [15, 20] as P } } : p));
  const plank = (id: string, x: number, phase: number) => ({ ...put(id, "*/bar/plank", [x, 8.5]), geometry: { t: "bar" as const, a: [x, 8.5] as P, b: [x, 11.5] as P, thick: 0.5 }, clock: { k: "substep" as const, every: 40, on: 20, phase } });
  assert.deepEqual(errors(door([plank("p", 14.75, 0)])), []);
  // two in turn, on half the cycle each and overlapping a tick: still shut for good
  assert.deepEqual(errors(door([plank("p", 14.75, 0), plank("q", 15.25, 20)])), ["E4 The cup cannot be reached from the tee: the tee is closed in"]);
  // two that are both off now and then: the door opens then
  const off = [plank("p", 14.75, 0), { ...plank("q", 15.25, 20), clock: { k: "substep" as const, every: 40, on: 15, phase: 20 } }];
  assert.deepEqual(errors(door(off)), []);
  const h = host.decode(hexOf(door(off)));
  assert.ok(gridOf(h, LOOSE(h)).shut.some(Boolean));
});

for (const skin of ["crevasse", "cliff"])
void test(`a round ${skin} is drawn round: its walls deep down lie on its ellipse, never its box's corners`, async () => {
  const mountain = await loadPalette("mountain");
  const e = mountain.find((x) => x.kind === "hazard" && x.skin === skin)!;
  const d = lane("mountain", [{ ...placePiece(e, "x", [12, 6]), geometry: { t: "round", min: [12, 6], max: [18, 14] } }]);
  assert.deepEqual(errors(d, mountain), []);
  host.load(`${skin}/v1`, hexOf(d));
  host.setperiod(PERIOD);
  const s = JSON.parse(host.state(`${skin}/v1`)) as Hole, z = s.zones.find((q) => q.skin === skin)!;
  const root = buildHole(s), v = new THREE.Vector3(), cx = (z.min[0] + z.max[0]) / 2, cz = (z.min[1] + z.max[1]) / 2, rx = (z.max[0] - z.min[0]) / 2, rz = (z.max[1] - z.min[1]) / 2;
  let deep = 0, off = 0;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const pos = (o as THREE.Mesh).geometry?.attributes?.position;
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.y > -1.5 || v.x < z.min[0] - 0.5 || v.x > z.max[0] + 0.5 || v.z < z.min[1] - 0.5 || v.z > z.max[1] + 0.5) continue;
      deep++;
      if (((v.x - cx) / rx) ** 2 + ((v.z - cz) / rz) ** 2 > 1.15) off++;
    }
  });
  assert.ok(deep > 100, `its walls drawn (${deep})`);
  assert.equal(off, 0, "none on the box's corners");
});

void test("the rain's puddles lie on the ground drawn there, a slope's too, not under it", () => {
  const scene = new THREE.Scene(), w = makeWeather(scene);
  w.board(30, 20, "garden", () => true, (x) => (x > 10 ? 1.2 : 0));
  w.set([{ kind: "surface", min: [0, 0], max: [30, 20], vec: [0, 0], scale: 1.025, round: false, skin: "rain", every: 0, on: 0, phase: 0 },
    { kind: "surface", min: [14, 8], max: [16, 10], vec: [0, 0], scale: 0.6, round: true, skin: "puddle", every: 0, on: 0, phase: 0 }]);
  const ys: number[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh, pos = m.geometry?.attributes?.position;
    if (m.material && (m.material as THREE.MeshBasicMaterial).color?.getHex() === 0x5f8fa8 && pos) for (let i = 0; i < pos.count; i++) ys.push(pos.getY(i));
  });
  assert.ok(ys.length > 0, "a puddle drawn");
  assert.ok(ys.every((y) => Math.abs(y - 1.23) < 1e-6), `on the slope's ground (${[...new Set(ys)].join(", ")})`);
});

void test("a piece that comes back is held to the push itself: where UnstickIn sets the ball's centre, a radius and 0.02 off it", () => {
  const pond = { ...put("w", "*/hazard/water", [10, 14]), geometry: { t: "rect" as const, min: [10, 14] as P, max: [16, 20] as P } };
  const plank = (y: number) => ({ ...put("x", "*/bar/plank", [10, y]), geometry: { t: "bar" as const, a: [10, y] as P, b: [16, y] as P, thick: 0.5 }, clock: { k: "substep" as const, every: 40, on: 20, phase: 0 } });
  assert.deepEqual(errors(lane("garden", [pond, plank(13)])), [], "0.75 from the pond: the ball set down 0.52 off the plank, clear of it");
  assert.deepEqual(errors(lane("garden", [pond, plank(13.5)])), ["E17 The plank comes back on a ball beside the water and would push it in: at least 0.55 between them"]);
});

// the coordinator's (2026-10-22): fair designs pass; what the physics shows harmless is not refused
const cave = (id: string, min: P, max: P, to: P) => ({ ...put(id, "*/tunnel/cave", min, { to }), geometry: { t: "rect" as const, min, max } });
const rail = (id: string, a: P, b: P) => ({ ...put(id, "*/rail/", a), geometry: { t: "rail" as const, a, b } });
const boxOf = (x0: number, y0: number, x1: number, y1: number, k: string) => [rail(`${k}1`, [x0, y0], [x1, y0]), rail(`${k}2`, [x1, y0], [x1, y1]), rail(`${k}3`, [x1, y1], [x0, y1]), rail(`${k}4`, [x0, y1], [x0, y0])];

void test("fair designs: a gate by a cave's mouth (a ball pushed in goes through), a way out by another's mouth, a pier, a wall across a pond, a cave in a wall", () => {
  const gate = { ...put("x", "*/bar/plank", [11.75, 8]), geometry: { t: "bar" as const, a: [11.75, 8] as P, b: [11.75, 12] as P, thick: 0.5 }, clock: { k: "substep" as const, every: 40, on: 20, phase: 0 } };
  assert.deepEqual(errors(lane("garden", [cave("t", [12, 9], [14, 11], [25, 4]), gate])), []);
  // (played: 165 balls under that gate as it comes back, 48 sent through the cave, none stuck: the audit's gatemouth.ts)
  const pond = { ...put("w", "*/hazard/water", [10, 12]), geometry: { t: "rect" as const, min: [10, 12] as P, max: [16, 20] as P } };
  assert.deepEqual(errors(lane("garden", [cave("a", [5, 2], [7, 4], [14, 10]), cave("b", [15, 9], [17, 11], [25, 4])])), [], "a way out 1 from another's mouth: a chain");
  assert.deepEqual(errors(lane("garden", [pond, rail("x", [13, 10], [13, 13])])), [], "a pier");
  assert.deepEqual(errors(lane("garden", [pond, rail("x", [13, 12], [13, 20])])), [], "a wall across a pond");
  assert.deepEqual(errors(lane("garden", [rail("w", [12, 10], [20, 10]), cave("t", [13, 9], [15, 11], [25, 4])])), [], "a cave in a wall");
});

void test("a chain of tunnels with no way out of it: a trap, named by the tunnel into it", () => {
  // the cave a sends the ball into box X; X's cave b into box Y; Y's cave c back into X
  const d = lane("garden", [...boxOf(14, 2, 22, 8, "x"), ...boxOf(14, 12, 22, 18, "y"),
    cave("a", [5, 2], [7, 4], [16, 5]), cave("b", [19, 4], [21, 6], [16, 15]), cave("c", [19, 14], [21, 16], [16.5, 5.5])], 30, 20);
  assert.deepEqual(errors(d), ["E17 The cave lets the ball out at (17.5, 6.5), where it can never get back to the cup"]);
});

void test("a slope's cells judged by what lies on each: sand on part of a dead end lets a ball stop there and climb on, ice does not", () => {
  const dead = (on: Draft["pieces"]) => lane("garden", [rail("c", [8, 5], [50, 5]), slope("x", [10, 0], [50, 5], 0.35, [1, 0]), ...on], 50, 20);
  const patch = (entry: string, x0: number, x1: number) => ({ ...put("s", entry, [x0, 0]), geometry: { t: "rect" as const, min: [x0, 0] as P, max: [x1, 5] as P } });
  // sand every 20 along it: the ball stops on each patch, and climbs the 20 to the next (a stroke climbs about 28)
  const sands = [patch("*/surface/sand", 18, 20), { ...patch("*/surface/sand", 38, 40), id: "s2" }];
  assert.deepEqual(errors(dead(sands)).filter((e) => e.startsWith("E17")), []);
  assert.equal(errors(dead([patch("*/surface/ice", 10, 50)])).filter((e) => e.startsWith("E17")).length, 1);
});

void test("a round crevasse from edge to edge of the lane is drawn round too, never splitting the mountain as a box", async () => {
  const mountain = await loadPalette("mountain");
  const e = mountain.find((x) => x.kind === "hazard" && x.skin === "crevasse")!;
  const d = lane("mountain", [{ ...placePiece(e, "x", [12, 0]), geometry: { t: "round", min: [12, 0], max: [18, 20] } }]);
  host.load("crevasse-full/v1", hexOf(d));
  host.setperiod(PERIOD);
  // (stretched to the board's edges, as a hole of the chain's may have it: the Builder's frame keeps a margin)
  const s = JSON.parse(host.state("crevasse-full/v1")) as Hole, z = s.zones.find((q) => q.skin === "crevasse")!;
  [z.min[1], z.max[1]] = [0, s.board.h];
  const root = buildHole(s), v = new THREE.Vector3(), cx = (z.min[0] + z.max[0]) / 2, cz = (z.min[1] + z.max[1]) / 2, rx = (z.max[0] - z.min[0]) / 2, rz = (z.max[1] - z.min[1]) / 2;
  let deep = 0, off = 0, past = 0;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const pos = (o as THREE.Mesh).geometry?.attributes?.position;
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.y > -1.5 || v.x < z.min[0] - 0.5 || v.x > z.max[0] + 0.5) continue;
      // (a split of the mountain runs its walls on past the board's edges)
      if (v.z < -1 || v.z > s.board.h + 1) past++;
      else if (v.z > z.min[1] + 0.5 && v.z < z.max[1] - 0.5) (deep++, ((v.x - cx) / rx) ** 2 + ((v.z - cz) / rz) ** 2 > 1.15 && off++);
    }
  });
  // (the lane's own cut edges, cell by cell, step a little past the ellipse where it narrows to its ends)
  assert.ok(deep > 100 && off / deep < 0.02, `${deep} deep, ${off} off its ellipse`);
  // (a box one splits it: a thousand vertices of its walls down past the board; the scenery has a dozen or two there)
  assert.ok(past < 100, `no split of the mountain past the board (${past} deep vertices there)`);
});

void test("traps stays quick on a busy board: 92 by 92, sixteen steep slopes, eight tunnels, eight timed planks", () => {
  const pieces: Draft["pieces"] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) pieces.push(slope(`s${i}${j}`, [6 + i * 20, 6 + j * 22], [18 + i * 20, 18 + j * 22], 0.35, i % 2 ? [1, 0] : [0, 1]));
  for (let k = 0; k < 8; k++) pieces.push(cave(`t${k}`, [4 + k * 11, 88], [6 + k * 11, 90], [10 + k * 10, 20 + (k % 3) * 22]));
  for (let k = 0; k < 8; k++) pieces.push({ ...put(`p${k}`, "*/bar/plank", [8 + k * 10, 3]), geometry: { t: "bar" as const, a: [8 + k * 10, 3] as P, b: [12 + k * 10, 3] as P, thick: 0.5 }, clock: { k: "substep" as const, every: 40, on: 20, phase: k * 5 } });
  const h = host.decode(hexOf(lane("garden", pieces, 92, 92)));
  traps(h, LOOSE(h)); // (warm)
  const t0 = performance.now();
  assert.deepEqual(traps(h, LOOSE(h)), []);
  // (about 10 ms here: the quick way, no slope one-way, no energies; 1.4 s once, when a flood went round and round)
  assert.ok(performance.now() - t0 < 250, `${(performance.now() - t0).toFixed(0)} ms`);
});

// the verifier's second pass (2026-10-22): abutting slopes of other grades or falls; the quick way and the full one agree
void test("a dead end of abutting slopes of different grades or falls: refused, the quick way and the full one alike", () => {
  const dead = (...parts: [P, P, number, P][]) => lane("garden", [rail("c", [8, 5], [50, 5]), ...parts.map(([a, b, g, dir], i) => slope(`x${i}`, a, b, g, dir))], 50, 20);
  const holes: [string, Draft, boolean][] = [
    ["0.35 then 0.34, 20 each", dead([[10, 0], [30, 5], 0.35, [1, 0]], [[30, 0], [50, 5], 0.34, [1, 0]]), true],
    ["0.35 then 0.30", dead([[10, 0], [30, 5], 0.35, [1, 0]], [[30, 0], [50, 5], 0.3, [1, 0]]), true],
    ["a fall turned 8°", dead([[10, 0], [30, 5], 0.35, [1, 0]], [[30, 0], [50, 5], 0.35, [0.99, 0.14]]), true],
    ["0.35, 0.34, 0.33, 13 or so each", dead([[10, 0], [23, 5], 0.35, [1, 0]], [[23, 0], [37, 5], 0.34, [1, 0]], [[37, 0], [50, 5], 0.33, [1, 0]]), true],
    ["two of 6, a stroke climbs both", dead([[10, 0], [16, 5], 0.35, [1, 0]], [[16, 0], [22, 5], 0.3, [1, 0]]), false],
  ];
  for (const [what, d, trap] of holes) {
    const h = host.decode(hexOf(d)), quick = traps(h, LOOSE(h)), full = traps(h, LOOSE(h), true);
    assert.deepEqual(quick, full, `${what}: the quick way as the full one`);
    assert.equal(quick.length > 0, trap, `${what}: ${trap ? "a trap" : "none"}`);
  }
});

void test("a valley beside the way: a ball stopped at its bottom climbs out of neither side (its bottom a place of rest)", () => {
  const d = lane("garden", [rail("c", [8, 6], [80, 6]), slope("x", [10, 0], [40, 6], 0.35, [1, 0]), slope("y", [40, 0], [70, 6], 0.35, [-1, 0])], 80, 20);
  const said = errors(d).map((e) => e.replace(/ at \(.*?\)/, ""));
  assert.ok(said.length >= 1 && said.every((e) => e === "E17 The slope sends the ball down, where it can never get back to the cup"), said.join("; "));
});

// the verifier's last pass (2026-10-22): the trap search left to what is kept, so a drag stays quick on a busy board
const { clampMove, dragCheck, dropMove, gate, movePiece } = await import("../lib/builder/edit.ts");
const quick = { host, palette: garden, traps: false }, full = { host, palette: garden, census };

void test("no trap made by a drop or a nudge: the clamp's probes leave the trap search out, what is kept is judged with it", () => {
  const d = lane("garden", [rail("c", [8, 5], [50, 5]), slope("x", [10, 14], [50, 19], 0.35, [1, 0])], 50, 20);
  assert.deepEqual(errors(d), [], "the slope along the top: a ball rolls off it to the lane");
  const p = d.pieces.find((q) => q.id === "x")!, into: P = [11.5, 1.5]; // (framed: the dead end's corridor)
  const dropped = dropMove(d, "x", into, quick, full);
  assert.ok("why" in dropped && /can never climb back to the cup/.test(dropped.why), JSON.stringify(dropped));
  // a nudge (the editor's keyboard): clamped with the quick checks, kept through the gate with the full ones
  const to = clampMove(d, "x", into, quick), nudged = gate(d, { ...d, pieces: d.pieces.map((q) => (q.id === "x" ? movePiece(p, to) : q)) }, full);
  assert.deepEqual(to, into, "the quick checks let it go there");
  assert.ok("why" in nudged && /can never climb back to the cup/.test(nudged.why), JSON.stringify(nudged));
  // the ghost as it moves: no trap search
  assert.equal(dragCheck(d, full).piece(movePiece(p, into)).filter((i) => i.rule === "E17").length, 0);
});

void test("a clamp and a drag move stay quick on a busy board (the walk: 4 strides, then a bisection)", () => {
  const pieces: Draft["pieces"] = [];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) pieces.push(slope(`s${i}${j}`, [6 + i * 44, 6 + j * 22], [46 + i * 44, 18 + j * 22], 0.35, i % 2 ? [1, 0] : [-1, 0]));
  for (let k = 0; k < 8; k++) pieces.push({ ...put(`p${k}`, "*/bar/plank", [8 + k * 10, 3]), geometry: { t: "bar" as const, a: [8 + k * 10, 3] as P, b: [12 + k * 10, 3] as P, thick: 0.5 }, clock: { k: "substep" as const, every: 40, on: 20, phase: k * 5 } });
  for (let k = 0; k < 8; k++) pieces.push(cave(`t${k}`, [4 + k * 11, 88], [6 + k * 11, 90], [10 + k * 10, 20 + (k % 3) * 22]));
  for (let k = 0; k < 8; k++) pieces.push({ ...put(`w${k}`, "*/hazard/water", [15 + (k % 6) * 13, 21 + Math.floor(k / 6) * 44]), geometry: { t: "rect" as const, min: [15 + (k % 6) * 13, 21 + Math.floor(k / 6) * 44] as P, max: [17 + (k % 6) * 13, 23 + Math.floor(k / 6) * 44] as P } });
  const d = lane("garden", pieces, 92, 92), p = d.pieces.find((q) => q.id === "p3")!, w = d.pieces.find((q) => q.id === "w2")!.geometry as { min: P };
  // (as the editor asks them: its quick checks, no census; with the trap search asked for too, the clamp leaves it out)
  const asked = { host, palette: garden };
  clampMove(d, "p3", [w.min[0] + 1, w.min[1] + 1], asked); // (warm)
  let t0 = performance.now();
  clampMove(d, "p3", [w.min[0] + 1, w.min[1] + 1], asked);
  const clamp = performance.now() - t0, check = dragCheck(d, asked);
  t0 = performance.now();
  for (let k = 0; k < 4; k++) check.piece(movePiece(p, [40 + k * 0.25, 40]));
  const move = (performance.now() - t0) / 4;
  // (about 250 ms and 30 ms alone, a few times that with the whole suite running beside it; 5.6 s and 200 ms alone
  // when every probe searched for traps)
  assert.ok(clamp < 2500, `clamp ${clamp.toFixed(0)} ms`);
  assert.ok(move < 400, `a drag move ${move.toFixed(0)} ms`);
});

void test("the full way names a chain of tunnels as the quick one does (the step into it); no slope blamed for a cup cut off by a wall", () => {
  const d = lane("garden", [...boxOf(14, 2, 22, 8, "x"), ...boxOf(14, 12, 22, 18, "y"),
    cave("a", [5, 2], [7, 4], [16, 5]), cave("b", [19, 4], [21, 6], [16, 15]), cave("c", [19, 14], [21, 16], [16.5, 5.5])], 30, 20);
  const h = host.decode(hexOf(d));
  assert.deepEqual(traps(h, LOOSE(h), true), traps(h, LOOSE(h)));
  assert.deepEqual(traps(h, LOOSE(h), true).map((t) => t.zone), [h.zones.findIndex((z) => z.kind === "tunnel" && z.min[0] === 6.5)]);
  // the cup in a box of rails, a kicker's hop the way's flood lets over them (a ball in the air meets the rails), a
  // long steep slope elsewhere that has nothing to do with it
  const cut = lane("garden", [...boxOf(30, 6, 38, 14, "z"), { ...slope("k", [24, 8], [27, 12], 0.3, [-1, 0]) }, slope("far", [4, 15], [40, 19], 0.35, [1, 0])].map((q) => q), 40, 20);
  const said = errors({ ...cut, pin: [35.5, 11.5] });
  assert.ok(!said.some((e) => /too long for a ball to climb/.test(e)), said.join("; "));
});

void test("a clamp never jumps a rail, a post or a bar: an 8-long drag across a rail 1.5 on stops in front of it", () => {
  const d = lane("garden", [rail("w", [14.5, 4], [14.5, 16]), put("x", "*/post/rock", [13, 10], { size: 0.5 })]);
  const p = d.pieces.find((q) => q.id === "x")!, from = (p.geometry as { c: P }).c, to: P = [from[0] + 8, from[1]];
  const at = clampMove(d, "x", to, full);
  assert.ok(at[0] <= 16 - 0.5 && at[0] >= from[0], `stopped at ${at.join(", ")}, in front of the rail at x 16 (the lane 1.5 in)`);
  // a thin plank and a post in the way too
  const plank = { ...put("b", "*/bar/plank", [14.25, 6]), geometry: { t: "bar" as const, a: [14.25, 6] as P, b: [14.25, 14] as P, thick: 0.25 } };
  const d2 = lane("garden", [plank, put("x", "*/post/rock", [13, 10], { size: 0.5 })]);
  const by = clampMove(d2, "x", to, full);
  assert.ok(by[0] <= 15.75 - 0.5, `stopped at ${by.join(", ")}, in front of the plank at x 15.75`);
});

void test("a clamp lands where the full checks hold: short of the dead end, not at its mouth only for the drop to snap back", () => {
  const d = lane("garden", [rail("c", [8, 5], [50, 5]), slope("x", [10, 14], [50, 19], 0.35, [1, 0])], 50, 20);
  const into: P = [11.5, 1.5], at = clampMove(d, "x", into, { host, palette: garden });
  assert.notDeepEqual(at, into, "not into the dead end");
  const p = d.pieces.find((q) => q.id === "x")!, moved = gate(d, { ...d, pieces: d.pieces.map((q) => (q.id === "x" ? movePiece(p, at) : q)) }, full);
  assert.ok(!("why" in moved), `where it stopped, the hole holds: ${JSON.stringify(moved).slice(0, 200)}`);
});

// The review's (2026-10-22): E17's push from every piece that comes back (lane.ts movers, gridOf's list), and every
// sentence of E6 and E17 in the player's words.
void test("E17's push: a pulse's wall and a timed wall by water are held to it as a pulse's post is", () => {
  const ring = [[1.5, 1.5, 41.5, 1.5], [41.5, 1.5, 41.5, 21.5], [41.5, 21.5, 1.5, 21.5], [1.5, 21.5, 1.5, 1.5]].map(([a, b, c, d]) => ({ a: [a, b] as P, b: [c, d] as P }));
  const pond = { kind: "hazard" as const, min: [16, 14] as P, max: [22, 20] as P, skin: "water" };
  const hole = (more: Partial<HoleIn>): HoleIn => ({ w: 96, h: 96, par: 3, substeps: 22, world: "garden", order: 0, title: "Push", tee: [5.5, 11.5], pin: [35.5, 11.5], cupR: 1.2, shelter: 0, friction: 0.86, bounce: 0.85, ballR: 0.5, walls: ring, posts: [], zones: [pond], pulses: [], ...more });
  const pushes = (h: HoleIn) => checkHole(h, { traps: false }).filter((i) => i.rule === "E17").map((i) => i.text);
  const by = (y: number) => ({ a: [16, y] as P, b: [22, y] as P });
  assert.equal(pushes(hole({ pulses: [{ every: 2, on: 1, phase: 0, walls: [by(13.6)], posts: [], zones: [] }] })).length, 1, "a pulse's wall 0.4 from the pond");
  assert.equal(pushes(hole({ pulses: [{ every: 2, on: 1, phase: 0, walls: [by(13)], posts: [], zones: [] }] })).length, 0, "1 from it: clear");
  assert.equal(pushes(hole({ walls: [...ring, { ...by(13.6), every: 40, on: 20, phase: 0 }] })).length, 1, "a timed wall 0.4 from it");
  assert.equal(pushes(hole({ walls: [...ring, by(13.6)] })).length, 0, "a wall that stays: it pushes nothing");
  assert.equal(pushes(hole({ pulses: [{ every: 2, on: 1, phase: 0, walls: [], posts: [{ c: [19, 13.2], r: 0.5 }], zones: [] }] })).length, 1, "a pulse's post 0.3 from it");
});

void test("every sentence of E6 and E17 has its plain words (explain.ts plainOf), none left as the rule's own", () => {
  const at: P = [12.5, 4];
  const said = [
    ...(["tunnel", "slope", "hop", "climb", "cut"] as const).map((kind) => ["E17", trapSaid({ kind, zone: 0, at }, "the slope")]),
    ["E17", pushSaid({ ballR: 0.5 }, "the plank", "the water")],
    ...["outside the lane", "on a wall or a post", "in a zone that moves the ball on", "inside the plank", "0.8 from its own mouth: at least 1.5, or the ball runs straight back in"].map((why) => ["E6", `The cave comes out at (3, 4), ${why}`]),
  ] as const;
  for (const [rule, text] of said) assert.notEqual(plainOf({ rule, text }), `${text.replace(/ at \(-?[\d.]+, -?[\d.]+\)/g, "")}.`, `${rule} ${text}: in plain words`);
});
