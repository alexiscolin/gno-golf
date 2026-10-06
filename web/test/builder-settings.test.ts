// The inspector's settings (lib/builder/settings.ts), pure: a piece's size,
// its numbers and its clock, each kept within its entry's ranges, on the
// grid where it is geometry; a pulse made when a piece first takes one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDraft } from "../lib/builder/draft.ts";
import { placePiece } from "../lib/builder/edit.ts";
import { loadPalette } from "../lib/builder/palette.ts";
import { DIRS, sizesOf, TIMING, withClock, withDir, withNumber, withSize, withTiming } from "../lib/builder/settings.ts";
import "./scene-harness.ts";

const garden = await loadPalette("garden");
const entry = (id: string) => garden.find((e) => e.id === id)!;

void test("sizesOf, withSize: a post's radius, a bar's length along its way, a zone's two sides; kept in range", () => {
  const rock = placePiece(entry("*/post/rock"), "p", [5, 5]);
  assert.deepEqual(sizesOf(rock).map((s) => [s.key, s.value]), [["r", 0.8]]);
  assert.equal((withSize(rock, entry("*/post/rock"), "r", 9).geometry as { r: number }).r, 4.5);
  const plank = placePiece(entry("*/bar/plank"), "b", [5, 5]);
  assert.deepEqual(sizesOf(plank).map((s) => [s.key, s.value]), [["length", 3]]);
  assert.deepEqual((withSize(plank, entry("*/bar/plank"), "length", 6.1).geometry as { b: number[] }).b, [11, 5], "on the grid");
  const pond = placePiece(entry("*/hazard/water"), "w", [5, 5]);
  assert.deepEqual(sizesOf(pond).map((s) => s.key), ["width", "depth"]);
  assert.deepEqual((withSize(pond, entry("*/hazard/water"), "depth", 0.2).geometry as { max: number[] }).max, [11, 6.5], "a side at its least");
});

void test("withNumber: bounce, grip and grade on their entry's steps and in range", () => {
  const bumper = placePiece(entry("*/post/bumper"), "p", [5, 5]);
  assert.equal(withNumber(bumper, entry("*/post/bumper"), "bounce", 9).params.bounce, entry("*/post/bumper").bounce!.max);
  const hill = garden.find((e) => e.kind === "slope")!;
  assert.equal(withNumber(placePiece(hill, "s", [5, 5]), hill, "grade", 0.013).params.grade, hill.grade!.min);
});

void test("withDir: a hill's push turned to one of eight ways", () => {
  const hill = garden.find((e) => e.kind === "slope")!, s = placePiece(hill, "s", [5, 5]);
  assert.equal(DIRS.length, 8);
  assert.deepEqual(withDir(s, 2).params.dir, DIRS[2]);
});

void test("withClock, withTiming: a clock its entry allows; a pulse made for the first that takes one; timing within a round", () => {
  const d = { ...emptyDraft("garden"), pieces: [placePiece(entry("*/bar/plank"), "b", [5, 5])] };
  const timed = withClock(d, "b", "substep", entry("*/bar/plank"));
  assert.deepEqual(timed.pieces[0].clock, { k: "substep", every: 40, on: 20, phase: 0 });
  const pulsed = withClock(d, "b", "stroke", entry("*/bar/plank"));
  assert.deepEqual([pulsed.pieces[0].clock, pulsed.pulses], [{ k: "stroke", pulse: 0 }, [{ every: 3, on: 1, phase: 0 }]]);
  assert.equal(withClock(d, "b", "stroke", { ...entry("*/bar/plank"), clocks: ["fixed"] }), d, "a clock its entry does not take: nothing");
  const t = withTiming(timed, "b", { every: 500, on: 900, phase: -3 });
  assert.deepEqual(t.pieces[0].clock, { k: "substep", every: TIMING.every.max, on: TIMING.every.max - 1, phase: 0 });
  const p = withTiming(pulsed, "b", { every: 4, on: 2, phase: 1 });
  assert.deepEqual(p.pulses, [{ every: 4, on: 2, phase: 1 }], "a pulsed piece's timing is its pulse's");
});
