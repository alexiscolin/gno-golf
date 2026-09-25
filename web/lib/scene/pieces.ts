// The pieces on the lane that the chain names by skin: posts (a palm, a buoy,
// a lamp...), bars (a tram, a stall...) and tunnel ends (a cave, a well...).
// Every one stands exactly on its physics footprint: a post's circle is the
// widest part the ball can touch; a bar fills its rectangle. What is above
// the ball (fronds, awnings, roofs) may reach further. The island and town
// draw some of these skins their own way (their piece()): the ones here are
// then the fallbacks, on purpose, for a hole of another world that uses that
// skin (a skin is a free string: a community hole may).
import * as THREE from "three";
import { C, flat, drawn, rbox, texOf, share } from "./materials";
import { house, smoke } from "./props";
import { inZone } from "../terrain";
import { ud, type Hole, type Height } from "./data";
import type { Post, Vec2, Zone } from "../types";

/** A post as a drawing takes it: its centre and radius. */
type PostLike = Pick<Post, "c" | "r">;
/** A post's drawing: (p, y) with y the ground there. */
type PostFn = (p: PostLike, y: number) => THREE.Object3D;
/** A bar's drawing: (centre, length, thickness, angle, height). */
type BarFn = (c: Vec2, L: number, th: number, ang: number, height: Height) => THREE.Object3D;

const P = {
  palmTrunk: 0xa47a4c, frond: 0x3f9b62, frondDark: 0x2f7d4f, coconut: 0x6b4a2f,
  coral: 0xf08a7e, coralHi: 0xf7b3a3, sandstone: 0xd6b27c, buoyRed: 0xe0524b,
  drift: 0xb9aa94, driftDark: 0x8f8373, brick: 0xb8573f, brickDark: 0x8c3f2e,
  iron: 0x3a4a52, tram: 0x5b9ad4, tramDark: 0x3d74a8, glass: 0xcfe9f2,
  stripeA: 0xe0524b, stripeB: 0xfdf6e9, crab: 0xe2553e, gold: 0xe7b84a,
};

/** Stripes on a canvas: for awnings, buoys and stall covers. */
const stripeTex = new Map<string, THREE.CanvasTexture>();
function stripes(a: number, b: number, n = 6, vertical = true) {
  const key = `${a}-${b}-${n}-${vertical}`;
  const had = stripeTex.get(key);
  if (had) return had;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  for (let k = 0; k < n; k++) {
    x.fillStyle = "#" + new THREE.Color(k % 2 ? b : a).getHexString();
    if (vertical) x.fillRect((k * 64) / n, 0, 64 / n + 1, 64);
    else x.fillRect(0, (k * 64) / n, 64, 64 / n + 1);
  }
  const t = texOf(c);
  stripeTex.set(key, share(t));
  return t;
}

// ------------------------------------------------------------------ posts
// Each takes (p, y): p.c the centre, p.r the radius; y the ground there.

function palm(p: PostLike, y: number) {
  const g = new THREE.Group();
  const H = 4.2 + (p.c[0] * 7 + p.c[1] * 3) % 1.2;
  // a trunk in rings, leaning a little, as wide as the post at its foot
  const n = 7, lean = 0.5;
  for (let k = 0; k < n; k++) {
    const f = k / n, r0 = p.r * (1 - f * 0.45), r1 = p.r * (1 - (f + 1 / n) * 0.45);
    const seg = drawn(new THREE.CylinderGeometry(r1, r0, H / n + 0.02, 10), flat(k % 2 ? P.palmTrunk : 0x8f6a42));
    seg.position.set(p.c[0] + lean * f * f, y + (H / n) * (k + 0.5), p.c[1]);
    g.add(seg);
  }
  const top = new THREE.Vector3(p.c[0] + lean, y + H, p.c[1]);
  // fronds: long drooping leaves, all well above the ball
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const leaf = drawn(new THREE.SphereGeometry(1, 10, 6), flat(k % 2 ? P.frond : P.frondDark));
    leaf.scale.set(1.9, 0.12, 0.45);
    leaf.position.copy(top).add(new THREE.Vector3(Math.cos(a) * 1.5, -0.35, Math.sin(a) * 1.5));
    leaf.rotation.set(0, -a, -0.35);
    g.add(leaf);
  }
  for (let k = 0; k < 3; k++) {
    const nut = drawn(new THREE.SphereGeometry(0.2, 8, 6), flat(P.coconut));
    nut.position.copy(top).add(new THREE.Vector3(Math.cos(k * 2.1) * 0.3, -0.3, Math.sin(k * 2.1) * 0.3));
    g.add(nut);
  }
  return g;
}

