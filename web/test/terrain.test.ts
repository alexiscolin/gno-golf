// Pure geometry unit tests for lib/terrain.ts. No DOM, no three.js: every
// export here is plain math over small hand-built HoleState-shaped fixtures.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mod, there, onAt, smoothstep, angDiff, closest, boxOf, nearestOnPoly, segDist, wallDist,
  segHit, rayCircle, inPoly, inset, inZone, inSea, sandIn, airy, terrain, CELL,
} from "../lib/terrain.ts";
import type { HoleState, Vec2, Wall, Zone } from "../lib/types.ts";

type Fixture = Pick<HoleState, "board" | "walls" | "zones" | "start" | "cup">;

function mkZone(over: Partial<Zone> & Pick<Zone, "kind" | "min" | "max">): Zone {
  return { vec: [0, 0], scale: 1, round: false, skin: "", ...over };
}
function mkWall(a: Vec2, b: Vec2, skin = "rail", over: Partial<Wall> = {}): Wall {
  return { a, b, skin, ...over };
}
function mkHole(over: Partial<Fixture> = {}): Fixture {
  return { board: { w: 10, h: 8 }, walls: [], zones: [], start: [0.5, 0.5], cup: [9.5, 7.5], ...over };
}

// ------------------------------------------------------------- small sums

void test("mod is never negative", () => {
  assert.equal(mod(-1, 4), 3);
  assert.equal(mod(-5, 3), 1);
  assert.equal(mod(5, 4), 1);
  assert.equal(mod(0, 4), 0);
});

void test("there: untimed (every 0) is always on; timed follows on/every/phase", () => {
  assert.equal(there(0), true);
  assert.equal(there(99, 0, 0, 0), true);
  // every 4, on 2: on for i%4 in {0,1}
  assert.equal(there(0, 4, 2), true);
  assert.equal(there(1, 4, 2), true);
  assert.equal(there(2, 4, 2), false);
  assert.equal(there(3, 4, 2), false);
  assert.equal(there(4, 4, 2), true);
  // a phase shift moves the window
  assert.equal(there(2, 4, 2, 2), true);
  assert.equal(there(0, 4, 2, 2), false);
});

void test("onAt reads a Timing object the same way", () => {
  assert.equal(onAt({ every: 4, on: 2 }, 0), true);
  assert.equal(onAt({ every: 4, on: 2 }, 2), false);
  assert.equal(onAt({}, 123), true); // no every: always on
});

void test("smoothstep: 0 below 0, 1 above 1, an S between", () => {
  assert.equal(smoothstep(-1), 0);
  assert.equal(smoothstep(0), 0);
  assert.equal(smoothstep(1), 1);
  assert.equal(smoothstep(2), 1);
  assert.equal(smoothstep(0.5), 0.5);
  assert.ok(smoothstep(0.25) < 0.5); // ease-in
  assert.ok(smoothstep(0.75) > 0.5); // ease-out
});

void test("angDiff wraps into (-pi, pi] and undoes itself", () => {
  const TWO_PI = Math.PI * 2;
  for (const [a, b] of [[0, Math.PI / 2], [Math.PI / 2, 0], [3, -3], [0.1, 6.2], [-1, 1]] as const) {
    const d = angDiff(a, b);
    assert.ok(d > -Math.PI - 1e-9 && d <= Math.PI + 1e-9, `angDiff(${a},${b})=${d} out of range`);
    // b + d lands back on a, modulo a full turn
    const back = mod(b + d, TWO_PI), want = mod(a, TWO_PI);
    assert.ok(Math.min(Math.abs(back - want), TWO_PI - Math.abs(back - want)) < 1e-9);
  }
  assert.ok(Math.abs(angDiff(1, 1)) < 1e-12);
});

void test("closest: the nearest point of a segment, clamped to its ends", () => {
  const a: Vec2 = [0, 0], b: Vec2 = [10, 0];
  const mid = closest(5, 3, a, b);
  assert.equal(mid.x, 5);
  assert.equal(mid.z, 0);
  assert.equal(mid.u, 0.5);
  assert.equal(mid.d, 3);
  const before = closest(-4, 1, a, b); // off the a-end: clamps to a
  assert.equal(before.u, 0);
  assert.equal(before.x, 0);
  assert.equal(before.d, Math.hypot(4, 1));
  const after = closest(14, 2, a, b); // off the b-end: clamps to b
  assert.equal(after.u, 1);
  assert.equal(after.x, 10);
  // a degenerate segment (a === b): the point itself, no division by zero
  const deg = closest(3, 4, [1, 1], [1, 1]);
  assert.equal(deg.u, 0);
  assert.equal(deg.d, Math.hypot(2, 3));
});

