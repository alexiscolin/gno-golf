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
import { writeDraft } from "../lib/builder/gg1.ts";
import { FIELD } from "../lib/builder/rules.ts";
import { loadPalette } from "../lib/builder/palette.ts";
import { errorsOf, removePiece } from "../lib/builder/edit.ts";
import { BUILDER_LIMITS } from "../lib/builder/limits.ts";
import { applySurface, brushAt, moveSide, outline, owned, paintEdit, paintOff, painted, railsOf, strokeCells, surfaceOf, toggleSide } from "../lib/builder/surface.ts";
import { startsIn } from "../lib/builder/templates.ts";

const { census } = await import("../lib/builder/drawn.ts");
const opts = async (world: string) => ({ host, palette: await loadPalette(world), census });
const painted0 = (d: Draft): Draft => ({ ...d, surface: surfaceOf(d)! });
const errors = async (d: Draft) => errorsOf(d, await opts(d.world)).map((i) => i.text);
const ok = (r: Draft | { why: string }): Draft => {
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
      assert.deepEqual(s.ids, rails.map((p) => p.id));
      assert.deepEqual(applySurface({ ...d, surface: s }, s).pieces, d.pieces, `${world} ${name}: painted again, nothing moves`);
    }
  }
  const straight = STARTERS.garden.straight;
  assert.equal(surfaceOf({ ...straight, pieces: straight.pieces.filter((p) => p.id !== "r2") }), null, "an open lane: no green");
  const slanted = { ...straight, pieces: straight.pieces.map((p) => (p.id === "r2" ? { ...p, geometry: { t: "rail" as const, a: [33.5, 1.5] as V, b: [34.5, 13.5] as V } } : p)) };
  assert.equal(surfaceOf(slanted), null, "a diagonal wall: no green");
  assert.ok(startsIn("town").every((s) => s.draft.surface && !paintOff(s.draft)), "a new hole is painted at once");
  assert.ok(paintOff({ ...straight }), "a hole walled by hand says why it is not painted");
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
  assert.deepEqual(owned(grown)!.ids, grown.surface!.ids, "every rail its own");
  assert.ok(grown.pieces.some((p) => p.id === "p1") && grown.pieces.some((p) => p.id === "p2"), "the posts as they were");
  // grown to the left: framed (the whole hole moves), the green with it
  const left = ok(paintEdit(d, { cells: moveSide(cells, outline(cells).find((s) => s.out[0] === -1)!, 2), open: [] }, o));
  assert.deepEqual(owned(left)!.ids, left.surface!.ids, "framed, the green still on its rails");
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
  assert.equal(typeof bad({ cells: [[1.5, 1.5]], open: [], ids: [3] }), "string", "a name not a name");
});
