// The aim preview: thirdAim's pull-to-angle mapping, and makeAimer's
// debounced chain previews, answer cache, abort-on-drop and give-up timer.
// The chain is a hand-rolled fake (only simulateFrom/simulateRound, the two
// methods aim.ts calls); aimAlong/aim itself run for real against a plain
// THREE.InstancedMesh, which needs no DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeAimer, thirdAim } from "../lib/engine/aim.ts";
import { angDiff } from "../lib/terrain.ts";
import type { Live } from "../lib/engine/types.ts";
import type { Mode, Stroke, Vec2 } from "../lib/types.ts";

// ------------------------------------------------------------ thirdAim

void test("thirdAim holds the last angle inside the dead zone (too short a pull to read)", () => {
  assert.equal(thirdAim(0, 3, 4, 1.23), 1.23); // r = 5 < DEAD (18)
});

void test("thirdAim starts fresh, straight opposite the pull, with no previous angle", () => {
  const want = 0 + Math.atan2(-0, -20);
  assert.ok(Math.abs(thirdAim(0, 0, -20, null) - want) < 1e-9);
});

void test("thirdAim ignores a move mostly along the pull itself (a power change, not a direction one)", () => {
  const prev = 0.7;
  // dx,dy well past the dead zone; mx,my point the same way as the pull, so
  // "along" swamps "across" and the direction holds
  const a = thirdAim(0, 0, -30, prev, false, 0, -10);
  assert.equal(a, prev);
});

void test("thirdAim blends toward the pull's direction, a third as far in fine mode as coarse", () => {
  const prev = 0, dx = 30, dy = 0, mx = 0, my = 30; // mostly across the pull: direction moves
  const want = 0 + Math.atan2(-dx, dy);
  const coarse = thirdAim(0, dx, dy, prev, false, mx, my);
  const fine = thirdAim(0, dx, dy, prev, true, mx, my);
  assert.ok(Math.abs(coarse - (prev + angDiff(want, prev) * 0.6)) < 1e-9);
  assert.ok(Math.abs(fine - (prev + angDiff(want, prev) * 0.33)) < 1e-9);
});

// ------------------------------------------------------------ makeAimer fixtures

function makeDots(cap = 64) {
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 4, 3), new THREE.MeshBasicMaterial(), cap);
  dots.count = 0;
  return dots;
}

interface PendingCall {
  kind: "simulateFrom" | "simulateRound";
  args: unknown[];
  resolve: (v: Stroke) => void;
  reject: (e: unknown) => void;
}
function makeChain() {
  const pending: PendingCall[] = [];
  const call = (kind: PendingCall["kind"]) => (...args: unknown[]) => {
    const signal = args[args.length - 1] as AbortSignal | undefined;
    let resolve!: (v: Stroke) => void, reject!: (e: unknown) => void;
    const p = new Promise<Stroke>((res, rej) => ((resolve = res), (reject = rej)));
    const onAbort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    if (signal) signal.aborted ? onAbort() : signal.addEventListener("abort", onAbort, { once: true });
    pending.push({ kind, args, resolve, reject });
    return p;
  };
  return { simulateFrom: call("simulateFrom"), simulateRound: call("simulateRound"), pending };
}

function mkStroke(path: Vec2[], cause = ""): Stroke {
  return { version: 1, path, air: "-".repeat(path.length), cause, rest: path[path.length - 1], holed: false, bounces: 0 };
}

function makeRig() {
  const dots = makeDots();
  const aim = new THREE.Group() as unknown as Live["aim"];
  (aim as unknown as THREE.Group).userData.dots = dots;
  const chain = makeChain();
  const g = {
    roundMode: null as Mode | null,
    ball: { x: 0, y: 0 },
    period: 1,
    shots: [] as string[],
    id: "garden/1" as string | null,
    rest: null as Vec2 | null,
    round: 1,
    course: null as { userData: { ghosts?: (on: boolean) => void } } | null,
    weather: null as { fog?: boolean } | null,
    s: null as { walls: { a: Vec2; b: Vec2; skin: string }[]; posts: { c: Vec2; r: number; skin: string }[] } | null,
  };
  const band = { visible: false };
  const E = {
    g,
    chain,
    aim,
    band,
    ground: () => 0,
    mode: "assisted" as Mode,
    shot: { angle: 0, power: 0, deg: undefined as number | undefined },
    dragging: false,
    tickNow: () => 0,
    landing: () => null,
    zones: () => [],
    clock: 0,
  } as unknown as Live;
  const aimer = makeAimer(E);
  return { E, g, aim: aim as unknown as THREE.Group, dots, band, chain, aimer };
}