function coral(p: PostLike, y: number) {
  const g = new THREE.Group();
  const base = drawn(new THREE.CylinderGeometry(p.r * 0.8, p.r, 0.5, 12), flat(P.coral));
  base.position.set(p.c[0], y + 0.25, p.c[1]);
  g.add(base);
  // branches rising and forking, inside the circle
  for (let k = 0; k < 5; k++) {
    const a = k * 1.26, h = 0.9 + (k % 3) * 0.35;
    const br = drawn(new THREE.CapsuleGeometry(0.13, h, 3, 6), flat(k % 2 ? P.coral : P.coralHi));
    br.position.set(p.c[0] + Math.cos(a) * p.r * 0.45, y + 0.5 + h / 2, p.c[1] + Math.sin(a) * p.r * 0.45);
    br.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    g.add(br);
  }
  return g;
}

/** A boulder filling the circle exactly; `color` for sandstone outcrops. */
function boulder(p: PostLike, y: number, color: number = C.stone, flatten = 0.8) {
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const a = geo.attributes.position;
  let far = 0;
  for (let i = 0; i < a.count; i++) far = Math.max(far, Math.hypot(a.getX(i), a.getZ(i)));
  geo.scale(p.r / far, (p.r * flatten) / far, p.r / far);
  const m = drawn(geo, flat(color));
  m.position.set(p.c[0], y + p.r * flatten * 0.7, p.c[1]);
  m.rotation.y = p.c[0] * 1.7;
  return m;
}

function buoy(p: PostLike, y: number) {
  const g = new THREE.Group();
  const body = drawn(new THREE.SphereGeometry(p.r, 16, 12), flat(0xffffff, { map: stripes(P.buoyRed, P.stripeB, 4, false) }));
  body.position.set(p.c[0], y + p.r * 0.8, p.c[1]);
  const mast = drawn(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), flat(P.iron));
  mast.position.set(p.c[0], y + p.r * 1.6 + 0.5, p.c[1]);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.3), flat(P.gold, { side: THREE.DoubleSide }));
  flag.position.set(p.c[0] + 0.24, y + p.r * 1.6 + 0.9, p.c[1]);
  g.add(body, mast, flag);
  return g;
}

function crab(p: PostLike, y: number) {
  const g = new THREE.Group();
  const [x, z] = p.c;
  const shell = drawn(new THREE.SphereGeometry(p.r * 0.85, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), flat(P.crab));
  shell.scale.set(1, 0.6, 0.8);
  shell.position.set(x, y + 0.05, z);
  g.add(shell);
  for (const side of [-1, 1]) {
    // claws out to the circle's edge, eyes on stalks
    const claw = drawn(new THREE.SphereGeometry(p.r * 0.28, 10, 8), flat(P.crab));
    claw.scale.set(1, 0.7, 0.6);
    claw.position.set(x + side * p.r * 0.72, y + 0.2, z + p.r * 0.3);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 5), flat(P.crab));
    stalk.position.set(x + side * 0.18, y + p.r * 0.5 + 0.1, z + p.r * 0.35);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), flat(0xffffff));
    eye.position.set(x + side * 0.18, y + p.r * 0.5 + 0.28, z + p.r * 0.35);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), flat(C.ink));
    pupil.position.set(x + side * 0.18, y + p.r * 0.5 + 0.29, z + p.r * 0.35 + 0.06);
    g.add(claw, stalk, eye, pupil);
  }
  return g;
}

/** An upright weathered log (a driftwood post). */
function driftPost(p: PostLike, y: number) {
  const m = drawn(new THREE.CylinderGeometry(p.r * 0.85, p.r, 0.9, 9), flat(P.drift));
  m.position.set(p.c[0], y + 0.45, p.c[1]);
  m.rotation.z = 0.08;
  return m;
}

function lamp(p: PostLike, y: number) {
  const g = new THREE.Group();
  const foot = drawn(new THREE.CylinderGeometry(p.r * 0.8, p.r, 0.4, 10), flat(P.iron));
  foot.position.set(p.c[0], y + 0.2, p.c[1]);
  const pole = drawn(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 8), flat(P.iron));
  pole.position.set(p.c[0], y + 1.6, p.c[1]);
  const lantern = drawn(rbox(0.45, 0.55, 0.45, 0.1), flat(P.gold));
  lantern.position.set(p.c[0], y + 3.1, p.c[1]);
  const hat = drawn(new THREE.ConeGeometry(0.4, 0.35, 8), flat(P.iron));
  hat.position.set(p.c[0], y + 3.55, p.c[1]);
  g.add(foot, pole, lantern, hat);
  return g;
}

/** A mushroom house standing in the lane: its wall is the post's circle. */
function mushHouse(p: PostLike, y: number) {
  const m = house([C.cap, 0xf2a93b, 0x9b7fd1][Math.round(p.c[0]) % 3]);
  m.scale.setScalar(p.r / 1.2); // the house's body is 1.2 wide at its foot
  m.position.set(p.c[0], y, p.c[1]);
  m.rotation.y = Math.PI; // its door faces the tee side (towards -z is away)
  return m;
}

