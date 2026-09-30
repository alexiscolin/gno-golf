// lib/engine/audit.ts: the render-vs-physics audit's hooks (?camlog), over a
// small hand-built course: a lane slab, a live bridge over it, an ink hull
// (never a surface), an instanced pair of stones, a lamp's additive glow by a
// solid rock, a hazard of the chain's and one of the stroke's.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { surfaceAudit, whatAt, glows, movers, clearance, rideClearance, draws, renderQuality, moverClip, trackOverHazard } from "../lib/engine/audit.ts";
import type { TubePath } from "../lib/scene/data.ts";
import type { Live } from "../lib/engine/types.ts";
import type { Zone } from "../lib/types.ts";

const zone = (over: Partial<Zone> & Pick<Zone, "kind" | "min" | "max">): Zone => ({ vec: [0, 0], scale: 1, round: false, skin: "", ...over });
/** A flat slab, its top at y, over [x0, x1] × [z0, z1]. */
function slab(x0: number, x1: number, z0: number, z1: number, y: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.2, z1 - z0), mat);
  m.position.set((x0 + x1) / 2, y - 0.1, (z0 + z1) / 2);
  return m;
}

function rig() {
  const course = new THREE.Group();
  // the lane: its slab, its kind on its top-level group
  const lane = new THREE.Group();
  lane.userData.kind = "green";
  lane.add(slab(0, 10, 0, 6, 0, new THREE.MeshToonMaterial({ color: 0x3a9a5a })));
  // its ink hull: the outline, never a surface
  const hullMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
  hullMat.userData.hull = true;
  lane.add(slab(0, 10, 0, 6, 0.05, hullMat));
  // a bridge over x 2..4, a live piece of the rides, named
  const rides = new THREE.Group();
  rides.name = "rides";
  const bridge = new THREE.Group();
  bridge.userData.live = true;
  bridge.add(slab(2, 4, 0, 6, 1.5, new THREE.MeshToonMaterial({ color: 0x8a5a2a })));
  rides.add(bridge);
  // two stones, instanced, at x 8.5 and 9.5 z 5.5 (their tops 0.4)
  const stones = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.4, 0.6), new THREE.MeshToonMaterial({ color: 0x777777 }), 2);
  for (const [k, x] of [8.5, 9.5].entries()) stones.setMatrixAt(k, new THREE.Matrix4().makeTranslation(x, 0.2, 5.5));
  // a lamp: its glass glowing (additive) a unit off a rock, and a solid of its own the glow ignores
  const lamp = new THREE.Group();
  lamp.name = "lamp";
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffcc66, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  glow.position.set(7, 1, 1);
  const cage = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshToonMaterial({ color: 0x222222 }));
  cage.position.set(7, 1, 1);
  lamp.add(glow, cage);
  const rock = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshToonMaterial({ color: 0x555566 }));
  rock.position.set(8, 1, 1);
  // a sign drawn over everything (no depth test)
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ depthTest: false }));
  sign.name = "sign";
  sign.position.set(-2, 3, -2);
  course.add(lane, rides, stones, lamp, rock, sign);
  course.userData.terrain = { onGreen: (x: number, z: number) => x >= 0 && x <= 10 && z >= 0 && z <= 6 };
  const lava = zone({ kind: "hazard", min: [6, 3], max: [8, 5], skin: "lava" });
  const vent = zone({ kind: "slope", min: [0, 0], max: [1, 1], skin: "vent" });
  const fall = zone({ kind: "hazard", min: [0, 0], max: [1, 2], skin: "lava fall", every: 4, on: 1 });
  const g = { course, s: { board: { w: 12, h: 6 }, zones: [lava, vent] } };
  const E = { g, ground: (x: number) => (x >= 2 && x <= 4 ? 1.5 : 0), zones: () => [lava, vent, fall], info: () => ({ render: { frame: 42 } }) } as unknown as Live;
  return { E, g, course, bridge };
}

