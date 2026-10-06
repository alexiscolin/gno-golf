// The golden set (the builder's design, "Prevention, not warning"): holes
// broken on purpose, one or more per rule, each refused by exactly its rule
// with its sentence, through the whole pipeline (lib/builder/pipeline.ts:
// the palette's ranges, the editor's checks on the hole as fit gives it, the
// chain's own checks, the render census); and the course holes as the
// Builder judges them: those it passes keep passing, those it is stricter on
// (named, with why) a report.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { build, loadWorld } from "./scene-harness.ts";
import { host, lane, rail } from "./builder-fixture.ts";
import { validate } from "../lib/builder/pipeline.ts";
import { plainOf } from "../lib/builder/explain.ts";
import { checkHole, type EntryOf } from "../lib/builder/checks.ts";
import { loadPalette } from "../lib/builder/palette.ts";
import { FIELD } from "../lib/builder/rules.ts";
import { canPlace, clampMove, fixOf, placePiece } from "../lib/builder/edit.ts";
import type { Draft } from "../lib/builder/draft.ts";
import type { GHole } from "../lib/builder/types.ts";

const garden = await loadPalette("garden");
await loadWorld("garden");
const { census } = await import("../lib/builder/drawn.ts");
const put = (id: string, entry: string, at: [number, number], p: Parameters<typeof placePiece>[3] = {}) => placePiece(garden.find((e) => e.id === entry)!, id, at, p);
const run = (d: Draft, over: Partial<Parameters<typeof validate>[1]> = {}) => validate(d, { host, palette: garden, census, ...over }).issues.filter((i) => i.severity === "error");
const said = (d: Draft, over: Partial<Parameters<typeof validate>[1]> = {}) => run(d, over).map((i) => `${i.rule} ${i.piece ?? "-"}: ${i.text}`);

void test("a plain lane passes everything", () => {
  assert.deepEqual(said(lane("garden", [])), []);
});

