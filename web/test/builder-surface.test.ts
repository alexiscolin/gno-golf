// The green painted (lib/builder/surface.ts): a starter's green read from its
// rails walls itself with those very rails; every paint the gate lets
// through leaves the hole whole and within the Builder's limits; a side
// opens only where something still keeps the ball in; the green is the
// editor's own, never in the bytes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { host } from "./builder-fixture.ts";
import "./scene-harness.ts";
import { STARTERS } from "../lib/builder/starters.ts";
import { exportDraft, parseDraft, type Draft, type V } from "../lib/builder/draft.ts";
import { frame, writeDraft } from "../lib/builder/gg1.ts";
import { FIELD } from "../lib/builder/rules.ts";
import { loadPalette } from "../lib/builder/palette.ts";
import { errorsOf, gate, removePiece, type Dropped } from "../lib/builder/edit.ts";
import { BUILDER_LIMITS } from "../lib/builder/limits.ts";
import { applySurface, brushAt, isPlainRail, moveSide, narrowed, narrowness, outline, owned, painted, railsOf, strokeCells, surfaceOf, toggleSide, type Surface } from "../lib/builder/surface.ts";
import type { ValidateOptions } from "../lib/builder/pipeline.ts";
import { scratch, startsIn } from "../lib/builder/templates.ts";
import { makeGesture } from "../lib/builder/gesture.ts";

const { census } = await import("../lib/builder/drawn.ts");
const opts = async (world: string) => ({ host, palette: await loadPalette(world), census });
const painted0 = (d: Draft): Draft => ({ ...d, surface: surfaceOf(d)! });
const errors = async (d: Draft) => errorsOf(d, await opts(d.world)).map((i) => i.text);
/** A stroke through the editor's gate, as the board's paint goes. */
const paintEdit = (d: Draft, next: Surface, o: ValidateOptions): Dropped => gate(d, applySurface(d, next), o);
const ok = (r: Dropped): Draft => {
  if ("why" in r) assert.fail(r.why);
  return r;
};

void test("surfaceOf: every starter's green, walled again by its own rails (the same ends, the same order, the same names)", () => {
  for (const [world, list] of Object.entries(STARTERS)) {
    for (const [name, d] of Object.entries(list)) {
      const s = surfaceOf(d);
      assert.ok(s, `${world} ${name}: a green`);
      const rails = d.pieces.filter((p) => p.geometry.t === "rail");
      assert.deepEqual(railsOf(s.cells, []), rails.map((p) => ({ a: (p.geometry as { a: V }).a, b: (p.geometry as { b: V }).b })), `${world} ${name}`);
      assert.deepEqual(owned(d)!.ids, rails.map((p) => p.id), "read lazily, its rails its own");
      assert.deepEqual(applySurface({ ...d, surface: s }, s).pieces, d.pieces, `${world} ${name}: painted again, nothing moves`);
    }
  }
  const straight = STARTERS.garden.straight;
  assert.equal(surfaceOf({ ...straight, pieces: straight.pieces.filter((p) => p.id !== "r2") }), null, "an open lane: no green");
  const slanted = { ...straight, pieces: straight.pieces.map((p) => (p.id === "r2" ? { ...p, geometry: { t: "rail" as const, a: [33.5, 1.5] as V, b: [34.5, 13.5] as V } } : p)) };
  assert.equal(surfaceOf(slanted), null, "a diagonal wall: no green");
  assert.ok(startsIn("town").every((s) => owned(s.draft)), "a new hole is painted at once");
});

void test("outline: cells touching at a corner stay apart, a hole in the green has its own loop", () => {
  assert.equal(outline([[0, 0], [1, 1]]).length, 8, "two squares, four sides each");
  const ring: V[] = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (x !== 1 || y !== 1) ring.push([x, y]);
  assert.deepEqual(railsOf(ring, []).length, 8, "the ring's outside and its inside");
});

