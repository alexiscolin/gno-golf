// The Crystal Mines' crystal: a six-sided prism with its point, in the worlds'
// own toon (mines-kit.ts grows every form of the world's crystals from it).
import * as THREE from "three";

/** A six-sided prism with a pointed tip, its foot at 0: r wide, h tall. */
export const prism = (r: number, h: number) =>
  new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(r, 0), new THREE.Vector2(r, h), new THREE.Vector2(0, h + r * 1.6)], 6);