const cases: [string, () => Draft, string[]][] = [
  ["L0: a size outside its entry's range (a hand-edited file)", () => lane("garden", [{ ...put("x", "*/post/rock", [12, 9]), geometry: { t: "post", c: [12, 9], r: 6 } }]),
    ["L0 x: The rock post's radius is 6: 0.3 to 4.5"]],
  ["E1: wider than the board takes (the tee out past the rails)", () => ({ ...lane("garden", [], 90, 20), tee: [-2.5, 11.5] }),
    ["E1 -: The hole is 94 across: at most 93 between its outermost pieces"]],
  ["E1: a tunnel's way out past the hole's edge", () => lane("garden", [put("x", "*/tunnel/cave", [8, 8], { to: [40, 5] })]),
    ["E1 x: The cave tunnel comes out at (41.5, 6.5), off the board once the hole is fitted"]],
  ["E1b: a bar reaching past the lane's edge", () => lane("garden", [{ ...put("x", "*/bar/plank", [0, 9]), geometry: { t: "bar", a: [-1, 9], b: [3, 9], thick: 0.5 } }]),
    ["E1b x: The plank bar reaches past the hole's outermost rail, post, tee or cup: bring it in"]],
  ["E2: the tee on a post", () => lane("garden", [put("x", "*/post/rock", [3.5, 10])]),
    ["E2 x: The tee touches the rock post at (4.5, 11.5)"]],
  ["E2: the tee in the water", () => lane("garden", [put("x", "*/hazard/water", [2, 8], { size: 3 })]),
    ["E2 x: The tee touches the water hazard at (4.5, 11.5)"]],
  ["E3: the cup in a pond", () => lane("garden", [put("x", "*/hazard/water", [25.5, 8.5], { size: 3 })]),
    ["E3 x: The cup touches the water hazard at (28.5, 11.5)"]],
  ["E4: the cup walled off", () => lane("garden", [rail("x", [20, 0], [20, 20])]),
    ["E4 -: The cup cannot be reached from the tee"]],
  ["E5: a pond too thin to stop a fast ball (a hand-edited file)", () => lane("garden", [{ ...put("x", "*/hazard/water", [12, 2]), geometry: { t: "rect", min: [12, 2], max: [13.25, 18] } }]),
    ["L0 x: The water hazard's side is 1.25: 1.5 to 80"]],
  ["E6: a tunnel out into the water", () => lane("garden", [put("x", "*/tunnel/cave", [8, 3], { to: [20, 10] }), put("w", "*/hazard/water", [18, 8], { size: 4 })]),
    ["E6 x: The cave tunnel comes out at (21.5, 11.5), in a zone that moves the ball on"]],
  ["E7: a timed bar always on", () => lane("garden", [{ ...put("x", "*/bar/plank", [12, 6]), clock: { k: "substep", every: 40, on: 40, phase: 0 } }]),
    ["E7 x: The plank bar is on for 40 of 40 substeps: 1 to 39"]],
  ["E10: a post walled in, out of every ball's reach", () => lane("garden", [rail("a", [10, 4], [16, 4]), rail("b", [16, 4], [16, 8]), rail("c", [16, 8], [10, 8]), rail("d", [10, 8], [10, 4]), put("x", "*/post/rock", [13, 6])]),
    ["E10 x: The rock post at (14.5, 7.5) is outside the lane: no ball reaches it"]],
  ["E12: four rails round a little square, drawn as a bar", () => lane("garden", [rail("a", [12, 8], [13, 8]), rail("b", [13, 8], [13, 9]), rail("c", [13, 9], [12, 9]), rail("d", [12, 9], [12, 8])]),
    ["a", "b", "c", "d"].map((id, k) => `E12 ${id}: The plain rail at ${["(13.5, 9.5)", "(14.5, 9.5)", "(14.5, 10.5)", "(13.5, 10.5)"][k]} is drawn as part of a bar: give it room from the other rails`)],
  ["E13: two posts in one another", () => lane("garden", [put("x", "*/post/rock", [12, 9]), put("y", "*/post/stump", [12.5, 9])]),
    ["E13 x: The rock post overlaps the stump post at (13.5, 10.5)"]],
  ["E13: a post on a rail", () => lane("garden", [put("x", "*/post/rock", [12, 0.25])]),
    ["E13 x: The rock post stands on the plain rail at (13.5, 2.3)"]],
  ["E13: two bars crossing", () => lane("garden", [put("x", "*/bar/plank", [10, 9], { size: 4 }), { ...put("y", "*/bar/plank", [12, 7], { size: 4 }), geometry: { t: "bar", a: [12, 7], b: [12, 11], thick: 0.5 } }]),
    ["E13 x: The plank bar crosses the plank bar at (13.5, 10.5)"]],
  ["E13: a bar run through a rail", () => lane("garden", [rail("a", [15, 0], [15, 8]), { ...put("x", "*/bar/plank", [13, 6]), geometry: { t: "bar", a: [13, 6], b: [17, 6], thick: 0.5 } }]),
    ["E13 x: The plank bar crosses the plain rail at (16.5, 7.5)"]],
  ["E13: a bar poking through the lane's own rail", () => lane("garden", [{ ...put("x", "*/bar/plank", [10, 18]), geometry: { t: "bar", a: [10, 18], b: [10, 21], thick: 0.5 } }]),
    ["E13 x: The plank bar crosses the plain rail at (11.5, 21)"]],
  ["E13: a short rail wholly under a bar", () => lane("garden", [rail("a", [12, 10], [12.5, 10]), { ...put("x", "*/bar/plank", [10, 10]), geometry: { t: "bar", a: [10, 10], b: [14, 10], thick: 1 } }]),
    ["E13 x: The plank bar crosses the plain rail at (13.5, 11.5)"]],
  ["E13: two ponds over one another (drawn at one height: they flicker)", () => lane("garden", [put("x", "*/hazard/water", [10, 3], { size: 3 }), put("y", "*/hazard/water", [11.5, 4], { size: 3 })]),
    ["E13 x: The water hazard lies over the water hazard at (11.5, 4.5)"]],
  ["E13: a flowerbed over soil (two surfaces at one height)", () => lane("garden", [put("x", "*/surface/flowerbed", [10, 3], { size: 3 }), put("y", "*/surface/soil", [11.5, 4], { size: 3 })]),
    ["E13 x: The flowerbed surface lies over the soil surface at (11.5, 4.5)"]],
  ["E14: the only way to the cup a ball only just fits", () => lane("garden", [rail("a", [15, 0], [15, 9.5]), rail("b", [15.5, 10.5], [15.5, 20])]),
    ["E14 a: The gap at (16.75, 11.5) between the plain rail and the plain rail is 1.12 wide, and the way to the cup goes through it: at least 1.25, or a ball only just fits"]],
  ["E15: a bar against a rail, swallowed by the kerb", () => lane("garden", [{ ...put("x", "*/bar/plank", [10, 0.5]), geometry: { t: "bar", a: [10, 0.5], b: [14, 0.5], thick: 0.5 } }]),
    ["E15 x: The plank bar is 0.25 from the plain rail: at least 0.5, or the kerb swallows it"]],
  ["L2: a name the chain refuses", () => ({ ...lane("garden", []), title: "see t.me/x" }),
    ["L2 -: The name or the note looks like a web address. Write \"St. Andrews\", not \"St.Andrews\"."]],
];
for (const [what, make, want] of cases) {
  void test(`refused: ${what}`, () => {
    assert.deepEqual(said(make()), want);
  });
}

