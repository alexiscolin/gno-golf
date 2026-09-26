// Unit tests for lib/engine/camera.ts's makeCamera(E): the springs and the
// rig/third-person math, driven by calling update(dt) and reading back the
// three.js camera and the returned probes (inner(), yaw(), settled()...).
// No DOM: everything here is three.js headless math plus plain state.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeCamera } from "../lib/engine/camera.ts";
import { angDiff, terrain } from "../lib/terrain.ts";
import type { Live } from "../lib/engine/types.ts";
import type { HoleState, Post, Vec2, Wall } from "../lib/types.ts";

type Fixture = Pick<HoleState, "board" | "walls" | "zones" | "start" | "cup"> & { posts: Post[] };

function mkWall(a: Vec2, b: Vec2, skin = "rail", over: Partial<Wall> = {}): Wall {
  return { a, b, skin, ...over };
}
function mkPost(c: Vec2, r = 0.5, skin = "bumper"): Post {
  return { c, r, skin };
}
function mkHole(over: Partial<Fixture> = {}): Fixture {
  return { board: { w: 20, h: 10 }, walls: [], zones: [], posts: [], start: [1, 5], cup: [18, 5], ...over };
}

/** A minimal Live fixture: just the fields makeCamera actually reads (see
 *  its destructuring and E.* uses). Cast through unknown, not checked against
 *  the full Live interface — this file only exercises the camera's own math. */
function mkCam(hole: Fixture, opt: { g?: Record<string, unknown>; ground?: (x: number, z: number) => number; screen?: () => { w: number; h: number; top: number; bottom: number; side: number } } = {}) {
  const camera = new THREE.PerspectiveCamera(30, 1, 3, 260);
  const scene = new THREE.Scene();
  const ball = new THREE.Object3D();
  ball.position.set(hole.start[0], 0, hole.start[1]);
  const g: Record<string, unknown> = {
    s: hole,
    over: { target: new THREE.Vector3(hole.start[0], 0, hole.start[1]), dist: 30, ox: 0, oy: 0 },
    view: "ball",
    cam: "third",
    flying: false,
    holed: false,
    done: false,
    aiming: false,
    inTube: false,
    course: null,
    rig: null,
    id: "test",
    ...opt.g,
  };
  const E = {
    g,
    camera,
    scene,
    screen: opt.screen ?? (() => ({ w: 1280, h: 720, top: 80, bottom: 80, side: 40 })),
    ground: opt.ground ?? (() => 0),
    dragging: false,
    ball,
    clock: 0,
    log: false,
    shot: { angle: 0, power: 0 },
  } as unknown as Live;
  return { E, camera, ball, g, api: makeCamera(E) };
}
/** Runs update(dt) n times (a fixed 1/60 s step), returning the final api. */
function settle(cam: ReturnType<typeof mkCam>, n = 200, dt = 1 / 60) {
  for (let i = 0; i < n; i++) cam.api.update(dt);
  return cam;
}

// ------------------------------------------------------------- the springs

void test("update: the first frame snaps straight to the target pose (not live yet)", () => {
  const cam = mkCam(mkHole());
  cam.api.update(1 / 60);
  assert.ok(Number.isFinite(cam.camera.position.x) && Number.isFinite(cam.camera.position.y));
  // it actually framed the gnome, not left at the origin
  assert.ok(cam.camera.position.distanceTo(cam.ball.position) > 0.5);
});

void test("update: a static scene settles, and stays put once settled", () => {
  const cam = settle(mkCam(mkHole()), 200);
  assert.equal(cam.api.settled(), true);
  const p0 = cam.camera.position.clone();
  cam.api.update(1 / 60);
  assert.ok(p0.distanceTo(cam.camera.position) < 1e-3, "a settled camera should not drift");
});

void test("jump: lands on the target pose immediately, a plain update lags behind", () => {
  // classic/rig mode: no auto-teleport detection (that lives in thirdTarget
  // only), so a sudden change in g.over genuinely shows the spring lagging.
  const over0 = { target: new THREE.Vector3(1, 0, 5), dist: 30, ox: 0, oy: 0 };
  const over1 = { target: new THREE.Vector3(15, 0, 40), dist: 30, ox: 0, oy: 0 };
  const camA = settle(mkCam(mkHole(), { g: { cam: "classic", view: "overview", over: { ...over0 } } }));
  const camB = settle(mkCam(mkHole(), { g: { cam: "classic", view: "overview", over: { ...over0 } } }));
  const preA = camA.camera.position.clone(), preB = camB.camera.position.clone();
  camA.g.over = { ...over1, target: over1.target.clone() };
  camB.g.over = { ...over1, target: over1.target.clone() };
  camA.api.update(1 / 60);
  camB.api.jump();
  camB.api.update(1 / 60);
  const movedA = preA.distanceTo(camA.camera.position), movedB = preB.distanceTo(camB.camera.position);
  assert.ok(movedB > movedA * 3, `a jump (moved ${movedB.toFixed(2)}) should cover the new framing in one frame, far more than a lagging spring (moved ${movedA.toFixed(2)})`);
});

