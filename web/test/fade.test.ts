// The canopy fade every world uses (materials.ts fadeLoop): what stands
// between the camera and the ball, or between the camera and the cup, goes
// see-through; what stands on neither line comes back.
import "./canvas.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { fadeLoop, fadeable } from "../lib/scene/materials.ts";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** A tree at at (radius 1), its material's opacity once the camera at eye looks at the ball (and the cup, if given). */
function seen(at: THREE.Vector3, eye: THREE.Vector3, ball: THREE.Vector3, cup: THREE.Vector3 | null) {
  const m = fadeable(new THREE.MeshBasicMaterial());
  fadeLoop([{ at, r: 1, mats: [m] }])(eye, ball, cup);
  return m.opacity;
}
const EYE = V(0, 10, 20), BALL = V(-8, 0, 0), CUP = V(8, 0, 0);

void test("fadeLoop: a tree between the camera and the ball fades", () => {
  assert.ok(seen(V(-4, 5, 10), EYE, BALL, CUP) < 0.5);
  assert.ok(seen(V(-4, 5, 10), EYE, BALL, null) < 0.5, "with no cup given, as before");
});

void test("fadeLoop: a tree between the camera and the cup fades", () => {
  assert.ok(seen(V(4, 5, 10), EYE, BALL, CUP) < 0.5);
  assert.equal(seen(V(4, 5, 10), EYE, BALL, null), 1, "no cup given: only the ball's line");
});

void test("fadeLoop: a tree on neither line stands as it is", () => {
  assert.equal(seen(V(0, 2, -6), EYE, BALL, CUP), 1);
});