const settle = () => Promise.resolve().then(() => Promise.resolve());

// ------------------------------------------------------------ preview()

void test("preview() does nothing for a pull too soft to shoot", () => {
  const { E, aimer, aim, chain } = makeRig();
  aim.visible = false; // as dropAim() leaves it between pulls
  E.dragging = true;
  E.shot.power = 0.2; // <= 0.3
  aimer.preview();
  assert.equal(aim.visible, false);
  assert.equal(chain.pending.length, 0);
});

void test("preview() in pro mode shows no dots and never asks the chain", () => {
  const { E, g, aimer, aim, chain } = makeRig();
  E.dragging = true;
  E.shot.power = 5;
  g.roundMode = "pro";
  aimer.preview();
  assert.equal(aim.visible, false);
  assert.equal(chain.pending.length, 0);
  assert.equal(aimer.shows(), false);
});

void test("preview() draws a provisional straight line at once, then asks the chain after a quiet moment", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { E, aimer, aim, dots, chain } = makeRig();
  E.dragging = true;
  E.shot.power = 5;
  aimer.preview();
  assert.equal(aim.visible, true);
  assert.ok(dots.count > 0); // the straight line's own dots, before any answer
  assert.equal(chain.pending.length, 0); // still debouncing
  t.mock.timers.tick(120); // PREVIEW_MS
  assert.equal(chain.pending.length, 1);
  assert.equal(chain.pending[0].kind, "simulateRound"); // no rest yet: the tee, replayed whole
});

void test("repeated changes reset the debounce; only one request goes out once it settles", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { E, aimer, chain } = makeRig();
  E.dragging = true;
  E.shot.power = 5;
  aimer.preview();
  t.mock.timers.tick(60);
  E.shot.angle = 0.5; // a new aim: resets the 120ms debounce
  aimer.preview();
  t.mock.timers.tick(60);
  assert.equal(chain.pending.length, 0); // the reset debounce has not elapsed yet
  t.mock.timers.tick(60);
  assert.equal(chain.pending.length, 1);
});

void test("a change while a request is already in flight does not ask a second time", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { E, aimer, chain } = makeRig();
  E.dragging = true;
  E.shot.power = 5;
  aimer.preview();
  t.mock.timers.tick(120);
  assert.equal(chain.pending.length, 1);
  E.shot.angle = 2; // the aim moves while the chain is still thinking
  aimer.preview();
  assert.equal(chain.pending.length, 1); // the one in flight wins; no second ask
});

void test("a wall in the way shortens the provisional straight line", () => {
  const { E, g, aimer, dots } = makeRig();
  E.dragging = true;
  E.shot.power = 8;
  E.shot.angle = 0; // straight along +x
  g.s = { walls: [{ a: [1, -2], b: [1, 2], skin: "kerb" }], posts: [] };
  aimer.preview();
  const blocked = dots.count;
  g.s = { walls: [], posts: [] };
  aimer.preview();
  const free = dots.count;
  assert.ok(blocked < free, `expected the wall to cut the line short (blocked=${blocked}, free=${free})`);
});

void test("a post in the way shortens the provisional straight line", () => {
  const { E, g, aimer, dots } = makeRig();
  E.dragging = true;
  E.shot.power = 8;
  E.shot.angle = 0;
  g.s = { walls: [], posts: [{ c: [1.5, 0], r: 0.5, skin: "post" }] };
  aimer.preview();
  const blocked = dots.count;
  g.s = { walls: [], posts: [] };
  aimer.preview();
  const free = dots.count;
  assert.ok(blocked < free, `expected the post to cut the line short (blocked=${blocked}, free=${free})`);
});

// ------------------------------------------------------------ answers: cache, morph, guards

void test("the chain's answer replaces the line, morphs the dots, and is cached for this exact shot", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { E, g, aimer, dots, chain } = makeRig();
  E.dragging = true;
  E.shot.power = 5;
  E.shot.deg = 12.5; // exercise the rounded-degree branch of question(), not just angle*180/pi
  aimer.preview();
  t.mock.timers.tick(120);
  assert.equal(chain.pending.length, 1);
  const req = chain.pending[0];
  const shots = req.args[1] as string[];
  const shot = shots[shots.length - 1];
  const stroke = mkStroke([[0, 0], [2, 0], [4, 0]]);
  req.resolve(stroke);
  await settle();
  assert.ok(dots.count > 0);
  assert.equal(aimer.known(g.id!, g.shots, shot), stroke);
  assert.equal(aimer.moving(), true); // the dots bend from the straight line to the chain's path
  aimer.step(performance.now() + 1000); // well past the 120ms morph
  assert.equal(aimer.moving(), false);
  aimer.forget();
  assert.equal(aimer.known(g.id!, g.shots, shot), undefined);
});

