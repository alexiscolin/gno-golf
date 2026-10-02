// The mines' kit, what can be checked without a GPU: the cart's mouth, the
// decks' boards, the machines standing over the kerb.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CART_LOAD_H, cartMouth, planks, lantern, lanternsLit, GLASS, DEAD_GLASS, MINES, chamferField, type DeckSpan } from "../lib/scene/mines-kit.ts";
import { seeded } from "../lib/scene/common.ts";
import { md } from "../lib/scene/data.ts";

test("cartMouth: a cart's timber set, 0.5 clear either side of the cart and 0.4 over its load", () => {
  assert.equal(CART_LOAD_H, 2.5);
  assert.deepEqual(cartMouth(1.2), { width: 2.2, height: 2.9 });
  assert.deepEqual(cartMouth(2), { width: 3, height: 2.9 }, "one height for every cart");
});

const span = (x0: number, z0: number, x1: number, z1: number, angle = 0, top = () => 0): DeckSpan => ({
  inside: (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1, top, box: [x0, z0, x1, z1], angle,
});
/** The gaps across the rows: the z-ranges the triangles cover, merged; how many holes between them. */
const gaps = (pos: ArrayLike<number>) => {
  const spans: [number, number][] = [];
  for (let i = 0; i < pos.length; i += 9) { const z = [pos[i + 2], pos[i + 5], pos[i + 8]]; spans.push([Math.min(...z), Math.max(...z)]); }
  spans.sort((p, q) => p[0] - q[0]);
  let n = 0, end = spans[0][1];
  for (const [lo, hi] of spans) { if (lo > end + 1e-4) n++; end = Math.max(end, hi); }
  return n;
};

test("planks: boards over the deck and nothing past it, a gap between rows, flat on its top", () => {
  const mesh = planks([span(0, 0, 4, 2)], seeded("deck"));
  const pos = mesh.geometry.attributes.position.array;
  assert.ok(pos.length > 0 && pos.length % 9 === 0, "whole triangles");
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    assert.ok(pos[i] >= -0.12 && pos[i] <= 4.12, `x ${pos[i]} ragged at most 0.1 past the edge`);
    assert.ok(pos[i + 2] >= -0.01 && pos[i + 2] <= 2.01, `z ${pos[i + 2]} inside the deck`);
    (lo = Math.min(lo, pos[i + 1])), (hi = Math.max(hi, pos[i + 1]));
  }
  assert.ok(hi <= 0.03 && hi > 0, `the tops at the deck's top, a hair of warp, the nails proud (${hi})`);
  assert.ok(lo < -0.08 && lo > -0.14, "a board's thickness under it");
  // four rows 0.5 apart over the 2 across (0.46 wide, 0.04 between): three gaps, no board over the next
  assert.equal(gaps(pos), 3);
  assert.equal(mesh.geometry.attributes.color.count, mesh.geometry.attributes.position.count);
});

test("planks: nothing where the span has no deck; the same seed, the same boards; along a slope, shorter boards", () => {
  assert.equal(planks([{ ...span(0, 0, 4, 2), inside: () => false }], seeded("none")).geometry.attributes.position.count, 0);
  const a = planks([span(0, 0, 4, 2)], seeded("x")).geometry.attributes.position.array, b = planks([span(0, 0, 4, 2)], seeded("x")).geometry.attributes.position.array;
  assert.deepEqual([...a], [...b]);
  // a deck bent along its length (a ramp's foot): more, shorter boards, each true to it within a hair
  const flat = planks([span(0, 0, 6, 1)], seeded("r")).geometry.attributes.position.count;
  const bent = planks([span(0, 0, 6, 1, 0, (x) => (x > 3 ? (x - 3) * 0.4 : 0))], seeded("r")).geometry.attributes.position.count;
  assert.ok(bent > flat, `${bent} > ${flat}`);
});

test("the mines' machines standing over the kerb (wallHeight): the wheel's paddles, the cage and the doors", async () => {
  const { wallHeight } = await import("../lib/scene/mines.ts");
  assert.equal(wallHeight("paddle"), 4);
  assert.equal(wallHeight("cage door"), 4.2, "to its lintel: drawn up, the lattice hangs over the lane");
  assert.equal(wallHeight("swing door"), 2);
  assert.equal(wallHeight("safe door"), 2);
  assert.equal(wallHeight("vault door"), 5.5, "a stroke's vault door, its disc");
  assert.equal(wallHeight("stamp"), undefined, "the rest: the kerb's own height");
});

test("ring: a crystal bumper sings when the replay's own hole object (not the course's copy) hits it (review #1)", async () => {
  const { piece, ring } = await import("../lib/scene/mines-pieces.ts");
  const t = { height: () => 0, onGreen: () => true } as unknown as Parameters<typeof piece>[2];
  const s = { hole: "gno.land/r/x/hole2", slot: "mines/2", board: { w: 20, h: 10 }, zones: [], walls: [], posts: [], cup: [18, 5], start: [2, 5] } as unknown as Parameters<typeof piece>[3];
  // the course is built from a copy of the hole (engine.ts decorOf), the replay rings with the engine's own object
  piece("post", { c: [10, 5], r: 0.8, skin: "crystal bumper" }, t, { ...s, hole: "mines/2" });
  assert.equal(ring(s, 10.9, 5, 0), true, "the nearest crystal answers");
  assert.equal(ring(s, 2, 2, 0), false, "none near: no crystal answers");
});