function clock(p: PostLike, y: number) {
  const g = new THREE.Group();
  const tower = drawn(new THREE.CylinderGeometry(p.r * 0.9, p.r, 3.2, 12), flat(C.cream));
  tower.position.set(p.c[0], y + 1.6, p.c[1]);
  const roof = drawn(new THREE.ConeGeometry(p.r * 1.2, 1.2, 12), flat(C.cap));
  roof.position.set(p.c[0], y + 3.8, p.c[1]);
  const face = drawn(new THREE.CircleGeometry(p.r * 0.6, 20), flat(0xffffff));
  face.position.set(p.c[0], y + 2.6, p.c[1] + p.r * 0.92);
  const hand = new THREE.Mesh(new THREE.PlaneGeometry(0.06, p.r * 0.5), flat(C.ink));
  hand.position.set(p.c[0], y + 2.6 + p.r * 0.2, p.c[1] + p.r * 0.93);
  g.add(tower, roof, face, hand);
  return g;
}

function gnomeStatue(p: PostLike, y: number) {
  const g = new THREE.Group();
  const stone = flat(0xb9c2bd);
  const plinth = drawn(new THREE.CylinderGeometry(p.r * 0.9, p.r, 0.5, 12), stone);
  plinth.position.set(p.c[0], y + 0.25, p.c[1]);
  const body = drawn(new THREE.CylinderGeometry(p.r * 0.45, p.r * 0.65, 0.9, 12), stone);
  body.position.set(p.c[0], y + 0.95, p.c[1]);
  const head = drawn(new THREE.SphereGeometry(p.r * 0.4, 12, 10), stone);
  head.position.set(p.c[0], y + 1.6, p.c[1]);
  const beard = drawn(new THREE.ConeGeometry(p.r * 0.35, 0.5, 10), stone);
  beard.rotation.x = Math.PI;
  beard.position.set(p.c[0], y + 1.35, p.c[1] + p.r * 0.25);
  const hat = drawn(new THREE.ConeGeometry(p.r * 0.45, 0.9, 12), stone);
  hat.position.set(p.c[0], y + 2.2, p.c[1]);
  g.add(plinth, body, head, beard, hat);
  return g;
}

/** A roundabout: a round raised bed of stone with a tree and flowers. */
function roundabout(p: PostLike, y: number) {
  const g = new THREE.Group();
  const ring = drawn(new THREE.CylinderGeometry(p.r, p.r, 0.5, 32), flat(0xb9c2bd));
  ring.position.set(p.c[0], y + 0.25, p.c[1]);
  const bed = drawn(new THREE.CylinderGeometry(p.r - 0.3, p.r - 0.3, 0.1, 32), flat(C.leaf));
  bed.position.set(p.c[0], y + 0.52, p.c[1]);
  const trunk = drawn(new THREE.CylinderGeometry(0.2, 0.28, 2, 8), flat(C.bark));
  trunk.position.set(p.c[0], y + 1.5, p.c[1]);
  const crown = drawn(new THREE.IcosahedronGeometry(1.4, 1), flat(C.leafDark));
  crown.position.set(p.c[0], y + 3.1, p.c[1]);
  g.add(ring, bed, trunk, crown);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2, fl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 4), flat([C.petal, C.sun, 0x9b7fd1][k % 3]));
    fl.position.set(p.c[0] + Math.cos(a) * (p.r - 0.8), y + 0.65, p.c[1] + Math.sin(a) * (p.r - 0.8));
    g.add(fl);
  }
  return g;
}

function chimney(p: PostLike, y: number) {
  const g = new THREE.Group();
  const stack = drawn(rbox(p.r * 1.4, 2.2, p.r * 1.4, 0.06), flat(P.brick));
  stack.position.set(p.c[0], y + 1.1, p.c[1]);
  const lip = drawn(rbox(p.r * 1.6, 0.25, p.r * 1.6, 0.05), flat(P.brickDark));
  lip.position.set(p.c[0], y + 2.3, p.c[1]);
  g.add(stack, lip);
  return g;
}

/**
 * A big sandcastle, moulded from a bucket: a tapered keep with wet-sand
 * bands, a crenellated top, four turrets and a keep tower with a flag. Every
 * part is inside the post's circle (the chain's footprint), so the ball meets
 * the castle exactly where it is drawn.
 */
