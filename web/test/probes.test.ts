// The ?camlog test hooks: what probes() computes from the engine's live
// state, the camera and the replay. No renderer is ever created here (three's
// core math runs headless); boardFrame() reads the bare globals `innerWidth`/
// `innerHeight` a browser gives it, so this file stands those in.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { probes } from "../lib/engine/probes.ts";
import type { Live } from "../lib/engine/types.ts";

globalThis.innerWidth ??= 800;
globalThis.innerHeight ??= 600;

function makeCam() {
  return {
    camLog: [] as unknown[],
    occluded: () => false,
    inner: { some: "state" },
    lensWho: {} as Record<number, number>,
    yaw: () => 0.5,
    gliding: () => false,
    laneAt: (x: number, z: number) => ({ x, z }),
    resetFollow: () => {},
    jump: () => {},
    forced: null as boolean | null,
    forceRoute(on: boolean | null) { this.forced = on; },
    routeAt: (x: number, z: number) => (x < 0 ? null : x + z),
  };
}

function makeRig() {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  group.name = "Decor";
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  group.add(mesh);
  scene.add(group, new THREE.Group()); // one empty group too: census.empty

  const course = new THREE.Group();
  course.userData.terrain = { onGreen: (_x: number, _z: number) => true };
  const piece = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x226c57 }));
  course.add(piece);

  const ball = new THREE.Object3D();
  ball.position.set(2, 0.5, 3);

  const cam = makeCam();
  const replayCalls: unknown[][] = [];
  const rp = { replay: (...args: unknown[]) => (replayCalls.push(args), Promise.resolve()) };
  const fakeWeatherCalls: unknown[] = [];
  const placeBallCalls: unknown[] = [];
  const strokeCalls: unknown[] = [];

  const g: Record<string, unknown> = {
    strokes: 0,
    done: false,
    holed: false,
    id: "garden/1",
    ball: { x: 2, y: 3 },
    weather: { fog: true, storm: false },
    course,
    s: {
      board: { w: 20, h: 12 },
      walls: [{ a: [1, 1] as const, b: [5, 1] as const, skin: "kerb" }],
      posts: [],
      zones: [],
      start: [1, 1] as const,
      cup: [15, 8] as const,
    },
    far: { orbit: 0.4, tilt: 0.2, dist: 12 },
    view: "ball",
    cam: "third",
    flying: false,
    tick0: 0,
    replaying: { flags: "a-", at: 1 },
    buildMs: [12, 3],
  };

  const E = {
    g,
    camera,
    scene,
    ground: (x: number, z: number) => x * 0.1 + z * 0.05,
    band: { visible: true },
    publish: () => true,
    ball,
    shot: { angle: 0.3, power: 4 },
    clock: 7.5,
  } as unknown as Live;

  const inner = {
    cam,
    rp,
    placeBall: (...a: unknown[]) => placeBallCalls.push(a),
    fakeWeather: (w: string) => fakeWeatherCalls.push(w),
    stroke: (ex: unknown) => strokeCalls.push(ex),
  };

  return { E, g, camera, scene, course, cam, rp, replayCalls, fakeWeatherCalls, placeBallCalls, strokeCalls, p: probes(E, inner as never) };
}

void test("fakeWin marks the hole done, and keeps it off the player's card (nobody played it)", () => {
  const { p, g } = makeRig();
  p.fakeWin(3);
  assert.equal(g.strokes, 3);
  assert.equal(g.done, true);
  assert.equal(g.holed, true);
  p.fakeWin();
  assert.equal(g.strokes, 2); // the default
});

void test("camLog drains the camera's own log", () => {
  const { p, cam } = makeRig();
  cam.camLog.push("a", "b");
  assert.deepEqual(p.camLog(), ["a", "b"]);
  assert.deepEqual(p.camLog(), []); // spliced away
});

void test("camAim reports the ball and a point ahead on screen, and whether the gnome is seen", () => {
  const { p } = makeRig();
  const r = p.camAim();
  assert.equal(typeof r.ball[0], "number");
  assert.equal(r.ball.length, 3);
  assert.equal(r.ahead.length, 2);
  assert.equal(r.seen, true); // the fake camera is never occluded
});

