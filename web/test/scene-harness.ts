// The scene without a GPU: buildHole (lib/scene/course.ts) on a hole as the
// chain gives it (HoleState), in Node. three builds its geometry without a GL
// context; the one browser thing the scene asks for is a 2D canvas, for its
// painted textures, stood in for here by one that draws nothing. What a test
// reads back is the geometry: each mesh's vertices, where, and their colours.
import type * as THREE from "three";
import type { Hole } from "../lib/scene/data.ts";

// a 2D context that draws nothing: every call a no-op, every read zeros
const ctx: unknown = new Proxy({}, {
  get: (_t, k) =>
    k === "measureText" ? () => ({ width: 8 })
    : k === "getImageData" ? (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) })
    : k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern" ? () => ({ addColorStop() {} })
    : () => undefined,
  set: () => true,
});
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) };

const { buildHole } = await import("../lib/scene/course.ts");
const worlds = await import("../lib/scene/worlds.ts");
export const { loadWorld, worldOf } = worlds;

/** The game's own buildHole on a hole as the chain gives it (HoleState). */
export const build = (s: Hole): THREE.Object3D => buildHole(s);

/** A buffer's sum, each value weighted by its place: two different shapes all but never agree. */
const sum = (a: ArrayLike<number> | undefined) => {
  let t = 0;
  for (let i = 0; a && i < a.length; i++) t += a[i] * ((i % 7) + 1);
  return t.toFixed(2);
};

/** What the scene drew: one key a mesh (its vertices, where they are, their colours, its material's), sorted. */
export function drawn(s: Hole): string[] {
  const keys: string[] = [], root = build(s);
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh, at = m.geometry?.attributes;
    if (!at?.position?.count) return;
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshBasicMaterial | undefined, e = m.matrixWorld.elements;
    keys.push(`${at.position.count}:${mat?.color?.getHexString?.() ?? ""}:${sum(at.position.array)}:${sum(at.color?.array)}:${sum([e[12], e[13], e[14]])}`);
  });
  return keys.sort();
}

/** The keys in a but not in b (a multiset difference): what a piece added. */
export function added(a: readonly string[], b: readonly string[]): string[] {
  const left = new Map<string, number>();
  for (const k of b) left.set(k, (left.get(k) ?? 0) + 1);
  return a.filter((k) => {
    const n = left.get(k) ?? 0;
    if (n > 0) left.set(k, n - 1);
    return n === 0;
  });
}
