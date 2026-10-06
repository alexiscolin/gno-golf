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
// a lane in its frame: its low corner at the margin (1.5, 1.5)
const hole = (over: Partial<GHole> = {}): GHole => ({
  w: 96, h: 96, par: 3, substeps: 14, world: "garden", order: 0, title: "A draft",
  tee: [3.5, 6.5], pin: [21.5, 6.5], cupR: 1.2, shelter: 0, friction: 0.8, bounce: 0.9, ballR: 0.5,
  walls: box(1.5, 1.5, 31.5, 11.5), posts: [], zones: [], pulses: [], ...over,
});
const fitted = (h: GHole) => {
  const f = host.fit(draftHex(h), "", 1.5);
  assert.ok(f.ok, f.ok ? "" : f.why);
  return f;
};
const why = (r: { ok: boolean; why?: string }) => (r.ok ? "ok" : r.why);

void test("a draft decodes, is sized to its pieces and passes PublishMine's checks", () => {
  const f = fitted(hole());
  assert.deepEqual([f.dx, f.dy, f.w, f.h, f.lo], [0, 0, 33, 13, [1.5, 1.5]]);
  const c = host.check("draft", f.hex);
  assert.ok(c.ok, c.ok ? "" : c.why);
  assert.equal(c.cost.name, "A draft");
});

void test("its wall lengths are never read: the chain writes its own, and fitting again changes nothing", () => {
  const a = fitted(hole());
  assert.equal(fitted(hole()).hex, a.hex);
  const again = host.fit(a.hex, "", 1.5);
  assert.ok(again.ok && again.hex === a.hex);
});

void test("every kind of piece, with its skin, bounce, flags, clock and a pulse, survives the chain's Decode", () => {
  const h = hole({
    walls: [...box(1.5, 1.5, 51.5, 31.5), ...box(11.5, 16.5, 12.5, 17.5).map((w) => ({ ...w, skin: "plank", every: 40, on: 20, phase: 3 }))],
    posts: [{ c: [31.5, 6.5], r: 0.8, bounce: 1.4, skin: "bumper" }],
    zones: [
      { kind: "surface", min: [3.5, 16.5], max: [9.5, 22.5], scale: 0.4, skin: "ice", round: true },
      { kind: "slope", min: [16.5, 2.5], max: [26.5, 8.5], vec: [0.25, 0], skin: "", air: true, capped: true },
      // (a hazard's vec is unused, but a point on the board, which Fit moves: its centre)
      { kind: "hazard", min: [33.5, 16.5], max: [46.5, 30.5], vec: [39.5, 23.5], skin: "water", poly: [[33.5, 16.5], [46.5, 16.5], [39.5, 30.5]] },
      { kind: "tunnel", min: [41.5, 2.5], max: [43.5, 4.5], vec: [47.5, 26.5], skin: "cave" },
      { kind: "loop", min: [35.5, 6.5], max: [37.5, 10.5], vec: [35.5, 24.5], scale: 2.5, skin: "" },
    ],
    pulses: [{ every: 3, on: 1, phase: 0, walls: box(21.5, 26.5, 22.5, 27.5), posts: [{ c: [16.5, 26.5], r: 0.5, skin: "rock" }], zones: [] }],
  });
  const c = host.check("every-kind", fitted(h).hex);
  assert.ok(c.ok, c.ok ? "" : c.why);
});

void test("what the chain refuses, it refuses in its words", () => {
  assert.equal(why(host.fit(draftHex(hole({ cupR: 3 })), "", 1.5)), "golf: course: the cup's radius is above 0 and at most 2");
  const steep = hole({ zones: [{ kind: "slope", min: [11.5, 2.5], max: [15.5, 6.5], vec: [0.96, 0] }] });
  assert.equal(why(host.fit(draftHex(steep), "", 1.5)), "golf: course: a slope pushes at most G·MaxSin (0.95)");
  assert.equal(why(host.fit(draftHex(hole({ walls: box(2, 1.5, 31.5, 11.5) })), "", 1.5)), "builder: the draft is not in its frame");
});