const SAND = 0xe9cf97, WET = 0xc9a66a, SAND_HI = 0xf3dfae;
function sandcastle(p: PostLike, y: number) {
  const g = new THREE.Group();
  const [x, z] = p.c, R = p.r;
  const put = <T extends THREE.Object3D>(m: T, px: number, py: number, pz: number) => (m.position.set(x + px, y + py, z + pz), g.add(m), m);
  // the keep: a bucket shape (wider at the foot), two wet bands where the
  // bucket's ridges were
  const H = 3; // tall: it is the island's landmark
  put(drawn(new THREE.CylinderGeometry(R * 0.86, R * 0.98, H, 28), flat(SAND)), 0, H / 2, 0);
  for (const [hy, r] of [[0.45, R * 0.965], [1.25, R * 0.92]]) put(new THREE.Mesh(new THREE.CylinderGeometry(r + 0.02, r + 0.02, 0.18, 28), flat(WET)), 0, hy, 0);
  // crenellations round the top: merlons with gaps
  const n = 16;
  for (let k = 0; k < n; k += 1) {
    if (k % 2) continue;
    const a = (k / n) * Math.PI * 2, r = R * 0.8;
    const m = put(drawn(new THREE.BoxGeometry(R * 0.28, 0.42, 0.34), flat(SAND_HI)), Math.cos(a) * r, H + 0.21, Math.sin(a) * r);
    m.rotation.y = -a;
  }
  // four turrets on the rim, each its own little bucket with a cone of wet sand
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4, r = R * 0.62, tr = R * 0.22;
    put(drawn(new THREE.CylinderGeometry(tr * 0.85, tr, 1.1, 14), flat(SAND)), Math.cos(a) * r, H + 0.55, Math.sin(a) * r);
    put(drawn(new THREE.ConeGeometry(tr * 1.05, 0.7, 14), flat(WET)), Math.cos(a) * r, H + 1.45, Math.sin(a) * r);
  }
  // the keep's own tower in the middle, a shell stuck on it, a flag on top
  const kr = R * 0.34;
  put(drawn(new THREE.CylinderGeometry(kr * 0.85, kr, 1.8, 18), flat(SAND)), 0, H + 0.9, 0);
  put(new THREE.Mesh(new THREE.CylinderGeometry(kr + 0.02, kr + 0.02, 0.14, 18), flat(WET)), 0, H + 0.6, 0);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    put(drawn(new THREE.BoxGeometry(kr * 0.42, 0.3, 0.24), flat(SAND_HI)), Math.cos(a) * kr * 0.8, H + 1.95, Math.sin(a) * kr * 0.8).rotation.y = -a;
  }
  put(drawn(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6), flat(0x6b4a2f)), 0, H + 2.6, 0);
  const flag = put(new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.42), flat(C.cap, { side: THREE.DoubleSide })), 0.36, H + 3.05, 0);
  ud(flag).live = true;
  const shell = put(drawn(new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), flat(0xf6d2c4)), R * 0.93, 0.9, 0);
  shell.rotation.z = -Math.PI / 2;
  return g;
}

/** A scarecrow standing in a round straw bale (the bale is the footprint);
 *  his arms reach out over the ball's head. */
function scarecrow(p: PostLike, y: number) {
  const g = new THREE.Group(), [x, z] = p.c, R = p.r;
  const straw = flat(0xe8c36a), strawDark = flat(0xc9a24e);
  const bale = drawn(new THREE.CylinderGeometry(R * 0.96, R, 0.55, 16), straw);
  bale.position.set(x, y + 0.275, z);
  const band = new THREE.Mesh(new THREE.TorusGeometry(R * 0.985, 0.04, 5, 20), strawDark);
  band.rotation.x = Math.PI / 2;
  band.position.set(x, y + 0.3, z);
  const pole = drawn(new THREE.CylinderGeometry(0.07, 0.08, 2.1, 7), flat(C.woodDark));
  pole.position.set(x, y + 1.35, z);
  const arms = drawn(new THREE.CylinderGeometry(0.06, 0.06, 1.9, 7), flat(C.woodDark));
  arms.rotation.z = Math.PI / 2;
  arms.position.set(x, y + 1.75, z);
  const shirt = drawn(rbox(0.62, 0.72, 0.36, 0.1), flat(0x5b6fb5));
  shirt.position.set(x, y + 1.55, z);
  const sleeves = drawn(new THREE.CylinderGeometry(0.13, 0.15, 1.3, 8), flat(0x4a5c9e));
  sleeves.rotation.z = Math.PI / 2;
  sleeves.position.set(x, y + 1.75, z);
  g.add(bale, band, pole, arms, shirt, sleeves);
  // straw poking out of the cuffs and the collar
  for (const sgn of [-1, 1]) {
    const tuft = drawn(new THREE.ConeGeometry(0.12, 0.3, 6), straw);
    tuft.rotation.z = sgn * Math.PI / 2;
    tuft.position.set(x + sgn * 1.02, y + 1.75, z);
    g.add(tuft);
  }
  const head = drawn(new THREE.SphereGeometry(0.26, 12, 9), flat(0xd8c19a));
  head.position.set(x, y + 2.13, z);
  const brim = drawn(new THREE.CylinderGeometry(0.46, 0.5, 0.05, 16), straw);
  brim.position.set(x, y + 2.3, z);
  const crown = drawn(new THREE.CylinderGeometry(0.2, 0.26, 0.28, 12), straw);
  crown.position.set(x, y + 2.45, z);
  const patch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.02), flat(C.cap));
  patch.position.set(x + 0.14, y + 1.45, z + 0.19);
  g.add(head, brim, crown, patch);
  for (const [dx, dz] of [[-0.09, 0.22], [0.09, 0.22]]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), flat(C.ink));
    eye.position.set(x + dx, y + 2.18, z + dz);
    g.add(eye);
  }
  return g;
}

