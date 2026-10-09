// A Draft written as GG1 (lib/builder/gg1.ts) through builder.wasm's fit:
// the chain's Decode reads it, build.Bar makes its bars, author.Fit and
// Encode give the bytes that will be published, in its frame; and a hole's
// data read back into a Draft.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as gg1 from "../lib/builder/gg1.ts";
import { BOARD, frame, readHole, writeDraft, writeHole, type Match } from "../lib/builder/gg1.ts";
import { emptyDraft, type Draft, type Piece, type V } from "../lib/builder/draft.ts";
import { FIELD } from "../lib/builder/rules.ts";
import { makeBuilderHost } from "../lib/builder/wasm.ts";

const repo = new URL("../../", import.meta.url);
const host = makeBuilderHost(new WebAssembly.Module(fs.readFileSync(new URL("web/lib/sim/builder.wasm", repo))));
const course = fs.readFileSync(new URL("data/holes.txt", repo), "utf8").trim().split("\n").map((l) => l.split(" ")).map(([slot, , , hex]) => ({ slot, hex }));
const why = (r: { ok: boolean; why?: string }) => (r.ok ? "ok" : r.why);

let n = 0;
const piece = (entry: string, geometry: Piece["geometry"], over: Partial<Piece> = {}): Piece => ({ id: `p${++n}`, entry, geometry, params: {}, clock: { k: "fixed" }, ...over });
const rails = (x0: number, y0: number, x1: number, y1: number): Piece[] =>
  [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]].map(([a, b, c, d]) => piece("*/rail/", { t: "rail", a: [a, b], b: [c, d] }));
/** A lane of w by h in rails, tee and cup inside, in its frame. */
const box = (w: number, h: number, pieces: Piece[] = []): Draft => ({
  ...emptyDraft("garden"), title: "A box", tee: [4, 1.5 + h / 2], pin: [w - 1, 1.5 + h / 2], pieces: [...rails(1.5, 1.5, 1.5 + w, 1.5 + h), ...pieces],
});
const fitted = (d: Draft) => {
  const { hex, bars } = writeDraft(d, FIELD[d.world]);
  const f = host.fit(hex, bars);
  assert.ok(f.ok, f.ok ? "" : f.why);
  return f;
};

void test("a framed draft is fitted with no shift to its canonical bytes; fitting those again changes nothing; the chain takes them", () => {
  const f = fitted(box(20, 10));
  assert.deepEqual([f.dx, f.dy, f.w, f.h, f.lo], [0, 0, 23, 13, [1.5, 1.5]]);
  assert.equal(why(host.fit(f.hex)), "ok");
  assert.equal((host.fit(f.hex) as { hex: string }).hex, f.hex);
  const c = host.check("box", f.hex);
  assert.ok(c.ok, c.ok ? "" : c.why);
  assert.equal(c.cost.name, "A box");
});

void test("bars at every lattice angle on the grid: build.Bar's walls, and fitting again changes nothing", () => {
  const dirs: V[] = [[1, 0], [0, 1], [1, 1], [1, -1], [1, 2], [2, 1], [1, 3], [3, 1]];
  for (const [k, d] of dirs.entries()) {
    for (const len of [1, 3, 8]) {
      const a: V = [10 + k, 12], b: V = [10 + k + d[0] * len * 0.5, 12 + d[1] * len * 0.5];
      const f = fitted(box(40, 24, [piece("*/bar/plank", { t: "bar", a, b, thick: 0.5 }, { clock: { k: "substep", every: 40, on: 20, phase: 3 } })]));
      const again = host.fit(f.hex);
      assert.ok(again.ok && again.hex === f.hex, `${d.join(",")} ${len}`);
      const g = host.decode(f.hex);
      const plank = g.walls.filter((w) => w.skin === "plank");
      assert.deepEqual(plank.map((w) => w.a), host.bar(`${a[0]} ${a[1]} ${b[0]} ${b[1]} 0.5`), `${d.join(",")} ${len}: build.Bar's corners`);
      assert.ok(plank.every((w) => w.every === 40 && w.on === 20 && w.phase === 3), "the bar's clock on its four walls");
    }
  }
});

void test("every kind of piece and clock, a pulse among them, is written and taken by the chain", () => {
  const d = box(50, 30, [
    piece("*/post/bumper", { t: "post", c: [31.5, 6.5], r: 0.8 }, { params: { bounce: 1.25 } }),
    piece("*/surface/ice", { t: "round", min: [3.5, 16.5], max: [9.5, 22.5] }, { params: { scale: 1.18 } }),
    piece("*/slope/", { t: "rect", min: [16.5, 2.5], max: [26.5, 8.5] }, { params: { grade: 0.25, dir: [1, 0] } }),
    piece("*/hazard/water", { t: "poly", pts: [[33.5, 16.5], [46.5, 16.5], [39.5, 30.5]] }),
    piece("*/tunnel/cave", { t: "round", min: [41.5, 2.5], max: [44.5, 5.5] }, { params: { to: [47.5, 26.5] } }),
    piece("*/post/rock", { t: "post", c: [16.5, 26.5], r: 0.5 }, { clock: { k: "stroke", pulse: 0 } }),
    piece("*/bar/plank", { t: "bar", a: [21.5, 26.5], b: [24.5, 26.5], thick: 0.5 }, { clock: { k: "stroke", pulse: 0 } }),
  ]);
  d.pulses = [{ every: 3, on: 1, phase: 0 }];
  const g = host.decode(fitted(d).hex);
  assert.equal(g.posts.length, 1);
  assert.equal(g.pulses.length, 1);
  assert.deepEqual([g.pulses[0].every, g.pulses[0].posts.length, g.pulses[0].walls.length], [3, 1, 4]);
  assert.deepEqual(g.zones.map((z) => [z.kind, z.skin]), [["surface", "ice"], ["slope", ""], ["hazard", "water"], ["tunnel", "cave"]]);
  assert.deepEqual(g.zones[1].vec, [0.25, 0]);
  assert.deepEqual(g.zones[2].vec, d.tee, "a hazard's unread vec: the tee, on the board, in the extent");
  assert.deepEqual(g.zones[3].vec, [47.5, 26.5]);
  assert.deepEqual([g.cupR, g.ballR, g.friction, g.substeps, g.shelter], [1.2, 0.5, 0.86, 22, 0], "the world's field");
  const c = host.check("every-kind", fitted(d).hex);
  assert.ok(c.ok, c.ok ? "" : c.why);
});

