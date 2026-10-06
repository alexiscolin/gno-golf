// A community hole judged by the Builder's own rules before the game shows it
// (lib/builder/verdict.ts): anyone can call PublishMine with gnokey and any
// data the chain takes, bypassing the editor. The game lists, links and plays
// only a hole whose world is the Builder's, whose pieces are its palette's,
// that passes every rule (E1-E15, the census) and whose bytes are exactly
// what the Builder writes for it. Each threat below is a hole the chain
// accepts and the Builder refuses.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { host, hexOf, lane, rail } from "./builder-fixture.ts";
import "./scene-harness.ts";
import { judge, NOT_BUILDER } from "../lib/builder/verdict.ts";
import { canonicalHex } from "../lib/builder/proof.ts";
import { STARTERS } from "../lib/builder/starters.ts";
import { placePiece } from "../lib/builder/edit.ts";
import { loadPalette } from "../lib/builder/palette.ts";
import { writeHole } from "../lib/builder/gg1.ts";
import type { HoleIn } from "../lib/builder/types.ts";

const { census } = await import("../lib/builder/drawn.ts");
const garden = await loadPalette("garden");
const holes = new Map(fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").trim().split("\n").map((l) => l.split(" ")).map(([slot, , , hex]) => [slot, hex]));
const put = (id: string, e: string, at: [number, number]) => placePiece(garden.find((x) => x.id === e)!, id, at);
const okFor = async (hex: string) => judge(hex, host, census);
/** A hole written by hand and published straight through PublishMine (the chain takes it: check passes). */
const direct = (h: HoleIn) => {
  const f = host.fit(writeHole(h), "");
  assert.ok(f.ok, f.ok ? "" : f.why);
  assert.ok(host.check("direct", f.hex).ok, "the chain itself would take it");
  return f.hex;
};
// a 40 by 20 lane, framed as Fit leaves a hole (its low corner at the margin, 1.5), in the Builder's garden field
const box = (over: Partial<HoleIn> = {}): HoleIn => ({
  w: 96, h: 96, par: 3, substeps: 22, world: "garden", order: 0, title: "Direct", tee: [5.5, 11.5], pin: [35.5, 11.5], cupR: 1.2, shelter: 0, friction: 0.86, bounce: 0.85, ballR: 0.5,
  walls: [[1.5, 1.5, 41.5, 1.5], [41.5, 1.5, 41.5, 21.5], [41.5, 21.5, 1.5, 21.5], [1.5, 21.5, 1.5, 1.5]].map(([a, b, c, d]) => ({ a: [a, b], b: [c, d] })), posts: [], zones: [], pulses: [], ...over,
});

void test("a hole the Builder made passes: every starter's published bytes, and a course hole of its palette", async () => {
  for (const [world, list] of Object.entries(STARTERS)) for (const [name, d] of Object.entries(list)) {
    const v = await okFor(canonicalHex(d, host)!);
    assert.deepEqual(v, { ok: true }, `${world} ${name}`);
  }
  assert.deepEqual(await okFor(hexOf(lane("garden", [put("p", "*/post/rock", [12, 5])]))), { ok: true });
  assert.deepEqual(await okFor(direct(box())), { ok: true }, "a plain lane written by hand as the Builder writes it: the same bytes, the same verdict");
});

void test("threat: direct PublishMine of a hole the editor refuses: a cup in a post, a cup walled off, two posts in one another", async () => {
  const inPost = await okFor(direct(box({ posts: [{ c: [35.5, 11.5], r: 1, skin: "rock" }] })));
  assert.match(inPost.ok ? "" : inPost.why, /^This hole was not made with the Builder rules\. This hole breaks the Builder's rules: The cup touches the rock post/);
  const walled = await okFor(direct(box({ walls: [...box().walls, { a: [21.5, 1.5], b: [21.5, 21.5] }] })));
  assert.equal(walled.ok, false);
  assert.match(walled.ok ? "" : walled.why, /cannot be reached from the tee/);
  const overlap = await okFor(direct(box({ posts: [{ c: [21.5, 11.5], r: 1, skin: "rock" }, { c: [22, 11.5], r: 1, skin: "stump" }] })));
  assert.match(overlap.ok ? "" : overlap.why, /overlaps/);
});

void test("threat: a hole of a world the Builder does not make, or with pieces only a hand-written hole has", async () => {
  assert.match(JSON.stringify(await okFor(holes.get("mines/1")!)), /Crystal Mines/);
  assert.match(JSON.stringify(await okFor(holes.get("island/4")!)), /pieces the Builder doesn't make/);
  assert.match(JSON.stringify(await okFor(holes.get("town/14")!)), /breaks the Builder.s rules/);
});

void test("threat: bytes a Builder would not write for the same hole (a field of its own, a rail off the grid)", async () => {
  // a course hole: its own field (friction 0.84, 24 substeps), not the Builder's garden one
  assert.equal((await okFor(holes.get("garden/6")!)).ok, false, "off the Builder's grid, and its own field");
  assert.deepEqual(await okFor(direct(box({ friction: 0.5 }))), { ok: false, why: `${NOT_BUILDER} Its data is not as the Builder writes it.` });
  const off = await okFor(direct(box({ walls: [...box().walls, { a: [10.1, 6.5], b: [14.5, 6.5] }] })));
  assert.equal(off.ok, false, "a rail end off the quarter grid: the chain takes it, the Builder never writes it");
  void rail;
});

void test("threat: huge or garbage data never reaches the decoder", async () => {
  assert.deepEqual(await okFor("zz"), { ok: false, why: `${NOT_BUILDER} Its data is not a hole's.` });
  assert.deepEqual(await okFor("00".repeat((32 << 10) + 1)), { ok: false, why: `${NOT_BUILDER} Its data is not a hole's.` });
  assert.deepEqual(await okFor("0011"), { ok: false, why: `${NOT_BUILDER} Its data is not a hole's.` });
});