void test("resetFollow: zeroes the follow state right away, no update() needed", () => {
  const cam = settle(mkCam(mkHole()));
  assert.notEqual(cam.api.inner().wide, undefined);
  cam.api.resetFollow();
  const inner = cam.api.inner();
  assert.equal(inner.wide, 0);
  assert.equal(inner.rise, 0);
  assert.equal(inner.swing, 0);
});

void test("inner(): a finite, plainly-shaped probe", () => {
  const cam = settle(mkCam(mkHole()));
  const inner = cam.api.inner();
  for (const k of ["swing", "pen", "rise", "wide", "yaw"] as const) assert.ok(Number.isFinite(inner[k]), `${k} should be finite`);
});

// ------------------------------------------------------------- rig modes

void test("classic mode: rigTarget fills g.rig from g.over", () => {
  const hole = mkHole();
  const cam = mkCam(hole, { g: { cam: "classic", view: "overview", over: { target: new THREE.Vector3(9, 0, 5), dist: 40, ox: 3, oy: -2 } } });
  cam.api.update(1 / 60);
  const rig = cam.g.rig as { target: THREE.Vector3; dist: number; ox: number; oy: number };
  assert.ok(rig, "g.rig should be populated");
  assert.equal(rig.dist, 40);
  assert.equal(rig.ox, 3);
  assert.equal(rig.oy, -2);
  assert.ok(rig.target.distanceTo(new THREE.Vector3(9, 0, 5)) < 1e-9);
});

void test("far mode: the whole-hole rig, not the ball's own framing", () => {
  const hole = mkHole();
  const far = { target: new THREE.Vector3(9, 0, 5), dist: 60, ox: 0, oy: 0, orbit: 0, tilt: 0 };
  const cam = mkCam(hole, { g: { cam: "far", view: "ball", far } });
  cam.api.update(1 / 60);
  const rig = cam.g.rig as { dist: number };
  assert.equal(rig.dist, 60);
});

// --------------------------------------------------------- third person

void test("third person, rest: settles along the lane's own heading (toward the cup on an open board)", () => {
  const hole = mkHole({ start: [1, 5], cup: [18, 5] }); // due east
  const cam = settle(mkCam(hole, { g: { cam: "third", view: "ball" } }), 300);
  // behind the gnome, roughly east of him, looking back west along the lane
  assert.ok(Math.abs(angDiff(cam.api.yaw(), 0)) < 0.3, `yaw ${cam.api.yaw()} should point roughly east`);
});

void test("third person, aiming: the yaw trails the pull's own heading", () => {
  const hole = mkHole();
  const cam = mkCam(hole, { g: { cam: "third", view: "ball", aiming: true } });
  (cam.E as unknown as { shot: { angle: number; power: number } }).shot = { angle: Math.PI / 2, power: 1 };
  let last = Infinity;
  for (let i = 0; i < 60; i++) {
    cam.api.update(1 / 60);
    const d = Math.abs(angDiff(cam.api.yaw(), Math.PI / 2));
    assert.ok(d <= last + 1e-6, "the yaw should trail the aim monotonically closer");
    last = d;
  }
  assert.ok(last < 0.05, `after a second of aiming the yaw (${cam.api.yaw()}) should be near the aim`);
});

void test("third person, replay: tracks the ball's own run once it is moving fast enough", () => {
  const hole = mkHole();
  const cam = settle(mkCam(hole, { g: { cam: "third", view: "ball" } }));
  cam.g.flying = true;
  // the ball runs north at a few units a second: fast enough (> 1.5) to steer by
  for (let i = 0; i < 180; i++) {
    cam.ball.position.z -= 3 / 60;
    cam.api.update(1 / 60);
  }
  assert.ok(Math.abs(angDiff(cam.api.yaw(), -Math.PI / 2)) < 0.3, `yaw ${cam.api.yaw()} should have turned to follow the run`);
});