void test("sightProbe walks the ground under the camera-to-head line", () => {
  const { p } = makeRig();
  const r = p.sightProbe();
  assert.equal(r.line.length, 7);
  assert.ok(Number.isFinite(r.groundAtBall));
});

void test("inView lists the drawn meshes in the frustum, keyed by what draws them", () => {
  const { p, camera } = makeRig();
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const seen = p.inView();
  assert.ok(Object.keys(seen).length > 0);
});

void test("camHeading reads the camera's own yaw", () => {
  const { p, camera } = makeRig();
  camera.position.set(0, 0, 0);
  camera.lookAt(1, 0, 0);
  camera.updateMatrixWorld(true);
  assert.ok(Number.isFinite(p.camHeading()));
});

void test("camInner passes the follow rig's own state through untouched", () => {
  const { p, cam } = makeRig();
  assert.equal(p.camInner, cam.inner);
});

void test("lensFill: a wall filling the view scores near 1, an empty one scores 0", () => {
  const { p, camera, scene } = makeRig();
  // the camera's default forward is -Z; stand it outside a wide, near wall so
  // every ray of the 5x5 grid lands on its front face, well inside rc.far (2)
  camera.position.set(0, 0, 3);
  camera.updateMatrixWorld(true);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 2), new THREE.MeshBasicMaterial());
  wall.position.set(0, 0, 1.5);
  wall.updateMatrixWorld(true);
  scene.add(wall);
  const fill = p.lensFill();
  assert.ok(fill > 0.5, `expected most of the 5x5 grid to hit the wall, got ${fill}`);
  assert.ok(Object.keys(p.lensWho()).length > 0);
});

void test("lensFill sees nothing when nothing but the empty course stands in range", () => {
  const { p, camera } = makeRig();
  camera.position.set(0, 500, 0); // nothing within its 2-unit reach up here
  camera.updateMatrixWorld(true);
  assert.equal(p.lensFill(), 0);
});

void test("camYaw, gliding and laneAt pass through to the camera rig", () => {
  const { p } = makeRig();
  assert.equal(p.camYaw(), 0.5);
  assert.equal(p.gliding(), false);
  assert.deepEqual(p.laneAt(3, 4), { x: 3, z: 4 });
});

void test("camBoard reads whether the camera stands on the green and how far from the nearest wall", () => {
  const { p, camera } = makeRig();
  camera.position.set(2, 1, 1);
  const board = p.camBoard();
  assert.ok(board);
  assert.equal(board.green, true);
  assert.ok(board.gap >= 0);
});

void test("camBoard is null without a loaded hole", () => {
  const { p, g } = makeRig();
  g.s = null;
  assert.equal(p.camBoard(), null);
});

void test("aimAngle reads the pull's heading", () => {
  const { p } = makeRig();
  assert.equal(p.aimAngle(), 0.3);
});

void test("putBall moves the ball and resets the camera's follow", () => {
  const { p, g, cam, placeBallCalls } = makeRig();
  p.putBall(5, 6);
  assert.deepEqual(g.ball, { x: 5, y: 6 });
  assert.equal(placeBallCalls.length, 1);
  void cam; // resetFollow/jump are stubbed no-ops, called for their side effect only
});

void test("groundAt reads the height field directly", () => {
  const { p } = makeRig();
  assert.equal(p.groundAt(10, 20), 10 * 0.1 + 20 * 0.05);
});

void test("replayPath flags the ball flying for the replay's duration, then drops it", async () => {
  const { p, g, replayCalls } = makeRig();
  const path = [[0, 0], [1, 1]] as const;
  const done = p.replayPath(path, "--", "ww", 42);
  assert.equal(g.flying, true);
  assert.equal(g.tick0, 42);
  await done;
  assert.equal(g.flying, false);
  assert.deepEqual(replayCalls, [[path, false, "--", "ww"]]);
});

