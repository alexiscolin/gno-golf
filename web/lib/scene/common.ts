// What every scene module needs and nothing else: a seeded random, the size of
// the island round the board, the garden's ground level, and the small
// helpers every world's decor uses. Its own module so
// the scene files import it without importing each other (and without cycles).
import type * as THREE from "three";
import type { Height, Hole } from "./data";
import type { Vec2, Zone } from "../types";

/** A random in [0, 1): seeded() makes one. */
export type Rand = () => number;

/** A seeded random in [0, 1): the same string always draws the same scene. */
export const seeded = (str: string): Rand => {
  let h = 1779033703;
  for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 3432918353);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
};

/** What a hole's own scenery is seeded by: a course hole's name and id, as it always was (an older realm's, saying
 *  nothing of official, one: engine.ts's reading); a built hole's id alone (renamed, in the Builder or at Publish, it
 *  keeps its look). */
export const lookSeed = (s: Pick<Hole, "name" | "hole" | "official">) => (s.official !== false ? s.name : "") + s.hole;

/** The island's margins around the green, in board units. */
export const ISLAND = { x: 7, front: 4, back: 10, soil: 4 };
/** The ground round the board: a step below the green. */
export const GRASS = -0.6;

/** Room round the board, for a world's decor: free(x, z, r) says whether a
 *  circle there is clear of every one reserved, reserve(x, z, r) takes it. */
export function placer() {
  const taken: { x: number; z: number; r: number }[] = [];
  return {
    free: (x: number, z: number, r: number) => taken.every((t) => Math.hypot(t.x - x, t.z - z) >= t.r + r),
    reserve: (x: number, z: number, r: number) => taken.push({ x, z, r }),
  };
}

/** Stands m on the course's ground at (x, z); returns it. */
export const onGround = <T extends THREE.Object3D>(m: T, x: number, z: number, t: { height: Height }) => (m.position.set(x, t.height(x, z), z), m);

/** Whether o is shown: it and every parent of it visible. */
export const shown = (o: THREE.Object3D | null) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

/** A curve's unit tangent at u, written into out: three's own getTangent
 *  (two points 1e-4 either side) without the two vectors it makes a call,
 *  for what moves along a curve every frame. tmp: a scratch vector. */
export function tangentInto(c: THREE.Curve<THREE.Vector3>, u: number, out: THREE.Vector3, tmp: THREE.Vector3) {
  c.getPoint(Math.max(0, u - 1e-4), tmp);
  c.getPoint(Math.min(1, u + 1e-4), out);
  return out.sub(tmp).normalize();
}

/** A zone's outline, as the chain has it: its polygon, its ellipse (n points round its box) or its rectangle. */
export function outlineOf(z: Pick<Zone, "min" | "max"> & Partial<Pick<Zone, "round" | "poly">>, n = 72): readonly Vec2[] {
  if (z.poly && z.poly.length > 2) return z.poly;
  const [x0, z0] = z.min, [x1, z1] = z.max;
  if (!z.round) return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
  return Array.from({ length: n }, (_, i): Vec2 => [cx + Math.cos((i / n) * Math.PI * 2) * hx, cz + Math.sin((i / n) * Math.PI * 2) * hz]);
}

/** How a drop (a crevasse, a cliff, a gap) is drawn and cut: "rim" round its own outline (round, or a polygon: the
 *  Builder's; it cuts no rail, its box's corners are ground), "edge" all its box but a polygon (everything but the
 *  lane: the lane's own walls run along it, it cuts none either), "straight" its box (it cuts the rails it crosses). */
export const dropOf = (z: Partial<Pick<Zone, "round" | "poly" | "outside">>): "rim" | "edge" | "straight" =>
  z.round || (z.poly && z.poly.length > 2 && !z.outside) ? "rim" : z.poly && z.poly.length > 2 ? "edge" : "straight";
