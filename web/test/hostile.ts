// Holes no course hole is like, all within GG1's bounds: what anyone can
// publish from a terminal once community publishing opens, for the renderer
// to stand (hostile.test.ts builds each in every world). Zones with
// no area, every limit at once, and every piece and the world itself named
// like Object.prototype's keys, which a table looked up by name would answer
// (lib/own.ts). Plain data in HoleState's shape: no three.js.
import type { HoleState, Post, Vec2, Wall, Zone } from "../lib/types.ts";

/** Names a lookup on a plain object answers with Object.prototype's. */
export const HOSTILE_NAMES = ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"];

const KINDS: readonly Zone["kind"][] = ["surface", "slope", "tunnel", "hazard", "loop"];
const box = (x0: number, y0: number, x1: number, y1: number, skin = ""): Wall[] =>
  [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]].map(([a, b, c, d]) => ({ a: [a, b], b: [c, d], skin }));
const zone = (kind: Zone["kind"], min: Vec2, max: Vec2, over: Partial<Zone> = {}): Zone =>
  ({ kind, min, max, vec: kind === "slope" ? [0.2, 0] : [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2], scale: kind === "loop" ? 2 : 0.5, round: false, skin: "", ...over });
const ring = (c: Vec2, r: number, n: number): Vec2[] => Array.from({ length: n }, (_, k) => [c[0] + r * Math.cos((2 * Math.PI * k) / n), c[1] + r * Math.sin((2 * Math.PI * k) / n)]);

function hole(world: string, pieces: { walls?: Wall[]; posts?: Post[]; zones?: Zone[] }): HoleState {
  return {
    version: 1, hole: `g1hostile/${world}/v1`, name: "Hostile", official: false, board: { w: 96, h: 48 }, par: 3, world, order: 0,
    timed: false, period: 0, weather: null, start: [4, 24], cup: [90, 24], cupR: 1.2,
    walls: [...box(0, 0, 96, 48), ...(pieces.walls ?? [])], posts: pieces.posts ?? [], zones: pieces.zones ?? [],
    wear: { w: 1, h: 1, cells: [0] },
  };
}

/** Every piece, of every kind and clock, skinned name. */
function named(world: string, name: string): HoleState {
  return hole(world, {
    walls: [...box(0, 0, 96, 48, name), { a: [20, 5], b: [20, 15], skin: name }, ...box(30, 5, 31, 9, name), ...box(40, 5, 41, 9, name).map((w) => ({ ...w, every: 40, on: 20, phase: 0 }))],
    posts: [{ c: [50, 8], r: 0.8, skin: name }],
    zones: KINDS.flatMap((k, i) => [
      zone(k, [10 + i * 12, 20], [18 + i * 12, 28], { skin: name }),
      zone(k, [10 + i * 12, 32], [18 + i * 12, 40], { skin: name, round: true, every: 40, on: 20, phase: 0 }),
    ]),
  });
}

/** The hostile holes for a world. */
export function hostileHoles(world: string): HoleState[] {
  return [
    // zones with no area, of every kind: inverted, flat, round, polygons
    hole(world, {
      zones: KINDS.flatMap((k, i) => [
        zone(k, [20 + i * 10, 30], [10 + i * 10, 20]),
        zone(k, [20 + i * 10, 10], [20 + i * 10, 16], { round: true }),
        zone(k, [20 + i * 10, 40], [24 + i * 10, 40], { poly: [[20 + i * 10, 40], [24 + i * 10, 40], [22 + i * 10, 40]], outside: i % 2 === 1 }),
      ]),
    }),
    // every polygon point GG1 allows: 8 zones of 64
    hole(world, { zones: Array.from({ length: 8 }, (_, i) => zone(KINDS[i % 5], [6 + i * 11, 18], [16 + i * 11, 28], { poly: ring([11 + i * 11, 23], 5, 64) })) }),
    // every wall GG1 allows, each of no length
    { ...hole(world, {}), walls: Array.from({ length: 160 }, (_, i): Wall => ({ a: [10 + (i % 40) * 2, 10 + Math.floor(i / 40) * 5], b: [10 + (i % 40) * 2, 10 + Math.floor(i / 40) * 5], skin: "" })) },
    // every post GG1 allows, each as big as it allows, overlapping
    hole(world, { posts: Array.from({ length: 32 }, (_, i): Post => ({ c: [8 + (i % 8) * 11, 8 + Math.floor(i / 8) * 11], r: 8, skin: i % 2 ? "palm" : "" })) }),
    // every piece, and then the world too, named like Object.prototype's keys
    ...HOSTILE_NAMES.map((n) => named(world, n)),
    ...HOSTILE_NAMES.map((n) => named(n, n)),
  ];
}