void test("ballLift reads the ball's height over the ground and the replay step it is on", () => {
  const { p } = makeRig();
  const r = p.ballLift();
  assert.equal(r.flying, false);
  assert.equal(r.at, 1);
  assert.equal(r.flags, "a-");
});

void test("ballLift reports no replay step without one under way", () => {
  const { p, g } = makeRig();
  g.replaying = null;
  const r = p.ballLift();
  assert.equal(r.at, -1);
  assert.equal(r.flags, null);
});

void test("pullState reports the pull, the aim and the stroke count as they stand", () => {
  const { p, g } = makeRig();
  g.aiming = true;
  const r = p.pullState();
  assert.equal(r.power, 4);
  assert.equal(r.aiming, true);
  assert.equal(r.band, true);
  assert.equal(r.strokes, 0);
});

void test("census counts the scene's objects, its empty groups and what draws", () => {
  const { p } = makeRig();
  const c = p.census();
  assert.ok(c.objects > 0);
  assert.ok(c.empty >= 1);
  assert.ok(c.draws >= 1);
  assert.ok(c.auto >= 1);
  assert.equal(c.weather, "fog");
});

void test("census reads an empty weather string with none forecast", () => {
  const { p, g } = makeRig();
  g.weather = null;
  assert.equal(p.census().weather, "");
});

void test("fingerprint sums each top-level piece's vertices, local and in world space", () => {
  const { p } = makeRig();
  const fp = p.fingerprint();
  assert.ok(fp);
  assert.equal(fp.length, 1); // one top-level piece in the fake course
  const [kind, n] = fp[0];
  assert.equal(kind, "Mesh:");
  assert.ok((n as number) > 0);
});

void test("fingerprint is null without a built course", () => {
  const { p, g } = makeRig();
  g.course = null;
  assert.equal(p.fingerprint(), null);
});

void test("fakeWeather forwards to the engine's own hook", () => {
  const { p, fakeWeatherCalls } = makeRig();
  p.fakeWeather("storm");
  assert.deepEqual(fakeWeatherCalls, ["storm"]);
});

void test("clock and buildMs read the engine's own fields", () => {
  const { p } = makeRig();
  assert.equal(p.clock(), 7.5);
  assert.deepEqual(p.buildMs(), [12, 3]);
});

void test("camPose reads the camera's world position", () => {
  const { p, camera } = makeRig();
  camera.position.set(1, 2, 3);
  assert.deepEqual(p.camPose(), [1, 2, 3]);
});

void test("farOrbit reads the Far rig's orbit share, tilt and distance", () => {
  const { p } = makeRig();
  assert.deepEqual(p.farOrbit(), { orbit: 0.4, tilt: 0.2, dist: 12 });
});

void test("farOrbit is undefined outside the Far view", () => {
  const { p, g } = makeRig();
  g.far = undefined;
  assert.equal(p.farOrbit(), undefined);
});

void test("boardFrame projects the lane's box onto the screen", () => {
  const { p } = makeRig();
  const bf = p.boardFrame();
  assert.ok(bf);
  assert.equal(bf.w, 800);
  assert.equal(bf.h, 600);
  assert.equal(bf.r.length, 4);
  assert.equal(bf.view, "ball");
  assert.equal(bf.cam, "third");
});

void test("boardFrame is null without a loaded hole", () => {
  const { p, g } = makeRig();
  g.s = null;
  assert.equal(p.boardFrame(), null);
});

void test("pose holds the camera at a close-up as a ride would, and lets it go", () => {
  const { p, g } = makeRig();
  p.pose([1, 2, 3], [4, 5, 6], 30);
  const ride = g.ride as { pos: THREE.Vector3; look: THREE.Vector3; fov?: number };
  assert.deepEqual([ride.pos.toArray(), ride.look.toArray(), ride.fov], [[1, 2, 3], [4, 5, 6], 30]);
  p.pose();
  assert.equal(g.ride, null);
});

