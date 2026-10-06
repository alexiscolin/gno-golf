// What a gnome costs to draw (docs/gnomes/design.md, "Budget"): triangles,
// ink hulls and instanced copies included, and draws, once makeBall has baked
// him; how high and how far he reaches. The budget's test and the generator
// (which keeps no gnome over it) both count with this.
import * as THREE from "three";
import { makeBall, type Skin } from "./gnome";
import "./gnome-wardrobe"; // (what is counted is a collection gnome: his wardrobe on)
import type { Gnome } from "./data";

/** A built gnome's cost. */
export function costOf(g: Gnome) {
  let tris = 0, draws = 0;
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh || o instanceof THREE.Sprite) || !o.visible) return;
    draws++;
    const geo = o.geometry as THREE.BufferGeometry, n = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
    tris += o instanceof THREE.InstancedMesh ? n * o.count : n;
  });
  const box = new THREE.Box3().setFromObject(g.userData.body, true);
  return { tris, draws, top: box.max.y, reach: g.userData.reach };
}

/** A skin's triangles, as built. */
export const trianglesOf = (skin: Skin) => costOf(makeBall(skin)).tris;