void test("paintEdit: a stroke grows the green and walls it; one that leaves the tee outside is refused; every one let through leaves the hole whole", async () => {
  const o = await opts("garden"), d = painted0(STARTERS.garden.straight), cells = d.surface!.cells;
  // grown down by a stroke along the bottom: its rails follow, the old bottom gone
  const grown = ok(paintEdit(d, { cells: painted(cells, strokeCells([10, 14], [20, 14], cells), true), open: [] }, o));
  assert.deepEqual(await errors(grown), []);
  assert.ok(grown.pieces.filter((p) => p.geometry.t === "rail").length > 4, "the bump walled");
  assert.deepEqual(owned(grown)!.ids, grown.pieces.filter((p) => p.geometry.t === "rail").map((p) => p.id), "every rail its own");
  assert.ok(grown.pieces.some((p) => p.id === "p1") && grown.pieces.some((p) => p.id === "p2"), "the posts as they were");
  // grown to the left: framed (the whole hole moves), the green with it
  const left = ok(paintEdit(d, moveSide({ cells, open: [] }, outline(cells).find((s) => s.out[0] === -1)!, 2), o));
  assert.deepEqual(owned(left)!.ids.length, left.pieces.filter((p) => p.geometry.t === "rail").length, "framed, the green still on its rails");
  assert.deepEqual(owned(left)!.hand, [], "none of the author's");
  assert.equal(left.tee[0], d.tee[0] + 2, "framed by two");
  // shrunk over the tee: refused, with why
  const over = paintEdit(d, { cells: painted(cells, brushAt(d.tee, cells), false), open: [] }, o);
  assert.ok("why" in over && over.why, "the tee out of the green");
  // a run of strokes: each let through is a whole hole
  let now = d;
  for (const [a, b, grow] of [[[30, 2], [30, 13], false], [[16, 0], [24, 0], true], [[3, 3], [3, 12], false], [[34, 7], [36, 7], true]] as [V, V, boolean][]) {
    const c = now.surface!.cells, r = paintEdit(now, { cells: painted(c, strokeCells(a, b, c), grow), open: now.surface!.open }, o);
    if ("why" in r) continue;
    assert.deepEqual(await errors(r), [], JSON.stringify([a, b, grow]));
    now = r;
  }
});

void test("paintEdit: within the Builder's piece budget", async () => {
  const o = await opts("garden"), d = painted0(STARTERS.garden.straight);
  // a comb along the top: a rail for each tooth's every side
  let cells = d.surface!.cells;
  for (let x = 1.5; x < 33.5; x += 2) cells = painted(cells, [[x, 0.5]], true);
  const r = paintEdit(d, { cells, open: [] }, o);
  assert.ok(railsOf(cells, []).length + 2 > BUILDER_LIMITS.pieces);
  assert.ok("why" in r && /60 pieces/.test(r.why), "why" in r ? r.why : "let through");
});

void test("a side opens where water keeps the ball in, never onto the grass", async () => {
  const o = await opts("garden"), d0 = painted0(STARTERS.garden.straight);
  const water = { id: "w1", entry: "*/hazard/water", geometry: { t: "rect" as const, min: [31.5, 1.5] as V, max: [33.5, 13.5] as V }, params: {}, clock: { k: "fixed" as const } };
  const d = { ...d0, pin: [29.5, 7.5] as V, pieces: [...d0.pieces, water] };
  assert.deepEqual(await errors(d), []);
  const sides = outline(d.surface!.cells), east = sides.find((s) => s.out[0] === 1)!, north = sides.find((s) => s.out[1] === -1)!;
  const opened = ok(paintEdit(d, { cells: d.surface!.cells, open: toggleSide([], east) }, o));
  assert.ok(!opened.pieces.some((p) => p.id === "r2"), "its rail gone");
  assert.ok(outline(opened.surface!.cells, opened.surface!.open).find((s) => s.out[0] === 1)!.open, "drawn open");
  const shut = ok(paintEdit(opened, { cells: opened.surface!.cells, open: toggleSide(opened.surface!.open, { ...east, open: true }) }, o));
  assert.equal(shut.pieces.filter((p) => p.geometry.t === "rail").length, 4, "shut again");
  const grass = paintEdit(d, { cells: d.surface!.cells, open: toggleSide([], north) }, o);
  assert.ok("why" in grass && grass.why, "the grass edge stays shut");
});

void test("owned: a rail taken away or moved by hand is the author's, its side open; the paint never touches it", () => {
  const d = painted0(STARTERS.garden.straight);
  const moved = { ...d, pieces: d.pieces.map((p) => (p.id === "r1" ? { ...p, geometry: { t: "rail" as const, a: [1.5, 1] as V, b: [33.5, 1] as V } } : p)) };
  assert.deepEqual(owned(moved)!.ids, ["r2", "r3", "r4"]);
  const next = applySurface(moved, { cells: painted(d.surface!.cells, strokeCells([10, 14], [12, 14], d.surface!.cells), true), open: owned(moved)!.open });
  // (framed: the hand's rail is the hole's top now, half a unit above the green)
  const r1 = next.pieces.find((p) => p.id === "r1")!.geometry as { a: V; b: V }, top = r1.a[1] + 0.5;
  assert.deepEqual([r1.a[1] - next.tee[1], r1.b[0] - r1.a[0]], [1 - d.tee[1], 32], "the hand's rail as it is");
  assert.ok(!next.pieces.some((p) => p.geometry.t === "rail" && p.id !== "r1" && p.geometry.a[1] === top && p.geometry.b[1] === top), "no rail again under it");
  assert.deepEqual(owned(removePiece(d, "r3"))!.ids, ["r1", "r2", "r4"]);
});

