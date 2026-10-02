// The aim preview: steerAim's third-person aim (the fine zone, the spin, the power), and makeAimer's
// debounced chain previews, answer cache, abort-on-drop and give-up timer.
// The chain is a hand-rolled fake (only simulateFrom/simulateRound, the two
// methods aim.ts calls); aimAlong/aim itself run for real against a plain
// THREE.InstancedMesh, which needs no DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeAimer, steerAim } from "../lib/engine/aim.ts";
import { sight } from "../lib/scene/data.ts";
import type { Live } from "../lib/engine/types.ts";
import type { Mode, Stroke, Vec2 } from "../lib/types.ts";

// ------------------------------------------------------------ steerAim

// a desktop screen: the zone is 0.28 of its width (403 px), 50° at its edge
const VW = 1440, VH = 900, ZONE = 0.28 * VW, DEG = Math.PI / 180;

void test("steerAim: inside the zone the offset is the aim, a slingshot's way round (the hand right turns it left)", () => {
  for (const f of [0, 0.25, 0.5, 1]) {
    const a = steerAim(1, f * ZONE, 50, 1 / 60, VW, VH);
    assert.ok(Math.abs(a.dir - (1 - 50 * f * DEG)) < 1e-9, `at ${f} of the zone`);
    assert.equal(a.yaw, 1, "no spin inside it");
    assert.equal(a.spin, 0);
  }
  assert.ok(steerAim(0, -0.5 * ZONE, 50, 1, VW, VH).dir > 0, "the hand left turns it right");
});

void test("steerAim: past the zone the aim turns on that way, faster the further, without end", () => {
  const rate = (px: number) => -steerAim(0, ZONE + px, 50, 1, VW, VH).yaw / DEG; // (a second of it)
  assert.ok(rate(0.03 * VW) > 0 && rate(0.03 * VW) < rate(0.1 * VW) && rate(0.1 * VW) < rate(0.3 * VW));
  assert.ok(Math.abs(rate(0.3 * VW) - 150) < 1e-9, "at most 150°/s");
  let yaw = 0;
  for (let i = 0; i < 600; i++) yaw = steerAim(yaw, ZONE + 0.3 * VW, 50, 1 / 60, VW, VH).yaw;
  assert.ok(Math.abs(yaw / DEG + 1500) < 1e-6, "10 s held: 1500°, no clamp");
  assert.equal(steerAim(0, ZONE + 10, 50, 1, VW, VH).spin, 1, "the side held");
});

void test("steerAim: back inside the zone the spin stops, the fine aim going on from the new heading without a jump", () => {
  const out = steerAim(-2, ZONE + 1e-6, 50, 1 / 60, VW, VH), back = steerAim(out.yaw, ZONE - 1e-6, 50, 1 / 60, VW, VH);
  assert.ok(Math.abs(back.dir - out.dir) < 1e-6);
  assert.equal(back.yaw, out.yaw);
});

void test("steerAim: down is the power, as a pull's; a 45° pull to full power does not spin; at the press's height, no shot", () => {
  const full = Math.max(120, Math.min(VW, VH) * 0.24);
  const a = steerAim(0, full, full, 1, VW, VH);
  assert.equal(a.spin, 0);
  assert.equal(a.shot?.power, 10);
  assert.equal(steerAim(0, 100, 5, 1, VW, VH).shot, null, "within 6 px of its height: cancelled");
  assert.ok((steerAim(0, 0, full / 2, 1, VW, VH).shot?.power ?? 0) > 4);
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
    s: null as { walls: { a: Vec2; b: Vec2; skin: string }[]; posts: { c: Vec2; r: number; skin: string }[]; hole?: string; slot?: string } | null,
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

void test("the same aim pulled again after dropAim() shows the kept answer, not the straight line", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { E, aimer, dots, chain } = makeRig();
  E.dragging = true;
  E.shot.power = 5;
  aimer.preview();
  const straight = dots.count;
  t.mock.timers.tick(120);
  chain.pending[0].resolve(mkStroke([[0, 0], [1, 0]])); // the ball stops short of the straight line
  await settle();
  const answered = dots.count;
  assert.ok(answered < straight);
  aimer.dropAim(); // Escape
  aimer.preview(); // the very same aim again
  assert.equal(dots.count, answered); // the chain's kept dots, at once
  assert.equal(chain.pending.length, 1); // and no second request
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

void test("sight: fog cuts the dots at 7; a dark gallery at the headlamp's 7, and 4 in fog", () => {
  assert.equal(sight(false, false), 0);
  assert.equal(sight(true, false), 7);
  assert.equal(sight(false, true), 7);
  assert.equal(sight(true, true), 4);
});

void test("the mines' dark galleries (holes 2 and 15) cut the dots in any weather; other holes only in fog", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const dotsOn = async (hole: string, fog: boolean) => {
    const { E, g, aimer, dots, chain } = makeRig();
    g.s = { walls: [], posts: [], hole: hole + "/v1", slot: hole };
    g.weather = fog ? { fog: true } : null;
    E.dragging = true;
    E.shot.power = 9;
    aimer.preview();
    t.mock.timers.tick(120);
    chain.pending[0].resolve(mkStroke([[0, 0], [20, 0]]));
    await settle();
    return dots.count;
  };
  const open = await dotsOn("mines/3", false), dark = await dotsOn("mines/2", false), fogged = await dotsOn("mines/3", true);
  assert.ok(open >= 20, "a mines hole in the light: the whole path");
  assert.ok(dark < 20 && dark === fogged, "a dark gallery: as far as fog, 7 units");
  assert.equal(await dotsOn("mines/15", false), dark);
  assert.ok((await dotsOn("mines/15", true)) < dark, "a dark gallery in fog: 4 units");
  assert.equal(await dotsOn("garden/2", false), open, "another cup's hole 2: not dark");
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
