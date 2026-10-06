// An Epic's prop, built from its data (lib/gnomes/props.ts): each part a
// simple shape in a flat colour under the gnome's thin ink line, or lit.
import * as THREE from "three";
import { C, flat, inked, share } from "./materials";
import { colour } from "../gnomes/vocab";
import { PROP_DESIGNS, type Part } from "../gnomes/props";
import type { Skin } from "./gnome";

// the fewest segments that stay round under an outline at ball size
const GEO: Record<Part["s"], (d: readonly number[]) => THREE.BufferGeometry> = {
  sphere: ([r, w = 10, h = 8, ...rest]) => new THREE.SphereGeometry(r, w, h, ...rest),
  cone: ([r, h]) => new THREE.ConeGeometry(r, h, 10),
  cyl: ([t, b, h]) => new THREE.CylinderGeometry(t, b, h, 10),
  box: ([w, h, d]) => new THREE.BoxGeometry(w, h, d),
  torus: ([R, t, arc = Math.PI * 2]) => new THREE.TorusGeometry(R, t, 6, 16, arc),
  oct: ([r]) => new THREE.OctahedronGeometry(r, 0),
  ico: ([r]) => new THREE.IcosahedronGeometry(r, 0),
  tetra: ([r]) => new THREE.TetrahedronGeometry(r, 0),
  disc: ([r]) => new THREE.CircleGeometry(r, 12),
};

/** A part's colour: one of the gnome's own, or a palette name. */
function tone(c: string | undefined, skin: Skin) {
  switch (c ?? "prop") {
    case "prop": return skin.propColor ?? C.sun;
    case "hat": return skin.hat;
    case "body": return skin.body ?? C.cream;
    case "hair": return skin.hair ?? 0xffffff;
    case "accent": return skin.accent ?? C.sun;
    default: return colour(c!);
  }
}

// lit parts: no shading, as the headlamp's lens (one material per colour, kept: share)
const lit = new Map<number, THREE.MeshBasicMaterial>();
export const glowOf = (v: number) => lit.get(v) ?? (lit.set(v, share(new THREE.MeshBasicMaterial({ color: v }))), lit.get(v)!);

/**
 * The skin's prop, built: { body, hat, top } groups of parts to place (in the
 * body's space, the hat's, and at the hat's tip), and the parts that take
 * his material (gnome-matter.ts dresses them with the rest of him). Nothing
 * for a skin without one, or a Legendary's (gnome-legend.ts builds those).
 */
export function propOf(skin: Skin) {
  const design = skin.prop ? PROP_DESIGNS[skin.prop] : undefined;
  if (!design || "legend" in design) return null;
  const group = new THREE.Group(), matter: THREE.Mesh[] = [];
  for (const p of design.parts) {
    const geo = GEO[p.s](p.d), v = tone(p.c, skin);
    const mesh = p.glow ? new THREE.Mesh(geo, glowOf(v)) : p.bare ? new THREE.Mesh(geo, flat(v)) : inked(geo, flat(v));
    mesh.position.set(...p.p);
    if (p.r) mesh.rotation.set(...p.r);
    if (p.k) mesh.scale.set(...p.k);
    if (p.m) mesh.traverse((o) => o instanceof THREE.Mesh && o.material instanceof THREE.MeshToonMaterial && matter.push(o as THREE.Mesh));
    group.add(mesh);
  }
  return { at: design.at, group, matter };
}
