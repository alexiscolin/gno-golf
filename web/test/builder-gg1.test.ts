// The builder's draft GG1 (lib/builder/gg1.ts) through builder.wasm's fit:
// the chain's Decode reads it, author.Fit and Encode make it the bytes that
// will be published, and PublishMine's checks take them.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { draftHex, type GHole, type GWall } from "../lib/builder/gg1.ts";
import { makeBuilderHost } from "../lib/builder/wasm.ts";

const host = makeBuilderHost(new WebAssembly.Module(fs.readFileSync(new URL("../lib/sim/builder.wasm", import.meta.url))));

const box = (x0: number, y0: number, x1: number, y1: number): GWall[] =>
  [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]].map(([a, b, c, d]) => ({ a: [a, b], b: [c, d] }));
const hole = (over: Partial<GHole> = {}): GHole => ({
  w: 96, h: 96, par: 3, substeps: 14, world: "garden", order: 0, title: "A draft",
  tee: [12, 20], pin: [30, 20], cupR: 1.2, shelter: 0, friction: 0.8, bounce: 0.9, ballR: 0.5,
  walls: box(10, 15, 40, 25), posts: [], zones: [], pulses: [], ...over,
});
const fitted = (h: GHole) => {
  const f = host.fit(draftHex(h), 1.5);
  assert.ok(f.ok, f.ok ? "" : f.why);
  return f;
};

void test("a draft decodes, is fitted to the margin and passes PublishMine's checks", () => {
  const f = fitted(hole());
  assert.deepEqual([f.dx, f.dy, f.w, f.h], [-8.5, -13.5, 33, 13]);
  const c = host.check("draft", f.hex);
  assert.ok(c.ok, c.ok ? "" : c.why);
  assert.equal(c.cost.name, "A draft");
});

void test("its wall lengths are never read: the chain writes its own", () => {
  // the same draft fitted twice comes back the same bytes, and those bytes are canonical
  const a = fitted(hole()), b = fitted(hole());
  assert.equal(a.hex, b.hex);
  assert.equal(fitted({ ...hole(), w: a.w, h: a.h, tee: [12 + a.dx, 20 + a.dy], pin: [30 + a.dx, 20 + a.dy], walls: box(1.5, 1.5, 31.5, 11.5) }).hex, a.hex);
});

void test("every kind of piece, with its skin, bounce, flags, clock and a pulse, survives the chain's Decode", () => {
  const h = hole({
    walls: [...box(10, 15, 60, 45), ...box(20, 30, 21, 31).map((w) => ({ ...w, skin: "plank", every: 40, on: 20, phase: 3 }))],
    posts: [{ c: [40, 20], r: 0.8, bounce: 1.4, skin: "bumper" }],
    zones: [
      { kind: "surface", min: [12, 30], max: [18, 36], scale: 0.4, skin: "ice", round: true },
      { kind: "slope", min: [25, 16], max: [35, 22], vec: [0.25, 0], skin: "", air: true, capped: true },
      // (a hazard's vec is unused, but a point on the board, which Fit moves: its centre)
      { kind: "hazard", min: [42, 30], max: [55, 44], vec: [48, 37], skin: "water", poly: [[42, 30], [55, 30], [48, 44]] },
      { kind: "tunnel", min: [50, 16], max: [52, 18], vec: [56, 40], skin: "cave" },
      { kind: "loop", min: [44, 20], max: [46, 24], vec: [44, 38], scale: 2.5, skin: "" },
    ],
    pulses: [{ every: 3, on: 1, phase: 0, walls: box(30, 40, 31, 41), posts: [{ c: [25, 40], r: 0.5, skin: "rock" }], zones: [] }],
  });
  const c = host.check("every-kind", fitted(h).hex);
  assert.ok(c.ok, c.ok ? "" : c.why);
});

void test("what the chain refuses, it refuses in its words", () => {
  assert.equal((host.fit(draftHex(hole({ cupR: 3 })), 1.5) as { why?: string }).why, "golf: course: the cup's radius is above 0 and at most 2");
  const steep = hole({ zones: [{ kind: "slope", min: [20, 16], max: [24, 20], vec: [0.96, 0] }] });
  assert.equal((host.fit(draftHex(steep), 1.5) as { why?: string }).why, "golf: course: a slope pushes at most G·MaxSin (0.95)");
});

void test("a draft on the builder's grid is shifted exactly: fitting the result again changes nothing", () => {
  const f = fitted(hole({ walls: [...box(10.25, 15.5, 40.75, 25), ...box(20, 18, 20.5, 22.25)] }));
  const again = host.fit(f.hex, 1.5);
  assert.ok(again.ok && again.hex === f.hex && again.dx === 0 && again.dy === 0);
});