/** A stone lantern (a tōrō) by the water: its round foot is the footprint. */
function lantern(p: PostLike, y: number) {
  const g = new THREE.Group(), [x, z] = p.c, R = p.r, stone = flat(0xb9c2bd), dark = flat(0x9aa39e);
  const foot = drawn(new THREE.CylinderGeometry(R * 0.9, R, 0.35, 8), stone);
  foot.position.set(x, y + 0.175, z);
  const post = drawn(new THREE.CylinderGeometry(R * 0.32, R * 0.4, 0.8, 8), stone);
  post.position.set(x, y + 0.75, z);
  const shelf = drawn(new THREE.CylinderGeometry(R * 0.72, R * 0.62, 0.16, 6), stone);
  shelf.position.set(x, y + 1.23, z);
  const box = drawn(rbox(R * 0.95, 0.5, R * 0.95, 0.05), stone);
  box.position.set(x, y + 1.56, z);
  const light = new THREE.Mesh(new THREE.BoxGeometry(R * 0.55, 0.3, R * 1.0), new THREE.MeshBasicMaterial({ color: 0xffd98a }));
  light.position.set(x, y + 1.56, z);
  const light2 = light.clone();
  light2.rotation.y = Math.PI / 2;
  const roof = drawn(new THREE.ConeGeometry(R * 1.15, 0.5, 6), dark);
  roof.position.set(x, y + 2.05, z);
  const knob = drawn(new THREE.SphereGeometry(0.12, 8, 6), dark);
  knob.position.set(x, y + 2.38, z);
  g.add(foot, post, shelf, light, light2, box, roof, knob);
  return g;
}

/** A tall sunflower in a terracotta pot: the pot is the footprint; the
 *  stem, the leaves and the head are over the ball. */
function sunflower(p: PostLike, y: number) {
  const g = new THREE.Group(), [x, z] = p.c, R = p.r;
  const pot = drawn(new THREE.CylinderGeometry(R, R * 0.78, 0.8, 16), flat(0xc8693f));
  pot.position.set(x, y + 0.4, z);
  const lip = drawn(new THREE.TorusGeometry(R * 0.97, 0.09, 6, 20), flat(0xd97c50));
  lip.rotation.x = Math.PI / 2;
  lip.position.set(x, y + 0.8, z);
  const soil = new THREE.Mesh(new THREE.CircleGeometry(R * 0.9, 16).rotateX(-Math.PI / 2), flat(0x5a3d2a));
  soil.position.set(x, y + 0.76, z);
  const stem = drawn(new THREE.CylinderGeometry(0.07, 0.1, 2.6, 7), flat(C.leafDark));
  stem.position.set(x, y + 2.05, z);
  g.add(pot, lip, soil, stem);
  for (const [h, a] of [[1.5, 0.3], [2.1, 3.4]]) {
    const leaf = drawn(new THREE.SphereGeometry(0.3, 8, 5), flat(C.leaf));
    leaf.scale.set(1, 0.2, 0.55);
    leaf.rotation.y = a;
    leaf.position.set(x + Math.cos(a) * 0.3, y + h, z - Math.sin(a) * 0.3);
    g.add(leaf);
  }
  // the head, facing the camera's side of the board (+z), tipped a little
  const head = new THREE.Group();
  head.position.set(x, y + 3.35, z);
  head.rotation.x = -0.35;
  const petal = new THREE.ConeGeometry(0.16, 0.55, 5);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2, pe = new THREE.Mesh(petal, flat(k % 2 ? 0xf5c33b : 0xf2b124));
    pe.position.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0);
    pe.rotation.z = a - Math.PI / 2;
    pe.scale.z = 0.35;
    head.add(pe);
  }
  const disc = drawn(new THREE.CylinderGeometry(0.4, 0.4, 0.14, 16), flat(0x6b4226));
  disc.rotation.x = Math.PI / 2;
  head.add(disc);
  g.add(head);
  return g;
}