test("rockfall: its dust fades on its own material, never the halos' shared one (review #2)", async () => {
  const { extras } = await import("../lib/scene/mines-pulses.ts");
  const { haloMat } = await import("../lib/scene/mines-toon.ts");
  const { state } = await import("../lib/scene/state.ts");
  const t = { height: () => 0, onGreen: () => true } as unknown as Parameters<typeof extras>[2];
  const s = { hole: "mines/9", slot: "mines/9", board: { w: 30, h: 20 }, zones: [], walls: [], posts: [], cup: [28, 10], start: [2, 10] } as unknown as Parameters<typeof extras>[1];
  const bar = [[[10, 9], [14, 9]], [[14, 9], [14, 10]], [[14, 10], [10, 10]], [[10, 10], [10, 9]]].map(([a, b]) => ({ a, b, skin: "rockfall" }));
  const before = haloMat().opacity;
  extras({ version: 1, walls: [], posts: [], zones: [] }, s, t);
  state.live.length = 0;
  extras({ version: 1, walls: bar, posts: [], zones: [] } as unknown as Parameters<typeof extras>[0], s, t); // the roof comes down this stroke
  const t0 = performance.now() / 1000;
  for (let k = 0; k <= 30; k++) for (const f of state.live) f(t0 + k * 0.1, 0.1);
  assert.equal(haloMat().opacity, before, "the shared halo material untouched");
});

test("the ball's cues in the mines' words: a draught, not a gust; the strongroom's gold as slippery as ice", async () => {
  const THREE = await import("three");
  const { causeAt, makeCauses } = await import("../lib/scene/cause.ts");
  const gold = { kind: "surface", skin: "gold", vec: [0, 0], min: [0, 0], max: [4, 4], round: false } as const;
  assert.deepEqual(causeAt([gold], 2, 2, 1, 0), { kind: "ice" });
  assert.equal(causeAt([{ ...gold, skin: "carpet" }], 2, 2, 1, 0), null);
  const at = new THREE.Vector3(), wind = { kind: "wind" as const, vec: [0.05, 0] as [number, number] };
  const mines = makeCauses(new THREE.Scene()), garden = makeCauses(new THREE.Scene());
  assert.equal(mines.at(at, 1, 0, wind, "mines"), "Draught");
  assert.equal(garden.at(at, 1, 0, wind, "garden"), "Gust");
  assert.equal(mines.at(at, 1, 0, { kind: "ice" }, "mines"), "Slippery");
});

test("Review #3: one lantern for the mines, its glass the one GLASS, dimmed at once by lanternsLit", () => {
  const glass: THREE.Material[] = [];
  lantern(0.55).traverse((o) => { if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial && !md(o.material).hull) glass.push(o.material); });
  assert.deepEqual(glass, [GLASS], "its only unlit part (its ink aside) is the shared glass");
  lanternsLit(0);
  assert.equal(GLASS.color.getHex(), DEAD_GLASS.getHex(), "Lights out: dead");
  lanternsLit(1);
  assert.equal(GLASS.color.getHex(), MINES.lantern, "lit again");
});

test("gnomeIn keeps the gnome it found while he is in the scene, and finds the new one after a swap", async () => {
  const THREE = await import("three");
  const { gnomeIn } = await import("../lib/scene/gnome.ts");
  const scene = new THREE.Scene(), a = new THREE.Group(), b = new THREE.Group();
  a.name = b.name = "gnome";
  scene.add(a);
  assert.equal(gnomeIn(scene), a);
  assert.equal(gnomeIn(scene), a);
  scene.remove(a), scene.add(new THREE.Group().add(b));
  assert.equal(gnomeIn(scene), b);
  b.name = "ghost";
  assert.equal(gnomeIn(scene), undefined);
});

// Review #11: the one chamfer the world and the signs share measures off its zeros along rows, columns and diagonals
test("chamferField: distance to the nearest zero cell", () => {
  const nx = 5, nz = 5, D = new Float32Array(nx * nz).fill(1e4);
  D[2 * nx + 2] = 0;
  chamferField(D, nx, nz, 0.5);
  assert.equal(D[2 * nx + 2], 0);
  assert.equal(D[2 * nx + 4], 1); // two cells along a row
  assert.ok(Math.abs(D[0] - 2 * 0.5 * Math.SQRT2) < 1e-6); // two diagonal steps to a corner
  assert.ok(Math.abs(D[3] - (0.5 * Math.SQRT2 + 0.5)) < 1e-6); // a diagonal step and a straight one
});
