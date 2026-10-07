// The golden set's broken holes (builder-golden.test.ts): one or more per
// rule, each with the refusals it must meet, in the rule's own sentences.
// Shared with the tests that must cope with any hole the rules refuse (the
// difficulty meter's: it never throws on one).
import { lane, rail } from "./builder-fixture.ts";
import { loadPalette } from "../lib/builder/palette.ts";
import { placePiece } from "../lib/builder/edit.ts";
import { BUILDER_LIMITS } from "../lib/builder/limits.ts";
import type { Draft } from "../lib/builder/draft.ts";

export const garden = await loadPalette("garden");
export const put = (id: string, entry: string, at: [number, number], p: Parameters<typeof placePiece>[3] = {}) => placePiece(garden.find((e) => e.id === entry)!, id, at, p);

/** Each broken hole: what it breaks, the hole, the refusals the whole pipeline gives (rule, piece, sentence). */
export const cases: [string, () => Draft, string[]][] = [
  ["L0: a size outside its entry's range (a hand-edited file)", () => lane("garden", [{ ...put("x", "*/post/rock", [12, 9]), geometry: { t: "post", c: [12, 9], r: 6 } }]),
    ["L0 x: The rock's radius is 6: 0.3 to 4.5"]],
  ["E1: wider than the board takes (the tee out past the rails)", () => ({ ...lane("garden", [], 90, 20), tee: [-2.5, 11.5] }),
    ["E1 -: The hole is 94 across: at most 93 between its outermost pieces"]],
  ["E1: a tunnel's way out past the hole's edge", () => lane("garden", [put("x", "*/tunnel/cave", [8, 8], { to: [40, 5] })]),
    ["E1 x: The cave comes out at (41.5, 6.5), off the board once the hole is fitted"]],
  ["E1b: a bar reaching past the lane's edge", () => lane("garden", [{ ...put("x", "*/bar/plank", [0, 9]), geometry: { t: "bar", a: [-1, 9], b: [3, 9], thick: 0.5 } }]),
    ["E1b x: The plank reaches past the hole's outermost rail, post, tee or cup: bring it in"]],
  ["E2: the tee on a post", () => lane("garden", [put("x", "*/post/rock", [3.5, 10])]),
    ["E2 x: The tee touches the rock at (4.5, 11.5)"]],
  ["E2: the tee in the water", () => lane("garden", [put("x", "*/hazard/water", [2, 8], { size: 3 })]),
    ["E2 x: The tee touches the water at (4.5, 11.5)"]],
  ["E3: the cup in a pond", () => lane("garden", [put("x", "*/hazard/water", [25.5, 8.5], { size: 3 })]),
    ["E3 x: The cup touches the water at (28.5, 11.5)"]],
  ["E4: the cup walled off", () => lane("garden", [rail("x", [20, 0], [20, 20])]),
    ["E4 -: The cup cannot be reached from the tee"]],
  ["E5: a pond too thin to stop a fast ball (a hand-edited file)", () => lane("garden", [{ ...put("x", "*/hazard/water", [12, 2]), geometry: { t: "rect", min: [12, 2], max: [13.25, 18] } }]),
    ["L0 x: The water's side is 1.25: 1.5 to 80"]],
  ["E6: a tunnel out into the water", () => lane("garden", [put("x", "*/tunnel/cave", [8, 3], { to: [20, 10] }), put("w", "*/hazard/water", [18, 8], { size: 4 })]),
    ["E6 x: The cave comes out at (21.5, 11.5), in a zone that moves the ball on"]],
  ["E7: a timed bar always on", () => lane("garden", [{ ...put("x", "*/bar/plank", [12, 6]), clock: { k: "substep", every: 40, on: 40, phase: 0 } }]),
    ["E7 x: The plank is on for 40 of 40 substeps: 1 to 39"]],
  ["E10: a post walled in, out of every ball's reach", () => lane("garden", [rail("a", [10, 4], [16, 4]), rail("b", [16, 4], [16, 8]), rail("c", [16, 8], [10, 8]), rail("d", [10, 8], [10, 4]), put("x", "*/post/rock", [13, 6])]),
    ["E10 x: The rock at (14.5, 7.5) is outside the lane: no ball reaches it"]],
  ["E12: four rails round a little square, drawn as a bar", () => lane("garden", [rail("a", [12, 8], [13, 8]), rail("b", [13, 8], [13, 9]), rail("c", [13, 9], [12, 9]), rail("d", [12, 9], [12, 8])]),
    ["a", "b", "c", "d"].map((id, k) => `E12 ${id}: The wall at ${["(13.5, 9.5)", "(14.5, 9.5)", "(14.5, 10.5)", "(13.5, 10.5)"][k]} is drawn as part of a bar: give it room from the other rails`)],
  ["E13: two posts in one another", () => lane("garden", [put("x", "*/post/rock", [12, 9]), put("y", "*/post/stump", [12.5, 9])]),
    ["E13 x: The rock overlaps the tree stump at (13.5, 10.5)"]],
  ["E13: a post on a rail", () => lane("garden", [put("x", "*/post/rock", [12, 0.25])]),
    ["E13 x: The rock stands on the wall at (13.5, 2.3)"]],
  ["E13: two bars crossing", () => lane("garden", [put("x", "*/bar/plank", [10, 9], { size: 4 }), { ...put("y", "*/bar/plank", [12, 7], { size: 4 }), geometry: { t: "bar", a: [12, 7], b: [12, 11], thick: 0.5 } }]),
    ["E13 x: The plank crosses the plank at (13.5, 10.5)"]],
  ["E13: a bar run through a rail", () => lane("garden", [rail("a", [15, 0], [15, 8]), { ...put("x", "*/bar/plank", [13, 6]), geometry: { t: "bar", a: [13, 6], b: [17, 6], thick: 0.5 } }]),
    ["E13 x: The plank crosses the wall at (16.5, 7.5)"]],
  ["E13: a bar poking through the lane's own rail", () => lane("garden", [{ ...put("x", "*/bar/plank", [10, 18]), geometry: { t: "bar", a: [10, 18], b: [10, 21], thick: 0.5 } }]),
    ["E13 x: The plank crosses the wall at (11.5, 21)"]],
  ["E13: a short rail wholly under a bar", () => lane("garden", [rail("a", [12, 10], [12.5, 10]), { ...put("x", "*/bar/plank", [10, 10]), geometry: { t: "bar", a: [10, 10], b: [14, 10], thick: 1 } }]),
    ["E13 x: The plank crosses the wall at (13.5, 11.5)"]],
  ["E13: two ponds over one another (drawn at one height: they flicker)", () => lane("garden", [put("x", "*/hazard/water", [10, 3], { size: 3 }), put("y", "*/hazard/water", [11.5, 4], { size: 3 })]),
    ["E13 x: The water lies over the water at (11.5, 4.5)"]],
  ["E13: a flowerbed over soil (two surfaces at one height)", () => lane("garden", [put("x", "*/surface/flowerbed", [10, 3], { size: 3 }), put("y", "*/surface/soil", [11.5, 4], { size: 3 })]),
    ["E13 x: The flowerbed lies over the vegetable patch at (11.5, 4.5)"]],
  ["E14: the only way to the cup a ball only just fits", () => lane("garden", [rail("a", [15, 0], [15, 9.5]), rail("b", [15.5, 10.5], [15.5, 20])]),
    ["E14 a: The gap at (16.75, 11.5) between the wall and the wall is 1.12 wide, and the way to the cup goes through it: at least 1.25, or a ball only just fits"]],
  ["E15: a bar against a rail, swallowed by the kerb", () => lane("garden", [{ ...put("x", "*/bar/plank", [10, 0.5]), geometry: { t: "bar", a: [10, 0.5], b: [14, 0.5], thick: 0.5 } }]),
    ["E15 x: The plank is 0.25 from the wall: at least 0.5, or the kerb swallows it"]],
  ["E16: a piece past the Builder's limit (posts and sand in rows, clear of one another)", () => lane("garden", Array.from({ length: BUILDER_LIMITS.pieces - 3 }, (_, k) => {
    const at: [number, number] = [4 + (k % 14) * 3, 4 + Math.floor(k / 14) * 4.5];
    return k % 2 ? put(`s${k}`, "*/post/rock", at, { size: 0.3 }) : put(`s${k}`, "*/surface/sand", at, { size: 1 });
  }), 50, 30),
    [`E16 -: Too many pieces: ${BUILDER_LIMITS.pieces + 1} of ${BUILDER_LIMITS.pieces}`]],
  ["E16: a moving piece past the Builder's limit (clock hands)", () => lane("garden", Array.from({ length: BUILDER_LIMITS.moving + 1 }, (_, k) => put(`h${k}`, "*/bar/clock hand", [8, 4 + 2 * k])), 50, 30),
    [`E16 -: Too many moving pieces: ${BUILDER_LIMITS.moving + 1} of ${BUILDER_LIMITS.moving}`]],
  ["L2: a name the chain refuses", () => ({ ...lane("garden", []), title: "see t.me/x" }),
    ["L2 -: The name or the note looks like a web address. Write \"St. Andrews\", not \"St.Andrews\"."]],
];