void test("the green is the editor's: in the file, never in the bytes; a file's green checked as it opens", () => {
  const d = painted0(STARTERS.island.dogleg), bare = { ...d };
  delete bare.surface;
  assert.equal(writeDraft(d, FIELD.island).hex, writeDraft(bare, FIELD.island).hex);
  assert.deepEqual(parseDraft(exportDraft(d)), d);
  assert.deepEqual(parseDraft(exportDraft(bare)), bare, "none: none");
  const bad = (s: unknown) => parseDraft(JSON.stringify({ ...d, surface: s }));
  assert.equal(typeof bad({ cells: [[1.6, 1.5]], open: [], ids: [] }), "string", "off the grid");
  assert.equal(typeof bad({ cells: [[1.5, 1.5], [2, 1.5]], open: [], ids: [] }), "string", "two lattices");
  assert.equal(typeof bad({ cells: [], open: [], ids: [] }), "string", "no cell");
  assert.deepEqual(parseDraft(JSON.stringify({ ...d, surface: { ...d.surface, ids: ["r1"] } })), d, "an older file's rails by name: let go (found, never stored)");
});

void test("owned: a rail of the author's on a run (timed) is neither open nor shut by the paint: no second rail over it", async () => {
  const o = await opts("garden"), d = painted0(STARTERS.garden.straight);
  const timed = { ...d, pieces: d.pieces.map((p) => (p.id === "r1" ? { ...p, clock: { k: "substep" as const, every: 40, on: 20, phase: 0 } } : p)) };
  const g = owned(timed)!, top = g.sides.find((x) => x.out[1] === -1)!;
  assert.deepEqual(g.ids, ["r2", "r3", "r4"]);
  assert.ok(top.hand && !top.open, "the author's: not drawn open");
  assert.equal(g.open.length, 0);
  const next = applySurface(timed, { cells: painted(g.cells, strokeCells([10, 14], [20, 14], g.cells), true), open: g.open }, g);
  assert.equal(next.pieces.filter((p) => p.geometry.t === "rail" && p.geometry.a[1] === p.geometry.b[1] && p.geometry.a[1] === (timed.pieces.find((q) => q.id === "r1")!.geometry as { a: V }).a[1] + next.tee[1] - timed.tee[1]).length, 1, "one rail along the top: the author's");
  assert.ok(!("why" in gate(timed, next, o)), "and the hole holds");
});

void test("moveSide: a side moved keeps its open edges with it", () => {
  const cells: V[] = [];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) cells.push([x + 0.5, y + 0.5]);
  const east = outline(cells).find((s) => s.out[0] === 1)!, open = toggleSide([], east);
  const out = moveSide({ cells, open }, east, 2), back = moveSide({ cells, open }, east, -1);
  assert.equal(out.cells.length, 32);
  assert.ok(outline(out.cells, out.open).find((s) => s.out[0] === 1)!.open, "out by two: still open");
  assert.ok(outline(back.cells, back.open).find((s) => s.out[0] === 1)!.open, "in by one: still open");
  assert.deepEqual(railsOf(out.cells, out.open).length, 3, "three walls: the open side none");
});

void test("the gate: a green narrower than three refused (E14's words), wide enough let through; a green narrow already, kept so", async () => {
  const o = await opts("garden"), d = painted0(STARTERS.garden.straight), cells = d.surface!.cells;
  assert.deepEqual(narrowness(cells), { bare: 0, split: 0, parts: 1 });
  // a nook two wide off the bottom: refused; three wide: let through
  const nook = (w: number) => painted(cells, Array.from({ length: 3 * w }, (_, i): V => [10.5 + (i % w), 13.5 + Math.floor(i / w)]), true);
  const two = paintEdit(d, { cells: nook(2), open: [] }, o);
  assert.ok("why" in two && /too narrow to play: keep it at least 3 wide/.test(two.why), "why" in two ? two.why : "let through");
  ok(paintEdit(d, { cells: nook(3), open: [] }, o));
  // two rooms a gap of two cells joins
  const rooms: V[] = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 11; x++) if (x < 4 || x > 6 || (y > 1 && y < 4)) rooms.push([x, y]);
  assert.ok(narrowness(rooms).bare > 0, "the way between them: too narrow");
  const wider = painted(rooms, [[11, 0], [11, 1], [11, 2], [11, 3], [11, 4]], true);
  assert.deepEqual(narrowed({ cells: rooms, open: [] }, { cells: wider, open: [] }), [], "narrow already, grown elsewhere: let through");
  assert.equal(narrowed({ cells: wider, open: [] }, { cells: rooms, open: [] }).length, 0, "no narrower than it was");
  assert.equal(narrowed(null, { cells: rooms, open: [] })[0].rule, "E14", "narrower than nothing: E14's");
  // the gate itself: past nothing, no error, the same draft back
  assert.equal(gate(d, d, o), d);
  assert.ok("why" in gate(d, applySurface(d, { cells: [], open: [] }), o), "no green: refused");
});

