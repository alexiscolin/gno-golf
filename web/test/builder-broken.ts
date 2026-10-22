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

type P = [number, number];
const plank = (id: string, a: P, b: P, thick: number, clock: Draft["pieces"][number]["clock"] = { k: "fixed" }) => ({ ...put(id, "*/bar/plank", a), geometry: { t: "bar" as const, a, b, thick }, clock });
const box = (id: string, entry: string, min: P, max: P, more = {}) => ({ ...put(id, entry, min), geometry: { t: "rect" as const, min, max }, ...more });
const slope = (id: string, min: P, max: P, grade: number, dir: P) => ({ ...put(id, "*/slope/", min, { grade }), geometry: { t: "rect" as const, min, max }, params: { grade, dir } });
/** The lane cut across at x 15 but for a door 3 wide (the audit's: two pieces taking turns in it shut it for good). */
const door = () => [rail("u", [15, 0], [15, 8.5]), rail("v", [15, 11.5], [15, 20])];

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
    ["E4 -: The cup cannot be reached from the tee: the cup is closed off"]],
  ["E4: a diagonal rail closing the tee in, from the lane's corner to its far rail", () => lane("garden", [rail("x", [0, 0], [12, 20])]),
    ["E4 -: The cup cannot be reached from the tee: the tee is closed in"]],
  ["E4: a diagonal rail closing the cup off", () => lane("garden", [rail("x", [30, 0], [18, 20])]),
    ["E4 -: The cup cannot be reached from the tee: the cup is closed off"]],
  ["E4: a gap by the far rail narrower than the ball (0.75): no ball through, the tee closed in", () => lane("garden", [rail("x", [0, 0], [12, 19.25])]),
    ["E4 -: The cup cannot be reached from the tee: the tee is closed in"]],
  ["E14: that gap a ball wide: it only just fits", () => lane("garden", [rail("x", [0, 0], [12, 19])]),
    ["E14 r3: The gap at (13.5, 21) between the wall and the wall is 1 wide, and the way to the cup goes through it: at least 1.25, or a ball only just fits"]],
  ["E4: two gaps side by side in a rail across, each narrower than the ball (0.9): neither alone shuts the way, both do", () => lane("garden", [rail("a", [15.5, 0], [15.5, 5]), rail("b", [15, 5.75], [15.5, 14.25]), rail("c", [15, 15], [15, 20])]),
    [
      "E4 a: The cup cannot be reached from the tee: the gap at (16.75, 6.88) between the wall and the wall is 0.9 wide, narrower than the ball (1)",
      "E4 b: The cup cannot be reached from the tee: the gap at (16.75, 16.13) between the wall and the wall is 0.9 wide, narrower than the ball (1)",
    ]],
  ["E4: three such gaps side by side", () => lane("garden", [rail("a", [15.5, 0], [15.5, 4]), rail("b", [15, 4.75], [15.5, 9.5]), rail("c", [15, 10.25], [15.5, 15]), rail("d", [15, 15.75], [15, 20])]),
    [
      "E4 a: The cup cannot be reached from the tee: the gap at (16.75, 5.88) between the wall and the wall is 0.9 wide, narrower than the ball (1)",
      "E4 b: The cup cannot be reached from the tee: the gap at (16.75, 11.38) between the wall and the wall is 0.9 wide, narrower than the ball (1)",
      "E4 c: The cup cannot be reached from the tee: the gap at (16.75, 16.88) between the wall and the wall is 0.9 wide, narrower than the ball (1)",
    ]],
  ["E4: two rails across one after the other, each with such a gap", () => lane("garden", [rail("a", [10.5, 0], [10.5, 9.75]), rail("b", [10, 10.5], [10, 20]), rail("c", [20.5, 0], [20.5, 9.75]), rail("d", [20, 10.5], [20, 20])]),
    [
      "E4 a: The cup cannot be reached from the tee: the gap at (11.75, 11.63) between the wall and the wall is 0.9 wide, narrower than the ball (1)",
      "E4 c: The cup cannot be reached from the tee: the gap at (21.75, 11.63) between the wall and the wall is 0.9 wide, narrower than the ball (1)",
    ]],
  ["E14: two gaps side by side a ball only just fits (1.12)", () => lane("garden", [rail("a", [15.5, 0], [15.5, 5]), rail("b", [15, 6], [15.5, 14]), rail("c", [15, 15], [15, 20])]),
    [
      "E14 a: The gap at (16.75, 7) between the wall and the wall is 1.12 wide, and the way to the cup goes through it: at least 1.25, or a ball only just fits",
      "E14 b: The gap at (16.75, 16) between the wall and the wall is 1.12 wide, and the way to the cup goes through it: at least 1.25, or a ball only just fits",
    ]],
  ["E4: the only way between a rock and a pond, 0.4 apart: a ball keeps its radius from the rock, none from the water", () => lane("garden", [{ ...put("w", "*/hazard/water", [13, 0]), geometry: { t: "rect", min: [13, 0], max: [17, 8] } }, { ...put("x", "*/post/rock", [15, 10.5]), geometry: { t: "post", c: [15, 10.5], r: 2.1 } }, rail("a", [15, 12.75], [15, 20])]),
    ["E4 x: The cup cannot be reached from the tee: the gap at (16.5, 9.7) between the rock and the water is 0.4 wide, narrower than the ball (0.5 beside a hazard)"]],
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
  // the pre-launch audit's (2026-10-22): each one published and played before these rules, a ball trapped for good, a
  // hole no round can hole, or a piece drawn where the physics has none
  ["E17: a tunnel let out in a box of rails: the ball never gets out", () => lane("garden", [put("x", "*/tunnel/cave", [8, 3], { to: [17, 15] }), rail("a", [14, 12], [20, 12]), rail("b", [20, 12], [20, 18]), rail("c", [20, 18], [14, 18]), rail("d", [14, 18], [14, 12])]),
    ["E17 x: The cave lets the ball out at (18.5, 16.5), where it can never get back to the cup"]],
  ["E17: a tunnel let out on an island in a pond: every shot off it is back on it", () => lane("garden", [put("x", "*/tunnel/cave", [8, 3], { to: [17, 15] }),
    box("w1", "*/hazard/water", [12, 11], [22, 13]), box("w2", "*/hazard/water", [12, 17], [22, 19]), box("w3", "*/hazard/water", [12, 13], [14, 17]), box("w4", "*/hazard/water", [20, 13], [22, 17])]),
    ["E17 x: The cave lets the ball out at (18.5, 16.5), where it can never get back to the cup"]],
  ["E17: a dead end down a slope longer than a full stroke climbs", () => lane("garden", [rail("c", [8, 5], [50, 5]), slope("x", [10, 0], [50, 5], 0.35, [1, 0])], 50, 20),
    ["E17 x: The slope sends the ball down at (51.05, 2.05), where it can never get back to the cup"]],
  ["E17: that dead end in four abutting slopes of one fall (one slope to climb, no crest between them)", () => lane("garden", [rail("c", [8, 5], [50, 5]), ...[10, 20, 30, 40].map((x, i) => slope(`x${i}`, [x, 0], [x + 10, 5], 0.35, [1, 0]))], 50, 20),
    ["E17 x0: The slope sends the ball down at (51.05, 2.05), where it can never get back to the cup"]],
  ["E17: that dead end with ice laid on it (ice keeps it one-way)", () => lane("garden", [rail("c", [8, 5], [50, 5]), slope("x", [10, 0], [50, 5], 0.35, [1, 0]), box("i", "*/surface/ice", [10, 0], [50, 5])], 50, 20),
    ["E17 x: The slope sends the ball down at (51.05, 2.05), where it can never get back to the cup"]],
  ["E17: the cup beyond a valley of two long slopes: down the one, no ball climbs the other (rolling spends what the downhill gave)", () => lane("garden", [slope("x", [10, 0], [40, 10], 0.35, [1, 0]), slope("y", [40, 0], [70, 10], 0.35, [-1, 0])], 80, 10),
    ["E17 y: The cup cannot be reached from the tee: the slope is too long for a ball to climb"]],
  ["E17: the cup up a slope no stroke climbs (the two-way way finds it)", () => lane("garden", [slope("x", [8, 0], [60, 8], 0.35, [-1, 0])], 64, 8),
    ["E17 x: The cup cannot be reached from the tee: the slope is too long for a ball to climb"]],
  ["E17: a pulse's rock 0.25 from a pond: back on a ball between them, it pushes it in, for good", () => ({ ...lane("garden", [box("w", "*/hazard/water", [10, 14], [14, 20]), { ...put("x", "*/post/rock", [12, 12.75], { size: 1 }), clock: { k: "stroke", pulse: 0 } }]), pulses: [{ every: 2, on: 1, phase: 1 }] }),
    ["E17 x: The rock comes back on a ball beside the water and would push it in: at least 0.55 between them"]],
  ["E17: a timed plank 0.25 from a pond", () => lane("garden", [box("w", "*/hazard/water", [10, 14], [16, 20]), plank("x", [10, 13.5], [16, 13.5], 0.5, { k: "substep", every: 40, on: 20, phase: 0 })]),
    ["E17 x: The plank comes back on a ball beside the water and would push it in: at least 0.55 between them"]],
  ["E4: two timed planks in turn across the only door: one there at every tick", () => lane("garden", [...door(), plank("p", [14.75, 8.5], [14.75, 11.5], 0.5, { k: "substep", every: 40, on: 20, phase: 0 }), plank("q", [15.25, 8.5], [15.25, 11.5], 0.5, { k: "substep", every: 40, on: 20, phase: 20 })]),
    ["E4 -: The cup cannot be reached from the tee: the tee is closed in"]],
  ["E4: two pulses' planks in turn across the only door: one there every stroke", () => ({ ...lane("garden", [...door(), plank("p", [14.75, 8.5], [14.75, 11.5], 0.5, { k: "stroke", pulse: 0 }), plank("q", [15.25, 8.5], [15.25, 11.5], 0.5, { k: "stroke", pulse: 1 })]), pulses: [{ every: 2, on: 1, phase: 0 }, { every: 2, on: 1, phase: 1 }] }),
    ["E4 -: The cup cannot be reached from the tee: the tee is closed in"]],
  ["E6: a tunnel let out inside a thick timed plank", () => lane("garden", [put("x", "*/tunnel/cave", [8, 3], { to: [18, 14] }), plank("b", [16, 14], [22, 14], 1.6, { k: "substep", every: 40, on: 20, phase: 0 })]),
    ["E6 x: The cave comes out at (19.5, 15.5), inside the plank"]],
  ["E6: a tunnel let out into a pulse's pond", () => lane("garden", [put("x", "*/tunnel/cave", [8, 3], { to: [18, 14] }), box("w", "*/hazard/water", [16, 12], [20, 16], { clock: { k: "stroke", pulse: 0 } })]),
    ["E6 x: The cave comes out at (19.5, 15.5), in a zone that moves the ball on"]],
  ["E6: a tunnel let out 0.5 from its own mouth: round and round", () => lane("garden", [{ ...put("x", "*/tunnel/cave", [12, 8], { to: [11.5, 10] }), geometry: { t: "rect", min: [12, 8], max: [14, 12] } }]),
    ["E6 x: The cave comes out at (13, 11.5), 0.5 from its own mouth: at least 1.5, or the ball runs straight back in"]],
  ["E13: the same rail twice (its kerb drawn twice)", () => lane("garden", [rail("x", [10, 5], [10, 15]), rail("y", [10, 5], [10, 15])]),
    ["E13 x: The wall lies over the wall at (11.5, 6.5)"]],
  ["E13: two rails crossing", () => lane("garden", [rail("x", [8, 5], [16, 15]), rail("y", [8, 15], [16, 5])]),
    ["E13 x: The wall crosses the wall at (9.5, 6.5)"]],
  ["E13: a rail along the lane's own", () => lane("garden", [rail("x", [5, 0], [15, 0])]),
    ["E13 r1: The wall lies over the wall at (6.5, 1.5)"]],
  ["E13: a rock hidden inside a thick plank", () => lane("garden", [plank("b", [10, 10], [16, 10], 1.6), put("x", "*/post/rock", [13, 10], { size: 0.3 })]),
    ["E13 x: The rock stands on the plank at (14.5, 11.5)"]],
  ["E13: a plank over a tunnel's mouth", () => lane("garden", [plank("x", [10, 10], [16, 10], 1.6), { ...put("t", "*/tunnel/cave", [12, 9], { to: [25, 4] }), geometry: { t: "rect", min: [12.5, 9.25], max: [14, 10.75] } }]),
    ["E13 x: The plank lies over the cave at (14.5, 11.5)"]],
  ["L2: a name the chain refuses", () => ({ ...lane("garden", []), title: "see t.me/x" }),
    ["L2 -: The name or the note looks like a web address. Write \"St. Andrews\", not \"St.Andrews\"."]],
];
