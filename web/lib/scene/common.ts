// What every scene module needs and nothing else: a seeded random, the size of
// the island round the board, the garden's ground level, and the small
// helpers every world's decor uses. Its own module so
// the scene files import it without importing each other (and without cycles).
import type * as THREE from "three";
import type { Height } from "./data";

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

/** A curve's unit tangent at u, written into out: three's own getTangent
 *  (two points 1e-4 either side) without the two vectors it makes a call,
 *  for what moves along a curve every frame. tmp: a scratch vector. */
export function tangentInto(c: THREE.Curve<THREE.Vector3>, u: number, out: THREE.Vector3, tmp: THREE.Vector3) {
  c.getPoint(Math.max(0, u - 1e-4), tmp);
  c.getPoint(Math.min(1, u + 1e-4), out);
  return out.sub(tmp).normalize();
}
