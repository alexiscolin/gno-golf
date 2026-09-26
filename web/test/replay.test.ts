// Unit tests for lib/engine/replay.ts: the chain's path walked on screen.
// A fake requestAnimationFrame that calls back synchronously, paired with a
// performance.now() that jumps far ahead every call, makes every animated
// step (a roll, a splash, a tube) resolve to its end state in one or two
// frames instead of needing real timers.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeReplay } from "../lib/engine/replay.ts";
import { BALL_R } from "../lib/terrain.ts";
import type { Live, GameState } from "../lib/engine/types.ts";
import type { Post, Vec2, Zone } from "../lib/types.ts";
import type { TubePath } from "../lib/scene/data.ts";

function mkZone(over: Partial<Zone> & Pick<Zone, "kind" | "min" | "max">): Zone {
  return { vec: [0, 0], scale: 1, round: false, skin: "", ...over };
}
function mkHole(zones: Zone[] = [], posts: Post[] = []) {
  return { board: { w: 20, h: 20 }, walls: [], zones, posts, start: [0, 0] as Vec2, cup: [10, 10] as Vec2 };
}

type RafGlobal = { window?: { requestAnimationFrame: (f: FrameRequestCallback) => number }; requestAnimationFrame?: (f: FrameRequestCallback) => number };

/** Runs fn() with requestAnimationFrame firing its callback right away, and
 *  performance.now() jumping a million ms further every call: any
 *  animation's first frame already lands past its own duration, so the whole
 *  chain of steps (and any .then() it strings together) runs to completion
 *  as fast as the microtask queue drains, no real waiting. replay() reads
 *  its own guarded copy off `window`, but the tube/splash helpers it calls
 *  out to (through, climbBack, splashDown) call the bare global instead —
 *  both need stubbing. */
async function withFakeClock<T>(fn: () => Promise<T>): Promise<T> {
  const realNow = performance.now.bind(performance);
  const g = globalThis as RafGlobal;
  const realWindow = g.window, realRaf = g.requestAnimationFrame;
  let t = 0;
  performance.now = () => (t += 1e6);
  const raf = (cb: FrameRequestCallback) => (cb(performance.now()), 0);
  g.window = { requestAnimationFrame: raf };
  g.requestAnimationFrame = raf;
  try {
    return await fn();
  } finally {
    performance.now = realNow;
    g.window = realWindow;
    g.requestAnimationFrame = realRaf;
  }
}

function makeFixture(ground: (x: number, z: number) => number = () => 0) {
  const scene = new THREE.Scene();
  const ball = Object.assign(new THREE.Object3D(), { userData: { body: new THREE.Object3D() } });
  const calls = { showAt: [] as number[], stop: 0, causesAt: 0, moodShake: 0, publish: 0 };
  const lift = (p: Vec2) => new THREE.Vector3(p[0], BALL_R + ground(p[0], p[1]), p[1]);
  const g = { s: mkHole(), round: 1, weather: null, cause: null, course: null, tick0: 0 } as unknown as GameState;
  const E = {
    g, scene, ground, lift, ball,
    cut: 0,
    stop: () => ((calls.stop += 1), 0),
    showAt: (t: number) => calls.showAt.push(t),
    zones: () => (g.s ? g.s.zones : []),
    causes: { at: () => ((calls.causesAt += 1), null) },
    mood: { shake: () => (calls.moodShake += 1) },
    publish: () => ((calls.publish += 1), true),
  };
  return { E: E as unknown as Live, g, ball, calls };
}

// -------------------------------------------------------------- landing()

void test("landing: no hole loaded, no zones, or the two points coincide", () => {
  const { E, g } = makeFixture();
  const api = makeReplay(E);
  assert.equal(api.landing([0, 0], [5, 5]), null); // no zone reaches [5,5]
  assert.equal(api.landing([0, 0], [0, 0.0001]), null); // p ~= q: never a jump
  g.s = null;
  assert.equal(api.landing([0, 0], [5, 5]), null); // no hole at all
});