void test("an aim already answered, revisited, is served from cache with no second request", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { E, aimer, chain } = makeRig();
  E.dragging = true;
  E.shot.power = 5;
  E.shot.angle = 0;
  aimer.preview();
  t.mock.timers.tick(120);
  chain.pending[0].resolve(mkStroke([[0, 0], [1, 0]]));
  await settle();

  E.shot.angle = 1; // a different aim: asked afresh
  aimer.preview();
  t.mock.timers.tick(120);
  assert.equal(chain.pending.length, 2);
  chain.pending[1].resolve(mkStroke([[0, 0], [1, 1]]));
  await settle();

  E.shot.angle = 0; // back to the first aim, exactly
  aimer.preview();
  assert.equal(chain.pending.length, 2); // served from the cache: no third request
});

void test("dropAim() cancels a chain request under way", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { E, aimer, aim, band, chain } = makeRig();
  E.dragging = true;
  E.shot.power = 5;
  aimer.preview();
  t.mock.timers.tick(120);
  const signal = chain.pending[0].args.at(-1) as AbortSignal;
  assert.equal(signal.aborted, false);
  aimer.dropAim();
  assert.equal(signal.aborted, true);
  assert.equal(aim.visible, false);
  assert.equal(band.visible, false);
  assert.doesNotThrow(() => aimer.dropAim()); // idempotent with nothing in flight
});

void test("ask() gives the chain 1.5s before giving up, then a changed aim can ask again", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { E, aimer, chain } = makeRig();
  E.dragging = true;
  E.shot.power = 5;
  aimer.preview();
  t.mock.timers.tick(120);
  const first = chain.pending[0];
  assert.ok(first.args.includes(1500)); // the give-up ceiling passed to the chain
  first.reject(Object.assign(new Error("timed out"), { name: "AbortError" }));
  await settle();

  E.shot.angle = 1; // the pull moved on; the latest aim is asked afresh
  aimer.preview();
  t.mock.timers.tick(120);
  assert.equal(chain.pending.length, 2);
});

void test("an answer landing after the pull is released is cached but never drawn", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { E, g, aimer, dots, chain } = makeRig();
  E.dragging = true;
  E.shot.power = 5;
  aimer.preview();
  t.mock.timers.tick(120);
  const req = chain.pending[0];
  const shots = req.args[1] as string[];
  const shot = shots[shots.length - 1];
  const beforeCount = dots.count;
  E.dragging = false; // released before the chain answers
  req.resolve(mkStroke([[0, 0], [3, 0]]));
  await settle();
  assert.equal(dots.count, beforeCount); // answer() guarded it away: never drawn
  assert.ok(aimer.known(g.id!, g.shots, shot)); // still cached for next time
});

void test("in fog the chain's dots are clipped to 7 units, even mid-segment", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { E, g, aimer, dots, chain } = makeRig();
  g.weather = { fog: true };
  E.dragging = true;
  E.shot.power = 9;
  aimer.preview();
  t.mock.timers.tick(120);
  // one long straight segment, well past the 7-unit fog radius
  chain.pending[0].resolve(mkStroke([[0, 0], [20, 0]]));
  await settle();
  assert.ok(dots.count > 0);
  // aimAlong lays dots every ~0.7 units along a path capped at 7: nowhere near 20's worth
  assert.ok(dots.count < 20);
});

void test("ghosts(on) toggles the course's timed-piece outlines only once a course is built", () => {
  const { g, aimer } = makeRig();
  assert.doesNotThrow(() => aimer.ghosts(true)); // no course yet: a no-op
  const calls: boolean[] = [];
  g.course = { userData: { ghosts: (on: boolean) => calls.push(on) } };
  aimer.ghosts(true);
  aimer.ghosts(false);
  assert.deepEqual(calls, [true, false]);
});

void test("shows() is true in assisted mode, false in pro", () => {
  const { g, aimer } = makeRig();
  assert.equal(aimer.shows(), true);
  g.roundMode = "pro";
  assert.equal(aimer.shows(), false);
});
