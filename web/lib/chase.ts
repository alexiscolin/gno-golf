// A camera behind a ball, looking where it goes: the promo's follow shots and
// the game's third-person view are the same framing.
import * as THREE from "three";

/** Fills out.pos / out.look for a camera `back` units behind B along dir (flat), `up` above it. */
/** A camera's pose: where it stands, what it looks at. */
export interface Chase {
  pos: THREE.Vector3;
  look: THREE.Vector3;
}
export function behind(out: Chase, B: THREE.Vector3, dir: THREE.Vector3, { back = 6, up = 1.8, ahead = 3, lookUp = 0.2 } = {}) {
  out.pos.copy(B).addScaledVector(dir, -back).setY(B.y + up);
  out.look.copy(B).addScaledVector(dir, ahead).setY(B.y + lookUp);
  return out;
}

export const chaseState = (): Chase => ({ pos: new THREE.Vector3(), look: new THREE.Vector3() });