void test("landing: a tunnel or a loop zone, matched by its own vec", () => {
  const { E, g } = makeFixture();
  const api = makeReplay(E);
  g.s = mkHole([mkZone({ kind: "tunnel", min: [4, 4], max: [6, 6], vec: [5, 5] })]) as unknown as GameState["s"];
  assert.equal(api.landing([0, 0], [5, 5]), "tunnel");
  g.s = mkHole([mkZone({ kind: "loop", min: [4, 4], max: [6, 6], vec: [5, 5] })]) as unknown as GameState["s"];
  assert.equal(api.landing([0, 0], [5, 5]), "loop");
});

void test("landing: a hazard matched by its vec, or by the stroke's own start", () => {
  const { E, g } = makeFixture();
  const api = makeReplay(E);
  g.s = mkHole([mkZone({ kind: "hazard", min: [4, 4], max: [6, 6], vec: [5, 5] })]) as unknown as GameState["s"];
  assert.equal(api.landing([0, 0], [5, 5]), "hazard");
  // an older realm's hazard sends the ball to the stroke's start, not its own vec
  const hz = mkZone({ kind: "hazard", min: [4, 4], max: [6, 6], vec: [99, 99] });
  g.s = mkHole([hz]) as unknown as GameState["s"];
  assert.equal(api.landing([1, 1], [5, 5], [5, 5]), "hazard");
  assert.equal(api.landing([1, 1], [5, 5]), null); // no start given: the vec no longer matches
});

void test("landing: of several zones landing at the same point, the nearest to p wins", () => {
  const { E, g } = makeFixture();
  const api = makeReplay(E);
  // both send the ball to [10, 10]; the hazard's box starts closer to p than the tunnel's
  const near = mkZone({ kind: "hazard", min: [8, 8], max: [12, 12], vec: [10, 10] });
  const far = mkZone({ kind: "tunnel", min: [9, 9], max: [9.2, 9.2], vec: [10, 10] });
  g.s = mkHole([far, near]) as unknown as GameState["s"];
  assert.equal(api.landing([0, 0], [10, 10]), "hazard");
});

// --------------------------------------------------------------- replay()

void test("replay: a plain roll ends exactly at the path's last point", async () => {
  const { E, ball, g } = makeFixture();
  const api = makeReplay(E);
  const path: Vec2[] = [[0, 0], [2, 0], [4, 3]];
  await withFakeClock(() => api.replay(path, false, "000"));
  assert.ok(Math.abs(ball.position.x - 4) < 1e-6);
  assert.ok(Math.abs(ball.position.z - 3) < 1e-6);
  assert.ok(g.replaying && g.replaying.at >= path.length - 2); // time only moves forward
});

void test("replay: a holed final step eases in and sinks the ball, scaling it down", async () => {
  const { E, ball } = makeFixture();
  const api = makeReplay(E);
  const path: Vec2[] = [[0, 0], [1, 0]];
  await withFakeClock(() => api.replay(path, true, "00"));
  assert.ok(Math.abs(ball.position.x - 1) < 1e-6);
  assert.ok(ball.scale.x < 1, "a holed ball shrinks into the cup");
});

void test("replay: a hazard step (a shaped, poly sea) splashes down and sinks", async () => {
  const { E, ball } = makeFixture();
  const api = makeReplay(E);
  const sea = mkZone({ kind: "hazard", min: [1, 1], max: [5, 5], vec: [3, 3], poly: [[1, 1], [5, 1], [5, 5], [1, 5]] });
  E.g.s = mkHole([sea]) as unknown as GameState["s"];
  const path: Vec2[] = [[0, 0], [3, 3], [3, 3]]; // the hazard sends it right back to where it fell
  await withFakeClock(() => api.replay(path, false, "000"));
  assert.equal(ball.visible, true); // back and visible once the splash finishes
});