test("surfaceAudit: each grid point's chain piece against the surfaces drawn there, top first", () => {
  const { E } = rig();
  const a = surfaceAudit(E, 1)!;
  assert.deepEqual(a.board, [12, 6]);
  const row = (x: number, z: number) => a.rows.find((r) => r[0] === x && r[1] === z)!;
  const owner = (i: number) => a.owners[i];
  // on the bridge: its deck over the lane, the deck the rides' live piece
  const deck = row(2.5, 2.5);
  assert.equal(deck[2], "lane");
  assert.equal(deck[3], 1.5, "the ball there as the replay draws it");
  assert.deepEqual([deck[4], deck[7]], [1.5, 0]);
  assert.deepEqual([owner(deck[5] as number).by, owner(deck[5] as number).live, owner(deck[5] as number).kind], ["rides", 1, "rides"]);
  assert.equal(owner(deck[8] as number).kind, "green");
  // the ink hull is never among them
  assert.ok(!a.owners.some((o) => o.side === THREE.BackSide && o.mat === "MeshBasicMaterial"));
  // the chain's lava, the stroke's timed fall, the rough off the lane
  assert.equal(row(6.5, 3.5)[2], "hazard:lava");
  assert.equal(row(0.5, 1.5)[2], "hazard:lava fall~", "a timed hazard of the stroke's, marked so");
  assert.equal(row(11.5, 0.5)[2], "rough");
  // an instanced stone: each copy where its matrix puts it
  for (const x of [8.5, 9.5]) assert.equal(row(x, 5.5)[4], 0.4, `stone at ${x}`);
  assert.equal(row(7.5, 5.5)[4], 0, "between the stones: the lane");
  assert.equal(surfaceAudit({ g: { course: null, s: null } } as unknown as Live), null);
});

test("whatAt: a ray straight down, top first: height, material, the path up to the course", () => {
  const { E, course } = rig();
  course.updateMatrixWorld(true); // (as the last frame drawn left it)
  const hits = whatAt(E, 2.5, 1.2)!;
  assert.deepEqual(hits.map((h) => h.y), [1.5, 0], "front faces up: the deck, then the lane");
  assert.match(hits[0].path, /^Mesh < Group\* < Group:rides$/);
  assert.equal(hits[0].mat, "MeshToonMaterial");
  assert.equal(hits[0].tri.length, 3);
  assert.equal(hits.filter((h) => h.color === "000000").length, 0, "the hull is left out");
  assert.equal(whatAt({ g: { course: null } } as unknown as Live, 0, 0), null);
});

test("glows: a glow's sphere against the nearest solid but its own lamp's; what is drawn over everything", () => {
  const { E } = rig();
  const { glows: list, blind } = glows(E)!;
  assert.equal(list.length, 1);
  const [g] = list;
  assert.deepEqual([g.by, g.mat, g.p, g.r, g.depthTest], ["lamp", "MeshBasicMaterial", [7, 1, 1], 0.8, true]);
  assert.equal(g.near, 0.5, "the rock's face, half a unit off (not its own cage)");
  assert.match(g.hit, /^BoxGeometry 7\.50,/);
  assert.deepEqual(blind, ["sign|MeshBasicMaterial"]);
  assert.equal(glows({ g: { course: null } } as unknown as Live), null);
});

test("movers: each live piece as drawn, its outermost live group only, hidden with a hidden parent", () => {
  const { E, bridge } = rig();
  const inner = new THREE.Group();
  inner.userData.live = true;
  bridge.add(inner); // under a live group: not a row of its own
  let m = movers(E)!;
  assert.equal(m.frame, 42);
  assert.equal(m.rows.length, 1);
  assert.deepEqual(m.rows[0].slice(0, 2), ["rides", 1]);
  assert.deepEqual(m.rows[0].slice(2, 5), [0, 0, 0]);
  bridge.position.x = 2;
  bridge.parent!.visible = false;
  m = movers(E)!;
  assert.deepEqual(m.rows[0].slice(0, 5), ["rides", 0, 2, 0, 0]);
  assert.equal(movers({ g: { course: null } } as unknown as Live), null);
});

