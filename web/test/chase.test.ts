import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { behind, chaseState } from "../lib/chase.ts";

test("chaseState starts at the origin", () => {
  const c = chaseState();
  assert.ok(c.pos instanceof THREE.Vector3);
  assert.ok(c.look instanceof THREE.Vector3);
  assert.deepEqual([c.pos.x, c.pos.y, c.pos.z], [0, 0, 0]);
  assert.deepEqual([c.look.x, c.look.y, c.look.z], [0, 0, 0]);
});

test("behind places the camera back and up, looking ahead of the ball", () => {
  const out = chaseState();
  const B = new THREE.Vector3(0, 0, 0);
  const dir = new THREE.Vector3(0, 0, 1); // ball rolling toward +z
  const ret = behind(out, B, dir);
  assert.equal(ret, out, "returns the same object it fills");
  // default back=6, up=1.8, ahead=3, lookUp=0.2
  assert.deepEqual([out.pos.x, out.pos.y, out.pos.z], [0, 1.8, -6]);
  assert.deepEqual([out.look.x, out.look.y, out.look.z], [0, 0.2, 3]);
});

test("behind honors custom back/up/ahead/lookUp and a non-origin ball", () => {
  const out = chaseState();
  const B = new THREE.Vector3(1, 2, 3);
  const dir = new THREE.Vector3(1, 0, 0);
  behind(out, B, dir, { back: 10, up: 4, ahead: 2, lookUp: 1 });
  assert.deepEqual([out.pos.x, out.pos.y, out.pos.z], [1 - 10, 2 + 4, 3]);
  assert.deepEqual([out.look.x, out.look.y, out.look.z], [1 + 2, 2 + 1, 3]);
});

test("behind flattens a tilted direction (y is set, not added)", () => {
  const out = chaseState();
  const B = new THREE.Vector3(0, 5, 0);
  const dir = new THREE.Vector3(0, 1, 0); // straight up: x/z contribution is 0
  behind(out, B, dir, { back: 6, up: 1.8, ahead: 3, lookUp: 0.2 });
  // addScaledVector still moves y by dir*scalar before setY overrides it
  assert.equal(out.pos.y, 5 + 1.8);
  assert.equal(out.look.y, 5 + 0.2);
});
