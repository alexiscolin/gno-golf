// The 3D board's camera (Scene.tsx): orthographic, so the ground is seen as
// the board's lens maps it (view.ts): straight down, or tilted from it by
// the look's tilt, turned a quarter at a time; a board point at (x, y) is the
// scene's (x, 0, y), and it shows on the board's pixel toScreen gives it.
// The overlay (the selection, the handles, the ghost) is drawn in the same
// map, so it sits on the pieces it is about.
import * as THREE from "three";
import { toBoard, type Look, type View } from "./view";

/** How far above the ground the camera stands (orthographic: only its direction counts, and what fits between near and far). */
const STAND = 200;

/** cam set to show the ground of a board w × h pixels as the view and the look have it. */
export function orthoFor(cam: THREE.OrthographicCamera, v: View, look: Look, size: { w: number; h: number }) {
  const { w, h } = size, mid = toBoard(v, look, [w / 2, h / 2]), down = toBoard(v, look, [w / 2, h / 2 + 1]);
  // the screen's down along the ground, a unit; the camera leans back from it by the tilt
  const g = new THREE.Vector3(down[0] - mid[0], 0, down[1] - mid[1]).normalize(), y = new THREE.Vector3(0, 1, 0);
  const s = Math.sin(look.tilt), c = Math.cos(look.tilt), target = new THREE.Vector3(mid[0], 0, mid[1]);
  cam.position.copy(target).addScaledVector(y, c * STAND).addScaledVector(g, s * STAND);
  cam.up.copy(y).multiplyScalar(s).addScaledVector(g, -c);
  cam.lookAt(target);
  Object.assign(cam, { left: -w / 2 / v.k, right: w / 2 / v.k, top: h / 2 / v.k, bottom: -h / 2 / v.k, near: 1, far: 2 * STAND });
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return cam;
}

/** Where a point of the scene shows on the board (its pixels), through cam. */
export function shownAt(cam: THREE.Camera, p: THREE.Vector3, size: { w: number; h: number }): [number, number] {
  const q = p.clone().project(cam);
  return [((q.x + 1) / 2) * size.w, ((1 - q.y) / 2) * size.h];
}