export const POSTS: Record<string, PostFn> = {
  scarecrow,
  sunflower,
  lantern,
  sandcastle,
  palm, coral, buoy, crab, lamp, clock, roundabout, chimney,
  outcrop: (p, y) => boulder(p, y, P.sandstone, 0.9),
  driftwood: driftPost,
  house: mushHouse,
  "gnome statue": gnomeStatue,
};

// ------------------------------------------------------------------- bars
// Each takes (centre [x, z], length, thickness, angle, height fn) and fills
// the bar's rectangle exactly.

const along = <T extends THREE.Object3D>(m: T, [x, z]: Vec2, ang: number, y: number) => {
  m.position.set(x, y, z);
  m.rotation.y = -ang;
  return m;
};

function driftBar(c: Vec2, L: number, th: number, ang: number, height: Height) {
  const geo = new THREE.CylinderGeometry(th / 2, th / 2 * 0.9, L, 10);
  geo.rotateZ(Math.PI / 2);
  return along(drawn(geo, flat(P.drift)), c, ang, height(c[0], c[1]) + th / 2);
}

function plank(c: Vec2, L: number, th: number, ang: number, height: Height) {
  const g = new THREE.Group();
  const y = height(c[0], c[1]);
  const board = drawn(rbox(L, 0.55, th, 0.06), flat(C.wood));
  board.position.y = 0.28;
  g.add(board);
  for (const e of [-L / 2, L / 2]) {
    const rope = drawn(new THREE.TorusGeometry(0.12, 0.04, 6, 10), flat(C.soil));
    rope.position.set(e, 0.28, 0);
    rope.rotation.y = Math.PI / 2;
    g.add(rope);
  }
  return along(g, c, ang, y);
}

function tram(c: Vec2, L: number, th: number, ang: number, height: Height) {
  const g = new THREE.Group();
  const y = height(c[0], c[1]);
  const body = drawn(rbox(L, 1.6, th, 0.25), flat(P.tram));
  body.position.y = 1.05;
  const skirt = drawn(rbox(L * 0.98, 0.3, th * 0.98, 0.08), flat(P.tramDark));
  skirt.position.y = 0.2;
  const roof = drawn(rbox(L * 0.9, 0.2, th * 0.8, 0.08), flat(C.cream));
  roof.position.y = 1.95;
  g.add(body, skirt, roof);
  const n = Math.max(2, Math.round(L / 1.4));
  for (let k = 0; k < n; k++)
    for (const side of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry((L / n) * 0.6, 0.55), flat(P.glass));
      win.position.set(-L / 2 + (L / n) * (k + 0.5), 1.25, side * (th / 2 + 0.01));
      if (side < 0) win.rotation.y = Math.PI;
      g.add(win);
    }
  const pole = drawn(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 5), flat(P.iron));
  pole.position.set(0, 2.6, 0);
  pole.rotation.z = 0.5;
  g.add(pole);
  return along(g, c, ang, y);
}

function clockHand(c: Vec2, L: number, th: number, ang: number, height: Height) {
  // a long iron hand with an arrow tip, lying just above the lane
  const s = new THREE.Shape();
  s.moveTo(-L / 2, -th / 2); s.lineTo(L / 2 - 0.8, -th / 2); s.lineTo(L / 2 - 0.8, -th); s.lineTo(L / 2, 0);
  s.lineTo(L / 2 - 0.8, th); s.lineTo(L / 2 - 0.8, th / 2); s.lineTo(-L / 2, th / 2); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.6, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return along(drawn(geo, flat(P.iron)), c, ang, height(c[0], c[1]) + 0.05);
}

function stall(c: Vec2, L: number, th: number, ang: number, height: Height) {
  const g = new THREE.Group();
  const y = height(c[0], c[1]);
  const counter = drawn(rbox(L, 1.0, th, 0.1), flat(C.wood));
  counter.position.y = 0.5;
  g.add(counter);
  // goods on the counter, an awning over it on four poles
  for (let k = 0; k < Math.round(L / 0.7); k++) {
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), flat([C.cap, C.sun, C.leaf, 0xf29a6b][k % 4]));
    fruit.position.set(-L / 2 + 0.4 + k * 0.7, 1.1, 0);
    g.add(fruit);
  }
  for (const ex of [-L / 2 + 0.1, L / 2 - 0.1])
    for (const ez of [-th / 2 + 0.08, th / 2 - 0.08]) {
      const pole = drawn(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), flat(C.woodDark));
      pole.position.set(ex, 1.7, ez);
      g.add(pole);
    }
  const cover = drawn(rbox(L + 0.3, 0.12, th + 0.6, 0.05), flat(0xffffff, { map: stripes(P.stripeA, P.stripeB, 8) }));
  cover.position.y = 2.45;
  g.add(cover);
  return along(g, c, ang, y);
}