void test("tubes lists the course's tubes: skin, kind, length, ridden, the hole's own", () => {
  const { p, g, course } = makeRig();
  assert.deepEqual(p.tubes(), []);
  const own = { kind: "tunnel", skin: "cart ride", min: [0, 0], max: [1, 1], vec: [5, 5] };
  const lift = { kind: "tunnel", skin: "lift", min: [0, 0], max: [1, 1], vec: [5, 5] };
  const ride = Object.assign(new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 4, 0)), { userData: { ride: { ms: 900 } } });
  const plain = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 2.04));
  (g.s as { zones: unknown[] }).zones = [own];
  course.userData.tubes = new Map<unknown, unknown>([[own, ride], [lift, plain]]);
  assert.deepEqual(p.tubes(), [["cart ride", "tunnel", 5, true, true], ["lift", "tunnel", 2, false, false]]);
});

void test("showAt, ballAt and gpu read the engine: the clock held, the ball as drawn, what the GPU holds", () => {
  const { p, E, g } = makeRig();
  const shown: number[] = [];
  Object.assign(E, { showAt: (t: number) => shown.push(t), info: () => ({ memory: { geometries: 12, textures: 3 }, programs: [1, 2], render: { frame: 9 } }) });
  p.showAt(6);
  assert.deepEqual(shown, [6]);
  g.inTube = true;
  assert.deepEqual(p.ballAt(), { p: [2, 0.5, 3], visible: true, tube: true, scale: 1, seen: true });
  assert.deepEqual(p.gpu(), { geometries: 12, textures: 3, programs: 2 });
  Object.assign(E, { info: () => ({ memory: { geometries: 1, textures: 0 } }) });
  assert.equal(p.gpu().programs, 0);
});

void test("the audit's hooks run on the engine's course (audit.ts)", () => {
  const { p, E } = makeRig();
  Object.assign(E, { zones: () => [], info: () => ({ render: { frame: 3 } }) });
  const a = p.surfaceAudit(2)!;
  assert.deepEqual([a.board, a.step, a.rows.length], [[20, 12], 2, 60]);
  assert.ok(Array.isArray(p.whatAt(0, 0)));
  assert.deepEqual(p.glows(), { glows: [], blind: [] });
  assert.deepEqual(p.movers(), { frame: 3, rows: [] });
});

void test("sightHits names what stands between the camera and the gnome, by its nearest named group; nothing when clear", () => {
  const { p, scene } = makeRig();
  const wall = new THREE.Group();
  wall.name = "crag";
  wall.add(new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.2), new THREE.MeshBasicMaterial()));
  wall.position.set(2, 1, 0);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.2), new THREE.MeshBasicMaterial({ transparent: true }));
  glass.position.set(2, 1, 6);
  scene.add(wall, glass);
  scene.updateMatrixWorld(true);
  assert.deepEqual(p.sightHits([2, 0.6, -5]), ["crag", "crag", "crag", "crag", "crag"]);
  assert.deepEqual(p.sightHits([2, 0.6, 9]), ["", "", "", "", ""], "a see-through pane is no obstacle");
  wall.visible = false;
  assert.deepEqual(p.sightHits([2, 0.6, -5]), ["", "", "", "", ""], "nor a hidden one");
});

void test("routeForce, routeAt and strokeState pass through to the camera's route and the engine's stroke", () => {
  const { p, cam, strokeCalls } = makeRig();
  p.routeForce(true);
  assert.equal(cam.forced, true);
  p.routeForce(null);
  assert.equal(cam.forced, null);
  assert.equal(p.routeAt(2, 3), 5);
  assert.equal(p.routeAt(-1, 0), null);
  const ex = { walls: [], zones: [] };
  p.strokeState(ex as never);
  assert.deepEqual(strokeCalls, [ex]);
});

void test("the audit's rides and pieces checks run on the engine's course (audit.ts)", () => {
  const { p, E } = makeRig();
  Object.assign(E, { zones: () => [] });
  assert.deepEqual(p.clearance(), { seen: 0, under: [] });
  assert.equal(p.rideClearance(), null, "no tubes on this course");
  assert.deepEqual(p.draws("none")!.mine, []);
  assert.ok(Array.isArray(p.renderQuality()));
  assert.deepEqual(p.moverClip(), []);
  assert.deepEqual(p.trackOverHazard(), []);
});