void test("a hole walled plainly by hand (no green kept) is painted all the same, read from its rails", async () => {
  const o = await opts("garden"), bare = { ...STARTERS.garden.straight };
  delete bare.surface;
  const g = owned(bare)!;
  assert.ok(g && g.cells.length > 0 && g.ids.length === 4, "its green read");
  const grown = ok(paintEdit(bare, { cells: painted(g.cells, strokeCells([10, 14], [20, 14], g.cells), true), open: [] }, o));
  assert.ok(grown.surface && grown.surface.cells.length > g.cells.length, "painted, kept from then on");
  assert.equal(owned({ ...bare, pieces: bare.pieces.map((p) => (p.id === "r2" ? { ...p, entry: "island/rail/rampart" } : p)) }), null, "a wall not plain: no green to paint");
});

void test("narrowed: a cut that leaves the green in two parts (an island beyond the cup, each part wide enough) is refused", async () => {
  const o = await opts("garden"), d = painted0(STARTERS.garden.straight), cells = d.surface!.cells;
  const far = Math.max(...cells.map((c) => c[0])), rows = cells.filter((c) => c[0] === far).map((c) => c[1]);
  const block = (x0: number, n: number) => rows.flatMap((y) => Array.from({ length: n }, (_, i): V => [far + x0 + i, y]));
  const grown = painted(cells, block(1, 8), true), cut = painted(grown, block(1, 3), false);
  assert.ok(narrowness(cut).bare === 0 && narrowness(cut).parts === 2, "each part wide enough, two of them");
  assert.match(narrowed({ cells: grown, open: [] }, { cells: cut, open: [] })[0]?.text ?? "", /cuts the green in two/);
  const r = gate({ ...d, surface: { cells: grown, open: [] } }, applySurface({ ...d, surface: { cells: grown, open: [] } }, { cells: cut, open: [] }), o);
  assert.ok("why" in r && /cuts the green in two/.test(r.why), "why" in r ? r.why : "let through");
});

void test("a green framed off the quarters (a post's rim) keeps its lattice: neighbours met to a millionth, its four sides, its rails its own", () => {
  const sc = scratch("garden"), post: Draft["pieces"][number] = { id: "q1", entry: "*/post/scarecrow", geometry: { t: "post", c: [1.04, 1.19], r: 0.37 }, params: {}, clock: { k: "fixed" } };
  const d = frame({ ...sc, pieces: [...sc.pieces, post] }), g = owned(d)!;
  assert.notEqual(d.surface!.cells[0][0] % 1, 0, "off the whole units");
  assert.equal(g.sides.length, 4, "a plain rectangle: four sides");
  assert.equal(g.ids.length, 4, "its four rails its own");
  assert.deepEqual([g.open, g.hand], [[], []]);
  assert.ok(surfaceOf({ ...d, surface: undefined }), "read from its rails too");
  assert.equal(applySurface(d, g).pieces.filter(isPlainRail).length, 4, "painted again: the same four");
});

void test("a stroke that changes no cell (Grow inside the green, Shrink off it) is no edit: nothing let go to the gate, no step", async () => {
  const o = await opts("garden"), d = painted0(STARTERS.garden.straight), green = owned(d)!;
  let sent = 0;
  const noop = () => {};
  const g = makeGesture({ onPreview: noop, onCommit: noop, onCancel: noop, onSet: noop, onSelect: noop, onDisarm: noop, onBin: noop, onPaint: () => void sent++ });
  const xs = green.cells.map((c) => c[0]), ys = green.cells.map((c) => c[1]);
  const mid: V = [(Math.min(...xs) + Math.max(...xs) + 1) / 2, (Math.min(...ys) + Math.max(...ys) + 1) / 2];
  const env = (mode: "grow" | "shrink") => ({ draft: d, quick: o, full: o, armed: null, selected: null, step: 0.5, paint: { mode, green } });
  const stroke = (mode: "grow" | "shrink", at: V) => (g.down(env(mode), at, { t: "brush" }), g.move(env(mode), at), g.up(env(mode), at));
  assert.equal(stroke("grow", mid), null, "grown inside: nothing");
  assert.equal(stroke("shrink", [mid[0], Math.max(...ys) + 20]), null, "shrunk where no green is: nothing");
  assert.equal(sent, 0);
  assert.deepEqual(stroke("grow", [mid[0], Math.max(...ys) + 1.5]), { painted: true }, "grown at its edge: let go to the gate");
  assert.equal(sent, 1);
});
