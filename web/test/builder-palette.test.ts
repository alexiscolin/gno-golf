// The hole builder's palette (lib/builder/palette.ts): every entry, in every
// world it is offered in, is drawn by the game's own code as itself (not as
// the plain form an unknown skin falls back to), and is bound to physics the
// chain takes: its ranges inside GG1's bounds, and its piece, at the ends of
// its ranges, published by builder.wasm's PublishMine checks. Every drawing
// the scene declares is in the palette or in HAND_ONLY, with why.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { added, drawn, loadWorld, worldOf } from "./scene-harness.ts";
import { writeHole as draftHex } from "../lib/builder/gg1.ts";
import type { HoleIn as GHole } from "../lib/builder/types.ts";
import { BINDINGS, HAND_ONLY, WORLD_NAMES, paletteOf, sharedSkins, type PaletteEntry } from "../lib/builder/palette.ts";
import { FIELD, MAX_BOUNCE, WEATHER, kicks } from "../lib/builder/rules.ts";
import { place, type Params } from "../lib/builder/place.ts";
import { makeBuilderHost } from "../lib/builder/wasm.ts";

const host = makeBuilderHost(new WebAssembly.Module(fs.readFileSync(new URL("../lib/sim/builder.wasm", import.meta.url))));
const palettes = new Map<string, PaletteEntry[]>();
for (const w of WORLD_NAMES) {
  await loadWorld(w);
  palettes.set(w, paletteOf(w, worldOf({ world: w }).skins));
}
const every = () => [...palettes.entries()].flatMap(([w, es]) => es.map((e) => [w, e] as const));

// a lane of 30 by 20 in a world, the piece in its middle, tee and cup at its ends
const AT: [number, number] = [15, 10];
const lane = (world: string, pieces: Partial<Pick<GHole, "walls" | "posts" | "zones">> = {}, w = 30, h = 20): GHole => {
  const f = FIELD[world];
  const box: GHole["walls"] = [[0, 0, w, 0], [w, 0, w, h], [w, h, 0, h], [0, h, 0, 0]].map(([a, b, c, d]) => ({ a: [a, b], b: [c, d] }));
  return {
    w, h, par: 3, substeps: f.substeps, world, order: 0, title: "Palette", tee: [3, h / 2], pin: [w - 3, h / 2],
    cupR: f.cupR, shelter: 0, friction: f.friction, bounce: f.bounce, ballR: f.ballR,
    walls: [...box, ...(pieces.walls ?? [])], posts: pieces.posts ?? [], zones: pieces.zones ?? [], pulses: [],
  };
};
// the lane moved into the builder's frame: its corner (0, 0) to the margin, a whole grid step
const framed = (g: GHole): GHole => {
  const m = (v: readonly [number, number]): [number, number] => [v[0] + 1.5, v[1] + 1.5];
  return {
    ...g, tee: m(g.tee), pin: m(g.pin),
    walls: g.walls.map((w) => ({ ...w, a: m(w.a), b: m(w.b) })),
    posts: g.posts.map((p) => ({ ...p, c: m(p.c) })),
    zones: g.zones.map((z) => ({ ...z, min: m(z.min), max: m(z.max), ...(z.vec && z.kind !== "slope" && { vec: m(z.vec) }), ...(z.poly && { poly: z.poly.map(m) }) })),
  };
};
const withPiece = (world: string, e: PaletteEntry, p: Params = {}) => lane(world, place(e, AT, { to: [24, 4], ...p }));

void test("every world has a palette, every kind of piece in it", () => {
  for (const [w, es] of palettes) {
    const kinds = new Set(es.map((e) => e.kind));
    for (const k of ["rail", "bar", "post", "surface", "slope", "tunnel", "hazard"] as const) assert.ok(kinds.has(k), `${w}: no ${k}`);
    assert.equal(new Set(es.map((e) => e.id)).size, es.length, `${w}: an id twice`);
  }
});

