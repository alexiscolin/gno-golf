// The render census (lib/scene/census.ts, buildHole's census option): what
// drew each of a hole's pieces, as the game itself builds it. Every palette
// entry, placed alone, is drawn by its own path; the census names what the
// builder must refuse (E12): a tram line, a timed wall drawn as nothing, a
// piece hidden in the sea.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "./scene-harness.ts";
import { lane, stateOf } from "./builder-fixture.ts";
import { WORLD_NAMES, loadPalette } from "../lib/builder/palette.ts";
import { placePiece } from "../lib/builder/edit.ts";
import { writeDraft } from "../lib/builder/gg1.ts";
import { FIELD } from "../lib/builder/rules.ts";
import type { Draft, Piece } from "../lib/builder/draft.ts";
import type { Drawn, PieceRef } from "../lib/scene/census.ts";
import type { Hole } from "../lib/scene/data.ts";

const { buildHole } = await import("../lib/scene/course.ts");
const key = (r: PieceRef) => `${r.set}${r.i}${r.pulse ?? ""}`;
/** What the census said of each of the draft's pieces, by piece id (every report of its elements). */
function census(d: Draft, s: Hole = stateOf(d)): Map<string, Drawn[]> {
  const got = new Map<string, Drawn>();
  buildHole(s, { census: (p, drawn) => got.set(key(p), drawn) });
  const { refs } = writeDraft(d, FIELD[d.world]);
  return new Map([...refs].map(([id, rs]) => [id, rs.map((r) => got.get(key(r))!)]));
}
const piece = (entry: string, geometry: Piece["geometry"], over: Partial<Piece> = {}): Piece => ({ id: "x", entry, geometry, params: {}, clock: { k: "fixed" }, ...over });

void test("every palette entry, placed alone, is drawn by its own path", async () => {
  for (const w of WORLD_NAMES) {
    await loadWorld(w);
    for (const e of await loadPalette(w)) {
      const d = lane(w, [placePiece(e, "x", [14, 9], { to: [24, 4] })]);
      const said = census(d).get("x")!;
      assert.ok(said.every(Boolean), `${w} ${e.id}: reported`);
      for (const r of said) {
        const ok = e.kind === "rail" ? ["kerb", "table", "world"].includes(r.by)
          : e.kind === "bar" ? r.by === "bar" && (r.draw !== "fallback" || !!e.plain)
          : r.by === "table" || r.by === "world" || (r.by === "fallback" && !!e.plain);
        assert.ok(ok, `${w} ${e.id}: ${JSON.stringify(r)}`);
      }
    }
  }
});

void test("the census names a tram line, a timed wall alone, a piece of no drawing of its own", () => {
  const tram = lane("town", [piece("*/bar/tram", { t: "bar", a: [5, 5], b: [9, 5], thick: 1 }, { clock: { k: "substep", every: 40, on: 20, phase: 0 } })]);
  assert.deepEqual(census(tram).get("x")!.map((r) => r.by), ["tram", "tram", "tram", "tram"]);
  const lone = lane("garden", [piece("*/rail/", { t: "rail", a: [5, 5], b: [9, 5] }, { clock: { k: "substep", every: 40, on: 20, phase: 0 } })]);
  assert.deepEqual(census(lone).get("x"), [{ by: "hidden", why: "timed" }]);
  const pine = lane("garden", [piece("*/post/pine", { t: "post", c: [9, 9], r: 0.6 })]);
  assert.deepEqual(census(pine).get("x"), [{ by: "fallback" }], "a mountain post in the garden: the mushroom");
  const square = lane("garden", [
    piece("*/rail/", { t: "rail", a: [5, 5], b: [6, 5] }, { id: "a" }), piece("*/rail/", { t: "rail", a: [6, 5], b: [6, 6] }, { id: "b" }),
    piece("*/rail/", { t: "rail", a: [6, 6], b: [5, 6] }, { id: "c" }), piece("*/rail/", { t: "rail", a: [5, 6], b: [5, 5] }, { id: "d" }),
  ]);
  assert.equal(census(square).get("a")![0].by, "bar", "four short rails round a square: read as a bar");
});

void test("a rail out past the island's sea is hidden; a zone with no area too (a hole from a terminal)", () => {
  const d = lane("island", [piece("*/rail/", { t: "rail", a: [40, 2], b: [44, 2] })], 50, 20);
  const s = stateOf(d);
  const sea = { kind: "hazard" as const, min: [0, 0] as [number, number], max: [s.board.w, s.board.h] as [number, number], vec: [0, 0] as [number, number], scale: 0, round: false, skin: "sea", outside: true, poly: [[1, 1], [34, 1], [34, 24], [1, 24]] as [number, number][] };
  const got = new Map<string, Drawn>();
  buildHole({ ...s, zones: [...s.zones, sea, { ...sea, skin: "water", outside: false, poly: undefined, min: [5, 5], max: [5, 9] }] }, { census: (p, drawn) => got.set(key(p), drawn) });
  assert.deepEqual(got.get("wall4"), { by: "hidden", why: "unreached" }, "past the sea: no ball reaches it, nothing drawn");
  assert.deepEqual(got.get(`zone${s.zones.length + 1}`), { by: "hidden", why: "empty" });
});