// ---- the rides' and the pieces' checks (the same small course, a piece or two more each)

/** A box w × h × d centred at (x, y, z), in a material of colour c (a named group round it if named). */
function box(w: number, h: number, d: number, x: number, y: number, z: number, c = 0x777777, name = "") {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshToonMaterial({ color: c }));
  m.position.set(x, y, z);
  if (!name) return m;
  const g = new THREE.Group();
  g.name = name;
  g.add(m);
  return g;
}
const RAIL = 0x9aa3ad; // the rides' iron

test("clearance: a rail's points under the ground are found, not over a hazard", () => {
  const { E, course } = rig();
  course.add(box(9, 0.1, 0.1, 5, -0.5, 5.8, RAIL, "rides")); // sunk half a unit under the lane
  course.add(box(1.4, 0.1, 0.1, 7, -0.5, 4, RAIL)); // under the lava: its own ground
  const c = clearance(E)!;
  assert.equal(c.seen, 8, "every sixth vertex of each");
  assert.equal(c.under.length, 4);
  assert.ok(c.under.every((r) => r[0] === "rides" && (r[3] as number) < -0.4 && (r[4] as number) - (r[3] as number) > 0.1), "the sunk rail only, deeper than 0.1 under the ground");
  assert.equal(clearance({ g: { course: null } } as unknown as Live), null);
});

test("rideClearance: a ride's ball under a rock hidden, under a glow seen through, in the lava drowned", () => {
  const { E, course } = rig();
  const tubes = new Map<Zone, TubePath>();
  const ride = (from: number[], to: number[], skin: string, hideTill = 0) => {
    const c = new THREE.LineCurve3(new THREE.Vector3(...from), new THREE.Vector3(...to)) as unknown as TubePath & { userData: unknown };
    const at: number[] = [];
    c.userData = { ride: { ms: 1000, ease: (k: number) => k, at: (k: number, ball: THREE.Object3D) => void (at.push(k), (ball.visible = k >= hideTill)) } };
    tubes.set(zone({ kind: "tunnel", min: [0, 0], max: [1, 1], skin }), c);
    return at;
  };
  const cart = ride([6.4, 0.5, 1], [8.4, 0.5, 1], "cart ride", 0.1); // under the lamp's glow, then into the rock
  ride([6.2, 0.5, 4], [7.8, 0.5, 4], "lava fall"); // under the lava's crust
  tubes.set(zone({ kind: "tunnel", min: [0, 0], max: [1, 1], skin: "adit" }), new THREE.LineCurve3(new THREE.Vector3(), new THREE.Vector3(1, 0, 0))); // no ride: not looked at
  const crust = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true }));
  crust.position.set(7, 1, 4);
  course.add(crust);
  course.userData.tubes = tubes;
  const r = rideClearance(E)!;
  assert.equal(r.seen, 61 - 6 + 61, "the frames the ball is seen");
  const kinds = (skin: string) => new Set(r.under.filter((u) => u[0] === skin).map((u) => u[7]));
  assert.deepEqual([...kinds("cart ride")].sort(), ["HIDDEN", "THROUGH"]);
  assert.deepEqual([...kinds("lava fall")], ["DROWNED"]);
  assert.equal(cart[cart.length - 1], -1, "its pieces put back at rest");
  assert.equal(rideClearance({ g: { course: new THREE.Group() } } as unknown as Live), null, "no tubes");
});

test("draws: the course's draws by owner, and each of the rides' own", () => {
  const { E } = rig();
  const d = draws(E)!;
  assert.equal(d.by.rides, 1);
  assert.equal(d.by.lamp, 2);
  assert.ok(d.by["(world)"] >= 3);
  assert.deepEqual(d.mine, [["MeshToonMaterial", "8a5a2a", 12, "live", "G<rides<"]]);
  assert.deepEqual(draws(E, "lamp")!.mine.map((m) => m[0]).sort(), ["MeshBasicMaterial", "MeshToonMaterial"]);
  assert.equal(draws({ g: { course: null } } as unknown as Live), null);
});