function awning(c: Vec2, L: number, th: number, ang: number, height: Height) {
  // a striped canvas let down to the ground, on its roller
  const g = new THREE.Group();
  const y = height(c[0], c[1]);
  const cloth = drawn(rbox(L, 1.6, th, 0.08), flat(0xffffff, { map: stripes(P.stripeA, P.stripeB, 8) }));
  cloth.position.y = 0.8;
  const roller = drawn(new THREE.CylinderGeometry(th * 0.45, th * 0.45, L + 0.2, 10), flat(C.woodDark));
  roller.rotation.z = Math.PI / 2;
  roller.position.y = 1.7;
  g.add(cloth, roller);
  return along(g, c, ang, y);
}

/** A wheelbarrow of greens left at the end of a row: its tray fills the bar,
 *  the wheel at one end, the handles at the other. */
function wheelbarrow(c: Vec2, L: number, th: number, ang: number, height: Height) {
  const g = new THREE.Group(), y = height(c[0], c[1]);
  const tray = drawn(rbox(L * 0.72, 0.5, th * 0.95, 0.1), flat(0x3f8f6f));
  tray.position.set(-L * 0.08, 0.62, 0);
  const soil = new THREE.Mesh(new THREE.BoxGeometry(L * 0.66, 0.05, th * 0.8), flat(0x6b4a31));
  soil.position.set(-L * 0.08, 0.88, 0);
  g.add(tray, soil);
  for (let k = 0; k < 3; k++) {
    const cab = drawn(new THREE.SphereGeometry(0.22, 10, 7), flat(k % 2 ? 0x8fcb6a : 0x6fae55));
    cab.scale.y = 0.8;
    cab.position.set(-L * 0.08 + (k - 1) * L * 0.2, 0.98, (k % 2 ? 0.1 : -0.1) * th);
    g.add(cab);
  }
  const wheel = drawn(new THREE.CylinderGeometry(0.34, 0.34, 0.14, 14), flat(C.woodDark));
  wheel.rotation.x = Math.PI / 2;
  wheel.position.set(L / 2 - 0.36, 0.36, 0);
  g.add(wheel);
  for (const sgn of [-1, 1]) {
    const handle = drawn(new THREE.CylinderGeometry(0.05, 0.05, L * 0.55, 6), flat(C.wood));
    handle.rotation.z = Math.PI / 2 + 0.25;
    handle.position.set(-L * 0.22, 0.72, sgn * th * 0.34);
    const leg = drawn(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), flat(C.woodDark));
    leg.position.set(-L * 0.28, 0.2, sgn * th * 0.34);
    g.add(handle, leg);
  }
  return along(g, c, ang, y);
}

export const BARS: Record<string, BarFn> = { driftwood: driftBar, plank, tram, "clock hand": clockHand, stall, awning, wheelbarrow };

// ------------------------------------------------------------ tunnel ends
// (x, y, z) the centre of the mouth on the ground, R its radius, dir the way
// its opening faces (a unit THREE.Vector3 in the ground plane).

function darkHole(R: number) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(R, 20), flat(C.burrow));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.04;
  return m;
}

function cave(R: number) {
  const g = new THREE.Group();
  // a rock arch over a dark mouth
  const arch = drawn(new THREE.TorusGeometry(R * 1.1, R * 0.45, 8, 16, Math.PI), flat(0x8f8a80));
  arch.scale.z = 1.4;
  const back = drawn(new THREE.SphereGeometry(R * 1.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), flat(0x7d7870));
  back.position.z = -R * 0.9;
  back.scale.set(1, 0.9, 0.7);
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(R * 1.05, 16, 0, Math.PI), flat(C.burrow));
  mouth.position.z = 0.02;
  g.add(back, arch, mouth);
  return g;
}

function well(R: number) {
  const g = new THREE.Group();
  const ring = drawn(new THREE.CylinderGeometry(R * 1.15, R * 1.2, 0.5, 20, 1, true), flat(0xb9c2bd, { side: THREE.DoubleSide }));
  ring.position.y = 0.25;
  const lip = drawn(new THREE.TorusGeometry(R * 1.15, 0.12, 6, 20), flat(0xa5aea9));
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.5;
  g.add(ring, lip, darkHole(R));
  for (const s of [-1, 1]) {
    const post = drawn(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 6), flat(C.woodDark));
    post.position.set(s * R * 1.15, 1.2, 0);
    g.add(post);
  }
  const roof = drawn(new THREE.ConeGeometry(R * 1.5, 0.7, 4), flat(C.cap));
  roof.position.y = 2.4;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  return g;
}

function door(R: number) {
  const g = new THREE.Group();
  // a round gnome door in a little stone frame, standing open
  const frame = drawn(new THREE.TorusGeometry(R, 0.2, 8, 20, Math.PI), flat(0xb9c2bd));
  frame.position.y = 0.02;
  const dark = new THREE.Mesh(new THREE.CircleGeometry(R * 0.95, 16, 0, Math.PI), flat(C.burrow));
  const leaf = drawn(rbox(R * 0.95, R * 0.95, 0.1, 0.05), flat(C.woodDark));
  leaf.position.set(R * 0.9, R * 0.48, R * 0.45);
  leaf.rotation.y = -1.2;
  g.add(frame, dark, leaf);
  return g;
}