void test("boxOf: a zone's centre and half-sizes", () => {
  const b = boxOf({ min: [2, 4], max: [6, 10] });
  assert.deepEqual([b.cx, b.cz, b.hx, b.hz, b.w, b.h], [4, 7, 2, 3, 4, 6]);
});

void test("nearestOnPoly: the closest point on a polygon's outline", () => {
  const square: Vec2[] = [[0, 0], [4, 0], [4, 4], [0, 4]];
  // straight out from the middle of the bottom edge
  assert.deepEqual(nearestOnPoly(2, -3, square), [2, 0]);
  // from inside, still snaps to the nearest edge (the outline, not the interior)
  const inside = nearestOnPoly(0.5, 2, square);
  assert.deepEqual(inside, [0, 2]);
  // exactly at a corner
  assert.deepEqual(nearestOnPoly(-1, -1, square), [0, 0]);
});

void test("segDist matches closest().d, and wallDist takes the nearest wall", () => {
  const a: Vec2 = [0, 0], b: Vec2 = [10, 0];
  assert.equal(segDist(5, 3, a, b), 3);
  assert.equal(wallDist(5, 5, []), Infinity);
  const walls = [mkWall([0, 0], [10, 0]), mkWall([0, 10], [10, 10])];
  assert.equal(wallDist(5, 1, walls), 1); // the near one
  assert.equal(wallDist(5, 9, walls), 1); // the far one is now nearer
});

void test("segHit: where o->c crosses a->b, as a fraction of o->c", () => {
  // a vertical ray through a horizontal segment, each crossing at its midpoint
  const t = segHit(0, 0, 0, 10, [-5, 5], [5, 5]);
  assert.equal(t, 0.5);
  // parallel lines never cross
  assert.equal(segHit(0, 0, 10, 0, [0, 1], [10, 1]), -1);
  // the target segment lies entirely behind the ray's origin
  assert.equal(segHit(0, 0, 0, 10, [-5, -5], [5, -5]), -1);
  // the crossing point is off the far end of a->b (u out of [0, 1])
  assert.equal(segHit(0, 0, 0, 10, [20, 5], [30, 5]), -1);
});

void test("rayCircle: where o->c first enters a circle", () => {
  const t = rayCircle(0, 0, 10, 0, [5, 0], 1);
  assert.ok(Math.abs(t - 0.4) < 1e-9); // enters at x=4, 40% along a length-10 ray
  assert.equal(rayCircle(0, 0, 10, 0, [5, 5], 1), -1); // the ray passes well clear
  assert.equal(rayCircle(0, 0, 0, 0, [5, 0], 1), -1); // a zero-length ray (A === 0)
});

void test("inPoly: even-odd membership of a simple square", () => {
  const square: Vec2[] = [[0, 0], [4, 0], [4, 4], [0, 4]];
  assert.equal(inPoly(2, 2, square), true);
  assert.equal(inPoly(-1, 2, square), false);
  assert.equal(inPoly(5, 5, square), false);
});

void test("inZone: a rectangle is half-open [min, max)", () => {
  const q = { min: [0, 0] as Vec2, max: [4, 4] as Vec2, round: false };
  assert.equal(inZone(q, 0, 0), true); // min included
  assert.equal(inZone(q, 4, 0), false); // max excluded
  assert.equal(inZone(q, 3.999, 3.999), true);
  assert.equal(inZone(q, -0.1, 2), false);
});

void test("inZone: round is the ellipse inscribed in the box", () => {
  const q = { min: [0, 0] as Vec2, max: [4, 4] as Vec2, round: true };
  assert.equal(inZone(q, 2, 2), true); // centre
  assert.equal(inZone(q, 3.9, 3.9), false); // corner of the box, outside the ellipse
  assert.equal(inZone(q, 2, 3.9), true); // near an edge, on-axis: still inside
});

void test("inZone: a poly zone, and its outside flip", () => {
  const tri: Vec2[] = [[0, 0], [4, 0], [0, 4]];
  const q = { min: [0, 0] as Vec2, max: [4, 4] as Vec2, round: false, poly: tri };
  assert.equal(inZone(q, 1, 1), true);
  assert.equal(inZone(q, 3, 3), false); // inside the box, outside the triangle
  const flipped = { ...q, outside: true };
  assert.equal(inZone(flipped, 1, 1), false);
  assert.equal(inZone(flipped, 3, 3), true); // still has to be inside the rectangle
  assert.equal(inZone(flipped, 5, 5), false);
});