void test("in the player's words: every refusal without its place's numbers or its rule's code, and with what to do", () => {
  for (const [what, make] of cases) {
    for (const i of run(make())) {
      const p = plainOf(i);
      assert.doesNotMatch(p, /\(-?\d+(\.\d+)?, -?\d+(\.\d+)?\)/, `${what}: a place in numbers: ${p}`);
      assert.doesNotMatch(p, /\b(E\d+b?|L\d)\b/, `${what}: a rule's code: ${p}`);
      assert.match(p, /^[A-Z].*[:.] [a-z].*\.$|^[A-Z][^:]*\.$/, `${what}: a sentence with what to do: ${p}`);
      assert.match(p, /move|bring|widen|leave|open|give|make|remove|write|keep|take/i, `${what}: what to do: ${p}`);
    }
  }
  const one = (d: Draft) => plainOf(run(d)[0]);
  assert.equal(one(lane("garden", [put("x", "*/hazard/water", [25.5, 8.5], { size: 3 })])), "The cup is inside the water hazard: move the cup or the water hazard.");
  assert.equal(one(lane("garden", [put("x", "*/post/rock", [3.5, 10])])), "The tee is on the rock post: move the tee or the rock post.");
  assert.equal(one(lane("garden", [rail("x", [20, 0], [20, 20])])), "The ball can't get from the tee to the cup: open a way through.");
  assert.equal(one(lane("garden", [put("x", "*/post/rock", [12, 9]), put("y", "*/post/stump", [12.5, 9])])), "The rock post overlaps the stump post: move one of them.");
  assert.equal(one(lane("garden", [rail("a", [15, 0], [15, 9.5]), rail("b", [15.5, 10.5], [15.5, 20])])), "The way to the cup squeezes between the plain rail and the plain rail (1.12 wide): widen it to at least 1.25.");
  assert.equal(one(lane("garden", [{ ...put("x", "*/bar/plank", [10, 0.5]), geometry: { t: "bar", a: [10, 0.5], b: [14, 0.5], thick: 0.5 } }])), "The plank bar is too close to the plain rail (0.25): leave at least 0.5 between them.");
});

void test("L0: a piece's geometry is its entry's kind and shape, a polygon within GG1's points (a hand-edited file)", () => {
  const rock = put("x", "*/post/rock", [12, 9]);
  assert.deepEqual(said(lane("garden", [{ ...rock, geometry: { t: "rail", a: [12, 9], b: [14, 9] } }])), ["L0 x: The rock post cannot be drawn as a rail"]);
  const cave = put("x", "*/tunnel/cave", [8, 8]);
  assert.deepEqual(said(lane("garden", [{ ...cave, geometry: { t: "poly", pts: [[8, 8], [11, 8], [8, 11]] } }])), ["L0 x: The cave tunnel cannot be drawn as a polygon"]);
  const ring = Array.from({ length: 70 }, (_, k): [number, number] => [+(15 + 3 * Math.cos((k * 2 * Math.PI) / 70)).toFixed(2), +(10 + 3 * Math.sin((k * 2 * Math.PI) / 70)).toFixed(2)].map((x) => Math.round(x * 4) / 4) as [number, number]);
  const pond = put("x", "*/hazard/water", [12, 7]);
  assert.deepEqual(said(lane("garden", [{ ...pond, geometry: { t: "poly", pts: ring } }])), ["L0 x: The water hazard's outline has 70 points: at most 64"]);
});

void test("L0: every point on the quarter grid, as the board places them (a hole read back, a hand-edited file)", () => {
  const off = { ...rail("x", [10, 4], [14, 4]), geometry: { t: "rail" as const, a: [10.1, 4] as [number, number], b: [14, 4] as [number, number] } };
  assert.deepEqual(said(lane("garden", [off])), ["L0 x: The plain rail is off the grid: every point on a quarter"]);
  assert.deepEqual(said({ ...lane("garden", []), pin: [28.6, 11.5] }), ["L0 -: The cup is off the grid: every point on a quarter"]);
});

void test("E9 and E11: the data's size and the work, from the chain's own numbers", () => {
  const d = lane("garden", []);
  assert.deepEqual(said(d, { maxBytes: 100 }), ["E9 -: The hole is 367 bytes of data: at most 100"]);
  const warn = validate(d, { host, palette: garden, census, warnAt: 0.005 }).issues.filter((i) => i.rule === "E11").map((i) => i.severity);
  assert.deepEqual(warn, ["warning", "warning"]);
});

// The course holes were checked by hand and by play, not by the Builder, which
// is stricter (safety first: its rules are never relaxed to let one in). Those
// it refuses are a report, not a requirement; every other one of its worlds
// must keep passing, so a change that refuses a new one is seen here. (The
// Crystal Mines are not a Builder world: their holes are the game's alone.)
const REFUSED_COURSE: Record<string, string> = {
  "garden/10": "two soil patches over one another: drawn at one height, their edges flicker",
  "garden/14": "two ponds over one another, at one height",
  "mountain/11": "ice over a snowdrift, at one height",
  "town/18": "patches laid on a brick floor that covers the board, at one height",
  "town/14": "a door 1.2 deep: a fast ball can step over it",
};

