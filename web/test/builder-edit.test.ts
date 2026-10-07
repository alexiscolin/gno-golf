// The editor's edits (lib/builder/edit.ts), pure: placing an entry, keeping a
// value in its range, changing world.
import { test } from "node:test";
import assert from "node:assert/strict";
import { changeWorld, clampTo, matchIn, placePiece, unknownEntry } from "../lib/builder/edit.ts";
import { emptyDraft, type Draft } from "../lib/builder/draft.ts";
import { loadPalette } from "../lib/builder/palette.ts";
import "./scene-harness.ts";

const garden = await loadPalette("garden"), island = await loadPalette("island"), town = await loadPalette("town");
const byId = (es: typeof garden, id: string) => es.find((e) => e.id === id)!;

void test("clampTo: inside the range, on its steps", () => {
  const r = { min: 0.3, max: 4.5, step: 0.05, def: 0.8 };
  assert.equal(clampTo(9, r), 4.5);
  assert.equal(clampTo(0.01, r), 0.3);
  assert.equal(clampTo(1.234, r), 1.25);
});

void test("placePiece: on the grid, the entry's defaults, its first clock", () => {
  const rock = placePiece(byId(garden, "*/post/rock"), "a", [10, 5]);
  assert.deepEqual(rock, { id: "a", entry: "*/post/rock", geometry: { t: "post", c: [10, 5], r: 0.8 }, params: {}, clock: { k: "fixed" } });
  const bar = placePiece(byId(garden, "*/bar/plank"), "b", [2, 2], { size: 3.1, thick: 9 });
  assert.deepEqual(bar.geometry, { t: "bar", a: [2, 2], b: [5, 2], thick: 1.6 }, "length on the grid, thickness clamped");
  const bumper = placePiece(byId(garden, "*/post/bumper"), "c", [3, 3], { bounce: 2 });
  assert.equal(bumper.params.bounce, 1.5, "a kicking post's bounce, kept in its range");
  const cave = placePiece(byId(garden, "*/tunnel/cave"), "d", [3, 3]);
  assert.deepEqual([cave.geometry, cave.params], [{ t: "round", min: [3, 3], max: [6, 6] }, { to: [11, 3] }]);
});

void test("changeWorld: kept where every piece has an entry there (or a shared one); refused naming those that have none", () => {
  const d: Draft = { ...emptyDraft("island"), pieces: [placePiece(byId(island, "*/post/rock"), "a", [5, 5]), placePiece(byId(island, "island/bar/rowing boat"), "b", [8, 5])] };
  const r = changeWorld(d, "town", town);
  assert.deepEqual(r, { refused: ["the rowing boat at (8, 5)"] });
  const plain: Draft = { ...d, pieces: [d.pieces[0]] };
  const moved = changeWorld(plain, "town", town);
  assert.ok(!("refused" in moved));
  assert.equal(moved.world, "town");
  assert.deepEqual(moved.pieces, plain.pieces);
  const back = changeWorld({ ...d, pieces: [placePiece(byId(island, "island/post/palm"), "c", [1, 1])] }, "garden", garden);
  assert.ok(!("refused" in back) && back.pieces[0].entry === "*/post/palm", "the island's own palm: the shared one in the garden");
  const own = changeWorld({ ...emptyDraft("town"), pieces: [placePiece(byId(town, "town/post/lamp"), "l", [1, 1])] }, "island", island);
  assert.ok(!("refused" in own) && own.pieces[0].entry === "*/post/lamp", "a world's own drawing of a shared skin: the shared one in the next world");
});

void test("a draft opened: every piece's entry is its world's, or it is refused, named", () => {
  const d: Draft = { ...emptyDraft("garden"), pieces: [placePiece(byId(garden, "*/post/rock"), "a", [5, 5])] };
  assert.equal(unknownEntry(d, garden), null);
  assert.equal(unknownEntry({ ...d, pieces: [{ ...d.pieces[0], entry: "island/post/palm" }] }, garden), "Piece a is no piece of the Garden's.");
  assert.equal(unknownEntry({ ...d, pieces: [{ ...d.pieces[0], entry: "constructor" }] }, garden), "Piece a is no piece of the Garden's.");
});

void test("matchIn: a hole's piece to its world's entry, the world's own drawing first; null for none", () => {
  const m = matchIn(island);
  assert.equal(m({ kind: "post", skin: "palm" }), "island/post/palm");
  assert.equal(m({ kind: "post", skin: "rock" }), "*/post/rock");
  assert.equal(m({ kind: "post", skin: "lamp" }), "*/post/lamp");
  assert.equal(m({ kind: "bar", skin: "tram" }), null, "hand-only");
  assert.equal(m({ kind: "post", skin: "constructor" }), null);
});