void test("inset: distance in from a zone's own edge, 0 outside", () => {
  const q = { min: [0, 0] as Vec2, max: [4, 4] as Vec2, round: false };
  assert.equal(inset(q, 2, 2), 2); // dead centre of a 4x4 box
  assert.ok(Math.abs(inset(q, 0.5, 2) - 0.5) < 1e-9);
  assert.equal(inset(q, 10, 10), 0); // outside the zone entirely
  const round = { ...q, round: true };
  assert.ok(Math.abs(inset(round, 2, 2) - 2) < 1e-9);
  assert.ok(Math.abs(inset(round, 3.9, 2) - 0.1) < 1e-6);
});

void test("sandIn: negative outside the zone, largest away from every edge", () => {
  const q = { min: [0, 0] as Vec2, max: [10, 10] as Vec2, round: false };
  assert.equal(sandIn(q, [], 20, 20), -1);
  const centre = sandIn(q, [], 5, 5);
  const nearEdge = sandIn(q, [], 0.3, 5);
  assert.ok(centre > nearEdge, `centre ${centre} should read further in than the edge ${nearEdge}`);
});

void test("inSea: a plain wall wholly outside the hazard's own (land) polygon", () => {
  // the sea is the bounding box minus an inner "land" shape (outside: true)
  const land: Vec2[] = [[8, 8], [12, 8], [12, 12], [8, 12]];
  const sea = mkZone({ kind: "hazard", min: [0, 0], max: [20, 20], poly: land, outside: true });
  assert.equal(inSea(mkWall([1, 1], [2, 2], ""), [sea]), true);
  // a skinned wall (a rail) is drawn, never folded into the sea
  assert.equal(inSea(mkWall([1, 1], [2, 2], "rail"), [sea]), false);
  // no sea zone at all
  assert.equal(inSea(mkWall([1, 1], [2, 2], ""), []), false);
  // partly outside the sea polygon
  assert.equal(inSea(mkWall([1, 1], [25, 25], ""), [sea]), false);
});

void test("airy: a slope's own air flag wins; else guessed from skin or a clock", () => {
  const base = mkZone({ kind: "slope", min: [0, 0], max: [1, 1] });
  assert.equal(airy(base), false);
  assert.equal(airy({ ...base, air: true }), true);
  assert.equal(airy({ ...base, air: false, skin: "wind" }), false); // the explicit flag wins
  assert.equal(airy(mkZone({ kind: "slope", min: [0, 0], max: [1, 1], skin: "wind" })), true);
  assert.equal(airy(mkZone({ kind: "slope", min: [0, 0], max: [1, 1], skin: "gust" })), true);
  assert.equal(airy(mkZone({ kind: "slope", min: [0, 0], max: [1, 1], every: 4 })), true);
  assert.equal(airy(mkZone({ kind: "surface", min: [0, 0], max: [1, 1] })), false); // not a slope at all
});

// --------------------------------------------------------------- terrain()

void test("terrain: an open board is all green, height and ground flat", () => {
  const t = terrain(mkHole());
  assert.equal(t.onGreen(0.5, 0.5), true);
  assert.equal(t.onGreen(9.5, 7.5), true);
  assert.equal(t.height(3, 3), 0);
  assert.equal(t.ground(3, 3), 0);
  assert.equal(t.zoneAt(3, 3), null);
  assert.equal(t.pond(3, 3), null);
  assert.deepEqual(t.domes, []);
  assert.equal(t.nx, Math.round(10 / CELL));
  assert.equal(t.nz, Math.round(8 / CELL));
});

void test("terrain: walls fence off ground a ball never reaches into rough", () => {
  // a closed 2x2 box with nothing seeded inside it (start and cup are elsewhere)
  const walls = [
    mkWall([2, 2], [4, 2]), mkWall([4, 2], [4, 4]), mkWall([4, 4], [2, 4]), mkWall([2, 4], [2, 2]),
  ];
  const t = terrain(mkHole({ walls, start: [0.5, 0.5], cup: [9.5, 7.5] }));
  assert.equal(t.onGreen(0.5, 0.5), true);
  assert.equal(t.onGreen(9.5, 7.5), true);
  assert.equal(t.onGreen(3, 3), false); // the pocket inside the box
  const i = Math.floor(3 / CELL), j = Math.floor(3 / CELL);
  const inRough = t.rough.some((comp) => comp.some(([ci, cj]) => ci === i && cj === j));
  assert.equal(inRough, true);
});