test("renderQuality: a card standing by the lane, a square strip, an orphan in the air, a smeared map, a folded sheet", () => {
  const { E, course } = rig();
  const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshToonMaterial());
  card.position.set(5, 0.6, 3);
  const strip = box(3, 0.1, 0.2, 5, 0.05, 1);
  const orphan = box(0.3, 0.3, 0.3, 9, 1.5, 3.5);
  const map = new THREE.DataTexture(new Uint8Array(4 * 4 * 4), 4, 4);
  const smeared = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map }));
  smeared.position.set(1.5, 0.02, 4.5);
  // an accordion: six slopes of 60° up and down, open at its edges
  const pts: number[] = [], index: number[] = [];
  for (let k = 0; k <= 6; k++) for (const z of [2, 3]) pts.push(9 + k * 0.25, k % 2 ? 0.43 : 0, z);
  for (let k = 0; k < 6; k++) index.push(2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 1, 2 * k + 3, 2 * k + 2);
  const sheet = new THREE.BufferGeometry();
  sheet.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  sheet.setIndex(index);
  sheet.computeVertexNormals();
  const fold = new THREE.Mesh(sheet, new THREE.MeshToonMaterial({ side: THREE.DoubleSide }));
  course.add(card, strip, orphan, smeared, fold);
  const found = renderQuality(E)!;
  const has = (k: string, x: number) => found.some((f) => f[0] === k && Math.abs((f[2] as number) - x) < 0.3);
  assert.ok(has("CARD", 5), "the card");
  assert.ok(has("SQUARE", 5), "the strip");
  assert.ok(has("ORPHAN", 9), "the orphan");
  assert.ok(found.some((f) => f[0] === "TEXEL" && /texels/.test(String(f[5]))), "the smeared map");
  assert.ok(has("FOLD", 9.75), "the folded sheet");
  assert.ok(!found.some((f) => f[1] === "rides"), "the bridge is none of them");
  assert.equal(renderQuality({ g: { course: null, s: null } } as unknown as Live), null);
});

test("moverClip: a mover's vertices inside another piece, swept along its travel when it is a cart", () => {
  const { E, course } = rig();
  const crag = box(1, 2, 1, 8, 3.5, 5); // a solid block over the lane, clear of it
  const cart = new THREE.Group();
  cart.name = "cart";
  cart.userData.live = true;
  cart.add(box(0.4, 0.4, 0.4, 8, 3.5, 5, 0x3b3048));
  course.add(crag, cart);
  const clip = moverClip(E)!;
  assert.ok(clip.length > 0 && clip.every((r) => r[0] === "cart" && r[1] === "(world)"));
  assert.ok((clip[0][5] as number) > 0.06, "its depth in the block");
  const swept = moverClip(E, 0.06, true)!;
  assert.ok(swept.some((r) => r[0] === "cart (swept)"), "carried along its axis, into the block from a way off");
  cart.position.y = 5; // lifted clear
  assert.equal(moverClip(E)!.filter((r) => r[0] === "cart").length, 0);
  assert.equal(moverClip({ g: { course: null } } as unknown as Live), null);
});

test("trackOverHazard: a rail over the lava with nothing under it, and one on a trestle", () => {
  const { E, course } = rig();
  course.add(box(1.4, 0.1, 0.1, 7, 1.6, 3.5, RAIL, "loose"));
  course.add(box(1.4, 0.1, 0.1, 7, 1.6, 4.5, RAIL, "held"), box(1.6, 0.1, 0.4, 7, 1.3, 4.5)); // its trestle's cap 0.3 under
  const over = trackOverHazard(E)!;
  assert.ok(over.length > 0 && over.every((r) => r[0] === "loose" && r[4] === "lava"));
  assert.equal(trackOverHazard({ g: { course: null, s: null } } as unknown as Live), null);
});
