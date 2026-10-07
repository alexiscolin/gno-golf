// The serac's tower fades out of the camera's way as the trees and the
// canopies do (materials.ts ownFade, fadeLoop; course.ts fadeOf), on every
// device: from a phone held upright, the course's own seracs (mountain/15)
// stand between the camera at rest and a ball on a few spots just beside
// their towers (scene/sight.ts: the computer's camera never), and there they
// go see-through; elsewhere they stand as drawn.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { host } from "./builder-fixture.ts";
import { loadWorld } from "./scene-harness.ts";
import { applyRig, restRig, type View } from "../lib/scene/camera.ts";
import { md } from "../lib/scene/data.ts";
import { BALL_R } from "../lib/terrain.ts";
import type { Course, Hole } from "../lib/scene/data.ts";

await loadWorld("mountain");
const { buildHole } = await import("../lib/scene/course.ts");
const PHONE: View = { w: 390, h: 844, top: 108, bottom: 136, side: 14 }, COMPUTER: View = { w: 1440, h: 900, top: 108, bottom: 136, side: 14 };

const [, , , hex] = fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").trim().split("\n").map((l) => l.split(" ")).find(([slot]) => slot === "mountain/15")!;
host.load("mountain/15", hex);
host.setperiod(5967997);
const s = JSON.parse(host.state("mountain/15")) as Hole;
const course: Course = buildHole(s);
const towers: THREE.Object3D[] = [];
course.traverse((o) => void (o.name === "serac tower" && towers.push(o)));
const mats = (o: THREE.Object3D) => {
  const out = new Set<THREE.Material>();
  o.traverse((m) => void ((m as THREE.Mesh).isMesh && out.add((m as THREE.Mesh).material as THREE.Material)));
  return [...out];
};
/** The tower's opacity once the camera is at rest on a ball at (x, z) in view. */
function seenFrom(view: View, x: number, z: number) {
  const ball = new THREE.Vector3(x, course.userData.height(x, z) + BALL_R, z), cam = new THREE.PerspectiveCamera(30, 1, 3, 260);
  applyRig(cam, restRig(s, ball, view), view);
  course.userData.fade!(cam.position, ball);
  return towers.map((t) => Math.min(...mats(t).map((m) => m.opacity)));
}

void test("mountain/15's serac towers are registered with the canopy fade: their own fadeable materials, the course's fade watching them", () => {
  assert.equal(towers.length, 3);
  for (const t of towers) assert.ok(mats(t).every((m) => md(m).fade !== undefined), "each of its materials fadeable");
  assert.equal(typeof course.userData.fade, "function");
});

void test("from a phone, the camera at rest on a ball just beside a tower: that tower fades; away from it, none does", () => {
  // (sight.ts, from the phone's camera: a ball at (22.5, 13.5) is behind the first tower, at (32.5, 8.5) the second's)
  const first = seenFrom(PHONE, 22.5, 13.5);
  assert.ok(first[0] < 0.5, `the first tower faded: ${first.join()}`);
  const second = seenFrom(PHONE, 32.5, 8.5);
  assert.ok(second[1] < 0.5, `the second tower faded: ${second.join()}`);
  // the tee, far from them all, and the computer's camera on the same spots (nothing hidden from it)
  assert.deepEqual(seenFrom(PHONE, s.start[0], s.start[1]), [1, 1, 1], "from the tee");
  assert.deepEqual(seenFrom(COMPUTER, 22.5, 13.5), [1, 1, 1], "from a computer");
});