void test("terrain: a tunnel's own destination is seeded, reachable with no path to it", () => {
  const walls = [
    mkWall([2, 2], [4, 2]), mkWall([4, 2], [4, 4]), mkWall([4, 4], [2, 4]), mkWall([2, 4], [2, 2]),
  ];
  const tunnel = mkZone({ kind: "tunnel", min: [2.9, 2.9], max: [3.1, 3.1], vec: [3, 3] });
  const t = terrain(mkHole({ walls, zones: [tunnel], start: [0.5, 0.5], cup: [9.5, 7.5] }));
  assert.equal(t.onGreen(3, 3), true); // seeded via the tunnel's vec, despite the walls around it
});

void test("terrain: a slope zone ramps up toward its uphill side", () => {
  const slope = mkZone({ kind: "slope", min: [2, 2], max: [6, 4], vec: [1, 0] }); // pushes +x: uphill is -x
  const t = terrain(mkHole({ zones: [slope] }));
  const top = t.height(2.2, 3), bottom = t.height(5.8, 3), away = t.height(0.5, 7.5);
  assert.ok(top > bottom, `top ${top} should be higher than bottom ${bottom}`);
  assert.ok(bottom >= 0);
  assert.equal(away, 0); // untouched ground, well clear of the cup's landing too
});

void test("terrain: a mound draws one round dome over four slopes", () => {
  const mound = mkZone({ kind: "slope", min: [1, 1], max: [3, 3], vec: [0.5, 0.5], skin: "mound" });
  const t = terrain(mkHole({ zones: [mound], start: [8, 0.5], cup: [9.5, 7.5] }));
  assert.equal(t.domes.length, 1);
  assert.ok(Math.abs(t.domes[0].h - 1.1) < 1e-9); // 0.35 + push*2 caps at 1.1
  assert.ok(Math.abs(t.height(2, 2) - 1.1) < 1e-9); // dead centre: the dome's own peak
  assert.equal(t.height(9, 0.5), 0); // far away, untouched
});

void test("terrain: a volcano cone climbs toward its flat top", () => {
  const volcano = mkZone({ kind: "slope", min: [1, 1], max: [3, 3], vec: [1, 0], skin: "volcano" });
  const t = terrain(mkHole({ zones: [volcano], start: [8, 0.5], cup: [9.5, 7.5] }));
  const h = t.height(2, 2);
  assert.ok(Math.abs(h - 0.8) < 1e-9); // 1.6 (MAX_RISE) * 0.5 (x rise1) * 1 (z rise1)
  assert.equal(t.height(9, 0.5), 0);
});

void test("terrain: a sand dish sinks toward its middle", () => {
  const sand = mkZone({ kind: "surface", min: [0, 0], max: [10, 8], skin: "sand" });
  const t = terrain(mkHole({ zones: [sand], start: [8, 0.5], cup: [9.5, 7.5] }));
  const centre = t.height(3, 3); // well clear of the cup's own landing
  assert.ok(centre < -0.15, `sand centre should sink, got ${centre}`);
});

void test("terrain: a pond drowns its middle, dry ground round it", () => {
  const pond = mkZone({ kind: "hazard", min: [0, 0], max: [4, 4], skin: "water" });
  const t = terrain(mkHole({ zones: [pond], start: [8, 0.5], cup: [9.5, 7.5] }));
  assert.equal(t.zoneAt(2, 2), pond);
  const at = t.pond(2, 2);
  assert.ok(at && at.k > 0.9, `pond centre should be almost fully water, got ${JSON.stringify(at)}`);
  assert.equal(t.pond(8, 0.5), null);
  assert.equal(t.zoneAt(8, 0.5), null);
  // the ground actually drops toward the bed at the middle of the pond
  assert.ok(t.ground(2, 2) < t.height(2, 2));
});

void test("terrain: a bridge crosses a pond without the flood or the pond throwing", () => {
  const pond = mkZone({ kind: "hazard", min: [0, 0], max: [4, 2], skin: "water" });
  const bridge = mkZone({ kind: "surface", min: [1, 0], max: [2, 2], skin: "bridge" });
  const t = terrain(mkHole({ zones: [pond, bridge], start: [8, 0.5], cup: [9.5, 7.5] }));
  const under = t.pond(1.5, 1); // under the bridge deck
  assert.ok(under === null || typeof under.k === "number");
  const wet = t.pond(3, 1); // away from the bridge, plainly in the pond
  assert.ok(wet && wet.k > 0);
});