void test("writeDraft says which of the hole's pieces each draft piece became; fit keeps them where they were", () => {
  const d = box(30, 14, [
    piece("*/bar/plank", { t: "bar", a: [10, 6], b: [13, 6], thick: 0.5 }, { id: "bar" }),
    piece("*/post/rock", { t: "post", c: [20, 8], r: 0.75 }, { id: "rock", clock: { k: "stroke", pulse: 0 } }),
    piece("*/hazard/water", { t: "round", min: [24, 4], max: [27, 7] }, { id: "water" }),
  ]);
  d.pulses = [{ every: 3, on: 1, phase: 0 }];
  const { refs } = writeDraft(d, FIELD.garden);
  assert.deepEqual(refs.get("bar"), [4, 5, 6, 7].map((i) => ({ set: "wall", i })));
  assert.deepEqual(refs.get("rock"), [{ set: "post", i: 0, pulse: 0 }]);
  assert.deepEqual(refs.get("water"), [{ set: "zone", i: 0 }]);
  const g = host.decode(fitted(d).hex);
  assert.ok([4, 5, 6, 7].every((i) => g.walls[i].skin === "plank") && g.pulses[0].posts[0].skin === "rock" && g.zones[0].skin === "water");
});

void test("frame moves a draft by whole grid steps so its extent starts at the margin", () => {
  const d = frame({ ...box(20, 10), pieces: rails(7, 9.25, 27, 19.25), tee: [10, 12], pin: [24, 12] });
  assert.deepEqual(d.pieces[0].geometry, { t: "rail", a: [1.5, 1.5], b: [21.5, 1.5] });
  assert.deepEqual([d.tee, d.pin], [[4.5, 4.25], [18.5, 4.25]]);
  assert.equal(why(host.fit(writeDraft(d, FIELD.garden).hex)), "ok");
  const post = frame({ ...box(20, 10), pieces: [...rails(5, 5, 25, 15), piece("*/post/rock", { t: "post", c: [6, 4], r: 1.5 })] });
  assert.deepEqual((post.pieces[4].geometry as { c: V }).c, [3.5, 3], "a post's edge sets the extent too (here its y; the tee its x)");
});

void test("out of its frame, fit refuses in the driver's words", () => {
  const { hex, bars } = writeDraft({ ...box(20, 10), tee: [1, 6] }, FIELD.garden);
  assert.equal(why(host.fit(hex, bars)), "builder: the draft is not in its frame");
});

void test("golden round trip: every course hole, decoded and written back as GG1, is the same bytes", () => {
  for (const { slot, hex } of course) {
    const f = host.fit(writeHole({ ...host.decode(hex), w: BOARD, h: BOARD }));
    assert.ok(f.ok, slot);
    if (slot !== "mines/17") assert.equal(f.hex, hex, slot);
  }
});

void test("a draft's piece is written from its entry, geometry, settings and clock alone: no raw GG1 element it carries reaches the bytes", () => {
  const d = box(20, 10), hex = writeDraft(d, FIELD.garden).hex;
  const crafted = { ...d, pieces: d.pieces.map((p, i) => (i === 0 ? { ...p, raw: { wall: { a: [0, 0], b: [9, 9], bounce: 1.5, mark: 0, skin: "gust", every: 0, on: 0, phase: 0 } } } : p)) };
  assert.equal(writeDraft(crafted, FIELD.garden).hex, hex);
  assert.ok(!("rawDraft" in gg1), "no raw draft: a hole is read back only through the palette (readHole)");
});

void test("a hole read back: matched piece by piece, its bars found again; a piece no entry matches refuses it, named", () => {
  const d = box(30, 14, [
    piece("*/bar/plank", { t: "bar", a: [10, 6], b: [13, 7.5], thick: 0.5 }),
    piece("*/post/rock", { t: "post", c: [20, 8], r: 0.75 }, { params: { bounce: 0.6 } }),
    piece("*/hazard/water", { t: "round", min: [24, 4], max: [27, 7] }),
  ]);
  const g = host.decode(fitted(d).hex);
  const match: Match = (p) => (p.skin === "nope" ? null : `*/${p.kind}/${p.skin}`);
  const back = readHole(g, match, (line) => host.bar(line));
  assert.ok(!("refused" in back));
  const strip = (x: Draft) => x.pieces.map(({ entry, geometry, params, clock }) => ({ entry, geometry, params, clock }));
  assert.deepEqual(strip(back), strip(d));
  assert.deepEqual([back.tee, back.pin, back.title], [d.tee, d.pin, d.title]);
  const bad = readHole({ ...g, posts: [{ ...g.posts[0], skin: "nope" }] }, match, (line) => host.bar(line));
  assert.deepEqual(bad, { refused: ["the post nope at (20, 8)"] });
});