void test("the course holes as the Builder judges them: those it passes keep passing; those it refuses, a report", async (t) => {
  for (const l of fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").trim().split("\n")) {
    const [slot, , , hex] = l.split(" ");
    const g: GHole = host.decode(hex);
    if (!Object.hasOwn(FIELD, g.world)) continue;
    const es = await loadPalette(g.world);
    const entryOf: EntryOf = (r) => {
      const list = r.pulse === undefined ? g : g.pulses[r.pulse];
      const p = r.set === "wall" ? list.walls[r.i] : r.set === "post" ? list.posts[r.i] : list.zones[r.i];
      const kinds = r.set === "wall" ? ["rail", "bar"] : r.set === "post" ? ["post"] : [(p as { kind: string }).kind];
      return es.find((e) => kinds.includes(e.kind) && e.skin === p.skin);
    };
    const rules = checkHole(g, { entryOf }).filter((i) => i.severity === "error").map((i) => i.rule);
    if (Object.hasOwn(REFUSED_COURSE, slot)) t.diagnostic(`${slot} refused by the Builder (${rules.join(", ") || "none now"}): ${REFUSED_COURSE[slot]}`);
    else assert.deepEqual(rules, [], `${slot}: it passed before`);
  }
  void build;
});

// Prevention: the ghost (canPlace), the drag (clampMove), the one-click fix (fixOf).
const without = (d: Draft, id: string) => ({ ...d, pieces: d.pieces.filter((p) => p.id !== id) });
const pieceIn = (d: Draft, id: string) => d.pieces.find((p) => p.id === id)!;
const ctx = { host, palette: garden, census };

void test("canPlace: the ghost is red with the rule's sentence where a drop would break the hole, green where not", () => {
  for (const [what, make, want] of cases) {
    const d = make(), id = want[0].split(" ")[1].replace(":", "");
    if (id === "-" || !d.pieces.some((p) => p.id === id)) continue; // (a rule of the whole hole: the pipeline's)
    const red = canPlace(without(d, id), pieceIn(d, id), ctx);
    assert.ok(red.length > 0, `${what}: placed alone, refused`);
  }
  const d = lane("garden", []);
  assert.deepEqual(canPlace(d, put("x", "*/post/rock", [12, 9]), ctx), []);
});

void test("canPlace: a piece that breaks another piece is refused too (the error named for the other)", () => {
  const bar = { ...put("x", "*/bar/plank", [10, 6]), geometry: { t: "bar" as const, a: [10, 6] as [number, number], b: [14, 6] as [number, number], thick: 0.5 } };
  const d = lane("garden", [bar]);
  assert.deepEqual(said(d), []);
  const g = pieceIn(d, "x").geometry as { a: [number, number]; b: [number, number] };
  const near = rail("y", [g.a[0], g.a[1] + 0.5], [g.b[0], g.b[1] + 0.5]); // 0.25 from the bar's edge: the kerb would swallow the bar
  const why = canPlace(d, near, ctx);
  assert.ok(why.some((i) => i.rule === "E15" && i.piece === "x"), JSON.stringify(why.map((i) => `${i.rule} ${i.piece}`)));
});

void test("clampMove: a drag stops at the last place it may go", () => {
  const d = lane("garden", [put("x", "*/post/rock", [12, 9])]);
  // dragged up onto the top rail (y 1.5 once framed): it stops clear of it
  const to = clampMove(d, "x", [13.5, 1.5], ctx);
  const p = pieceIn(d, "x").geometry as { c: [number, number]; r: number };
  assert.equal(to[0], 13.5);
  assert.ok(to[1] > 1.5 + p.r && to[1] <= 10.5, to.join(", "));
  assert.deepEqual(canPlace(without(d, "x"), { ...pieceIn(d, "x"), geometry: { ...p, c: to } }, ctx), []);
  assert.deepEqual(clampMove(d, "x", [20, 12], ctx), [20, 12], "a free place: as dragged");
});

void test("fixOf: one click moves the piece where its issue is gone, and the hole then passes", () => {
  for (const [what, make] of cases.filter(([w]) => /^E2: the tee on a post|^E13: a post on a rail|^E13: two posts|^E15|^E14/.test(w))) {
    const d = make(), issue = run(d)[0];
    const fixed = fixOf(issue, d, ctx);
    assert.ok(fixed, `${what}: a fix`);
    assert.deepEqual(said(fixed), [], `${what}: fixed`);
  }
  const walled = cases.find(([w]) => w.startsWith("E4"))![1]();
  assert.equal(fixOf(run(walled)[0], walled, ctx), null, "no obvious fix: none offered");
});