void test("each world's field is the one most of its course holes have", () => {
  type F = keyof (typeof FIELD)[string];
  const seen = new Map<string, Record<F, number[]>>();
  for (const l of fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").trim().split("\n")) {
    // GG1's header (course/data.gno Encode): magic, W, H, Strokes, Substeps, World, Order, Title, Tee, Pin, then the floats
    const b = Buffer.from(l.split(" ")[3], "hex");
    let i = 10;
    const world = b.subarray(i + 1, (i += 1 + b[i])).toString();
    i += 8, (i += 1 + b[i]), (i += 32);
    const f = (k: number) => b.readDoubleLE(i + 8 * k);
    const s = seen.get(world) ?? { substeps: [], friction: [], bounce: [], ballR: [], cupR: [], shelter: [] };
    s.substeps.push(b.readUInt16LE(8)), s.cupR.push(f(0)), s.friction.push(f(2)), s.bounce.push(f(3)), s.ballR.push(f(4)), s.shelter.push(f(1));
    seen.set(world, s);
  }
  // each value the one most of the world's holes have (their substeps vary hole by hole)
  const most = (xs: number[]) => xs.reduce((best, x) => (xs.filter((y) => y === x).length > xs.filter((y) => y === best).length ? x : best));
  for (const [w, s] of seen) {
    assert.deepEqual(FIELD[w], { substeps: most(s.substeps), friction: most(s.friction), bounce: most(s.bounce), ballR: most(s.ballR), cupR: most(s.cupR), shelter: most(s.shelter) }, w);
  }
});

void test("every drawing the scene declares is bound or hand-only, and nothing is both", () => {
  const declared = [sharedSkins(), ...[...palettes.keys()].map((w) => worldOf({ world: w }).skins ?? {})];
  for (const skins of declared) {
    for (const [kind, list] of Object.entries(skins)) {
      for (const s of list) {
        const bound = Object.hasOwn(BINDINGS[kind as keyof typeof BINDINGS], s), hand = Object.hasOwn(HAND_ONLY, `${kind}/${s}`);
        assert.ok(bound !== hand, `${kind}/${s}: ${bound ? "bound and hand-only" : "neither bound nor hand-only"}`);
      }
    }
  }
});

void test("every binding is inside GG1's bounds; a bounce above 1 exactly where the skin kicks; no weather skin", () => {
  for (const [w, e] of every()) {
    const at = `${w} ${e.id}`;
    for (const [name, r] of Object.entries({ size: e.size, thick: e.thick, bounce: e.bounce, scale: e.scale, grade: e.grade })) {
      if (!r) continue;
      assert.ok(r.min <= r.def && r.def <= r.max && r.step > 0, `${at} ${name}`);
    }
    if (e.kind === "post") assert.ok(e.size.min > 0 && e.size.max <= 8, at);
    if (e.bounce) assert.ok(e.bounce.min >= 0 && e.bounce.max <= (kicks(e.skin) ? 1.5 : MAX_BOUNCE), at);
    if (kicks(e.skin) && e.bounce) assert.ok(e.bounce.max > 1, `${at}: kicks, so may bounce above 1`);
    if (e.scale) assert.ok(e.scale.min >= 0 && e.scale.max <= 8, at);
    if (e.grade) assert.ok(e.grade.max <= 0.95, at);
    if (e.kind === "loop" && e.scale) assert.ok(e.scale.max <= 3.5, `${at}: a loop's speed is within a stroke's reach`);
    assert.ok(!WEATHER.some((s) => e.skin === s), at);
    assert.ok(e.clocks.length > 0, at);
  }
});

void test("every entry's piece, at the ends of its ranges, passes PublishMine's checks", () => {
  for (const [w, e] of every()) {
    for (const end of ["min", "def", "max"] as const) {
      const p: Params = { size: e.size[end], thick: e.thick?.[end], bounce: e.bounce?.[end], scale: e.scale?.[end], grade: e.grade?.[end], to: [80, 20] };
      // a lane as big as the draft's board (96 less Fit's margins), the piece in its middle; a rail from its edge
      const f = host.fit(draftHex({ ...framed(lane(w, place(e, e.kind === "rail" ? [0, 60] : [46.5, 46.5], p), 93, 93)), w: 96, h: 96 }), "", 1.5);
      assert.ok(f.ok, `${w} ${e.id} ${end}: ${f.ok ? "" : f.why}`);
      const c = host.check("palette", f.hex);
      assert.ok(c.ok, `${w} ${e.id} ${end}: ${c.ok ? "" : c.why}`);
    }
  }
});

void test("every entry is drawn as itself, not as the plain form an unknown skin falls back to", () => {
  const base = new Map<string, string[]>(), plain = new Map<string, string[]>();
  for (const [w, e] of every()) {
    if (!base.has(w)) base.set(w, drawn(lane(w)));
    const mine = added(drawn(withPiece(w, e)), base.get(w)!);
    assert.ok(mine.length > 0, `${w} ${e.id}: draws nothing`);
    if (e.plain) continue; // the plain form itself (CLIENT.md, rule 2), on purpose
    const k = `${w}/${e.kind}/${e.clocks[0]}`;
    if (!plain.has(k)) plain.set(k, added(drawn(withPiece(w, { ...e, skin: "zz-unknown" })), base.get(w)!));
    assert.notDeepEqual(mine, plain.get(k), `${w} ${e.id}: drawn as the plain form`);
  }
});