void test("replay: a hazard step off a rectangular pond (no poly), and off a roof", async () => {
  const { E, ball } = makeFixture();
  const api = makeReplay(E);
  const pond = mkZone({ kind: "hazard", min: [1, 1], max: [5, 5], vec: [3, 3], round: true });
  E.g.s = mkHole([pond]) as unknown as GameState["s"];
  await withFakeClock(() => api.replay([[0, 0], [3, 3], [3, 3]], false, "000"));
  assert.equal(ball.visible, true);

  const roof = mkZone({ kind: "hazard", min: [1, 1], max: [5, 5], vec: [3, 3], skin: "roof" });
  E.g.s = mkHole([roof]) as unknown as GameState["s"];
  await withFakeClock(() => api.replay([[0, 0], [3, 3], [3, 3]], false, "000"));
  assert.equal(ball.visible, true);
});

void test("replay: a tunnel with no built tube still lerps straight through", async () => {
  const { E, ball, calls } = makeFixture();
  const api = makeReplay(E);
  const tunnel = mkZone({ kind: "tunnel", min: [1, 1], max: [3, 3], vec: [2, 2] });
  E.g.s = mkHole([tunnel]) as unknown as GameState["s"];
  await withFakeClock(() => api.replay([[0, 0], [2, 2], [6, 6]], false, "000"));
  assert.ok(Math.abs(ball.position.x - 6) < 1e-6);
  assert.ok(calls.showAt.length > 0);
});

void test("replay: a loop zone's tube rolls the ball back when it reverses at the mouth", async () => {
  const { E, ball } = makeFixture();
  const api = makeReplay(E);
  const loop = mkZone({ kind: "loop", min: [1.6, -0.4], max: [2.4, 0.4], vec: [2, 0], scale: 2 });
  const curve = new THREE.LineCurve3(new THREE.Vector3(2, 0, 0), new THREE.Vector3(4, 0, 0)) as unknown as TubePath;
  E.g.s = mkHole([loop]) as unknown as GameState["s"];
  E.g.course = { userData: { tubes: new Map([[loop, curve]]) } } as unknown as GameState["course"];
  // in at [0,0]->[2,0] (matches the tube's own tangent, +x), then reverses: [2,0]->[0,0]
  await withFakeClock(() => api.replay([[0, 0], [2, 0], [0, 0]], false, "000"));
  assert.ok(Math.abs(ball.position.x - 0) < 1e-6); // the path's own last point, after the climb back
});

void test("replay: a marked bounce runs the step through its corner", async () => {
  const { E, ball } = makeFixture();
  const api = makeReplay(E);
  const posts: Post[] = [{ c: [50, 50], r: 0.5, skin: "" }]; // nowhere near: a "knock", not a "boing"
  E.g.s = mkHole([], posts) as unknown as GameState["s"];
  const path: Vec2[] = [[0, 0], [2, 0], [2, 2], [4, 2]];
  const why = "-b b-"; // a bounce logged at index 1 (why[1]==="b") and index 2
  await withFakeClock(() => api.replay(path, false, "0000", why));
  assert.ok(Math.abs(ball.position.x - 4) < 1e-6);
  assert.ok(Math.abs(ball.position.z - 2) < 1e-6);
});

void test("replay: an unmarked sharp turn (an older realm) still reads as a bounce", async () => {
  const { E, ball } = makeFixture();
  const api = makeReplay(E);
  const path: Vec2[] = [[0, 0], [2, 0], [2, -2]]; // a hard right angle, no why string at all
  await withFakeClock(() => api.replay(path, false, "000"));
  assert.ok(Math.abs(ball.position.x - 2) < 1e-6);
  assert.ok(Math.abs(ball.position.z - -2) < 1e-6);
});

void test("replay: a flagged flight arcs from its crest to where it lands", async () => {
  const { E, ball } = makeFixture();
  const api = makeReplay(E);
  const path: Vec2[] = [[0, 0], [2, 0], [4, 0], [6, 0]];
  const flags = "0110"; // airborne across points 1..2
  await withFakeClock(() => api.replay(path, false, flags));
  assert.ok(Math.abs(ball.position.x - 6) < 1e-6);
});