function shipwreck(R: number) {
  const g = new THREE.Group();
  // half a hull on its side, the ball rolls in through a hole in its planks
  const hull = drawn(new THREE.SphereGeometry(R * 1.8, 14, 8, 0, Math.PI, 0, Math.PI / 2), flat(0x8a6240, { side: THREE.DoubleSide }));
  hull.scale.set(1.4, 0.8, 1);
  hull.rotation.y = Math.PI;
  hull.position.z = -R * 0.6;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(R * 0.95, 16, 0, Math.PI), flat(C.burrow));
  hole.position.z = 0.03;
  const mast = drawn(new THREE.CylinderGeometry(0.1, 0.12, 3, 6), flat(0x6b4a2f));
  mast.position.set(R * 0.6, 1.6, -R * 1.2);
  mast.rotation.z = 0.5;
  g.add(hull, hole, mast);
  return g;
}

export const MOUTHS: Record<string, (R: number) => THREE.Object3D> = { cave, well, door, shipwreck };

/** Places a mouth object facing `dir` at (x, y, z). */
export function mouthAt(skin: string, x: number, y: number, z: number, R: number, dir: THREE.Vector3) {
  const m = MOUTHS[skin](R);
  m.position.set(x, y, z);
  m.rotation.y = Math.atan2(dir.x, dir.z); // its front (+z) faces dir
  return m;
}

// ------------------------------------------------------------- rooftops

export const ROOF_Y = -2.6; // the rooftops' eaves, well below the lane

/**
 * The town's roofs below and round a lane that runs over them (a `roof` zone,
 * everything off the lane): rows of pitched tiled roofs with ridges and
 * chimneys, whose walls go on down out of sight. Nothing floats: every roof
 * is a house seen from above.
 */
export function roofs(z: Zone, s: Pick<Hole, "board">) {
  const g = new THREE.Group();
  const tiles = [0xc4633f, 0xb0553a, 0xd07a4f, 0x9b7fd1];
  const S = 4; // a house every 4 units
  const x0 = Math.max(0, z.min[0]), y0 = Math.max(0, z.min[1]), x1 = Math.min(s.board.w, z.max[0]), y1 = Math.min(s.board.h, z.max[1]);
  // the streets down between the houses, so no gap shows the sky
  const street = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), flat(0x5a5048));
  street.rotation.x = -Math.PI / 2;
  street.position.set((x0 + x1) / 2, ROOF_Y - 3.2, (y0 + y1) / 2);
  g.add(street);
  let k = 0;
  for (let y = y0; y + 1 < y1; y += S)
    for (let x = x0; x + 1 < x1; x += S, k++) {
      const w = Math.min(S, x1 - x) - 0.3, d = Math.min(S, y1 - y) - 0.3;
      if (w < 1.2 || d < 1.2) continue;
      // a whole house or none: every corner of it off the lane
      const cx = x + w / 2 + 0.15, cz = y + d / 2 + 0.15;
      if (![[x, y], [x + w, y], [x, y + d], [x + w, y + d], [cx, cz]].every(([a, b]) => inZone(z, a + 0.15, b + 0.15))) continue;
      const along = (k + Math.floor(y)) % 2 === 0; // ridges turn, row by row
      const h = 1.2 + ((k * 7) % 3) * 0.3;
      const walls = drawn(rbox(w, 3, d, 0.08), flat(C.cream));
      walls.position.set(cx, ROOF_Y - 1.5 - ((k * 5) % 3) * 0.3, cz);
      const shape = new THREE.Shape([new THREE.Vector2(-(along ? d : w) / 2 - 0.2, 0), new THREE.Vector2((along ? d : w) / 2 + 0.2, 0), new THREE.Vector2(0, h)]);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: (along ? w : d) + 0.2, bevelEnabled: false });
      geo.translate(0, 0, -((along ? w : d) + 0.2) / 2);
      if (along) geo.rotateY(Math.PI / 2);
      const roof = drawn(geo, flat(tiles[k % tiles.length]));
      roof.position.set(cx, walls.position.y + 1.5, cz);
      g.add(walls, roof);
      if (k % 3 === 0) {
        const ch = drawn(rbox(0.5, 1.2, 0.5, 0.04), flat(0xb8573f));
        const top = new THREE.Vector3(cx + w * 0.25, walls.position.y + 1.5 + h * 0.6, cz - d * 0.2);
        ch.position.copy(top);
        g.add(ch, smoke(top.clone().setY(top.y + 0.7)));
      }
    }
  return g;
}
