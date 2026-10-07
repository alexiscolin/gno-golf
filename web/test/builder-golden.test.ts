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
import { cases, garden, put } from "./builder-broken.ts";
import { validate } from "../lib/builder/pipeline.ts";
import { plainOf, refusalOf } from "../lib/builder/explain.ts";
import { checkHole, type EntryOf } from "../lib/builder/checks.ts";
import { FIELD } from "../lib/builder/rules.ts";
import { canPlace, clampMove, dragCheck, dropHandle, fixOf } from "../lib/builder/edit.ts";
import { setHandle } from "../lib/builder/handles.ts";
import { entry as entryIn, loadPalette } from "../lib/builder/palette.ts";
import { frame } from "../lib/builder/gg1.ts";
import type { Draft } from "../lib/builder/draft.ts";
import type { GHole, V } from "../lib/builder/types.ts";

await loadWorld("garden");
const { census } = await import("../lib/builder/drawn.ts");
const run = (d: Draft, over: Partial<Parameters<typeof validate>[1]> = {}) => validate(d, { host, palette: garden, census, ...over }).issues.filter((i) => i.severity === "error");
const said = (d: Draft, over: Partial<Parameters<typeof validate>[1]> = {}) => run(d, over).map((i) => `${i.rule} ${i.piece ?? "-"}: ${i.text}`);

void test("a plain lane passes everything", () => {
  assert.deepEqual(said(lane("garden", [])), []);
});

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
  assert.equal(one(lane("garden", [put("x", "*/hazard/water", [25.5, 8.5], { size: 3 })])), "The cup is inside the water: move the cup or the water.");
  assert.equal(one(lane("garden", [put("x", "*/post/rock", [3.5, 10])])), "The tee is on the rock: move the tee or the rock.");
  assert.equal(one(lane("garden", [rail("x", [20, 0], [20, 20])])), "The cup is closed off: no way from the tee. Open a way through.");
  assert.equal(one(lane("garden", [rail("x", [0, 0], [12, 20])])), "The tee is closed in: no way to the cup. Open a way through.");
  assert.equal(one(lane("garden", [put("x", "*/post/rock", [12, 9]), put("y", "*/post/stump", [12.5, 9])])), "The rock overlaps the tree stump: move one of them.");
  assert.equal(one(lane("garden", [rail("a", [15, 0], [15, 9.5]), rail("b", [15.5, 10.5], [15.5, 20])])), "The way to the cup squeezes between the wall and the wall (1.12 wide): widen it to at least 1.25.");
  assert.equal(one(lane("garden", [{ ...put("x", "*/bar/plank", [10, 0.5]), geometry: { t: "bar", a: [10, 0.5], b: [14, 0.5], thick: 0.5 } }])), "The plank is too close to the wall (0.25): leave at least 0.5 between them.");
});

void test("L0: a piece's geometry is its entry's kind and shape, a polygon within GG1's points (a hand-edited file)", () => {
  const rock = put("x", "*/post/rock", [12, 9]);
  assert.deepEqual(said(lane("garden", [{ ...rock, geometry: { t: "rail", a: [12, 9], b: [14, 9] } }])), ["L0 x: The rock cannot be drawn as a rail"]);
  const cave = put("x", "*/tunnel/cave", [8, 8]);
  assert.deepEqual(said(lane("garden", [{ ...cave, geometry: { t: "poly", pts: [[8, 8], [11, 8], [8, 11]] } }])), ["L0 x: The cave cannot be drawn as a polygon"]);
  const ring = Array.from({ length: 70 }, (_, k): [number, number] => [+(15 + 3 * Math.cos((k * 2 * Math.PI) / 70)).toFixed(2), +(10 + 3 * Math.sin((k * 2 * Math.PI) / 70)).toFixed(2)].map((x) => Math.round(x * 4) / 4) as [number, number]);
  const pond = put("x", "*/hazard/water", [12, 7]);
  assert.deepEqual(said(lane("garden", [{ ...pond, geometry: { t: "poly", pts: ring } }])), ["L0 x: The water's outline has 70 points: at most 64"]);
});

void test("L0: every point on the quarter grid, as the board places them (a hole read back, a hand-edited file)", () => {
  const off = { ...rail("x", [10, 4], [14, 4]), geometry: { t: "rail" as const, a: [10.1, 4] as [number, number], b: [14, 4] as [number, number] } };
  assert.deepEqual(said(lane("garden", [off])), ["L0 x: The wall is off the grid: every point on a quarter"]);
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

// E4 on an edit: a rail of the lane's own, its end dragged across (the hole without it already open, so its
// errors are no measure), a new rail, a long bar: refused while dragged (the drag stops at the last place the
// hole holds) and when let go, in an edit's words
void test("E4 on an edit: closing the tee in or the cup off is refused, dragged or dropped, whichever piece does it", () => {
  const d = lane("garden", []), r1 = pieceIn(d, "r1"), closes = { tee: "This closes the tee in: no way to the cup.", cup: "This closes the cup off: no way from the tee." };
  // the top rail's end dragged down to the bottom rail: its far end closes the tee in, its near end the cup off
  for (const [key, to, why] of [["b", [13.5, 21.5], closes.tee], ["a", [19.5, 21.5], closes.cup]] as const) {
    const there = setHandle(r1, key, to, entryIn(r1.entry, garden)!);
    // while dragged: the ghost red, in an edit's words
    const live = dragCheck(d, ctx).piece(there);
    assert.equal(refusalOf(live[0]), why, `r1.${key} while dragged`);
    assert.equal(refusalOf(canPlace(d, there, ctx)[0]), why, `r1.${key} put there`);
    // let go there: kept at the last place on the way the hole holds, never where it closes
    const dropped = dropHandle(d, "r1", key, to, ctx, ctx);
    assert.ok(!("why" in dropped), `r1.${key} let go: stopped short, not lost`);
    if ("why" in dropped) return;
    assert.notDeepEqual(pieceIn(dropped, "r1").geometry, there.geometry, `r1.${key}: the drag stops short`);
    assert.deepEqual(said(dropped), [], `r1.${key}: where it stops, the hole holds`);
  }
  // a new rail drawn across the tee's corner
  assert.equal(refusalOf(canPlace(d, rail("n", [1.5, 1.5], [13.5, 21.5]), ctx)[0]), closes.tee);
  // a long bar's end dragged across the tee's corner, by the left rail down to the bottom one
  const bar = { ...put("y", "*/bar/hedge", [3, 4]), geometry: { t: "bar" as const, a: [2.5, 4] as V, b: [3.5, 4] as V, thick: 0.5 } }, withBar = frame({ ...d, pieces: [...d.pieces, bar] });
  assert.deepEqual(said(withBar), []);
  const across = dropHandle(withBar, "y", "b", [8.5, 20.5], ctx, ctx);
  if ("why" in across) assert.match(across.why, /^This closes the tee in|^The ball can't get between/, "the bar's drop refused, said why");
  else assert.deepEqual(said(across), [], "or stopped where the hole holds");
});