void test("third person, holed: frames the cup, not the ball, once the ball is near it", () => {
  const hole = mkHole({ cup: [18, 5] });
  const cam = mkCam(hole, { g: { cam: "third", view: "ball" } });
  cam.ball.position.set(17.5, 0, 5); // within nearCup's 2.5
  cam.g.holed = true;
  for (let i = 0; i < 60; i++) cam.api.update(1 / 60);
  assert.ok(Number.isFinite(cam.camera.position.y));
  assert.ok(cam.camera.position.y > 0, "holed framing looks down from up and back a little");
});

void test("third person, in a tube: still updates without throwing", () => {
  const cam = mkCam(mkHole(), { g: { cam: "third", view: "ball", inTube: true } });
  assert.doesNotThrow(() => { for (let i = 0; i < 10; i++) cam.api.update(1 / 60); });
});

// ------------------------------------------------------------- occluded()

void test("occluded: nothing between the ball and the camera", () => {
  const cam = mkCam(mkHole());
  const P = new THREE.Vector3(10, 3, 5), B = new THREE.Vector3(1, 0.5, 5);
  assert.equal(cam.api.occluded(P, B), false);
});

void test("occluded: a wall between them, both too low to see over its kerb", () => {
  const walls = [mkWall([5, 0], [5, 10])]; // crosses the line from B to P
  const cam = mkCam(mkHole({ walls }));
  const P = new THREE.Vector3(9, 0.2, 5), B = new THREE.Vector3(1, 0.2, 5);
  assert.equal(cam.api.occluded(P, B), true);
});

void test("occluded: the same wall, both well above its kerb: clear", () => {
  const walls = [mkWall([5, 0], [5, 10])];
  const cam = mkCam(mkHole({ walls }));
  const P = new THREE.Vector3(9, 5, 5), B = new THREE.Vector3(1, 5, 5);
  assert.equal(cam.api.occluded(P, B), false);
});

void test("occluded: a post between them, within its height", () => {
  const posts = [mkPost([5, 5], 0.6)];
  const cam = mkCam(mkHole({ posts }));
  const P = new THREE.Vector3(9, 0.2, 5), B = new THREE.Vector3(1, 0.2, 5);
  assert.equal(cam.api.occluded(P, B), true);
});

void test("occluded: a rise in the ground between blocks the line of sight", () => {
  const ground = (x: number) => (x > 3 && x < 7 ? 20 : 0);
  const cam = mkCam(mkHole(), { ground });
  const P = new THREE.Vector3(9, 1, 5), B = new THREE.Vector3(1, 1, 5);
  assert.equal(cam.api.occluded(P, B), true);
});

// ---------------------------------------------------------------- laneAt

void test("laneAt: with no course wired, falls back to the straight line to the cup", () => {
  const hole = mkHole({ start: [1, 5], cup: [18, 9] });
  const cam = mkCam(hole);
  const want = Math.atan2(9 - 5, 18 - 2);
  assert.ok(Math.abs(angDiff(cam.api.laneAt(2, 5), want)) < 1e-6);
});

void test("laneAt: with a real terrain wired in, follows the green toward the cup on an open lane", () => {
  const hole = mkHole({ start: [1, 5], cup: [18, 5] });
  const t = terrain(hole);
  const cam = mkCam(hole, { g: { id: "lane-hole", course: { userData: { terrain: t } } } });
  const heading = cam.api.laneAt(2, 5);
  assert.ok(Math.abs(angDiff(heading, 0)) < 0.3, `heading ${heading} should point roughly east, toward the cup`);
});

void test("laneAt: nearby rails do not throw and still return a finite heading", () => {
  const walls = [mkWall([0, 4], [10, 4]), mkWall([0, 6], [10, 6])]; // a corridor flanking the lane
  const hole = mkHole({ start: [1, 5], cup: [18, 5], walls });
  const t = terrain(hole);
  const cam = mkCam(hole, { g: { id: "rail-hole", course: { userData: { terrain: t } } } });
  const heading = cam.api.laneAt(3, 5);
  assert.ok(Number.isFinite(heading));
});

void test("prepare: builds the course's distance field up front, idempotently", () => {
  const hole = mkHole({ start: [1, 5], cup: [18, 5] });
  const t = terrain(hole);
  const cam = mkCam(hole, { g: { id: "prep-hole", course: { userData: { terrain: t } } } });
  assert.doesNotThrow(() => cam.api.prepare());
  assert.doesNotThrow(() => cam.api.prepare()); // the cached path (field.id === g.id)
  assert.ok(Number.isFinite(cam.api.laneAt(2, 5)));
});