void test("replay: rolling over sand, ice, a puddle or flowers doesn't throw", async () => {
  for (const skin of ["sand", "ice", "puddle", "flowerbed"]) {
    const { E, ball } = makeFixture();
    const api = makeReplay(E);
    const patch = mkZone({ kind: "surface", min: [-1, -1], max: [7, 1], skin });
    E.g.s = mkHole([patch]) as unknown as GameState["s"];
    await withFakeClock(() => api.replay([[0, 0], [3, 0]], false, "00"));
    assert.ok(Math.abs(ball.position.x - 3) < 1e-6);
  }
});

void test("replay: a named cause (a slope) glows and clears through fadeSlopes", async () => {
  const { E, ball, calls } = makeFixture();
  const api = makeReplay(E);
  const slope = mkZone({ kind: "slope", min: [-1, -1], max: [7, 1], vec: [1, 0] }); // pushes the same way the ball moves
  E.g.s = mkHole([slope]) as unknown as GameState["s"];
  const glowCalls: number[] = [];
  E.g.course = { userData: { slopes: new Map([[slope, { glow: (k: number) => glowCalls.push(k) }]]) } } as unknown as GameState["course"];
  await withFakeClock(() => api.replay([[0, 0], [3, 0]], false, "00", "-s"));
  assert.ok(Math.abs(ball.position.x - 3) < 1e-6);
  assert.ok(calls.causesAt > 0); // the cause was drawn
  api.fadeSlopes(0.1);
  api.fadeSlopes(10); // more than enough to fade it out entirely
  assert.ok(glowCalls.length > 0);
  assert.ok(glowCalls[glowCalls.length - 1] <= 0); // faded to nothing
  api.clearGlow(); // never throws with nothing left glowing
});

void test("replay: a wind cause over a windy zone, and a tilt when it isn't wind", () => {
  const { E, ball } = makeFixture();
  const api = makeReplay(E);
  const wind = mkZone({ kind: "slope", min: [-1, -1], max: [7, 1], skin: "wind", vec: [1, 0] });
  E.g.s = mkHole([wind]) as unknown as GameState["s"];
  return withFakeClock(() => api.replay([[0, 0], [3, 0]], false, "00", "-w")).then(() => {
    assert.ok(Math.abs(ball.position.x - 3) < 1e-6);
  });
});

void test("replay: no flags at all (an older realm) guesses the flight from the ground itself", async () => {
  // a cliff: the ground drops away hard past x=2, so fly()'s "the ground falls
  // away faster than he can fall" take-off branch fires, then it lands
  const ground = (x: number) => (x < 2 ? 0 : -5);
  const { E, ball } = makeFixture(ground);
  const api = makeReplay(E);
  // flags.length !== path.length: flightsOf never runs, every step reads the
  // ground live through fly() instead of a chain-flagged arc
  await withFakeClock(() => api.replay([[0, 0], [1, 0], [3, 0], [5, 0]], false, ""));
  assert.ok(Math.abs(ball.position.x - 5) < 1e-6);
});

void test("replay: no glow at all is a no-op, and an aborted round settles without hanging", async () => {
  const { E, g, ball } = makeFixture();
  const api = makeReplay(E);
  assert.ok(!api.fadeSlopes(1)); // nothing glowing: glowing.size (0) short-circuits the call
  api.clearGlow();
  // the round changes mid-flight: the replay ends where it is, its promise still settles
  const path: Vec2[] = [[0, 0], [2, 0], [4, 0], [6, 0], [8, 0]];
  const realNow = performance.now.bind(performance);
  const rg = globalThis as RafGlobal;
  const realWindow = rg.window, realRaf = rg.requestAnimationFrame;
  let t = 0, frame = 0;
  performance.now = () => (t += 1e6);
  const raf = (cb: FrameRequestCallback) => {
    if (++frame === 2) g.round = 2; // cut the round after the first frame fires
    return (cb(performance.now()), 0);
  };
  rg.window = { requestAnimationFrame: raf };
  rg.requestAnimationFrame = raf;
  try {
    await api.replay(path, false, "00000");
  } finally {
    performance.now = realNow;
    rg.window = realWindow;
    rg.requestAnimationFrame = realRaf;
  }
  assert.ok(ball.position.x < 8); // it never reached the end: cut short
});