// ----------------------------------------------------------------- hover

void test("hover: a touch pointer is never leant on", () => {
  const cam = mkCam(mkHole());
  assert.doesNotThrow(() => cam.api.hover({ pointerType: "touch", clientX: 0, clientY: 0 } as unknown as PointerEvent));
});

void test("hover: dragging leaves the lean alone too", () => {
  const cam = mkCam(mkHole());
  (cam.E as unknown as { dragging: boolean }).dragging = true;
  assert.doesNotThrow(() => cam.api.hover({ pointerType: "mouse", clientX: 0, clientY: 0 } as unknown as PointerEvent));
});

void test("hover: a mouse leaning left vs right changes the Far view's framing", () => {
  const g = globalThis as unknown as { window?: { innerWidth: number; innerHeight: number } };
  const had = g.window;
  g.window = { innerWidth: 1280, innerHeight: 720 };
  try {
    const hole = mkHole();
    const far = { target: new THREE.Vector3(9, 0, 5), dist: 60, ox: 0, oy: 0, orbit: 1, tilt: 0 };
    const left = mkCam(hole, { g: { cam: "far", view: "ball", far: { ...far } } });
    const right = mkCam(hole, { g: { cam: "far", view: "ball", far: { ...far } } });
    left.api.hover({ pointerType: "mouse", clientX: 0, clientY: 360 } as unknown as PointerEvent);
    right.api.hover({ pointerType: "mouse", clientX: 1280, clientY: 360 } as unknown as PointerEvent);
    left.api.update(1 / 60);
    right.api.update(1 / 60);
    assert.ok(left.camera.position.distanceTo(right.camera.position) > 0.1, "leaning left vs right should orbit the camera differently");
  } finally {
    if (had) g.window = had; else delete g.window;
  }
});

// ----------------------------------------------------------------- glide

void test("finishGlide before it starts just cancels it", () => {
  const cam = settle(mkCam(mkHole()));
  cam.api.glide();
  assert.equal(cam.api.gliding(), true);
  cam.api.finishGlide(); // glide.t0 is still 0: no glide ever really started
  assert.equal(cam.api.gliding(), false);
});

void test("glide: the wait frame changes nothing, then it eases in and a cut finishes it quickly", () => {
  const cam = settle(mkCam(mkHole()));
  const before = cam.camera.position.clone();
  cam.api.glide();
  cam.api.update(1 / 60); // the wait frame: drawn as it is
  assert.ok(before.distanceTo(cam.camera.position) < 1e-6);
  cam.api.update(1 / 60); // glide.t0 set here
  assert.equal(cam.api.gliding(), true);
  cam.api.finishGlide(); // cut the rest short (GLIDE_CUT_MS = 250ms)
  const t0 = performance.now();
  while (cam.api.gliding() && performance.now() - t0 < 1000) cam.api.update(1 / 60);
  assert.equal(cam.api.gliding(), false);
});

// --------------------------------------------------------- collisions

void test("a wall close behind the ball: the camera rises to clear the kerb instead of sitting in it", () => {
  const walls = [mkWall([1, 3], [1, 7])]; // right behind the gnome at (1, 5), facing east
  const hole = mkHole({ start: [1, 5], cup: [18, 5], walls });
  const open = settle(mkCam(mkHole({ start: [1, 5], cup: [18, 5] })));
  const nearWall = settle(mkCam(hole));
  assert.ok(nearWall.camera.position.y > open.camera.position.y - 0.05, "squeezed against a rail, the camera should not end up lower than the open framing");
});

void test("a post right where the camera would sit is avoided", () => {
  // straight behind the gnome (heading 0, facing +x toward the cup at [18,5]): the
  // camera wants ~7 back, on the same axis; a post at 5 back overlaps that spot but
  // is not exactly on it (a post dead-centre on the ideal spot is a div-by-zero guard
  // in keepClear's push, see the report)
  const posts = [mkPost([5, 5], 1)];
  const hole = mkHole({ start: [10, 5], cup: [18, 5], posts });
  const cam = settle(mkCam(hole));
  const d = Math.hypot(cam.camera.position.x - 5, cam.camera.position.z - 5);
  assert.ok(d >= 1 - 0.05, `the camera (d=${d.toFixed(2)}) should be pushed clear of the post's radius`);
});
